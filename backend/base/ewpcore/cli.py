from __future__ import annotations

import argparse
from contextlib import contextmanager
from contextvars import ContextVar
from functools import partial
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Sequence


class BuildError(RuntimeError):
    """Raised when a build command cannot produce its requested artifact."""

    def __init__(self, message: str, code: int = 1):
        super().__init__(message)
        self.code = code


def _find_project_root() -> Path:
    for candidate in (Path.cwd(), *Path(__file__).resolve().parents):
        if (candidate / "pyproject.toml").is_file() and (candidate / "backend/base/ewpcore").is_dir():
            return candidate
    return Path.cwd()


PROJECT_ROOT = _find_project_root()
PACKAGE_NAME = "easy-windows-pack"
_LANGUAGE: ContextVar[str | None] = ContextVar("ewp_cli_language", default=None)


def project_language(project_root: Path, override: str | None = None) -> str:
    configured = None
    try:
        package = json.loads((project_root / "frontend/package.json").read_text(encoding="utf-8-sig"))
        ewp = package.get("ewp") if isinstance(package, dict) else None
        configured = ewp.get("language") if isinstance(ewp, dict) else None
    except (OSError, ValueError):
        pass
    for value in (override, os.environ.get("EWP_LANG"), configured):
        if value in ("zh-CN", "en"):
            return value
    return "zh-CN"


def _text(zh: str, en: str, project_root: Path) -> str:
    return en if (_LANGUAGE.get() or project_language(project_root)) == "en" else zh


@contextmanager
def _language_context(project_root: Path, override: str | None = None):
    token = _LANGUAGE.set(project_language(project_root, override))
    try:
        yield
    finally:
        _LANGUAGE.reset(token)


class _LocalizedParser(argparse.ArgumentParser):
    def __init__(self, *args, language: str, **kwargs):
        self.language = language
        kwargs["add_help"] = False
        super().__init__(*args, **kwargs)
        self._positionals.title = self.translate("位置参数", "positional arguments")
        self._optionals.title = self.translate("选项", "options")
        self.add_argument("-h", "--help", action="help",
                          help=self.translate("显示帮助并退出", "show this help message and exit"))

    def translate(self, zh: str, en: str) -> str:
        return en if self.language == "en" else zh

    def format_usage(self):
        return super().format_usage().replace("usage: ", self.translate("用法：", "usage: "), 1)

    def format_help(self):
        return super().format_help().replace("usage: ", self.translate("用法：", "usage: "), 1)

    def error(self, message):
        if self.language != "en":
            for pattern, replacement in (
                (r"invalid choice: (.*?) \(choose from (.*)\)", r"无效选项：\1（可选：\2）"),
                (r"argument (.*?): ", r"参数 \1："),
                (r"unrecognized arguments: ", "无法识别的参数："),
                (r"the following arguments are required: ", "缺少必需参数："),
                (r"expected one argument", "需要一个参数值"),
                (r"ignored explicit argument (.*)", r"不能指定参数值 \1"),
                (r"ambiguous option: (.*?) could match (.*)", r"选项不明确：\1（可能匹配：\2）"),
            ):
                message = re.sub(pattern, replacement, message)
        self.print_usage(sys.stderr)
        self.exit(2, f"{self.prog}: {self.translate('错误', 'error')}: {message}\n")


def _language_override(argv: Sequence[str]) -> str | None:
    override = None
    for index, value in enumerate(argv):
        if value == "--":
            break
        if value.startswith("--lang="):
            override = value.partition("=")[2]
        elif value == "--lang" and index + 1 < len(argv):
            override = argv[index + 1]
    return override


BUNDLE_SOURCES = (
    "backend",
    "frontend",
    "scripts",
    ".gitignore",
    "tests",
    "docs",
    "startup.cmd",
    "AGENTS.md",
    "CLAUDE.md",
    ".github/copilot-instructions.md",
    "docs/.agents/skills/easy-dev",
    "docs/.claude/skills/easy-dev",
    "docs/.easy-dev/agent.md",
    "docs/.easy-dev/install-state.json",
    "docs/.easy-dev/skills/easy-dev",
    ".gitattributes",
    "README.md",
    "README.en.md",
    "LICENSE",
    "pyproject.toml",
    "requirements.txt",
)
REQUIRED_BUNDLE_SOURCES = (
    "backend", "frontend", "scripts", "startup.cmd", "scripts/startup.cmd",
    "scripts/dev.py", "frontend/package.json", "README.md", "LICENSE", "pyproject.toml",
)


