"""Real Shell Snap probes. Unsupported desktop input is distinct from failure.

No snap rectangle is applied by this test and no Windows preference is changed.
A standard decorated WebView2 window calibrates input in the same desktop.
"""
from __future__ import annotations

import ctypes
import json
import sys
import threading
import time
import winreg
from ctypes import wintypes
from pathlib import Path

import webview

from easy_windows_pack import WindowConfig, create_window, win32


u = win32.user32
u.GetForegroundWindow.restype = wintypes.HWND
u.SetForegroundWindow.argtypes = [wintypes.HWND]
u.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
u.GetWindowThreadProcessId.restype = wintypes.DWORD
u.SetCursorPos.argtypes = [ctypes.c_int, ctypes.c_int]
u.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
u.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
u.GetAsyncKeyState.argtypes = [ctypes.c_int]
u.GetAsyncKeyState.restype = ctypes.c_short
win32._dwmapi.DwmGetWindowAttribute.argtypes = [wintypes.HWND, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD]


class GUIINFO(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.DWORD), ("flags", wintypes.DWORD),
                ("active", wintypes.HWND), ("focus", wintypes.HWND),
                ("capture", wintypes.HWND), ("menu", wintypes.HWND),
                ("move", wintypes.HWND), ("caret", wintypes.HWND), ("rect", wintypes.RECT)]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_size_t)]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_size_t)]


class INPUTUNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT)]


class INPUT(ctypes.Structure):
    _anonymous_ = ("data",)
    _fields_ = [("type", wintypes.DWORD), ("data", INPUTUNION)]


u.GetGUIThreadInfo.argtypes = [wintypes.DWORD, ctypes.POINTER(GUIINFO)]
u.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
u.SendInput.restype = wintypes.UINT
original_foreground = u.GetForegroundWindow()
original_cursor = wintypes.POINT()
u.GetCursorPos(ctypes.byref(original_cursor))
native_mode = "--native" in sys.argv
instance = create_window(WindowConfig(title="EWP Windows Snap regression", width=760, height=500,
                                      titlebar_mode="native" if native_mode else "default"),
                         url=(Path(__file__).parent / "fixtures/native-window.html").resolve().as_uri())
control = webview.create_window("EWP standard native Snap input control", html="Native input calibration",
                                width=760, height=500)
results: list[dict] = []
failure = None
tick = threading.Event()


def until(predicate, timeout=3.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        tick.wait(0.025)
    return False


def values(rect):
    return [rect.left, rect.top, rect.right, rect.bottom]


def snapshot(hwnd):
    outer, client, dwm = wintypes.RECT(), wintypes.RECT(), wintypes.RECT()
    point = wintypes.POINT()
    assert u.GetWindowRect(hwnd, ctypes.byref(outer))
    assert u.GetClientRect(hwnd, ctypes.byref(client))
    assert u.ClientToScreen(hwnd, ctypes.byref(point))
    client.left += point.x
    client.right += point.x
    client.top += point.y
    client.bottom += point.y
    hr = win32._dwmapi.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(dwm), ctypes.sizeof(dwm))
    return {"window": values(outer), "client": values(client), "dwm": values(dwm) if hr == 0 else None,
            "style": hex(u.GetWindowLongW(hwnd, win32.GWL_STYLE) & 0xffffffff),
            "zoomed": win32.is_zoomed(hwnd), "foreground": int(u.GetForegroundWindow() or 0), "hwnd": int(hwnd)}


def gui_state(hwnd):
    state = GUIINFO(cbSize=ctypes.sizeof(GUIINFO))
    tid = u.GetWindowThreadProcessId(hwnd, None)
    valid = u.GetGUIThreadInfo(tid, ctypes.byref(state))
    return {"valid": bool(valid), "flags": state.flags, "moving": bool(valid and state.flags & 2)}


def inject(*events):
    batch = (INPUT * len(events))(*events)
    ctypes.set_last_error(0)
    count = u.SendInput(len(batch), batch, ctypes.sizeof(INPUT))
    return {"sent": count, "requested": len(batch), "error": ctypes.get_last_error()}


