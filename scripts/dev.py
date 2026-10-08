"""Standard-library development entry point (Python 3.10+)."""
from __future__ import annotations

import argparse
import codecs
from contextlib import nullcontext
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import queue
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
    "init": "初始化环境 / Initialize environment",
    "browser": "Vite 浏览器预览 / Vite browser preview",
    "frontend": "构建前端 / Build frontend",
    "demo": "桌面演示 / Desktop demo",
    "wheel": "构建 Wheel / Build wheel",
    "exe": "构建 Windows EXE / Build Windows EXE",
    "bundle": "构建源码包 / Build source bundle",
    "build": "完整构建 / Full build",
    "test": "运行测试 / Run tests",
    "info": "环境信息 / Environment info",
}


class DevError(RuntimeError):
    def __init__(self, message: str, code: int = 1):
        super().__init__(message)
        self.code = code


def emit(message: str, log: TextIO | None = None) -> None:
    print(message, flush=True)
    if log is not None:
        log.write(message + "\n")
        log.flush()


def child_environment() -> dict[str, str]:
    env = os.environ.copy()
    # An activated foreign environment or user PYTHONPATH must not select code.
    env.pop("PYTHONHOME", None)
    env.pop("PYTHONPATH", None)
    env.update(PYTHONUTF8="1", PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
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
    emit("执行 / Run: " + subprocess.list2cmdline(list(command)), log)
    process = subprocess.Popen(
        process_command(command), cwd=root, env=env if env is not None else child_environment(),
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
                text = decoder.decode(chunk)
                sys.stdout.write(text)
                sys.stdout.flush()
                log.write(text)
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
        raise DevError(f"子进程失败 / Child process failed (exit {code})", code if code > 0 else 1)


def process_command(command: Sequence[str]) -> list[str] | str:
    """cmd.exe needs a verbatim command string, not CRT argv escaping."""
    if sys.platform != "win32" or Path(command[0]).suffix.lower() not in (".cmd", ".bat"):
        return list(command)
    if any(any(char in token for char in '\"%\r\n\0') for token in command):
        raise DevError("npm 参数无法安全引用 / Cannot safely quote Windows batch argument")
    shell = os.environ.get("COMSPEC") or str(Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32/cmd.exe")
    prefix = subprocess.list2cmdline([shell, "/d", "/s", "/v:off", "/c"])
    return prefix + ' "' + " ".join('"' + token + '"' for token in command) + '"'


def run_npm(root: Path, arguments: Sequence[str], log: TextIO | None = None) -> None:
    if not (root / "package.json").is_file():
        raise DevError("缺少 package.json / Missing package.json")
    # Keep cwd separate from the batch command: paths with spaces and & stay literal.
    if sys.platform == "win32" and any(char in str(root) for char in '\"%\r\n\0'):
        raise DevError("项目路径无法安全引用 / Cannot safely quote project path")
    npm = shutil.which("npm.cmd" if sys.platform == "win32" else "npm")
    if npm is None:
        raise DevError("缺少 npm，请安装 Node.js 并重新打开终端 / Missing npm; install Node.js and reopen the terminal")
    run_command([npm, *arguments], root=root, log=log)


def build_frontend(root: Path, log: TextIO | None = None) -> None:
    run_npm(root, ["run", "frontend:build"], log)


def venv_python(root: Path) -> Path:
    return root / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def in_project_venv(root: Path) -> bool:
    return sys.prefix != sys.base_prefix and Path(sys.prefix).resolve() == (root / ".venv").resolve()


def require_venv(root: Path) -> Path:
    python = venv_python(root)
    if not python.is_file() or not (root / ".venv/pyvenv.cfg").is_file():
        raise DevError("缺少有效虚拟环境，请运行 build.cmd init / Missing valid .venv; run build.cmd init")
    return python


def reenter(root: Path, argv: Sequence[str]) -> bool:
    python = require_venv(root)
    if in_project_venv(root):
        return False
    token = str(root.resolve())
    if os.environ.get(REENTRY) == token:
        raise DevError("虚拟环境解释器无效；请检查 .venv / Invalid .venv interpreter; re-entry stopped")
    env = child_environment()
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
        emit(f"日志 / Log: {log_path}")
    with (log_path.open("w", encoding="utf-8") if log_path else nullcontext(None)) as log:
        done = 0
        try:
            for label, action in stages:
                progress(done, len(stages), "开始 / Starting: " + label, log)
                action(log)
                done += 1
                progress(done, len(stages), "完成 / Completed: " + label, log)
        except BaseException as error:
            emit(f"失败或中断 / Failed or interrupted ({done}/{len(stages)}): {error}", log)
            raise


def initialize(root: Path) -> None:
    python = venv_python(root)

    def create(log: TextIO | None) -> None:
        environment = root / ".venv"
        if environment.exists() or environment.is_symlink():
            require_venv(root)
            emit("保留并复用已有 .venv / Keeping and reusing existing .venv", log)
        else:
            run_command([sys.executable, "-m", "venv", str(environment)], root=root, log=log)

    verify = (
        "import pathlib,sys; "
        "assert sys.version_info >= (3,10), 'Python >= 3.10 required'; "
        "assert sys.prefix != sys.base_prefix and "
        "pathlib.Path(sys.prefix).resolve() == pathlib.Path(sys.argv[1]).resolve(), "
        "'Invalid project virtual environment'"
    )
    env = child_environment()
    env["PIP_REQUIRE_VIRTUALENV"] = "true"
    stages: list[Stage] = [
        ("创建或复用环境 / Create or reuse environment", create),
        ("检查解释器 / Check interpreter", lambda log: run_command(
            [str(python), "-c", verify, str(root / ".venv")], root=root, log=log)),
    ]
    if (root / "package.json").is_file():
        # Generated app editable metadata requires output/frontend/index.html.
        stages.extend([
            ("安装前端依赖 / Install frontend dependencies", lambda log: run_npm(root, ["install"], log)),
            ("构建前端 / Build frontend", lambda log: build_frontend(root, log)),
        ])
    stages.append(("安装开发依赖 / Install development dependencies", lambda log: run_command(
        [str(python), "-m", "pip", "install", "-e", ".[dev,tray]"],
        root=root, log=log, env=env)))
    run_stages(root, "init", stages)


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
    raise DevError(f"未知任务 / Unknown task: {name}")


def prepare_exe_sources(root: Path) -> None:
    # PyInstaller cannot resolve setuptools' editable sys.meta_path mapping.
    source = root / "backend/base/ewpcore"
    destination = root / "build/exe-src/easy_windows_pack"
    if not (source / "__init__.py").is_file():
        raise DevError("缺少框架源码 / Missing framework source")
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))


def check_packager() -> None:
    try:
        import PyInstaller
        loader = Path(PyInstaller.__file__).parent / "bootloader" / PyInstaller.PLATFORM / "runw.exe"
        with loader.open("rb") as stream:
            if stream.read(2) != b"MZ":
                raise OSError("Invalid Windows bootloader")
    except (ImportError, OSError) as error:
        raise DevError(
            "打包器缺失或启动器不可读；关闭占用程序并检查系统拦截记录，然后运行 build.cmd init。"
            " / Missing or unreadable PyInstaller bootloader; check file locks and protection logs, "
            "then run build.cmd init. " + str(error)
        ) from error


def run_task(task: str, root: Path, log: TextIO | None) -> None:
    if task == "frontend":
        build_frontend(root, log)
        return
    if task == "exe" or (task == "wheel" and (root / "package.json").is_file()):
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
                    raise OSError("Invalid PE header")
        except OSError as error:
            raise DevError(
                "EXE 产物不存在或不可读，请检查占用及系统防护记录 / "
                f"EXE artifact missing or unreadable; check locks and protection records: {artifact}"
            ) from error
        emit(f"产物已验证 / Artifact verified: {artifact} ({artifact.stat().st_size} bytes)", log)


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
            self.send_error(403, "Outside frontend root")
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(403, "Directory listing disabled")
        return None


def make_server(root: Path, port: int = 0) -> ThreadingHTTPServer:
    frontend = root / "frontend"
    if not frontend.is_dir() or frontend.resolve() != root.resolve() / "frontend":
        raise DevError("缺少 frontend 目录或它是外部链接 / Missing frontend directory or linked root")
    return ThreadingHTTPServer(("127.0.0.1", port), partial(FrontendHandler, directory=str(frontend.resolve())))


def browser(root: Path, port: int, no_open: bool) -> None:
    emit("Vite 浏览器预览 / Vite browser preview; Ctrl+C 停止 / stop")
    run_npm(root, ["run", "frontend:dev", "--", "--port", str(port),
                   *(["--no-open"] if no_open else [])])


def legacy_browser(root: Path, port: int, no_open: bool) -> None:
    with make_server(root, port) as server:
        url = f"http://127.0.0.1:{server.server_port}/src/index.html"
        emit(f"浏览器预览 / Browser preview: {url}")
        emit("按 Ctrl+C 停止 / Press Ctrl+C to stop")
        if not no_open:
            try:
                if not webbrowser.open(url):
                    emit("无法自动打开浏览器，请访问上述 URL / Open the URL manually")
            except webbrowser.Error as error:
                emit(f"请手动打开 URL / Open the URL manually: {error}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            emit("预览已停止 / Preview stopped")


def info(root: Path) -> None:
    emit(f"Python / Python: {sys.version.split()[0]} ({sys.executable})")
    emit(f"项目目录 / Project root: {root}")
    emit(f"虚拟环境 / Virtual environment: {venv_python(root)}")
    emit(f"当前使用项目环境 / Using project environment: {in_project_venv(root)}")
    emit(f"环境解释器存在 / Environment interpreter exists: {venv_python(root).is_file()}")
    emit("初始化命令 / Initialize: build.cmd init")
    for directory, label in (
        ("output/frontend", "Vite 前端产物 / Vite frontend assets"),
        ("output/wheels", "Wheel 包 / Wheels"), ("output/exe", "桌面程序 / Executables"),
        ("output/bundles", "源码包 / Source bundles"), ("output/logs", "构建与初始化日志 / Build and init logs"),
        ("build/spec", "打包配置 / PyInstaller specs"), ("build/pyinstaller", "打包缓存 / PyInstaller work"),
    ):
        emit(f"{label}: {root / directory}")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="开发与构建工具 / Development and build tools")
    commands = result.add_subparsers(dest="command")
    for name, label in LABELS.items():
        command = commands.add_parser(name, help=label, description=label)
        if name == "browser":
            command.add_argument("--no-open", action="store_true", help="不自动打开浏览器 / Do not open browser")
            command.add_argument("--port", type=int, default=0, help="端口，0 为自动 / Port, 0 for automatic")
        elif name == "demo":
            command.add_argument("--debug", action="store_true", help="开发者工具 / Developer tools")
    return result


def execute(args: argparse.Namespace, argv: Sequence[str], root: Path) -> int:
    try:
        name = args.command
        if name == "info":
            info(root)
        elif name == "init":
            initialize(root)
        else:
            if name in ("exe", "build") and sys.platform != "win32":
                raise DevError("EXE 与完整构建仅支持 Windows / EXE and full build require Windows")
            if name == "browser" and not 0 <= args.port <= 65535:
                raise DevError("端口必须为 0–65535 / Port must be 0–65535")
            if name not in ("browser", "frontend") and reenter(root, argv):
                return 0
            if name == "browser":
                browser(root, args.port, args.no_open)
            elif name == "demo":
                if not os.environ.get("EWP_DEV_URL"):
                    build_frontend(root)
                run_command([str(venv_python(root)), str(root / "backend/src/demo.py"),
                             *(["--debug"] if args.debug else [])], root=root)
            else:
                tasks = ["test", "wheel", "exe", "bundle"] if name == "build" else [name]
                stages: list[Stage] = []
                for task in tasks:
                    stages.append((LABELS[task], lambda log, task=task: run_task(task, root, log)))
                run_stages(root, name, stages, logged=name != "test")
        return 0
    except DevError as error:
        emit(f"错误 / Error: {error}")
        return error.code
    except (OSError, subprocess.SubprocessError) as error:
        emit(f"操作失败 / Operation failed: {error}")
        return 1
    except KeyboardInterrupt:
        emit("操作已取消 / Operation cancelled")
        return 130


def menu(root: Path) -> int:
    names = list(LABELS)
    while True:
        emit("\nEasy Windows Pack — 开发菜单 / Development menu")
        for number, name in enumerate(names, 1):
            emit(f"{number}. {LABELS[name]}")
        emit("0. 退出 / Exit")
        try:
            choice = input("请选择 / Select: ").strip()
        except (EOFError, KeyboardInterrupt):
            return 0
        if choice == "0":
            return 0
        if choice not in {str(number) for number in range(1, len(names) + 1)}:
            emit("无效选项 / Invalid choice")
            continue
        argv = [names[int(choice) - 1]]
        code = execute(parser().parse_args(argv), argv, root)
        if code:
            emit(f"任务失败，可重试 / Task failed; select again (exit {code})")


def main(argv: Sequence[str] | None = None, *, root: Path = ROOT) -> int:
    if sys.version_info < (3, 10):
        emit("需要 Python 3.10 或以上 / Python 3.10 or newer is required")
        return 1
    arguments = list(sys.argv[1:] if argv is None else argv)
    args = parser().parse_args(arguments)
    return execute(args, arguments, root.resolve()) if args.command else menu(root.resolve())


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main())