"""Opt-in Windows acceptance of the current wheel, including real frozen GUIs.

Run with the selected repository venv after rebuilding output/wheels/0.3.0.
Only pip --target installs are performed. Each mode owns a separate project root;
all executables, payloads, logs and the failure-aware report remain under build/.
The real frozen wizard is driven with Win32 input using layouts calibrated from
the installed wheel's Tk renderer; its engines are never replaced. Long install
paths, forty empty directories and bounded helper waits exercise real cleanup.
This requires an interactive Windows desktop.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes
from email.parser import BytesParser
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import tomllib
import traceback
import zipfile


REPOSITORY = Path(__file__).resolve().parents[1]


def wait_for(predicate, label: str, timeout: float = 30):
    deadline = time.monotonic() + timeout
    while True:
        value = predicate()
        if value:
            return value
        if time.monotonic() >= deadline:
            raise TimeoutError(label)
        threading.Event().wait(0.1)


def processes() -> dict[int, dict]:
    """Include PyInstaller's bootloader/child relationship, not just Popen.pid."""
    class Entry(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("usage", wintypes.DWORD),
                    ("pid", wintypes.DWORD), ("heap", ctypes.c_size_t),
                    ("module", wintypes.DWORD), ("threads", wintypes.DWORD),
                    ("parent", wintypes.DWORD), ("priority", wintypes.LONG),
                    ("flags", wintypes.DWORD), ("exe", wintypes.WCHAR * 260)]

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    kernel.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    kernel.Process32FirstW.argtypes = kernel.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(Entry)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    snapshot = kernel.CreateToolhelp32Snapshot(2, 0)
    if snapshot == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    result = {}
    try:
        entry = Entry(size=ctypes.sizeof(Entry))
        more = kernel.Process32FirstW(snapshot, ctypes.byref(entry))
        while more:
            result[entry.pid] = {"parent": entry.parent, "exe": entry.exe}
            more = kernel.Process32NextW(snapshot, ctypes.byref(entry))
    finally:
        kernel.CloseHandle(snapshot)
    return result


