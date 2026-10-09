"""Standard-library development entry point (Python 3.10+)."""
from __future__ import annotations

import argparse
import codecs
from contextlib import contextmanager, nullcontext
from contextvars import ContextVar
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import queue
import re
import signal
import shutil
import subprocess
import sys
import threading
from typing import Callable, Sequence, TextIO
import webbrowser


ROOT = Path(__file__).resolve().parents[1]
REENTRY = "EWP_DEV_REENTRY"
LABELS = {
    "init": ("初始化环境", "Initialize environment"),
    "browser": ("Vite 浏览器预览", "Vite browser preview"),
    "frontend": ("构建前端", "Build frontend"),
    "demo": ("桌面演示", "Desktop demo"),
    "wheel": ("构建 Wheel", "Build wheel"),
    "exe": ("构建 Windows EXE", "Build Windows EXE"),
    "bundle": ("构建源码包", "Build source bundle"),
    "full-build": ("完整构建", "Full build"),
    "test": ("运行测试", "Run tests"),
    "info": ("环境信息", "Environment info"),
    "dev": ("桌面热更新开发（HMR）", "Desktop development with HMR"),
    "preview": ("预览编译后的前端", "Preview built frontend"),
    "build": ("构建（默认 EXE）", "Build (EXE by default)"),
    "check": ("Node 运行时检查", "Node runtime checks"),
}
LANGUAGE: ContextVar[str | None] = ContextVar("ewp_dev_language", default=None)


def project_language(root: Path, override: str | None = None) -> str:
    """Resolve a temporary override, environment, then frontend project config."""
    configured = None
    try:
        package = json.loads((root / "frontend/package.json").read_text(encoding="utf-8-sig"))
        ewp = package.get("ewp") if isinstance(package, dict) else None
        configured = ewp.get("language") if isinstance(ewp, dict) else None
    except (OSError, ValueError):
        pass
    for value in (override, os.environ.get("EWP_LANG"), configured):
        if value in ("zh-CN", "en"):
            return value
    return "zh-CN"


@contextmanager
def language_context(root: Path, override: str | None = None):
    token = LANGUAGE.set(project_language(root, override))
    try:
        yield
    finally:
        LANGUAGE.reset(token)


def text(zh: str, en: str, root: Path = ROOT) -> str:
    return en if (LANGUAGE.get() or project_language(root)) == "en" else zh


class LocalizedParser(argparse.ArgumentParser):
    """Localize this parser only; never mutate argparse's process-wide gettext."""

    def __init__(self, *args, language: str | None = None, **kwargs):
        self.language = language or LANGUAGE.get() or project_language(ROOT)
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
                (r"invalid int value: (.*)", r"无效的整数值：\1"),
                (r"invalid (.*?) value: (.*)", r"无效的 \1 值：\2"),
                (r"argument (.*?): ", r"参数 \1："),
                (r"unrecognized arguments: ", "无法识别的参数："),
                (r"the following arguments are required: ", "缺少必需参数："),
                (r"expected one argument", "需要一个参数值"),
                (r"expected at least one argument", "至少需要一个参数值"),
                (r"ignored explicit argument (.*)", r"不能指定参数值 \1"),
                (r"not allowed with argument (.*)", r"不能与参数 \1 同时使用"),
                (r"ambiguous option: (.*?) could match (.*)", r"选项不明确：\1（可能匹配：\2）"),
            ):
                message = re.sub(pattern, replacement, message)
        self.print_usage(sys.stderr)
        self.exit(2, f"{self.prog}: {self.translate('错误', 'error')}: {message}\n")


def language_override(argv: Sequence[str]) -> str | None:
    """Find the last --lang anywhere, including help before the subcommand."""
    override = None
    for index, value in enumerate(argv):
        if value == "--":
            break
        if value.startswith("--lang="):
            override = value.partition("=")[2]
        elif value == "--lang" and index + 1 < len(argv):
            override = argv[index + 1]
    return override


class DevError(RuntimeError):
    def __init__(self, message: str, code: int = 1):
        super().__init__(message)
        self.code = code