def _read_project_version(project_root: Path = PROJECT_ROOT) -> str:
    pyproject = (project_root / "pyproject.toml").read_text(encoding="utf-8")
    match = re.search(r'^version\s*=\s*["\']([^"\']+)["\']', pyproject, re.MULTILINE)
    if not match:
        raise BuildError(_text(f"无法从 pyproject.toml 读取项目版本：{project_root}",
                       f"Could not read project version from pyproject.toml: {project_root}", project_root))
    return match.group(1)


def _read_project_name(project_root: Path = PROJECT_ROOT) -> str:
    pyproject = (project_root / "pyproject.toml").read_text(encoding="utf-8")
    try:
        import tomllib
    except ModuleNotFoundError:
        # Python 3.10: scope the existing quoted-value regex approach to [project].
        section = re.search(r"(?m)^[ \t]*\[project\][ \t]*(?:#[^\r\n]*)?\r?$", pyproject)
        name = PACKAGE_NAME
        if section:
            body = re.split(r"(?m)^[ \t]*\[", pyproject[section.end():], maxsplit=1)[0]
            field = re.search(r"(?m)^[ \t]*name[ \t]*=[ \t]*([^\r\n]*)", body)
            if field:
                value = re.fullmatch(r'''(["'])([^"'\r\n]*)\1[ \t]*(?:#.*)?''', field.group(1))
                if not value:
                    raise BuildError(_text("pyproject.toml 中的项目名称无效",
                                           "Invalid project name in pyproject.toml", project_root))
                name = value.group(2)
    else:
        try:
            name = tomllib.loads(pyproject).get("project", {}).get("name", PACKAGE_NAME)
        except (ValueError, AttributeError) as error:
            raise BuildError(_text("无法从 pyproject.toml 读取项目名称",
                                   "Could not read project name from pyproject.toml", project_root)) from error
    # Distribution names must stay single path components for staging and archives.
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?", name):
        raise BuildError(_text(f"项目名称无效：{name!r}", f"Invalid project name: {name!r}", project_root))
    return name


def _resolve_path(value: str | Path | None, project_root: Path) -> Path:
    path = Path(value) if value is not None else project_root / "output"
    return path if path.is_absolute() else project_root / path


