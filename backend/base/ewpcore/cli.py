from __future__ import annotations

import argparse
from contextlib import contextmanager
from contextvars import ContextVar
from fnmatch import fnmatchcase
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

from .packaging import build_package, load_pack_config


class BuildError(RuntimeError):
    """Raised when a build command cannot produce its requested artifact."""

    def __init__(self, message: str, code: int = 1):
        super().__init__(message)
        self.code = code


def _find_project_root() -> Path:
    # Installed wheels operate on the caller's project, including projects that
    # have no local copy of the framework or repository development scripts.
    return Path.cwd().resolve()


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
    "ewp.pack.json",
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
BUNDLE_EXCLUDED_PATTERNS = (
    "__pycache__", "*.py[cod]", "*.egg-info", "node_modules", ".venv",
    "output", "build", "dist", ".git", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    ".tox", ".nox", "__pypackages__",
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
    completed = subprocess.run(_process_command(command), cwd=cwd, env=env)
    if completed.returncode:
        raise BuildError(_text(f"命令失败，退出码 {completed.returncode}：{printable}",
                       f"Command failed with exit code {completed.returncode}: {printable}", cwd),
                         completed.returncode if completed.returncode > 0 else 1)


def _process_command(command: Sequence[str]) -> list[str] | str:
    """Preserve literal argv when invoking npm.cmd through Windows cmd.exe."""
    if sys.platform != "win32" or Path(command[0]).suffix.lower() not in (".cmd", ".bat"):
        return list(command)
    if any(any(char in token for char in '\"%\r\n\0') for token in command):
        raise BuildError("Cannot safely quote Windows batch argument")
    shell = os.environ.get("COMSPEC") or str(Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32/cmd.exe")
    prefix = subprocess.list2cmdline([shell, "/d", "/s", "/v:off", "/c"])
    return prefix + ' "' + " ".join('"' + token + '"' for token in command) + '"'


def _build_frontend(project_root: Path, python: str = sys.executable) -> None:
    """Use a project's build entry when present; accept precompiled wheel hosts."""
    manifest = project_root / "frontend/package.json"
    if not manifest.is_file():
        return
    script = project_root / "scripts/dev.py"
    if script.is_file():
        _run([python, str(script), "frontend"], cwd=project_root)
        return
    try:
        package = json.loads(manifest.read_text(encoding="utf-8-sig"))
        scripts = package.get("scripts", {})
        if not isinstance(scripts, dict):
            raise ValueError("scripts must be an object")
    except (ValueError, AttributeError) as error:
        raise BuildError(f"Invalid frontend/package.json: {error}") from error
    if "frontend:build" not in scripts:
        return
    npm = shutil.which("npm.cmd" if sys.platform == "win32" else "npm")
    if npm is None:
        raise BuildError(_text("缺少 npm，请安装 Node.js 并重新打开终端",
                               "Missing npm; install Node.js and reopen the terminal", project_root))
    _run([npm, "run", "frontend:build"], cwd=project_root / "frontend")


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
    _build_frontend(project_root, python)
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
                *BUNDLE_EXCLUDED_PATTERNS,
                # AI directories are copied only through the explicit public entries above.
                ".agents", ".claude", ".easy-dev",
            ),
        )
    elif source.is_file():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    else:
        raise BuildError(_text(f"源码包源文件不存在：{source}", f"Bundle source does not exist: {source}", project_root))


def _bundle_config_sources(config: dict, project_root: Path) -> list[str]:
    """Collect validated sources without bypassing the bundle's artifact exclusions."""
    sources: set[str] = set()
    for collection in (config["features"], [config["installer"]]):
        for item in collection:
            for file_entry in item["files"]:
                source = file_entry["source"]
                if any(fnmatchcase(part.casefold(), pattern)
                       for part in source.split("/") for pattern in BUNDLE_EXCLUDED_PATTERNS):
                    raise BuildError(_text(
                        f"源码包 source 不能来自生成或依赖目录：{source}",
                        f"Source bundle cannot include generated or dependency source: {source}",
                        project_root))
                sources.add(source)
    return sorted(sources)