def emit(message: str, log: TextIO | None = None) -> None:
    print(message, flush=True)
    if log is not None:
        log.write(message + "\n")
        log.flush()


def child_environment(root: Path = ROOT) -> dict[str, str]:
    env = os.environ.copy()
    # An activated foreign environment or user PYTHONPATH must not select code.
    env.pop("PYTHONHOME", None)
    env.pop("PYTHONPATH", None)
    env.update(PYTHONUTF8="1", PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    env["EWP_LANG"] = LANGUAGE.get() or project_language(root)
    return env


def stop_process(process: subprocess.Popen) -> None:
    """Reap the child and its build workers when the user interrupts."""
    if os.name == "nt":
        if process.poll() is None:
            try:
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    check=False, timeout=5,
                )
            except (OSError, subprocess.TimeoutExpired):
                pass
    else:
        try:
            os.killpg(process.pid, signal.SIGINT)
        except ProcessLookupError:
            pass
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        if os.name != "nt":
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        process.kill()
        process.wait()


def run_command(
    command: Sequence[str], *, root: Path, log: TextIO | None = None,
    env: dict[str, str] | None = None,
) -> None:
    """Run argv, explicitly quoting Windows batch files; tee output for logs."""
    emit(text("执行：", "Run: ", root) + subprocess.list2cmdline(list(command)), log)
    process = subprocess.Popen(
        process_command(command), cwd=root, env=env if env is not None else child_environment(root),
        stdout=subprocess.PIPE if log is not None else None,
        stderr=subprocess.STDOUT if log is not None else None,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        start_new_session=os.name != "nt",
    )
    reader = None
    try:
        if log is not None:
            assert process.stdout is not None
            output: queue.Queue[bytes | OSError | None] = queue.Queue()

            def read_output() -> None:
                try:
                    assert process.stdout is not None
                    while chunk := process.stdout.read1(4096):
                        output.put(chunk)
                except OSError as error:
                    output.put(error)
                finally:
                    output.put(None)

            reader = threading.Thread(target=read_output, daemon=True)
            reader.start()
            decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
            while True:
                try:
                    chunk = output.get(timeout=0.1)
                except queue.Empty:
                    continue
                if chunk is None:
                    break
                if isinstance(chunk, OSError):
                    raise chunk
                decoded = decoder.decode(chunk)
                sys.stdout.write(decoded)
                sys.stdout.flush()
                log.write(decoded)
                log.flush()
            tail = decoder.decode(b"", final=True)
            sys.stdout.write(tail)
            sys.stdout.flush()
            log.write(tail)
            log.flush()
        while True:
            try:
                code = process.wait(timeout=0.1)
                break
            except subprocess.TimeoutExpired:
                continue
    except BaseException:
        stop_process(process)
        raise
    finally:
        if reader is not None:
            reader.join(timeout=3)
        if process.stdout is not None:
            process.stdout.close()
    if code:
        raise DevError(text(f"子进程失败（退出码 {code}）", f"Child process failed (exit {code})", root),
                   code if code > 0 else 1)