def keyboard(code, up=False):
    return INPUT(type=1, ki=KEYBDINPUT(wVk=code, dwFlags=(1 if code in (0x5B, 0x25, 0x26, 0x27) else 0) | (2 if up else 0)))


def chord(code):
    down = inject(keyboard(0x5B), keyboard(code))
    held = {"win": bool(u.GetAsyncKeyState(0x5B) & 0x8000), "arrow": bool(u.GetAsyncKeyState(code) & 0x8000)}
    up = inject(keyboard(code, True), keyboard(0x5B, True))
    return {"down": down, "held": held, "up": up}


def escape():
    inject(keyboard(0x1B), keyboard(0x1B, True))


def cancel_move(hwnd):
    # Also works when desktop input injection is unavailable.
    u.PostMessageW(hwnd, 0x0100, 0x1B, 0)  # WM_KEYDOWN / VK_ESCAPE
    u.PostMessageW(hwnd, 0x001F, 0, 0)  # WM_CANCELMODE
    u.PostMessageW(hwnd, 0x0202, 0, 0)  # WM_LBUTTONUP
    return until(lambda: not gui_state(hwnd)["moving"], 1.0)


def focus(hwnd):
    u.SetForegroundWindow(hwnd)
    return until(lambda: u.GetForegroundWindow() == hwnd, 1.0)


def restore(hwnd):
    assert cancel_move(hwnd), "Native move loop did not exit"
    u.ShowWindow(hwnd, win32.SW_RESTORE)
    assert until(lambda: not win32.is_zoomed(hwnd)), "Restore failed"


def matches(hwnd, target, custom):
    actual = snapshot(hwnd)
    visible = actual["client"] if custom else actual["dwm"]
    return visible is not None and all(abs(a - b) <= (0 if custom else 1) for a, b in zip(visible, target))


def key_probe(hwnd, code, target, custom):
    restore(hwnd)
    focused = focus(hwnd)
    before = snapshot(hwnd)
    sent = chord(code) if focused else None
    reached = focused and until(lambda: matches(hwnd, target, custom))
    result = {"reached": reached, "focused": focused, "input": sent, "before": before, "after": snapshot(hwnd)}
    escape()
    return result


def system_move_snap_probe(hwnd, target, custom):
    restore(hwnd)
    focused = focus(hwnd)
    before = snapshot(hwnd)
    assert u.PostMessageW(hwnd, win32.WM_SYSCOMMAND, 0xF010, 0)
    moving = until(lambda: gui_state(hwnd)["moving"], 1.0)
    try:
        if not moving:
            return {"reached": False, "focused": focused, "moving": False, "before": before}
        # The system menu Move loop accepts cursor movement and Return without
        # requiring a synthetic mouse-down. Let the shell decide whether to Snap.
        edge_x, edge_y = target[0], (target[1] + target[3]) // 2
        for x in (edge_x + 100, edge_x + 30, edge_x):
            assert u.SetCursorPos(x, edge_y)
            tick.wait(0.1)
        tick.wait(0.35)
        assert u.PostMessageW(hwnd, 0x0100, 0x0D, 0)  # WM_KEYDOWN / VK_RETURN
        reached = until(lambda: matches(hwnd, target, custom))
        return {"reached": reached, "focused": focused, "moving": moving, "before": before, "after": snapshot(hwnd)}
    finally:
        cancel_move(hwnd)
        escape()