def _run(command: Sequence[str], *, cwd: Path) -> None:
    printable = " ".join(f'"{part}"' if " " in part else part for part in command)
    print(_text(f"[执行] {printable}", f"[run] {printable}", cwd))
    env = os.environ.copy()
    env.pop("PYTHONHOME", None)
    env.pop("PYTHONPATH", None)
    env.update(PYTHONUTF8="1", PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    env["EWP_LANG"] = _LANGUAGE.get() or project_language(cwd)
    completed = subprocess.run(command, cwd=cwd, env=env)
    if completed.returncode:
        raise BuildError(_text(f"命令失败，退出码 {completed.returncode}：{printable}",
                       f"Command failed with exit code {completed.returncode}: {printable}", cwd),
                         completed.returncode if completed.returncode > 0 else 1)


def run_tests(project_root: Path = PROJECT_ROOT, python: str = sys.executable) -> None:
    _run(
        [python, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"],
        cwd=project_root,
    )


def build_wheel(
    project_root: Path = PROJECT_ROOT,
    output_dir: Path | None = None,
    python: str = sys.executable,
) -> Path:
    if (project_root / "frontend/package.json").is_file():
        # Share npm resolution, Windows batch quoting and Vite behavior with the menu.
        _run([python, str(project_root / "scripts/dev.py"), "frontend"], cwd=project_root)
    output = output_dir or project_root / "output/wheels"
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="easy-windows-pack-wheel-") as temporary:
        wheelhouse = Path(temporary)
        _run(
            [
                python,
                "-m",
                "pip",
                "wheel",
                "--no-deps",
                "--no-build-isolation",
                "--wheel-dir",
                str(wheelhouse),
                str(project_root),
            ],
            cwd=project_root,
        )
        wheels = sorted(wheelhouse.glob("*.whl"))
        if len(wheels) != 1:
            raise BuildError(_text(f"应生成一个 wheel，在 {wheelhouse} 中找到 {len(wheels)} 个",
                                   f"Expected one wheel, found {len(wheels)} in {wheelhouse}", project_root))
        destination = output / wheels[0].name
        shutil.copy2(wheels[0], destination)
    print(_text(f"[完成] wheel：{destination}", f"[ok] wheel: {destination}", project_root))
    return destination


def _copy_bundle_source(project_root: Path, staging: Path, relative_name: str) -> None:
    source = project_root / relative_name
    destination = staging / relative_name
    if source.is_dir():
        shutil.copytree(
            source,
            destination,
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns(
                "__pycache__", "*.py[cod]", "*.egg-info", "node_modules", ".venv",
                "output", "build", "dist", ".git", ".pytest_cache", ".mypy_cache", ".ruff_cache",
                # AI directories are copied only through the explicit public entries above.
                ".agents", ".claude", ".easy-dev",
            ),
        )
    elif source.is_file():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    else:
        raise BuildError(_text(f"源码包源文件不存在：{source}", f"Bundle source does not exist: {source}", project_root))


def build_bundle(project_root: Path = PROJECT_ROOT, output_dir: Path | None = None) -> Path:
    for source in REQUIRED_BUNDLE_SOURCES:
        if not (project_root / source).exists():
            raise BuildError(_text(f"源码包源文件不存在：{project_root / source}",
                                   f"Bundle source does not exist: {project_root / source}", project_root))
    name = _read_project_name(project_root)
    version = _read_project_version(project_root)
    output = output_dir or project_root / "output/bundles"
    output.mkdir(parents=True, exist_ok=True)
    bundle_name = f"{name}-{version}-bundle"
    staging = output / bundle_name
    archive = output / f"{bundle_name}.zip"
    if staging.exists():
        shutil.rmtree(staging)
    if archive.exists():
        archive.unlink()

    for source in BUNDLE_SOURCES:
        if (project_root / source).exists():
            _copy_bundle_source(project_root, staging, source)

    manifest = {
        "name": name,
        "version": version,
        "artifact": "source-bundle",
        "entrypoints": {
            "python": "easy_windows_pack",
            "frontend": ("frontend/frame/ewpframe/window-frame.js"
                         if (project_root / "frontend/frame").is_dir() else "frontend/index.html"),
            "example": "backend/src/demo.py",
        },
        "files": sorted(
            str(path.relative_to(staging)).replace("\\", "/")
            for path in staging.rglob("*")
            if path.is_file()
        ),
    }
    (staging / "easy-windows-pack.manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for path in sorted(staging.rglob("*")):
            if path.is_file():
                zip_file.write(path, f"{bundle_name}/{path.relative_to(staging)}")
    print(_text(f"[完成] 源码包目录：{staging}", f"[ok] bundle directory: {staging}", project_root))
    print(_text(f"[完成] 源码包压缩文件：{archive}", f"[ok] bundle archive: {archive}", project_root))
    return archive


def clean_project(project_root: Path = PROJECT_ROOT) -> None:
    targets = [project_root / "build", project_root / "dist", project_root / "output"]
    targets.extend(project_root.glob("*.egg-info"))
    targets.extend((project_root / "backend/base").glob("*.egg-info"))
    for source in ("backend", "frontend", "scripts", "tests"):
        targets.extend((project_root / source).rglob("__pycache__"))
    removed = 0
    for target in sorted(set(targets), key=lambda item: len(item.parts), reverse=True):
        if target.is_symlink():
            target.unlink()
            removed += 1
        elif target.is_dir() and target != project_root:
            # Never follow junctions outside the project or remove a source tree.
            if not target.resolve().is_relative_to(project_root.resolve()):
                continue
            if target.name.endswith(".egg-info") and any(
                item.is_symlink() or not item.is_file() or item.name not in {
                    "PKG-INFO", "SOURCES.txt", "dependency_links.txt", "entry_points.txt",
                    "requires.txt", "top_level.txt", "not-zip-safe", "zip-safe",
                } for item in target.iterdir()
            ):
                continue
            shutil.rmtree(target)
            removed += 1
        else:
            continue
        print(_text(f"[清理] 已移除 {target.relative_to(project_root)}",
                    f"[clean] removed {target.relative_to(project_root)}", project_root))
    print(_text(f"[完成] 已移除 {removed} 个生成目录", f"[ok] removed {removed} generated directories", project_root))


def print_info(project_root: Path = PROJECT_ROOT) -> None:
    print(
        json.dumps(
            {
                "name": _read_project_name(project_root),
                "version": _read_project_version(project_root),
                "projectRoot": str(project_root),
                "python": sys.executable,
                "commands": ["build", "bundle", "clean", "info", "test"],
                "artifacts": ["wheel", "source-bundle.zip"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def _build_parser() -> argparse.ArgumentParser:
    language = _LANGUAGE.get() or project_language(PROJECT_ROOT)
    choose = lambda zh, en: en if language == "en" else zh
    parser = _LocalizedParser(
        prog="easy-windows-pack",
        description=choose("构建并检查可复用的 Windows WebView 窗口框架。",
                           "Build and inspect the reusable Windows WebView window pack."),
        language=language,
    )
    lang_help = choose("临时选择语言（优先于 EWP_LANG 和项目配置）", "Temporary language (overrides EWP_LANG and project config)")
    parser.add_argument("--lang", choices=("zh-CN", "en"), default=argparse.SUPPRESS, help=lang_help)
    subparsers = parser.add_subparsers(dest="command", required=True, title=choose("任务", "tasks"),
                                     parser_class=partial(_LocalizedParser, language=language))

    build = subparsers.add_parser("build", help=choose("运行测试并构建 wheel 和源码包", "Run tests and build wheel plus source bundle"))
    build.add_argument("--output-dir", metavar=choose("目录", "DIRECTORY"), help=choose("产物输出目录", "Artifact output directory"))
    build.add_argument("--python", metavar=choose("解释器", "PYTHON"), default=sys.executable, help=choose("测试和 wheel 构建使用的 Python 解释器", "Python executable used for tests and wheel"))
    build.add_argument("--skip-tests", action="store_true", help=choose("跳过 unittest 阶段", "Skip the unittest phase"))
    build.add_argument("--skip-wheel", action="store_true", help=choose("跳过 wheel 构建", "Skip wheel creation"))
    build.add_argument("--skip-bundle", action="store_true", help=choose("跳过源码包构建", "Skip source bundle creation"))

    bundle = subparsers.add_parser("bundle", help=choose("仅构建源码包", "Build only the source bundle"))
    bundle.add_argument("--output-dir", metavar=choose("目录", "DIRECTORY"), help=choose("产物输出目录", "Artifact output directory"))

    test = subparsers.add_parser("test", help=choose("运行 Python 单元测试", "Run the package unittest suite"))
    test.add_argument("--python", metavar=choose("解释器", "PYTHON"), default=sys.executable, help=choose("测试使用的 Python 解释器", "Python executable used for tests"))

    clean = subparsers.add_parser("clean", help=choose("清理生成的 build、dist 和缓存目录", "Remove generated build, dist and cache directories"))
    clean.add_argument("--project-root", help=argparse.SUPPRESS)

    info = subparsers.add_parser("info", help=choose("打印项目与产物元数据", "Print project and artifact metadata"))
    for command in (build, bundle, test, clean, info):
        command.add_argument("--lang", choices=("zh-CN", "en"), default=argparse.SUPPRESS, help=lang_help)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    with _language_context(PROJECT_ROOT, _language_override(arguments)):
        return _main(arguments)


def _main(argv: Sequence[str]) -> int:
    args = _build_parser().parse_args(argv)
    try:
        if args.command == "test":
            run_tests(PROJECT_ROOT, args.python)
        elif args.command == "bundle":
            build_bundle(PROJECT_ROOT, _resolve_path(args.output_dir, PROJECT_ROOT) if args.output_dir else None)
        elif args.command == "clean":
            clean_project(PROJECT_ROOT)
        elif args.command == "info":
            print_info(PROJECT_ROOT)
        elif args.command == "build":
            output_dir = _resolve_path(args.output_dir, PROJECT_ROOT)
            if not args.skip_tests:
                run_tests(PROJECT_ROOT, args.python)
            output_dir.mkdir(parents=True, exist_ok=True)
            if not args.skip_wheel:
                build_wheel(PROJECT_ROOT, output_dir if args.output_dir else None, args.python)
            if not args.skip_bundle:
                build_bundle(PROJECT_ROOT, output_dir if args.output_dir else None)
            print(_text(f"[完成] 构建完成：{output_dir}", f"[ok] build complete: {output_dir}", PROJECT_ROOT))
        return 0
    except BuildError as error:
        print(_text(f"[错误] {error}", f"[error] {error}", PROJECT_ROOT), file=sys.stderr)
        return error.code
    except (OSError, subprocess.SubprocessError) as error:
        print(_text(f"[错误] {error}", f"[error] {error}", PROJECT_ROOT), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