def process_command(command: Sequence[str]) -> list[str] | str:
    """cmd.exe needs a verbatim command string, not CRT argv escaping."""
    if sys.platform != "win32" or Path(command[0]).suffix.lower() not in (".cmd", ".bat"):
        return list(command)
    if any(any(char in token for char in '\"%\r\n\0') for token in command):
        raise DevError(text("npm 参数无法安全引用", "Cannot safely quote Windows batch argument"))
    shell = os.environ.get("COMSPEC") or str(Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32/cmd.exe")
    prefix = subprocess.list2cmdline([shell, "/d", "/s", "/v:off", "/c"])
    return prefix + ' "' + " ".join('"' + token + '"' for token in command) + '"'


def run_npm(root: Path, arguments: Sequence[str], log: TextIO | None = None) -> None:
    frontend = root / "frontend"
    if not (frontend / "package.json").is_file():
        raise DevError(text("缺少 frontend/package.json", "Missing frontend/package.json", root))
    # Keep cwd separate from the batch command: paths with spaces and & stay literal.
    if sys.platform == "win32" and any(char in str(frontend) for char in '\"%\r\n\0'):
        raise DevError(text("项目路径无法安全引用", "Cannot safely quote project path", root))
    npm = shutil.which("npm.cmd" if sys.platform == "win32" else "npm")
    if npm is None:
        raise DevError(text("缺少 npm，请安装 Node.js 并重新打开终端",
                    "Missing npm; install Node.js and reopen the terminal", root))
    env = child_environment(root)
    with language_context(root, env["EWP_LANG"]):
        run_command([npm, *arguments], root=frontend, log=log, env=env)


def build_frontend(root: Path, log: TextIO | None = None) -> None:
    run_npm(root, ["run", "frontend:build"], log)


def venv_python(root: Path) -> Path:
    return root / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def in_project_venv(root: Path) -> bool:
    return sys.prefix != sys.base_prefix and Path(sys.prefix).resolve() == (root / ".venv").resolve()


def require_venv(root: Path) -> Path:
    python = venv_python(root)
    if not python.is_file() or not (root / ".venv/pyvenv.cfg").is_file():
        raise DevError(text("缺少有效虚拟环境，请运行 startup.cmd init",
                    "Missing valid .venv; run startup.cmd init", root))
    return python


def reenter(root: Path, argv: Sequence[str]) -> bool:
    python = require_venv(root)
    if in_project_venv(root):
        return False
    token = str(root.resolve())
    if os.environ.get(REENTRY) == token:
        raise DevError(text("虚拟环境解释器无效；请检查 .venv",
                    "Invalid .venv interpreter; re-entry stopped", root))
    env = child_environment(root)
    env[REENTRY] = token
    command = [str(python), "-u", str(root / "scripts/dev.py"), *argv]
    run_command(command, root=root, env=env)
    return True


def progress(done: int, total: int, name: str, log: TextIO | None) -> None:
    filled = done * 20 // total
    emit(f"[{'#' * filled}{'-' * (20 - filled)}] {done}/{total} {done * 100 // total}% {name}", log)


Stage = tuple[str, Callable[[TextIO | None], None]]


def run_stages(root: Path, name: str, stages: Sequence[Stage], *, logged: bool = True) -> None:
    log_path = None
    if logged:
        log_dir = root / "output/logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / f"{name}-{datetime.now():%Y%m%d-%H%M%S-%f}-{os.getpid()}.log"
        emit(text(f"日志：{log_path}", f"Log: {log_path}", root))
    with (log_path.open("w", encoding="utf-8") if log_path else nullcontext(None)) as log:
        done = 0
        try:
            for label, action in stages:
                progress(done, len(stages), text("开始：", "Starting: ", root) + label, log)
                action(log)
                done += 1
                progress(done, len(stages), text("完成：", "Completed: ", root) + label, log)
        except BaseException as error:
            emit(text(f"失败或中断（{done}/{len(stages)}）：{error}",
                      f"Failed or interrupted ({done}/{len(stages)}): {error}", root), log)
            raise


def initialize(root: Path) -> None:
    python = venv_python(root)

    def create(log: TextIO | None) -> None:
        environment = root / ".venv"
        if environment.exists() or environment.is_symlink():
            require_venv(root)
            emit(text("保留并复用已有 .venv", "Keeping and reusing existing .venv", root), log)
        else:
            run_command([sys.executable, "-m", "venv", str(environment)], root=root, log=log)

    verify = (
        "import pathlib,sys; "
        f"assert sys.version_info >= (3,10), {text('需要 Python 3.10 或以上', 'Python >= 3.10 required', root)!r}; "
        "assert sys.prefix != sys.base_prefix and "
        "pathlib.Path(sys.prefix).resolve() == pathlib.Path(sys.argv[1]).resolve(), "
        f"{text('项目虚拟环境无效', 'Invalid project virtual environment', root)!r}"
    )
    env = child_environment(root)
    env["PIP_REQUIRE_VIRTUALENV"] = "true"
    stages: list[Stage] = [
        (text("创建或复用环境", "Create or reuse environment", root), create),
        (text("检查解释器", "Check interpreter", root), lambda log: run_command(
            [str(python), "-c", verify, str(root / ".venv")], root=root, log=log)),
    ]
    if (root / "frontend/package.json").is_file():
        # Generated app editable metadata requires output/frontend/index.html.
        stages.extend([
            (text("安装前端依赖", "Install frontend dependencies", root), lambda log: run_npm(root, ["install"], log)),
            (text("构建前端", "Build frontend", root), lambda log: build_frontend(root, log)),
        ])
    stages.append((text("安装开发依赖", "Install development dependencies", root), lambda log: run_command(
        [str(python), "-m", "pip", "install", "-e", ".[dev,tray]"],
        root=root, log=log, env=env)))
    run_stages(root, "init", stages)
    # Only retire old metadata after the editable install has succeeded.
    cleanup_legacy_metadata(root)


def cleanup_legacy_metadata(root: Path) -> None:
    """Remove only verified generated metadata for this project from the root."""
    legacy = root / "easy_windows_pack.egg-info"
    current = root / "backend/base/easy_windows_pack.egg-info"
    if (not legacy.is_dir() or legacy.is_symlink()
            or legacy.resolve() != root.resolve() / legacy.name
            or current.resolve() != root.resolve() / "backend/base/easy_windows_pack.egg-info"
            or not (current / "PKG-INFO").is_file()
            or (current / "PKG-INFO").is_symlink()):
        return
    try:
        metadata = (legacy / "PKG-INFO").read_text(encoding="utf-8")
        replacement = (current / "PKG-INFO").read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return
    if not all(re.search(r"(?m)^Name: easy-windows-pack\r?$", value) for value in (metadata, replacement)):
        return
    generated = {"PKG-INFO", "SOURCES.txt", "dependency_links.txt", "entry_points.txt",
                 "requires.txt", "top_level.txt", "not-zip-safe", "zip-safe"}
    if any(item.is_symlink() or not item.is_file() or item.name not in generated for item in legacy.iterdir()):
        return
    shutil.rmtree(legacy)
    emit(text("已清理根目录旧元数据", "Removed legacy metadata from project root", root))


def task_command(name: str, root: Path) -> list[str]:
    python = str(venv_python(root))
    if name == "test":
        return [python, "-m", "unittest", "discover", "-s", "tests", "-v"]
    if name == "wheel":
        return [python, "-m", "build", "--wheel", "--no-isolation", "--outdir", str(root / "output/wheels"), str(root)]
    if name == "bundle":
        return [python, "-m", "easy_windows_pack.cli", "bundle", "--output-dir", str(root / "output/bundles")]
    if name == "exe":
        return [
            python, "-m", "PyInstaller", "--noconfirm", "--onefile", "--windowed",
            "--name", "easy-windows-pack-demo", "--paths", str(root / "build/exe-src"),
            "--specpath", str(root / "build/spec"), "--workpath", str(root / "build/pyinstaller"),
            "--distpath", str(root / "output/exe"),
            "--add-data", f"{root / 'output/frontend'};output/frontend", str(root / "backend/src/demo.py"),
        ]
    raise DevError(text(f"未知任务：{name}", f"Unknown task: {name}", root))


def prepare_exe_sources(root: Path) -> None:
    # PyInstaller cannot resolve setuptools' editable sys.meta_path mapping.
    source = root / "backend/base/ewpcore"
    destination = root / "build/exe-src/easy_windows_pack"
    if not (source / "__init__.py").is_file():
        raise DevError(text("缺少框架源码", "Missing framework source", root))
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))