class FrozenGui:
    """Use user32 against the unmodified frozen tkinter window.

    Tk's controls do not expose standard BM_GETCHECK/EM_GETSEL contracts. Use
    actual mouse/keyboard input; installed state proves the selections and
    edited path. GetGUIThreadInfo exposes native focus, not Tk's logical focus.
    """
    def __init__(self, executable: Path, destination: Path, name: str, evidence: dict,
                 templates: dict):
        self.templates = templates
        self.page = "confirm" if executable.name.lower() == "uninstall.exe" else "directory"
        self.process = subprocess.Popen([str(executable), "--install-dir", str(destination)],
                                        cwd=executable.parent)
        self.evidence = evidence
        evidence.update(argv=self.process.args, bootloaderPid=self.process.pid)
        self.connect()
        self.hwnd = None
        try:
            self.hwnd = wait_for(lambda: self.find_window(name), "Frozen GUI did not become visible", 60)
            self.expect_page(self.page)
            evidence["window"] = self.describe(self.hwnd)
            self.responds()
            self.focus()
        except BaseException:
            self.close()
            raise

    def connect(self) -> None:
        self.user = ctypes.WinDLL("user32", use_last_error=True)
        self.callback = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        self.user.EnumWindows.argtypes = [self.callback, wintypes.LPARAM]
        self.user.EnumChildWindows.argtypes = [wintypes.HWND, self.callback, wintypes.LPARAM]
        self.user.IsWindowVisible.argtypes = [wintypes.HWND]
        self.user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
        self.user.GetWindowThreadProcessId.restype = wintypes.DWORD
        self.user.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
        self.user.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
        self.user.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
        self.user.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
        self.user.GetAncestor.restype = wintypes.HWND
        self.user.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
        self.user.SetForegroundWindow.argtypes = [wintypes.HWND]
        self.user.GetForegroundWindow.restype = wintypes.HWND
        self.user.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
        self.user.SendMessageTimeoutW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM,
                                               wintypes.LPARAM, wintypes.UINT, wintypes.UINT,
                                               ctypes.POINTER(ctypes.c_size_t)]
        self.user.SendMessageTimeoutW.restype = ctypes.c_ssize_t

    def focus(self) -> None:
        # Windows can deny foreground activation from the terminal thread.
        # Temporarily share the foreground and Tk threads' input queues, then
        # detach them before SendInput so no attachment escapes this operation.
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.GetCurrentThreadId.restype = wintypes.DWORD
        self.user.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
        self.user.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
        self.user.BringWindowToTop.argtypes = [wintypes.HWND]
        self.user.SetFocus.argtypes = [wintypes.HWND]
        current = kernel.GetCurrentThreadId()
        foreground = self.user.GetForegroundWindow()
        threads = {self.user.GetWindowThreadProcessId(handle, None) for handle in (foreground, self.hwnd)}
        attached = []
        try:
            for thread in threads - {0, current}:
                if self.user.AttachThreadInput(current, thread, True):
                    attached.append(thread)
            self.user.ShowWindow(self.hwnd, 9)
            self.user.BringWindowToTop(self.hwnd)
            self.user.SetForegroundWindow(self.hwnd)
            self.user.SetFocus(self.hwnd)
        finally:
            for thread in attached:
                self.user.AttachThreadInput(current, thread, False)
        wait_for(lambda: self.user.GetForegroundWindow() == self.hwnd, "Cannot focus the frozen GUI", 5)
        self.evidence["foregroundVerified"] = True

    def describe(self, hwnd) -> dict:
        text, kind = ctypes.create_unicode_buffer(1024), ctypes.create_unicode_buffer(256)
        self.user.GetWindowTextW(hwnd, text, len(text))
        self.user.GetClassNameW(hwnd, kind, len(kind))
        rect, pid = wintypes.RECT(), wintypes.DWORD()
        self.user.GetWindowRect(hwnd, ctypes.byref(rect))
        self.user.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        return {"hwnd": hwnd, "pid": pid.value, "class": kind.value, "text": text.value,
                "rect": [rect.left, rect.top, rect.right, rect.bottom]}

    def find_window(self, name: str):
        if self.process.poll() is not None:
            raise RuntimeError(f"Frozen GUI exited early: {self.process.returncode}")
        tree, owned = processes(), {self.process.pid}
        while True:
            children = {pid for pid, item in tree.items() if item["parent"] in owned}
            if children <= owned:
                break
            owned |= children
        found = []

        @self.callback
        def visit(hwnd, _):
            item = self.describe(hwnd)
            if item["pid"] in owned and self.user.IsWindowVisible(hwnd) and item["text"].startswith(name):
                found.append(hwnd)
            return True

        self.user.EnumWindows(visit, 0)
        return found[0] if found else None

    def children(self) -> list:
        found = []

        @self.callback
        def visit(hwnd, _):
            if self.user.IsWindowVisible(hwnd):
                found.append(hwnd)
            return True

        self.user.EnumChildWindows(self.hwnd, visit, 0)
        return found

    def relative(self, item: dict) -> tuple:
        origin = wintypes.POINT()
        assert self.user.ClientToScreen(self.hwnd, ctypes.byref(origin))
        left, top, right, bottom = item["rect"]
        return (item["class"], left - origin.x, top - origin.y,
                right - origin.x, bottom - origin.y)

    def layout(self) -> list:
        # Frozen Tk has an additional wrapper HWND over the full client area.
        # Compare unique visible regions, retaining every distinct control rect.
        return sorted({self.relative(self.describe(handle)) for handle in self.children()})

    def expect_page(self, name: str) -> None:
        expected = self.templates[name]
        wait_for(lambda: self.layout() == expected["layout"], f"Frozen wizard did not show {name}", 15)
        self.page = name
        self.responds()
        self.evidence.setdefault("pages", []).append({"page": name, "layoutMatchedInstalledWheel": True,
                                                      "buttons": expected["buttons"]})

    def control(self, role: str) -> dict:
        expected = self.templates[self.page]["roles"][role]
        matches = [self.describe(handle) for handle in self.children()
                   if self.relative(self.describe(handle)) == expected]
        assert len(matches) == 1, (self.page, role, matches)
        return matches[0]

    def screenshot(self, name: str) -> None:
        from PIL import ImageGrab
        self.focus()
        image = ImageGrab.grab(window=self.hwnd)
        assert image.width > 500 and image.height > 400
        path = Path(self.evidence["evidenceDirectory"]) / (name + ".png")
        image.save(path)
        self.evidence.setdefault("screenshots", []).append(str(path))

    def responds(self) -> None:
        result = ctypes.c_size_t()
        assert self.user.SendMessageTimeoutW(self.hwnd, 0, 0, 0, 2, 2000, ctypes.byref(result)), "GUI hung"
        self.evidence["visibleResponsive"] = True

    def keys(self, *keys: int, text: str = "", mouse: tuple[int, int] | None = None) -> None:
        class Keyboard(ctypes.Structure):
            _fields_ = [("key", wintypes.WORD), ("scan", wintypes.WORD),
                        ("flags", wintypes.DWORD), ("time", wintypes.DWORD), ("extra", ctypes.c_size_t)]

        class Mouse(ctypes.Structure):
            _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG), ("data", wintypes.DWORD),
                        ("flags", wintypes.DWORD), ("time", wintypes.DWORD), ("extra", ctypes.c_size_t)]

        class Union(ctypes.Union):
            _fields_ = [("keyboard", Keyboard), ("mouse", Mouse)]

        class Input(ctypes.Structure):
            _fields_ = [("type", wintypes.DWORD), ("value", Union)]

        self.user.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(Input), ctypes.c_int]
        if self.user.GetForegroundWindow() != self.hwnd:
            self.focus()
        events = []
        if mouse is not None:
            self.user.SetCursorPos.argtypes = [ctypes.c_int, ctypes.c_int]
            assert self.user.SetCursorPos(*mouse)
            events.extend([Input(0, Union(mouse=Mouse(0, 0, 0, 2, 0, 0))),
                           Input(0, Union(mouse=Mouse(0, 0, 0, 4, 0, 0)))])
        for key in keys:
            events.append(Input(1, Union(keyboard=Keyboard(key, 0, 0, 0, 0))))
        for key in reversed(keys):
            events.append(Input(1, Union(keyboard=Keyboard(key, 0, 2, 0, 0))))
        encoded = text.encode("utf-16-le")
        for index in range(0, len(encoded), 2):
            scan = int.from_bytes(encoded[index:index + 2], "little")
            events.extend([Input(1, Union(keyboard=Keyboard(0, scan, 4, 0, 0))),
                           Input(1, Union(keyboard=Keyboard(0, scan, 6, 0, 0)))])
        array = (Input * len(events))(*events)
        assert self.user.SendInput(len(events), array, ctypes.sizeof(Input)) == len(events)

    def click(self, item: dict) -> None:
        left, top, right, bottom = item["rect"]
        self.keys(mouse=((left + right) // 2, (top + bottom) // 2))
        self.responds()

    def configure(self, destination: Path) -> None:
        assert self.page == "directory"
        entry = self.control("entry")
        self.click(entry)
        self.keys(17, 65)  # Ctrl+A
        self.keys(text=str(destination))
        self.evidence["directoryControl"] = entry
        self.evidence["editedDirectory"] = str(destination)
        self.screenshot("directory")
        self.invoke_action("features")
        self.click(self.control("core"))  # Required checkbox must resist input.
        self.click(self.control("extra"))
        self.evidence["requiredCheckboxClicked"] = True
        self.screenshot("features")
        self.invoke_action("prerequisites")
        self.click(self.control("back"))
        self.expect_page("features")
        self.invoke_action("prerequisites")
        self.screenshot("dependencies")
        self.invoke_action("options")
        for name in ("startup", "setting"):
            self.click(self.control(name))
            self.evidence.setdefault("toggled", []).append(name)
        self.click(self.control("back"))
        self.expect_page("prerequisites")
        self.invoke_action("options")
        self.invoke_action("confirm")
        self.screenshot("confirm")
        assert not destination.exists(), "Wizard changed the destination before confirmation"
        self.evidence["choicesSurvivedBackNext"] = True

    def bottom_buttons(self) -> list[dict]:
        outer = self.describe(self.hwnd)["rect"]
        candidates = []
        for handle in self.children():
            item = self.describe(handle)
            left, top, right, bottom = item["rect"]
            if 50 <= right - left <= 160 and 20 <= bottom - top <= 45 and bottom > outer[3] - 100:
                candidates.append(item)
        return sorted(candidates, key=lambda item: item["rect"][0])

    def invoke_action(self, next_page: str | None = None) -> None:
        assert self.page in ("directory", "features", "prerequisites", "options", "confirm", "complete")
        button = self.control("action")
        if self.page == "confirm":
            self.evidence["navigationHandles"] = {role: self.control(role)["hwnd"]
                                                    for role in ("back", "action", "cancel")}
        self.click(button)
        self.evidence.setdefault("actions", []).append({"page": self.page, "control": button})
        if next_page:
            self.expect_page(next_page)

    def expect_progress(self) -> None:
        nav = self.evidence["navigationHandles"]
        wait_for(lambda: [item["hwnd"] for item in self.bottom_buttons()] == [nav["cancel"]],
                 "Progress must show only Cancel, with Back/Install hidden", 10)
        self.page = "progress"
        self.responds()
        self.evidence.setdefault("pages", []).append({"page": "progress", "onlyCancelVisible": True})

    def expect_complete(self) -> None:
        nav = self.evidence["navigationHandles"]
        wait_for(lambda: [item["hwnd"] for item in self.bottom_buttons()] == [nav["action"]],
                 "Successful completion must show only Finish", 30)
        self.page = "complete"
        self.responds()
        self.evidence.setdefault("pages", []).append({"page": "complete", "onlyFinishVisible": True})
        self.screenshot("done")

    def finish(self) -> None:
        assert self.page == "complete"
        buttons = self.bottom_buttons()
        assert len(buttons) == 1
        left, top, right, bottom = buttons[0]["rect"]
        self.keys(mouse=((left + right) // 2, (top + bottom) // 2))
        assert self.process.wait(timeout=20) == 0
        self.evidence["finishedWithButton"] = True

    def close(self) -> None:
        if self.process.poll() is None:
            if self.hwnd:
                self.user.PostMessageW(self.hwnd, 0x10, 0, 0)
            try:
                self.process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                subprocess.run(["taskkill", "/PID", str(self.process.pid), "/T", "/F"],
                               capture_output=True, timeout=15, check=False)
                self.process.wait(timeout=15)
                self.evidence["forcedClose"] = True
        self.evidence["exitCode"] = self.process.returncode


def calibrate_wizard(installer, manifest: dict, destination: Path, removing: bool, evidence: dict) -> dict:
    """Read actual Tk widgets for layout calibration, without starting an engine.

    Native TkChild windows expose no text/check-state. Calibration supplies role
    coordinates and an entire visible layout; frozen EXEs then receive real input.
    Successful disk/registry evidence is collected independently from the engine.
    """
    templates, failures = {}, []
    view = FrozenGui.__new__(FrozenGui)
    view.connect()

    def observe(ui):
        root = ui["root"]
        view.hwnd = view.user.GetAncestor(root.winfo_id(), 2)
        previous, deadline = None, time.monotonic() + 12

        def drive():
            nonlocal previous
            try:
                assert time.monotonic() < deadline, "Tk layout calibration timed out"
                root.update_idletasks()
                name = ui["state"]["page"]
                layout = view.layout()
                if not ui["pages"][name].winfo_viewable() or layout != previous:
                    previous = layout
                    root.after(30, drive)
                    return
                roles = {key: ui[key] for key in ("back", "action", "cancel")}
                if name == "directory":
                    roles.update(entry=ui["entry"], browse=ui["browse"])
                elif name == "features":
                    roles.update(ui["controls"]["features"])
                elif name == "options":
                    roles.update(ui["controls"]["postInstall"])
                templates[name] = {"layout": layout,
                                   "roles": {key: view.relative(view.describe(widget.winfo_id()))
                                             for key, widget in roles.items() if widget.winfo_viewable()},
                                   "buttons": {key: {"text": str(ui[key].cget("text")),
                                                     "disabled": ui[key].instate(["disabled"])}
                                               for key in ("back", "action", "cancel")
                                               if ui[key].winfo_viewable()},
                                   "indicator": ui["indicator"].get()}
                if name == "confirm":
                    ui["cancel"].invoke()  # Product close cancels its pending poll callback.
                    return
                if name == "features":
                    required = ui["controls"]["features"]["core"]
                    assert required.instate(["disabled"]) and ui["selections"]["features"]["core"].get()
                    required.invoke()
                    assert ui["selections"]["features"]["core"].get()
                    ui["controls"]["features"]["extra"].invoke()
                elif name == "options":
                    for widget in ui["controls"]["postInstall"].values():
                        widget.invoke()
                ui["action"].invoke()
                previous = None
                root.after(30, drive)
            except BaseException:
                failures.append(sys.exc_info())
                ui["cancel"].invoke()

        root.after(30, drive)

    assert installer._gui(None, destination, manifest, None, None, removing, _observer=observe) == 0
    if failures:
        _, error, trace = failures[0]
        raise error.with_traceback(trace)
    assert set(templates) == ({"confirm"} if removing else
                              {"directory", "features", "prerequisites", "options", "confirm"})
    evidence["layoutCalibration"] = templates
    evidence["calibrationNeverStartedEngine"] = True
    return templates


def main() -> None:
    if sys.platform != "win32":
        raise RuntimeError("Frozen setup integration requires Windows")
    parent = REPOSITORY / "build/packaging-validation"
    parent.mkdir(parents=True, exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix="wheel installer ", dir=parent))
    install_root = root / "long-path-installations"
    report: dict = {"root": str(root), "python": sys.executable, "commands": [], "modes": {},
                    "installationRoot": str(install_root), "status": "running", "gui": {},
                    "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "limitations": []}
    server = None
    worker = None
    targets: list[Path] = []

    def save() -> None:
        (root / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    def run(argv: list[str], cwd: Path = root, label: str = "command", env: dict | None = None) -> str:
        print(label, flush=True)
        started = time.monotonic()
        log = root / f"{len(report['commands']):02d}-{label}.log"
        with log.open("w", encoding="utf-8") as output:
            child = subprocess.Popen(argv, cwd=cwd, stdout=output, stderr=subprocess.STDOUT,
                                     text=True, encoding="utf-8", errors="replace", env=env)
            try:
                deadline, next_message = started + 600, started + 30
                while child.poll() is None:
                    if time.monotonic() >= deadline:
                        subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"],
                                       capture_output=True, timeout=15, check=False)
                        child.wait(timeout=15)
                        raise TimeoutError(f"{label} exceeded 600 seconds: {log}")
                    if time.monotonic() >= next_message:
                        print(f"{label}: running {time.monotonic() - started:.0f}s; log={log}", flush=True)
                        next_message += 30
                    threading.Event().wait(0.1)
            finally:
                report["commands"].append({"argv": argv, "cwd": str(cwd), "code": child.poll(),
                                           "seconds": time.monotonic() - started, "log": str(log)})
                save()
        if child.returncode:
            raise RuntimeError(f"{label} failed ({child.returncode}): {log}")
        return log.read_text(encoding="utf-8")

    requests: list[str] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            if self.path in ("/runtime.zip", "/discovered-runtime.zip"):
                body = runtime_bytes
                self.send_response(200)
            elif self.path == "/corrupt-runtime.zip":
                body = b"intentionally wrong checksum"
                self.send_response(200)
            elif self.path == "/mirror-api":
                body = json.dumps({"urls": [base_url + "/discovered-missing",
                                             base_url + "/corrupt-runtime.zip",
                                             base_url + "/discovered-runtime.zip"]}).encode("utf-8")
                self.send_response(200)
            elif self.path == "/mirror-api-unavailable":
                body = b'{"error":"discovery intentionally unavailable"}'
                self.send_response(503)
            else:
                body = b"not found"
                self.send_response(404)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    try:
        wheel = REPOSITORY / "output/wheels/easy_windows_pack-0.3.0-py3-none-any.whl"
        core = REPOSITORY / "backend/base/ewpcore"
        source_bytes = {path.relative_to(core).as_posix(): path.read_bytes() for path in core.rglob("*.py")}
        project_metadata = tomllib.loads((REPOSITORY / "pyproject.toml").read_text(encoding="utf-8"))["project"]
        with zipfile.ZipFile(wheel) as archive:
            metadata_path = next(name for name in archive.namelist() if name.endswith(".dist-info/METADATA"))
            metadata = BytesParser().parsebytes(archive.read(metadata_path))
            assert metadata["Name"] == "easy-windows-pack" and metadata["Version"] == "0.3.0"
            assert metadata["Name"] == project_metadata["name"]
            assert metadata["Version"] == project_metadata["version"]
            assert metadata["Requires-Python"] == project_metadata["requires-python"]
            from packaging.requirements import Requirement
            assert {str(Requirement(value)) for value in project_metadata["dependencies"]} <= {
                str(Requirement(value)) for value in metadata.get_all("Requires-Dist", [])}
            wheel_modules = {name.removeprefix("easy_windows_pack/") for name in archive.namelist()
                             if name.startswith("easy_windows_pack/") and name.endswith(".py")}
            assert wheel_modules == source_bytes.keys(), "Wheel Python module inventory differs from source"
            for module, expected in source_bytes.items():
                assert archive.read("easy_windows_pack/" + module) == expected, f"Stale wheel module: {module}"
        report["wheel"] = {"path": str(wheel), "sha256": hashlib.sha256(wheel.read_bytes()).hexdigest(),
                           "version": metadata["Version"], "allModuleBytesMatch": True,
                           "metadataMatchesProject": True,
                           "modules": {name: hashlib.sha256(data).hexdigest() for name, data in source_bytes.items()}}
        site = root / "installed-wheel"
        run([sys.executable, "-m", "pip", "install", "--no-deps", "--no-compile", "--target", str(site),
             str(wheel)], label="install-wheel")
        for name in list(sys.modules):
            if name == "easy_windows_pack" or name.startswith("easy_windows_pack."):
                del sys.modules[name]
        sys.path.insert(0, str(site))
        package = importlib.import_module("easy_windows_pack")
        installer = importlib.import_module("easy_windows_pack.installer")
        assert Path(package.__file__).is_relative_to(site)
        for module, expected in source_bytes.items():
            assert (site / "easy_windows_pack" / module).read_bytes() == expected
        report["wheelOrigin"] = str(package.__file__)
        report["installedModuleBytesMatch"] = True
        env = dict(os.environ, PYTHONPATH=str(site), PYTHONUTF8="1")
        env.pop("PYTHONHOME", None)
        origin_probe = run([sys.executable, "-c",
                    "import json, easy_windows_pack as p; "
                    "from easy_windows_pack import cli, packaging, installer; "
                    "print(json.dumps({m.__name__:m.__file__ for m in (p,cli,packaging,installer)}))"],
                   label="installed-module-origins", env=env)
        report["subprocessModuleOrigins"] = json.loads(origin_probe)
        assert all(Path(origin).is_relative_to(site) for origin in report["subprocessModuleOrigins"].values())
        runtime_zip = root / "runtime.zip"
        with zipfile.ZipFile(runtime_zip, "w") as archive:
            archive.writestr("ready.txt", "runtime mirror succeeded")
            archive.writestr("empty/nested/", b"")
        runtime_bytes = runtime_zip.read_bytes()
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        base_url = f"http://127.0.0.1:{server.server_port}"
        app_id = "ewp-validation-" + root.name.rsplit(" ", 1)[-1].lower()
        app_name = "Installer validation " + app_id

        def frozen_gui(executable: Path, initial: Path, target: Path, evidence: dict) -> FrozenGui:
            directory = root / "gui-evidence" / str(len(report["gui"]))
            directory.mkdir(parents=True, exist_ok=True)
            evidence["evidenceDirectory"] = str(directory)
            templates = calibrate_wizard(installer, manifest, target,
                                         executable.name.lower() == "uninstall.exe", evidence)
            return FrozenGui(executable, initial, app_name, evidence, templates)

        def long_destination(label: str) -> Path:
            target = install_root / ("Long install destination with spaces " + label)
            assert len(str(target)) >= 108, "Long-path acceptance was accidentally shortened"
            return target

        def assert_registry(target: Path, startup: bool) -> None:
            import winreg
            from easy_windows_pack.installer import RUN_KEY, UNINSTALL_KEY
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY + "\\" + app_id) as key:
                assert winreg.QueryValueEx(key, "InstallLocation")[0] == str(target)
                assert "--silent" in winreg.QueryValueEx(key, "QuietUninstallString")[0]
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
                    value = winreg.QueryValueEx(key, app_id)[0]
            except FileNotFoundError:
                assert not startup
            else:
                assert startup and str(target / f"{app_id}.exe") in value

        def assert_registry_absent() -> None:
            import winreg
            from easy_windows_pack.installer import RUN_KEY, UNINSTALL_KEY
            for key_name, value_name in ((RUN_KEY, app_id), (UNINSTALL_KEY + "\\" + app_id, None)):
                try:
                    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_name) as key:
                        if value_name:
                            winreg.QueryValueEx(key, value_name)
                except FileNotFoundError:
                    continue
                raise AssertionError(f"Registry entry remains: {key_name}")

        def assert_install(target: Path, extra: bool) -> dict:
            state = json.loads((target / ".ewp-install-state.json").read_text())
            assert state["phase"] == "installed"
            assert state["features"] == (["core", "extra"] if extra else ["core"])
            assert state["options"] == (["setting", "startup"] if extra else [])
            assert (target / f"{app_id}.exe").is_file() and (target / "uninstall.exe").is_file()
            assert (target / "app-data/empty/nested").is_dir()
            assert (target / "app-data/ready.txt").read_text() == "always-installed application data"
            assert (target / "app-data/changeable.txt").read_text() == "original owned content"
            assert (target / "core-data/ready.txt").read_text() == "required feature"
            assert (target / "feature-data").exists() == extra
            assert (target / "runtime").exists() == extra
            expected_dirs = {"app-data", "app-data/empty", "app-data/empty/nested", "core-data",
                             "core-data/empty/nested"}
            empty_dirs = {f"app-data/empty/directory-{index:02d}" for index in range(40)}
            assert all((target / name).is_dir() for name in empty_dirs)
            expected_dirs |= empty_dirs
            if extra:
                assert (target / "feature-data/ready.txt").read_text() == "optional feature"
                assert (target / "feature-data/empty/nested").is_dir()
                assert (target / "runtime/test-runtime/empty/nested").is_dir()
                assert (target / "runtime/test-runtime/ready.txt").read_text() == "runtime mirror succeeded"
                assert (target / "runtime/fallback-runtime/empty/nested").is_dir()
                assert (target / "runtime/fallback-runtime/ready.txt").read_text() == "runtime mirror succeeded"
                assert json.loads((target / "ewp-options.json").read_text())["extraEnabled"]
                expected_dirs |= {"feature-data/empty/nested", "runtime/test-runtime/empty/nested",
                                  "runtime/fallback-runtime/empty/nested"}
            assert expected_dirs <= set(state["directories"]), "Empty directories were not recorded as owned"
            events = json.loads((target / "hook-events.json").read_text())
            assert [event["phase"] for event in events] == ["beforeInstall", "afterInstall"]
            assert all(event["frozen"] for event in events)
            assert all(event["installDir"] == str(target) for event in events)
            assert all(event["runtimeDir"] == str(target / "runtime") for event in events)
            assert all(event["executable"] == str(target / f"{app_id}.exe") for event in events)
            assert (target / "tools/hook probe.ps1").is_file()
            assert events[0]["runtimeReady"] is False and events[0]["settingsReady"] is False
            assert events[1]["runtimeReady"] == extra and events[1]["settingsReady"] == extra
            assert_registry(target, extra)
            return {"ownedDirectories": sorted(expected_dirs), "hooks": events,
                    "features": state["features"], "options": state["options"],
                    "installPathCharacters": len(str(target)), "fortyEmptyDirectoriesInstalled": True}

        def preserve_user_files(target: Path) -> None:
            state = json.loads((target / ".ewp-install-state.json").read_text())
            original_hash = next(item["sha256"] for item in state["files"]
                                 if item["path"] == "app-data/changeable.txt")
            (target / "app-data/changeable.txt").write_text("user modified owned file", encoding="utf-8")
            assert hashlib.sha256((target / "app-data/changeable.txt").read_bytes()).hexdigest() != original_hash
            (target / "app-data/user-created.txt").write_text("new file in owned directory", encoding="utf-8")
            (target / "user-notes.txt").write_text("keep me", encoding="utf-8")
            (target / "user-data/nested").mkdir(parents=True)
            (target / "user-data/nested/note.txt").write_text("nested user file", encoding="utf-8")

        def assert_uninstalled(target: Path) -> dict:
            wait_for(lambda: not (target / "uninstall.exe").exists() and
                     not (target / ".ewp-install-state.json").exists(), "Frozen self-cleanup did not finish", 40)
            assert not (target / f"{app_id}.exe").exists()
            assert not (target / "app-data/ready.txt").exists()
            assert not (target / "app-data/empty").exists()
            assert not (target / "core-data").exists()
            assert not (target / "feature-data").exists()
            assert not (target / "runtime").exists()
            assert not (target / "tools").exists()
            assert not (target / ".ewp-install.lock").exists()
            assert (target / "user-notes.txt").read_text() == "keep me"
            assert (target / "app-data/changeable.txt").read_text() == "user modified owned file"
            assert (target / "app-data/user-created.txt").read_text() == "new file in owned directory"
            assert (target / "user-data/nested/note.txt").read_text() == "nested user file"
            assert (target / "hook-events.json").is_file()
            events = [json.loads(line) for line in
                      (target / "uninstall-hook-events.jsonl").read_text(encoding="utf-8-sig").splitlines()]
            assert [event["phase"] for event in events] == ["beforeUninstall", "afterUninstall"]
            assert all(event["installDir"] == str(target) for event in events)
            assert all(event["runtimeDir"] == str(target / "runtime") for event in events)
            assert all(event["executable"] == str(target / f"{app_id}.exe") for event in events)
            assert all(event["scriptPath"] == str(target / "tools/hook probe.ps1") for event in events)
            assert events[0]["applicationPresent"] and not events[1]["applicationPresent"]
            assert events[0]["appDataPresent"] and not events[1]["appDataPresent"]
            assert_registry_absent()
            return {"hooks": events, "ownedFilesAndEmptyDirectoriesRemoved": True,
                    "registryRemoved": True, "userFilesPreserved": True,
                    "changedOwnedFilePreservedByHash": True, "nestedUserFilesPreserved": True,
                    "fortyEmptyDirectoriesRemoved": True}

        application_source = """import json, sys
from pathlib import Path
from easy_windows_pack import load_pack_config
base = Path(getattr(sys, '_MEIPASS', Path(__file__).parent))
assert 'Portable frontend' in (base / 'output/frontend/index.html').read_text()
assert getattr(sys, 'frozen', False)
if len(sys.argv) > 1 and sys.argv[1] == '--validation-hook':
    phase, install_dir, runtime_dir, executable = sys.argv[2:]
    root = Path(install_dir)
    assert Path(executable).is_file() and Path(executable) == Path(sys.executable)
    assert Path(runtime_dir) == root / 'runtime'
    path = root / 'hook-events.json'
    events = json.loads(path.read_text()) if path.exists() else []
    assert len(events) == (0 if phase == 'beforeInstall' else 1)
    events.append({'phase': phase, 'frozen': True, 'installDir': install_dir,
                   'runtimeDir': runtime_dir, 'executable': executable,
                   'runtimeReady': (root / 'runtime/test-runtime/ready.txt').is_file(),
                   'settingsReady': (root / 'ewp-options.json').is_file()})
    path.write_text(json.dumps(events))
else:
    (Path(sys.executable).parent / 'application-ran.json').write_text(json.dumps({'frozen': True}))
"""

        uninstall_hook_source = """param([string]$Phase, [string]$InstallDir, [string]$RuntimeDir, [string]$Executable)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$eventsPath = Join-Path $InstallDir 'uninstall-hook-events.jsonl'
$event = [ordered]@{
    phase = $Phase; installDir = $InstallDir; runtimeDir = $RuntimeDir; executable = $Executable
    scriptPath = $PSCommandPath; applicationPresent = (Test-Path -LiteralPath $Executable)
    appDataPresent = (Test-Path -LiteralPath (Join-Path $InstallDir 'app-data/ready.txt'))
}
ConvertTo-Json -InputObject $event -Depth 5 -Compress | Add-Content -LiteralPath $eventsPath -Encoding UTF8
"""
        powershell = str(Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe")
        assert Path(powershell).is_file()

        for mode in ("onefile", "onedir"):
            # Public build_package(root, ...) has no output_dir argument. Its
            # root determines output/apps and output/installers: isolate roots.
            app = root / mode / "Application source"
            (app / "backend/src").mkdir(parents=True)
            (app / "output/frontend").mkdir(parents=True)
            (app / "output/frontend/index.html").write_text("<h1>Portable frontend</h1>", encoding="utf-8")
            (app / "backend/src/demo.py").write_text(application_source, encoding="utf-8")
            for directory, content in (("app-data", "always-installed application data"),
                                       ("core-data", "required feature"),
                                       ("feature-data", "optional feature")):
                (app / "resources" / directory / "empty/nested").mkdir(parents=True)
                (app / "resources" / directory / "ready.txt").write_text(content, encoding="utf-8")
            (app / "resources/app-data/changeable.txt").write_text("original owned content", encoding="utf-8")
            for index in range(40):
                (app / f"resources/app-data/empty/directory-{index:02d}").mkdir()
            hook_source = app / "resources/hook-tools/hook probe.ps1"
            hook_source.parent.mkdir(parents=True)
            hook_source.write_text(uninstall_hook_source, encoding="utf-8")
            config = {
                "schemaVersion": 1,
                "application": {"id": app_id, "name": app_name, "version": "0.1.0"},
                "build": {"mode": mode, "installer": True},
                "installer": {"language": "en", "welcome": "Real frozen wheel acceptance",
                              "files": [{"source": "resources/app-data", "destination": "app-data"},
                                        {"source": "resources/hook-tools", "destination": "tools"}]},
                "features": [{"id": "core", "name": "Core feature", "description": "Required test data",
                              "default": False, "required": True,
                              "files": [{"source": "resources/core-data", "destination": "core-data"}]},
                             {"id": "extra", "name": "Extra feature", "description": "Optional test data",
                              "default": False, "files": [{"source": "resources/feature-data",
                                                             "destination": "feature-data"}]}],
                "prerequisites": [{"id": "test-runtime", "name": "Test runtime", "type": "zip",
                                   "features": ["extra"], "mirrorApi": base_url + "/mirror-api",
                                   "urls": [base_url + "/unexpected-static-fallback"],
                                   "sha256": hashlib.sha256(runtime_bytes).hexdigest()},
                                  {"id": "fallback-runtime", "name": "Fallback runtime", "type": "zip",
                                   "features": ["extra"], "mirrorApi": base_url + "/mirror-api-unavailable",
                                   "urls": [base_url + "/missing"], "mirrors": [base_url + "/runtime.zip"],
                                   "sha256": hashlib.sha256(runtime_bytes).hexdigest()}],
                "hooks": {phase: [["{executable}", "--validation-hook", phase, "{installDir}",
                                    "{runtimeDir}", "{executable}"]]
                          for phase in ("beforeInstall", "afterInstall")},
                "postInstall": [{"id": "startup", "name": "Start on login", "type": "startup", "default": False},
                                {"id": "setting", "name": "Enable feature", "type": "setting",
                                 "key": "extraEnabled", "value": True, "default": False}],
            }
            config["hooks"].update({phase: [[powershell, "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
                                            "Bypass", "-File", "{installDir}/tools/hook probe.ps1", phase,
                                            "{installDir}", "{runtimeDir}", "{executable}"]]
                                    for phase in ("beforeUninstall", "afterUninstall")})
            package.validate_pack_config(config, app)
            config_file = app / "ewp.pack.json"
            config_file.write_text(json.dumps(config), encoding="utf-8")
            mode_report = report["modes"][mode] = {"project": str(app), "config": str(config_file),
                                                   "schemaValidated": True}
            print(f"Build {mode} via installed wheel", flush=True)
            run([sys.executable, "-m", "easy_windows_pack.cli", "installer",
                 "--project-root", str(app), "--mode", mode, "--lang", "en"],
                label=f"build-{mode}", env=env)
            assert not (app / "backend/base/ewpcore").exists()
            for module, expected in source_bytes.items():
                assert (app / "build/exe-src/easy_windows_pack" / module).read_bytes() == expected
            setup = app / "output/installers" / f"{app_id}-setup.exe"
            application = app / "output/apps" / (f"{app_id}.exe" if mode == "onefile" else app_id)
            package.validate_pe(application if mode == "onefile" else application / f"{app_id}.exe")
            package.validate_pe(setup)
            mode_report.update(setup=str(setup), application=str(application),
                               setupSha256=hashlib.sha256(setup.read_bytes()).hexdigest(), stagedCoreBytesMatch=True)
            from PyInstaller.archive.readers import CArchiveReader
            payload = root / mode / "payload.zip"
            payload.write_bytes(CArchiveReader(str(setup)).extract("payload.zip"))
            from easy_windows_pack.installer import read_manifest
            manifest = read_manifest(payload)
            assert manifest["build"]["mode"] == mode
            with zipfile.ZipFile(payload) as archive:
                assert archive.getinfo("app-data/empty/nested/").is_dir()
                for index in range(40):
                    assert archive.getinfo(f"app-data/empty/directory-{index:02d}/").is_dir()
                assert archive.getinfo("features/core/core-data/empty/nested/").is_dir()
                assert archive.getinfo("features/extra/feature-data/empty/nested/").is_dir()
            mode_report["payload"] = str(payload)
            cancelled = root / f"Cancelled {mode}"
            gui_evidence = report["gui"][f"cancel-{mode}"] = {}
            gui = frozen_gui(setup, root / f"Initial GUI {mode}", cancelled, gui_evidence)
            try:
                gui.configure(cancelled)
            finally:
                gui.close()
            assert gui.process.returncode == 0 and not gui_evidence.get("forcedClose")
            assert not cancelled.exists()
            assert_registry_absent()
            gui_evidence["cancelledWithoutInstallation"] = True
            target = long_destination(mode)
            targets.append(target)
            chosen = "extra" if mode == "onedir" else ""
            options = "startup,setting" if mode == "onedir" else ""
            run([str(setup), "--silent", "--install-dir", str(target), "--features", chosen,
                 "--options", options], label=f"install-{mode}")
            executable = target / f"{app_id}.exe"
            mode_report["installDirectory"] = str(target)
            mode_report["installEvidence"] = assert_install(target, mode == "onedir")
            run_log = target / ".ewp-installer.log"
            shutil.copy2(run_log, root / mode / "installed.log")
            shutil.copy2(target / ".ewp-install-state.json", root / mode / "installed-state.json")
            mode_report["installLog"] = str(root / mode / "installed.log")
            mode_report["installedState"] = str(root / mode / "installed-state.json")
            run([str(executable)], target, label=f"launch-{mode}")
            assert json.loads((target / "application-ran.json").read_text())["frozen"]
            preserve_user_files(target)
            run([str(target / "uninstall.exe"), "--silent"], label=f"uninstall-{mode}")
            mode_report["uninstallEvidence"] = assert_uninstalled(target)
            assert (target / "application-ran.json").exists()
            mode_report.update(installed=True, appRan=True, uninstalled=True, userFilesPreserved=True)
            save()

        # A third install traverses the real wizard, including Back/Next. State
        # proves the edited long directory, required feature and chosen controls.
        target = long_destination("gui onedir")
        targets.append(target)
        gui_evidence = report["gui"]["full-install"] = {}
        gui_evidence["installDirectory"] = str(target)
        gui = frozen_gui(setup, root / "Initial full GUI", target, gui_evidence)
        try:
            gui.configure(target)
            gui.invoke_action()
            gui.expect_progress()
            gui.screenshot("progress")

            def installed():
                state_path = target / ".ewp-install-state.json"
                return state_path.exists() and json.loads(state_path.read_text())["phase"] == "installed"

            wait_for(installed, "GUI Install did not commit", 120)
            gui_evidence["installEvidence"] = assert_install(target, True)
            gui.expect_complete()
            gui.finish()
        finally:
            gui.close()
        assert gui.process.returncode == 0 and not gui_evidence.get("forcedClose")
        gui_evidence["installedViaGui"] = True
        executable = target / f"{app_id}.exe"
        run([str(executable)], target, label="launch-gui-installed")
        assert json.loads((target / "application-ran.json").read_text())["frozen"]
        preserve_user_files(target)
        shutil.copy2(target / ".ewp-installer.log", root / "gui-installed.log")

        # Filename-driven uninstall GUI; observe a real helper still blocked on
        # the visible completion page, then press Finish and verify self-deletion.
        uninstall_evidence = report["gui"]["self-delete-uninstall"] = {}
        gui = frozen_gui(target / "uninstall.exe", target, target, uninstall_evidence)
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        helper = None
        helper_directory = None
        try:
            gui.screenshot("confirm")
            gui.invoke_action()
            gui.expect_progress()
            gui.screenshot("progress")

            def pending():
                path = target / ".ewp-install-state.json"
                return path.exists() and json.loads(path.read_text())["phase"] == "pending-delete"

            wait_for(pending, "Frozen GUI uninstall did not schedule delayed deletion", 90)
            gui_pid = gui.evidence["window"]["pid"]
            helper_pid = wait_for(lambda: next((pid for pid, item in processes().items()
                                               if item["parent"] == gui_pid and
                                               item["exe"].lower() == "powershell.exe"), None),
                                  "Real cleanup helper was not created")
            helper = kernel.OpenProcess(0x100000 | 0x1000, False, helper_pid)
            assert helper, "Cannot observe the real cleanup helper"
            uninstall_evidence.update(helperPid=helper_pid, frozenChildPid=gui_pid)
            gui.expect_complete()
            helper_process = json.loads(run([powershell, "-NoProfile", "-NonInteractive", "-Command",
                "$ProgressPreference='SilentlyContinue'; "
                f"Get-CimInstance Win32_Process -Filter 'ProcessId = {helper_pid}' | "
                "Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"],
                label="cleanup-helper-command"))
            command_line = helper_process["CommandLine"]
            assert helper_process["ParentProcessId"] == gui_pid
            assert "-File" in command_line and "-EncodedCommand" not in command_line
            assert str(target) not in command_line and len(command_line) < 1024
            uninstall_evidence.update(helperCommand=helper_process,
                                      helperCommandCharacters=len(command_line), helperUsesFileInvocation=True)
            # Read this fixture's actual temporary helper artifacts while the
            # uninstaller keeps it alive. The manifest must carry the long root
            # and all owned directories; the command no longer embeds them.
            helper_manifest = wait_for(lambda: next((path for path in
                Path(tempfile.gettempdir()).glob("ewp-delete-*/manifest.json")
                if json.loads(path.read_text(encoding="utf-8-sig")).get("root") == str(target)), None),
                "Long-path helper manifest was not found", 10)
            helper_directory = helper_manifest.parent
            helper_script = helper_directory / "cleanup.ps1"
            helper_data = json.loads(helper_manifest.read_text(encoding="utf-8-sig"))
            script_text = helper_script.read_text(encoding="utf-8-sig")
            assert str(target) not in script_text
            assert "$parent.WaitForExit()" in script_text and "120000" not in script_text
            assert len(helper_data["directories"]) >= 40
            assert {gui_pid, gui.process.pid} <= set(helper_data["processIds"])
            assert {item["path"] for item in helper_data["files"]} == {"uninstall.exe", ".ewp-install-state.json"}
            shutil.copy2(helper_manifest, root / "cleanup-helper-manifest.json")
            shutil.copy2(helper_script, root / "cleanup-helper.ps1")
            uninstall_evidence.update(helperManifest=str(root / "cleanup-helper-manifest.json"),
                                      helperScript=str(root / "cleanup-helper.ps1"),
                                      longRootStoredInJson=True, helperUsesUnboundedProcessWait=True)
            started = time.monotonic()
            observations = 0
            while time.monotonic() - started < 2:
                assert gui.process.poll() is None
                assert kernel.WaitForSingleObject(helper, 0) == 258, "Cleanup helper exited before the GUI"
                assert pending() and (target / "uninstall.exe").is_file()
                gui.responds()
                observations += 1
                threading.Event().wait(0.1)
            assert kernel.WaitForSingleObject(helper, 0) == 258
            uninstall_evidence.update(heldSeconds=time.monotonic() - started,
                                      waitingObservations=observations, helperWaitedForWindowExit=True,
                                      ownershipPresentBeforeExit=True)
            shutil.copy2(target / ".ewp-install-state.json", root / "pending-uninstall-state.json")
            assert not executable.exists()
            assert_registry_absent()
            gui.finish()
        finally:
            gui.close()
            if helper:
                try:
                    wait_for(lambda: kernel.WaitForSingleObject(helper, 0) == 0,
                             "Cleanup helper did not exit after frozen GUI closed", 40)
                    code = wintypes.DWORD()
                    assert kernel.GetExitCodeProcess(helper, ctypes.byref(code)) and code.value == 0
                    uninstall_evidence["helperExitCode"] = code.value
                    assert helper_directory is not None and not helper_directory.exists(), \
                        "Temporary cleanup script/manifest were not removed"
                    uninstall_evidence["temporaryHelperArtifactsRemoved"] = True
                finally:
                    kernel.CloseHandle(helper)
        assert gui.process.returncode == 0 and not uninstall_evidence.get("forcedClose")
        uninstall_evidence["selfDeletionAfterExit"] = True
        uninstall_evidence["uninstallEvidence"] = assert_uninstalled(target)

        # Exercise the latest installed cli.py source-bundle config-source logic
        # using resources outside the conventional backend/frontend/scripts set.
        for relative in ("scripts/startup.cmd", "scripts/dev.py", "startup.cmd", "README.md", "LICENSE"):
            path = app / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("Integration source bundle fixture\n", encoding="utf-8")
        (app / "frontend").mkdir()
        (app / "frontend/package.json").write_text('{"private":true}', encoding="utf-8")
        (app / "pyproject.toml").write_text('[project]\nname="wheel-bundle-validation"\nversion="0.1.0"\n',
                                            encoding="utf-8")
        bundle_output = root / "source-bundle"
        run([sys.executable, "-m", "easy_windows_pack.cli", "bundle", "--project-root", str(app),
             "--output-dir", str(bundle_output), "--lang", "en"], label="installed-cli-bundle", env=env)
        bundle = next(bundle_output.glob("*.zip"))
        with zipfile.ZipFile(bundle) as archive:
            prefix = bundle.stem + "/"
            assert json.loads(archive.read(prefix + "ewp.pack.json")) == config
            assert archive.read(prefix + "resources/hook-tools/hook probe.ps1") == hook_source.read_bytes()
            for directory in ("app-data", "core-data", "feature-data"):
                relative = "resources/" + directory + "/ready.txt"
                assert archive.read(prefix + relative) == (app / relative).read_bytes()
                assert (bundle_output / bundle.stem / "resources" / directory / "empty/nested").is_dir()
                assert archive.getinfo(prefix + "resources/" + directory + "/empty/nested/").is_dir()
            restored = root / "restored-source"
            archive.extractall(restored)
            assert not any("/output/" in name or "/build/" in name for name in archive.namelist())
        restored_app = restored / bundle.stem
        assert json.loads((restored_app / "ewp.pack.json").read_text()) == config
        package.validate_pack_config(config, restored_app)
        for directory in ("app-data", "core-data", "feature-data"):
            assert (restored_app / "resources" / directory / "empty/nested").is_dir()
        for index in range(40):
            assert (restored_app / f"resources/app-data/empty/directory-{index:02d}").is_dir()
        for path in (app / "resources").rglob("*"):
            restored_path = restored_app / path.relative_to(app)
            assert restored_path.is_dir() if path.is_dir() else restored_path.read_bytes() == path.read_bytes()
        report["sourceBundle"] = {"archive": str(bundle), "installedCliConfigSourcesIncluded": True,
                                  "stagedEmptyDirectoriesPreserved": True, "zipEmptyDirectoryEntries": True,
                                  "restoredRoot": str(restored_app), "zipRestoredEmptyDirectories": True,
                                  "restoredResourcesMatch": True, "restoredConfigValidated": True}
        report["limitations"].append("Application empty data is installer.files data; PyInstaller frontend empty directories are not asserted.")
        report["limitations"].append("The frozen application fixture verifies wheel imports and frontend resources; pywebview/WebView2 rendering is not exercised.")
        report["limitations"].append("Mirror APIs and archives are served over real loopback HTTP; public HTTPS mirrors and third-party runtime installers are not exercised.")
        assert requests == ["/mirror-api", "/discovered-missing", "/discovered-missing",
                "/corrupt-runtime.zip", "/corrupt-runtime.zip", "/discovered-runtime.zip",
                    "/mirror-api-unavailable", "/missing", "/missing", "/runtime.zip"] * 2, requests
        report["mirrorEvidence"] = {"discoveryAndDownloadSucceeded": True, "discoveryFailureFallbackSucceeded": True,
                       "checksumMismatchRejectedBeforeFallback": True,
                       "archiveSha256": hashlib.sha256(runtime_bytes).hexdigest()}
        report["downloads"] = requests
        for mode_report in report["modes"].values():
            assert hashlib.sha256(Path(mode_report["setup"]).read_bytes()).hexdigest() == mode_report["setupSha256"]
        assert report["modes"]["onefile"]["setup"] != report["modes"]["onedir"]["setup"]
        assert all((core / name).read_bytes() == data for name, data in source_bytes.items()), "Source changed during acceptance"
        assert hashlib.sha256(wheel.read_bytes()).hexdigest() == report["wheel"]["sha256"], "Wheel changed during acceptance"
        report["status"] = "passed"
    except BaseException as error:
        report.update(status="failed", error=repr(error), downloads=requests)
        (root / "failure.log").write_text(traceback.format_exc(), encoding="utf-8")
        report["failureLog"] = str(root / "failure.log")
        raise
    finally:
        # On failure clean only this fixture's installed applications, retaining
        # logs/artifacts. This recovery is recorded and never counts as acceptance.
        for target in targets:
            if (target / ".ewp-install-state.json").exists() and (target / "uninstall.exe").exists():
                try:
                    run([str(target / "uninstall.exe"), "--silent"], label="failure-cleanup")
                    wait_for(lambda: not (target / ".ewp-install-state.json").exists(), "Failure cleanup timed out", 40)
                except Exception as cleanup_error:
                    report.setdefault("cleanupErrors", []).append(repr(cleanup_error))
        if server:
            server.shutdown()
            server.server_close()
        if worker:
            worker.join(5)
        report["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        save()
        print("REPORT=" + str(root / "report.json"), flush=True)


if __name__ == "__main__":
    main()