def drag_probe(hwnd, target, custom, use_bridge):
    restore(hwnd)
    focused = focus(hwnd)
    before = snapshot(hwnd)
    start_x, start_y = (before["window"][0] + before["window"][2]) // 2, before["window"][1] + 18
    positioned = bool(u.SetCursorPos(start_x, start_y))
    down = inject(INPUT(type=0, mi=MOUSEINPUT(dwFlags=2)))
    held = bool(u.GetAsyncKeyState(1) & 0x8000)
    result = {"focused": focused, "positioned": positioned, "input": down, "mouseDown": held, "before": before}
    try:
        if not (focused and positioned and held):
            return {**result, "reached": False, "reason": "Desktop did not accept mouse-down input"}
        if use_bridge:
            result["bridge"] = instance.controller.native_drag("move")
        else:
            packed = (start_x & 0xffff) | ((start_y & 0xffff) << 16)
            assert u.PostMessageW(hwnd, win32.WM_NCLBUTTONDOWN, win32.HTCAPTION, packed)
        if not until(lambda: gui_state(hwnd)["moving"], 1.0):
            return {**result, "reached": False, "gui": gui_state(hwnd), "reason": "Native move loop did not begin"}
        # Move the real cursor through the shell's edge trigger, never set bounds.
        edge_x, edge_y = target[0], (target[1] + target[3]) // 2
        for x in (edge_x + 100, edge_x + 30, edge_x):
            assert u.SetCursorPos(x, edge_y)
            tick.wait(0.05)
        tick.wait(0.35)
        inject(INPUT(type=0, mi=MOUSEINPUT(dwFlags=4)))
        return {**result, "reached": until(lambda: matches(hwnd, target, custom)), "after": snapshot(hwnd)}
    finally:
        inject(INPUT(type=0, mi=MOUSEINPUT(dwFlags=4)))
        cancel_move(hwnd)
        escape()