def check_packager() -> None:
    try:
        import PyInstaller
        loader = Path(PyInstaller.__file__).parent / "bootloader" / PyInstaller.PLATFORM / "runw.exe"
        with loader.open("rb") as stream:
            if stream.read(2) != b"MZ":
                raise OSError(text("Windows 启动器无效", "Invalid Windows bootloader"))
    except (ImportError, OSError) as error:
        raise DevError(
            text("打包器缺失或启动器不可读；关闭占用程序并检查系统拦截记录，然后运行 startup.cmd init。",
                 "Missing or unreadable PyInstaller bootloader; check file locks and protection logs, "
                 "then run startup.cmd init. ") + str(error)
        ) from error


def run_task(task: str, root: Path, log: TextIO | None) -> None:
    if task == "frontend":
        build_frontend(root, log)
        return
    if task == "exe" or (task == "wheel" and (root / "frontend/package.json").is_file()):
        build_frontend(root, log)
    if task == "exe":
        check_packager()
        prepare_exe_sources(root)
    run_command(task_command(task, root), root=root, log=log)
    if task == "exe":
        artifact = root / "output/exe/easy-windows-pack-demo.exe"
        try:
            with artifact.open("rb") as stream:
                if stream.read(2) != b"MZ":
                    raise OSError(text("PE 文件头无效", "Invalid PE header", root))
        except OSError as error:
            raise DevError(
                 text(f"EXE 产物不存在或不可读，请检查占用及系统防护记录：{artifact}",
                     f"EXE artifact missing or unreadable; check locks and protection records: {artifact}", root)
            ) from error
        emit(text(f"产物已验证：{artifact}（{artifact.stat().st_size} 字节）",
              f"Artifact verified: {artifact} ({artifact.stat().st_size} bytes)", root), log)


