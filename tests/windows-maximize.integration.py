"""Real Windows/WebView2 work-area regression; not part of headless tests."""
from __future__ import annotations

import ctypes
import json
import sys
import threading
import time
from ctypes import wintypes
from pathlib import Path

import webview

from easy_windows_pack import WindowConfig, create_window
from easy_windows_pack import win32


MONITORINFO = win32.MONITORINFO


def rect_values(rect: wintypes.RECT) -> list[int]:
    return [rect.left, rect.top, rect.right, rect.bottom]


user32 = win32.user32
user32.MonitorFromWindow.argtypes = [wintypes.HWND, wintypes.DWORD]
user32.MonitorFromWindow.restype = wintypes.HANDLE
user32.GetMonitorInfoW.argtypes = [wintypes.HANDLE, ctypes.POINTER(MONITORINFO)]
user32.GetMonitorInfoW.restype = wintypes.BOOL
user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
win32._dwmapi.DwmGetWindowAttribute.argtypes = [wintypes.HWND, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD]
instance = create_window(WindowConfig(title="EWP work-area regression", width=760, height=500,
                                      maximize_on_start="--startup" in sys.argv),
                         url=(Path(__file__).parent / "fixtures/native-window.html").resolve().as_uri())
results = []
failure = None
tick = threading.Event()


def bounds(hwnd: int) -> dict:
    outer, client, dwm = wintypes.RECT(), wintypes.RECT(), wintypes.RECT()
    origin = wintypes.POINT()
    assert user32.GetWindowRect(hwnd, ctypes.byref(outer))
    assert user32.GetClientRect(hwnd, ctypes.byref(client))
    assert user32.ClientToScreen(hwnd, ctypes.byref(origin))
    client.left += origin.x
    client.right += origin.x
    client.top += origin.y
    client.bottom += origin.y
    hr = win32._dwmapi.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(dwm), ctypes.sizeof(dwm))
    return {"window": rect_values(outer), "client": rect_values(client),
            "dwm": rect_values(dwm) if hr == 0 else None,
            "style": hex(user32.GetWindowLongW(hwnd, win32.GWL_STYLE) & 0xffffffff)}


def until(predicate, description: str) -> None:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if predicate():
            return
        tick.wait(0.025)
    raise AssertionError(description)


def inspect_maximized(label: str) -> None:
    hwnd = win32.window_handle(instance.window)
    info = MONITORINFO(cbSize=ctypes.sizeof(MONITORINFO))
    assert user32.GetMonitorInfoW(user32.MonitorFromWindow(hwnd, 2), ctypes.byref(info))
    until(lambda: win32.is_zoomed(hwnd), label + " did not maximize")
    results.append({"case": label, **bounds(hwnd),
                    "work": rect_values(info.rcWork), "monitor": rect_values(info.rcMonitor),
                    "zoomed": win32.is_zoomed(hwnd)})
    assert win32.is_zoomed(hwnd), results[-1]
    # GetWindowRect includes the invisible sizing frame. The content must fit rcWork.
    assert results[-1]["client"] == rect_values(info.rcWork), results[-1]
    assert results[-1]["dwm"] == results[-1]["client"], results[-1]
    native = instance.window.native
    browser_hwnd = int(native.browser.webview.Handle.ToInt64())
    browser_bounds = bounds(browser_hwnd)
    results[-1]["webview"] = browser_bounds["window"]
    assert browser_bounds["window"] == results[-1]["client"], results[-1]


def validate() -> None:
    global failure
    try:
        assert instance.window.events.loaded.wait(20), "WebView2 page did not load"
        initial = bounds(win32.window_handle(instance.window))
        results.append({"case": "initial", **initial})
        if "--startup" not in sys.argv:
            assert initial["client"] == initial["window"] == initial["dwm"], initial
        if "--startup" in sys.argv:
            inspect_maximized("maximize-on-start")
        else:
            instance.controller.window_action("maximize")
            inspect_maximized("bridge-maximize")
        instance.controller.window_action("restore")
        until(lambda: not win32.is_zoomed(win32.window_handle(instance.window)), "Restore failed")
        hwnd = win32.window_handle(instance.window)
        restored = bounds(hwnd)
        results.append({"case": "restored", **restored})
        assert restored["client"] == restored["window"], restored
        assert restored["dwm"] == restored["client"], restored
        if "--startup" not in sys.argv:
            assert restored["window"] == initial["window"], restored
        # This bypasses the bridge: the OS keyboard/system-menu path must work too.
        user32.PostMessageW(hwnd, win32.WM_SYSCOMMAND, 0xF030, 0)
        inspect_maximized("system-maximize")
        instance.controller.window_action("restore")
        assert not win32.is_zoomed(hwnd)
    except BaseException as error:
        failure = repr(error)
    finally:
        instance.window.destroy()


webview.start(validate, gui="edgechromium")
report = {"results": results, "error": failure}
if "--log" in sys.argv:
    log = Path(sys.argv[sys.argv.index("--log") + 1])
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=True), flush=True)
if failure:
    raise SystemExit(1)