def build_bundle(project_root: Path = PROJECT_ROOT, output_dir: Path | None = None) -> Path:
    for source in REQUIRED_BUNDLE_SOURCES:
        if not (project_root / source).exists():
            raise BuildError(_text(f"源码包源文件不存在：{project_root / source}",
                                   f"Bundle source does not exist: {project_root / source}", project_root))
    name = _read_project_name(project_root)
    version = _read_project_version(project_root)
    config_path = project_root / "ewp.pack.json"
    config_sources: list[str] = []
    if config_path.exists() or config_path.is_symlink():
        try:
            config = load_pack_config(project_root)
            config_sources = _bundle_config_sources(config, project_root)
        except (OSError, ValueError) as error:
            raise BuildError(_text(f"源码包配置 {config_path.name} 无效：{error}",
                                   f"Source bundle configuration {config_path.name} is invalid: {error}",
                                   project_root)) from error
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
    for source in config_sources:
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
            if path.is_file() or (path.is_dir() and not any(path.iterdir())):
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
                "commands": ["app", "exe", "installer", "build", "bundle", "clean", "info", "test"],
                "artifacts": ["application", "installer.exe", "wheel", "source-bundle.zip"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def _build_parser(project_root: Path = PROJECT_ROOT) -> argparse.ArgumentParser:
    language = _LANGUAGE.get() or project_language(project_root)
    choose = lambda zh, en: en if language == "en" else zh
    parser = _LocalizedParser(
        prog="easy-windows-pack",
        description=choose("构建并检查可复用的 Windows WebView 窗口框架。",
                           "Build and inspect the reusable Windows WebView window pack."),
        language=language,
    )
    lang_help = choose("临时选择语言（优先于 EWP_LANG 和项目配置）", "Temporary language (overrides EWP_LANG and project config)")
    parser.add_argument("--lang", choices=("zh-CN", "en"), default=argparse.SUPPRESS, help=lang_help)
    root_help = choose("应用项目根目录（默认当前目录）", "Application project root (default: current directory)")
    parser.add_argument("--project-root", metavar="PATH", default=argparse.SUPPRESS, help=root_help)
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
    app = subparsers.add_parser("app", aliases=["exe"], help=choose("构建应用程序", "Build application"))
    installer = subparsers.add_parser("installer", help=choose("构建应用程序与安装包", "Build application and installer"))
    for command in (app, installer):
        command.add_argument("--config", metavar="PATH", default=None,
                             help=choose("项目根目录下的配置路径（默认 ewp.pack.json）", "Config path relative to project root (default: ewp.pack.json)"))
        command.add_argument("--mode", choices=("onefile", "onedir"), default=None,
                             help=choose("覆盖配置中的应用模式", "Override configured application mode"))
        command.add_argument("--installer", action="store_const", const=True, default=None,
                             help=choose("同时构建安装包", "Also build an installer"))
    for command in (build, bundle, test, info, app, installer):
        command.add_argument("--project-root", metavar="PATH", default=argparse.SUPPRESS, help=root_help)
    for command in (build, bundle, test, clean, info, app, installer):
        command.add_argument("--lang", choices=("zh-CN", "en"), default=argparse.SUPPRESS, help=lang_help)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    root_parser = argparse.ArgumentParser(add_help=False)
    root_parser.add_argument("--project-root")
    # Resolve the explicit root before selecting the saved language for help.
    roots, _ = root_parser.parse_known_args(arguments)
    project_root = _resolve_path(roots.project_root, Path.cwd()).resolve() if roots.project_root else PROJECT_ROOT.resolve()
    with _language_context(project_root, _language_override(arguments)):
        return _main(arguments, project_root)


def _main(argv: Sequence[str], project_root: Path = PROJECT_ROOT) -> int:
    args = _build_parser(project_root).parse_args(argv)
    try:
        if args.command == "test":
            run_tests(project_root, args.python)
        elif args.command == "bundle":
            build_bundle(project_root, _resolve_path(args.output_dir, project_root) if args.output_dir else None)
        elif args.command == "clean":
            clean_project(project_root)
        elif args.command == "info":
            print_info(project_root)
        elif args.command in ("app", "exe", "installer"):
            _build_frontend(project_root)
            artifacts = build_package(project_root, Path(args.config) if args.config is not None else None,
                                      installer=True if args.command == "installer" else args.installer,
                                      mode=args.mode)
            for artifact in artifacts.values():
                print(_text(f"[完成] 产物：{artifact}", f"[ok] artifact: {artifact}", project_root))
        elif args.command == "build":
            output_dir = _resolve_path(args.output_dir, project_root)
            if not args.skip_tests:
                run_tests(project_root, args.python)
            output_dir.mkdir(parents=True, exist_ok=True)
            if not args.skip_wheel:
                build_wheel(project_root, output_dir if args.output_dir else None, args.python)
            if not args.skip_bundle:
                build_bundle(project_root, output_dir if args.output_dir else None)
            print(_text(f"[完成] 构建完成：{output_dir}", f"[ok] build complete: {output_dir}", project_root))
        return 0
    except BuildError as error:
        print(_text(f"[错误] {error}", f"[error] {error}", project_root), file=sys.stderr)
        return error.code
    except (OSError, subprocess.SubprocessError, ValueError, RuntimeError) as error:
        print(_text(f"[错误] {error}", f"[error] {error}", project_root), file=sys.stderr)
        code = getattr(error, "returncode", getattr(error, "code", None))
        # The packaging subprocess currently reports its exit code in RuntimeError.
        if code is None and isinstance(error, RuntimeError):
            match = re.search(r"\bexit code (-?\d+)\b", str(error))
            code = int(match.group(1)) if match else None
        return code if isinstance(code, int) and code > 0 else 1
    except KeyboardInterrupt:
        print(_text("操作已取消", "Operation cancelled", project_root), file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