class FrontendHandler(SimpleHTTPRequestHandler):
    """Serve only resolved frontend paths, including when symlinks are present."""

    def __init__(self, *args, directory: str, **kwargs):
        self.frontend_root = Path(directory).resolve()
        super().__init__(*args, directory=directory, **kwargs)

    def send_head(self):
        try:
            target = Path(self.translate_path(self.path)).resolve()
            allowed = target.is_relative_to(self.frontend_root)
            # SimpleHTTPRequestHandler also follows an index symlink in a directory.
            if allowed and target.is_dir():
                allowed = all(
                    (target / name).resolve().is_relative_to(self.frontend_root)
                    for name in ("index.html", "index.htm")
                )
        except (OSError, ValueError, RuntimeError):
            allowed = False
        if not allowed:
            self.send_error(403, "Forbidden", explain=text("超出前端目录", "Outside frontend root", self.frontend_root.parent))
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(403, "Forbidden", explain=text("禁止列出目录", "Directory listing disabled", self.frontend_root.parent))
        return None


def make_server(root: Path, port: int = 0) -> ThreadingHTTPServer:
    frontend = root / "frontend"
    if not frontend.is_dir() or frontend.resolve() != root.resolve() / "frontend":
        raise DevError(text("缺少 frontend 目录或它是外部链接", "Missing frontend directory or linked root", root))
    return ThreadingHTTPServer(("127.0.0.1", port), partial(FrontendHandler, directory=str(frontend.resolve())))


def browser(root: Path, port: int, no_open: bool) -> None:
    emit(text("Vite 浏览器预览；按 Ctrl+C 停止", "Vite browser preview; Ctrl+C to stop", root))
    run_npm(root, ["run", "frontend:dev", "--", "--port", str(port),
                   *(["--no-open"] if no_open else [])])


def legacy_browser(root: Path, port: int, no_open: bool) -> None:
    with make_server(root, port) as server:
        url = f"http://127.0.0.1:{server.server_port}/src/index.html"
        emit(text(f"浏览器预览：{url}", f"Browser preview: {url}", root))
        emit(text("按 Ctrl+C 停止", "Press Ctrl+C to stop", root))
        if not no_open:
            try:
                if not webbrowser.open(url):
                    emit(text("无法自动打开浏览器，请访问上述 URL", "Open the URL manually", root))
            except webbrowser.Error as error:
                emit(text(f"请手动打开 URL：{error}", f"Open the URL manually: {error}", root))
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            emit(text("预览已停止", "Preview stopped", root))