def validate():
    global failure
    try:
        assert instance.window.events.loaded.wait(20), "Target WebView2 did not load"
        assert control.events.loaded.wait(20), "Input control WebView2 did not load"
        hwnd, reference = win32.window_handle(instance.window), win32.window_handle(control)
        info = win32.MONITORINFO(cbSize=ctypes.sizeof(win32.MONITORINFO))
        assert u.GetMonitorInfoW(u.MonitorFromWindow(hwnd, 2), ctypes.byref(info))
        work = values(info.rcWork)
        midpoint = (work[0] + work[2]) // 2
        style = u.GetWindowLongW(hwnd, win32.GWL_STYLE)
        required = win32.WS_CAPTION | win32.WS_THICKFRAME | win32.WS_MAXIMIZEBOX | win32.WS_SYSMENU
        results.append({"case": "shell-snap-styles", "status": "passed" if style & required == required else "failed",
                        "required": hex(required), **snapshot(hwnd), "work": work})
        assert style & required == required, "Missing Shell Snap window styles"

        # A direct system command exercises the native maximize path even on a
        # desktop that refuses SendInput. This is not claimed as horizontal Snap.
        assert u.PostMessageW(hwnd, win32.WM_SYSCOMMAND, 0xF030, 0)
        maximized = until(lambda: win32.is_zoomed(hwnd) and matches(hwnd, work, not native_mode))
        results.append({"case": "native-SC_MAXIMIZE", "status": "passed" if maximized else "failed", **snapshot(hwnd)})
        assert maximized, "Native maximize did not respect the work area"
        restore(hwnd)

        # Enter the OS keyboard move loop without injected input, then cancel.
        # Calibrate this command too: an unavailable input desktop can prevent
        # a modal move loop even when PostMessage itself succeeds.
        move_probes = []
        for handle in (reference, hwnd):
            focused = focus(handle)
            assert u.PostMessageW(handle, win32.WM_SYSCOMMAND, 0xF010, 0)  # SC_MOVE from the system menu
            moving = until(lambda: gui_state(handle)["moving"], 1.0)
            move_probes.append({"focused": focused, "moving": moving, "gui": gui_state(handle)})
            assert cancel_move(handle), "Cannot cancel native system move"
        move_status = "passed" if move_probes[1]["moving"] else ("failed" if move_probes[0]["moving"] else "unsupported")
        results.append({"case": "native-SC_MOVE", "status": move_status,
                        "control": move_probes[0], "target": move_probes[1]})
        assert move_status != "failed", "Native move failed after standard control passed"

        target = [work[0], work[1], midpoint, work[3]]
        calibration = system_move_snap_probe(reference, target, False)
        if calibration["reached"]:
            probe = system_move_snap_probe(hwnd, target, not native_mode)
            results.append({"case": "native-SC_MOVE-edge-left", "status": "passed" if probe["reached"] else "failed",
                            "control": calibration, "target": probe})
            assert probe["reached"], "System-menu Move Snap failed after native control passed"
        else:
            results.append({"case": "native-SC_MOVE-edge-left", "status": "unsupported",
                            "reason": "Standard native control entered Move but did not complete edge Snap via cursor/system messages",
                            "control": calibration})

        if "--drag-only" not in sys.argv:
            for code, label, target in [(0x25, "Win+left", [work[0], work[1], midpoint, work[3]]),
                                         (0x27, "Win+right", [midpoint, work[1], work[2], work[3]]),
                                         (0x26, "Win+up", work)]:
                calibration = key_probe(reference, code, target, False)
                if not calibration["reached"]:
                    results.append({"case": label, "status": "unsupported",
                                    "reason": "Same-desktop standard native control did not respond to injected Snap keys",
                                    "control": calibration})
                    continue
                probe = key_probe(hwnd, code, target, not native_mode)
                results.append({"case": label, "status": "passed" if probe["reached"] else "failed",
                                "control": calibration, "target": probe})
                assert probe["reached"], label + " failed after input calibration passed"

        target = [work[0], work[1], midpoint, work[3]]
        calibration = drag_probe(reference, target, False, False)
        if calibration["reached"]:
            probe = drag_probe(hwnd, target, not native_mode, True)
            results.append({"case": "HTCAPTION-drag-left", "status": "passed" if probe["reached"] else "failed",
                            "control": calibration, "target": probe})
            assert probe["reached"], "HTCAPTION Snap failed after native drag calibration passed"
        else:
            results.append({"case": "HTCAPTION-drag-left", "status": "unsupported",
                            "reason": "Same-desktop standard native control could not complete injected drag Snap",
                            "control": calibration})

        # Verify direct HTCAPTION dispatch independently of physical input.
        restore(hwnd)
        received = threading.Event()
        @win32._SUBCLASSPROC
        def observe(h, message, wp, lp, sid, data):
            if message == win32.WM_NCLBUTTONDOWN and wp == win32.HTCAPTION:
                received.set()
            return win32._comctl32.DefSubclassProc(h, message, wp, lp)

        from System import Action
        def install_observer():
            assert win32._comctl32.SetWindowSubclass(hwnd, observe, 0x45575001, 0)
        def remove_observer():
            win32._comctl32.RemoveWindowSubclass(hwnd, observe, 0x45575001)
        instance.window.native.Invoke(Action(install_observer))
        try:
            for maximized in (False, True):
                if maximized:
                    assert u.PostMessageW(hwnd, win32.WM_SYSCOMMAND, 0xF030, 0)
                    assert until(lambda: win32.is_zoomed(hwnd)), "Maximize before drag failed"
                received.clear()
                response = instance.controller.native_drag("move")
                delivered = received.wait(2)
                results.append({"case": "bridge-HTCAPTION-maximized-message" if maximized else "bridge-HTCAPTION-message",
                                "status": "passed" if response["ok"] and delivered else "failed",
                                "bridge": response, "delivered": delivered, "gui": gui_state(hwnd)})
                assert response["ok"] and delivered, "Bridge did not deliver native HTCAPTION"
                assert cancel_move(hwnd), "Cannot cancel HTCAPTION move"
        finally:
            assert cancel_move(hwnd), "Cannot cancel HTCAPTION move"
            instance.window.native.Invoke(Action(remove_observer))
    except BaseException as error:
        failure = repr(error)
    finally:
        inject(INPUT(type=0, mi=MOUSEINPUT(dwFlags=4)), keyboard(0x5B, True))
        escape()
        for window in (control, instance.window):
            handle = win32.window_handle(window)
            if handle:
                cancel_move(handle)
            window.destroy()
        u.SetCursorPos(original_cursor.x, original_cursor.y)
        if original_foreground:
            u.SetForegroundWindow(original_foreground)


try:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop") as key:
        arrangement_setting = winreg.QueryValueEx(key, "WindowArrangementActive")[0]
except OSError:
    arrangement_setting = None
webview.start(validate, gui="edgechromium")
report = {"status": "failed" if failure else ("partial" if any(r["status"] == "unsupported" for r in results) else "passed"),
          "windowArrangementActive": arrangement_setting, "results": results, "error": failure}
if "--log" in sys.argv:
    log = Path(sys.argv[sys.argv.index("--log") + 1])
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report), flush=True)
if failure:
    raise SystemExit(1)