def info(root: Path) -> None:
    emit(f"Python: {sys.version.split()[0]} ({sys.executable})")
    emit(text(f"项目目录：{root}", f"Project root: {root}", root))
    emit(text(f"虚拟环境：{venv_python(root)}", f"Virtual environment: {venv_python(root)}", root))
    yes_no = lambda value: text("是" if value else "否", "yes" if value else "no", root)
    emit(text("当前使用项目环境：", "Using project environment: ", root) + yes_no(in_project_venv(root)))
    emit(text("环境解释器存在：", "Environment interpreter exists: ", root) + yes_no(venv_python(root).is_file()))
    emit(text("初始化命令：startup.cmd init", "Initialize: startup.cmd init", root))
    for directory, zh, en in (
        ("output/frontend", "Vite 前端产物", "Vite frontend assets"),
        ("output/wheels", "Wheel 包", "Wheels"), ("output/exe", "桌面程序", "Executables"),
        ("output/bundles", "源码包", "Source bundles"), ("output/logs", "构建与初始化日志", "Build and init logs"),
        ("build/spec", "打包配置", "PyInstaller specs"), ("build/pyinstaller", "打包缓存", "PyInstaller work"),
    ):
        emit(f"{text(zh, en, root)}: {root / directory}")


def parser(root: Path = ROOT, override: str | None = None) -> argparse.ArgumentParser:
    language = project_language(root, override)
    choose = lambda zh, en: en if language == "en" else zh
    result = LocalizedParser(description=choose("开发与构建工具", "Development and build tools"), language=language)
    lang_help = choose("临时选择语言（优先于 EWP_LANG 和项目配置）", "Temporary language (overrides EWP_LANG and project config)")
    result.add_argument("--lang", choices=("zh-CN", "en"), default=argparse.SUPPRESS, help=lang_help)
    commands = result.add_subparsers(dest="command", title=choose("任务", "tasks"),
                                    parser_class=partial(LocalizedParser, language=language))
    aliases = {"browser": ["frontend:dev"], "frontend": ["frontend:build"],
               "preview": ["frontend:preview"], "full-build": ["build:all"]}
    for name, label in LABELS.items():
        selected = choose(*label)
        command = commands.add_parser(name, aliases=aliases.get(name, []),
                                      help=selected, description=selected)
        command.add_argument("--lang", choices=("zh-CN", "en"), default=argparse.SUPPRESS, help=lang_help)
        if name in ("browser", "dev", "preview"):
            command.add_argument("--no-open", action="store_true", help=choose("不自动打开浏览器", "Do not open browser"))
            command.add_argument("--port", type=int, default=0, metavar=choose("端口", "PORT"),
                                 help=choose("端口，0 为自动", "Port, 0 for automatic"))
            if name == "dev":
                command.add_argument("--web", action="store_true", help=choose("仅浏览器热更新", "Browser HMR only"))
        elif name == "demo":
            command.add_argument("--debug", action="store_true", help=choose("开发者工具", "Developer tools"))
        elif name == "build":
            target = command.add_mutually_exclusive_group()
            target.add_argument("-w", "--wheel", action="store_const", const="wheel", dest="build_target",
                                help=choose("构建 wheel", "Build a wheel"))
            target.add_argument("-e", "--exe", action="store_const", const="exe", dest="build_target",
                                help=choose("构建 EXE（默认）", "Build an EXE (default)"))
            target.add_argument("--all", action="store_const", const="full-build", dest="build_target",
                                help=choose("执行测试、wheel、EXE 和源码包构建", "Run tests, wheel, EXE and source bundle builds"))
            command.set_defaults(build_target="exe")
    menu_command = commands.add_parser("menu", help=choose("打开开发菜单", "Open development menu"))
    menu_command.add_argument("--lang", choices=("zh-CN", "en"), default=argparse.SUPPRESS, help=lang_help)
    help_command = commands.add_parser("help", help=choose("显示任务帮助", "Show task help"))
    help_command.add_argument("task", nargs="?", metavar=choose("任务", "TASK"),
                              choices=(*LABELS, "frontend:dev", "frontend:build", "frontend:preview", "build:all", "menu"),
                              help=choose("需要帮助的任务", "Task to show help for"))
    help_command.add_argument("--lang", choices=("zh-CN", "en"), default=argparse.SUPPRESS, help=lang_help)
    return result


def execute(args: argparse.Namespace, argv: Sequence[str], root: Path) -> int:
    with language_context(root, getattr(args, "lang", None)):
        return _execute(args, argv, root)


def _execute(args: argparse.Namespace, argv: Sequence[str], root: Path) -> int:
    try:
        name = args.command
        name = {"frontend:dev": "browser", "frontend:build": "frontend",
            "frontend:preview": "preview", "build:all": "full-build"}.get(name, name)
        if name == "build":
            name = args.build_target
        if name == "info":
            info(root)
        elif name == "init":
            initialize(root)
        elif name == "menu":
            return menu(root, LANGUAGE.get())
        elif name == "help":
            parser(root, LANGUAGE.get()).parse_args([*([args.task] if args.task else []), "--help"])
        elif name == "check":
            run_npm(root, ["run", "ewp", "--", "check"])
        else:
            if name in ("exe", "full-build") and sys.platform != "win32":
                raise DevError(text("EXE 与完整构建仅支持 Windows", "EXE and full build require Windows"))
            if name in ("browser", "dev", "preview") and not 0 <= args.port <= 65535:
                raise DevError(text("端口必须为 0–65535", "Port must be 0–65535"))
            if name not in ("browser", "frontend", "dev", "preview") and reenter(root, argv):
                return 0
            if name == "browser":
                browser(root, args.port, args.no_open)
            elif name in ("dev", "preview"):
                emit(text(*LABELS[name]) + text("；按 Ctrl+C 停止", "; Ctrl+C to stop"))
                # Node dev owns Vite and calls Python demo --debug with EWP_DEV_URL.
                # Calling npm dev here never forwards this task back into Python dev.
                run_npm(root, ["run", "dev" if name == "dev" else "frontend:preview", "--",
                               "--port", str(args.port),
                               *(["--web"] if name == "dev" and args.web else []),
                               *(["--no-open"] if args.no_open else [])])
            elif name == "demo":
                if not os.environ.get("EWP_DEV_URL"):
                    build_frontend(root)
                run_command([str(venv_python(root)), str(root / "backend/src/demo.py"),
                             *(["--debug"] if args.debug else [])], root=root)
            else:
                tasks = ["test", "wheel", "exe", "bundle"] if name == "full-build" else [name]
                stages: list[Stage] = []
                for task in tasks:
                    stages.append((text(*LABELS[task]), lambda log, task=task: run_task(task, root, log)))
                run_stages(root, name, stages, logged=name != "test")
        return 0
    except DevError as error:
        emit(text(f"错误：{error}", f"Error: {error}"))
        return error.code
    except (OSError, subprocess.SubprocessError) as error:
        emit(text(f"操作失败：{error}", f"Operation failed: {error}"))
        return 1
    except KeyboardInterrupt:
        emit(text("操作已取消", "Operation cancelled"))
        return 130


def menu(root: Path, override: str | None = None) -> int:
    with language_context(root, override):
        return _menu(root)


def _menu(root: Path) -> int:
    names = list(LABELS)
    while True:
        emit(text("\nEasy Windows Pack — 开发菜单", "\nEasy Windows Pack — Development menu"))
        for number, name in enumerate(names, 1):
            emit(f"{number}. {text(*LABELS[name])}")
        emit(text("0. 退出", "0. Exit"))
        try:
            choice = input(text("请选择：", "Select: ")).strip()
        except (EOFError, KeyboardInterrupt):
            return 0
        if choice == "0":
            return 0
        if choice not in {str(number) for number in range(1, len(names) + 1)}:
            emit(text("无效选项", "Invalid choice"))
            continue
        argv = [names[int(choice) - 1]]
        args = parser(root, LANGUAGE.get()).parse_args(argv)
        args.lang = LANGUAGE.get()
        code = execute(args, argv, root)
        if code:
            emit(text(f"任务失败，可重试（退出码 {code}）", f"Task failed; select again (exit {code})"))


def main(argv: Sequence[str] | None = None, *, root: Path = ROOT) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    root = root.resolve()
    with language_context(root, language_override(arguments)):
        if sys.version_info < (3, 10):
            emit(text("需要 Python 3.10 或以上", "Python 3.10 or newer is required"))
            return 1
        args = parser(root, LANGUAGE.get()).parse_args(arguments)
        return execute(args, arguments, root) if args.command else menu(root, LANGUAGE.get())


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main())