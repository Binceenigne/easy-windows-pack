from __future__ import annotations

import ctypes
import sys
from ctypes import wintypes
from typing import Any

IS_WINDOWS = sys.platform == "win32"

WM_NCLBUTTONDOWN = 0x00A1
WM_SYSCOMMAND = 0x0112
SC_MINIMIZE = 0xF020
HTCAPTION = 2
HTLEFT = 10
HTRIGHT = 11
HTTOP = 12
HTTOPLEFT = 13
HTTOPRIGHT = 14
HTBOTTOM = 15
HTBOTTOMLEFT = 16
HTBOTTOMRIGHT = 17
SW_RESTORE = 9
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOZORDER = 0x0004
SWP_NOACTIVATE = 0x0010
HWND_TOPMOST = -1
HWND_NOTOPMOST = -2
DWMWA_WINDOW_CORNER_PREFERENCE = 33
DWMWCP_DONOTROUND = 1
DWMWCP_ROUND = 2

HIT_TESTS = {
    "move": HTCAPTION,
    "left": HTLEFT,
    "right": HTRIGHT,
    "top": HTTOP,
    "top-left": HTTOPLEFT,
    "top-right": HTTOPRIGHT,
    "bottom": HTBOTTOM,
    "bottom-left": HTBOTTOMLEFT,
    "bottom-right": HTBOTTOMRIGHT,
}

user32: Any = None
_dwmapi: Any = None
if IS_WINDOWS:
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    _dwmapi = ctypes.WinDLL("dwmapi", use_last_error=True)
    user32.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
    user32.FindWindowW.restype = wintypes.HWND
    user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.ShowWindow.restype = wintypes.BOOL
    user32.IsZoomed.argtypes = [wintypes.HWND]
    user32.IsZoomed.restype = wintypes.BOOL
    user32.IsIconic.argtypes = [wintypes.HWND]
    user32.IsIconic.restype = wintypes.BOOL
    user32.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
    user32.GetCursorPos.restype = wintypes.BOOL
    user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    user32.GetWindowRect.restype = wintypes.BOOL
    user32.SetWindowPos.argtypes = [
        wintypes.HWND,
        wintypes.HWND,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.UINT,
    ]
    user32.SetWindowPos.restype = wintypes.BOOL
    user32.ReleaseCapture.argtypes = []
    user32.ReleaseCapture.restype = wintypes.BOOL
    user32.PostMessageW.argtypes = [
        wintypes.HWND,
        wintypes.UINT,
        wintypes.WPARAM,
        wintypes.LPARAM,
    ]
    user32.PostMessageW.restype = wintypes.BOOL


def window_handle(window: Any, title: str = "") -> int:
    if not IS_WINDOWS:
        return 0
    native_form = getattr(window, "native", None) if window else None
    handle = getattr(native_form, "Handle", None)
    if handle is not None:
        try:
            return int(handle.ToInt64())
        except (AttributeError, TypeError, ValueError):
            pass
    if title:
        return int(user32.FindWindowW(None, title) or 0)
    return 0


def is_zoomed(hwnd: int) -> bool:
    return bool(IS_WINDOWS and hwnd and user32.IsZoomed(hwnd))


def post_minimize(hwnd: int) -> bool:
    return bool(IS_WINDOWS and hwnd and user32.PostMessageW(hwnd, WM_SYSCOMMAND, SC_MINIMIZE, 0))


def set_topmost(hwnd: int, enabled: bool) -> bool:
    if not IS_WINDOWS or not hwnd:
        return False
    insert_after = HWND_TOPMOST if enabled else HWND_NOTOPMOST
    return bool(
        user32.SetWindowPos(
            hwnd,
            insert_after,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )
    )


def set_corner(hwnd: int, maximized: bool) -> bool:
    if not IS_WINDOWS or not hwnd or _dwmapi is None:
        return False
    preference = ctypes.c_int(DWMWCP_DONOTROUND if maximized else DWMWCP_ROUND)
    result = _dwmapi.DwmSetWindowAttribute(
        hwnd,
        DWMWA_WINDOW_CORNER_PREFERENCE,
        ctypes.byref(preference),
        ctypes.sizeof(preference),
    )
    return result == 0


def native_drag(window: Any, direction: str, title: str = "") -> dict[str, object]:
    """Start a Windows non-client drag or resize operation.

    Moving a custom title bar through ``HTCAPTION`` intentionally delegates the
    actual interaction to Windows, which preserves Aero Snap and Windows 11
    snap layouts instead of reimplementing pointer tracking in JavaScript.
    """
    hit_test = HIT_TESTS.get(direction)
    hwnd = window_handle(window, title)
    if hit_test is None or not hwnd or not IS_WINDOWS:
        return {"ok": False, "maximized": False, "restored": False}

    restored = False
    if direction == "move" and is_zoomed(hwnd):
        cursor = wintypes.POINT()
        maximized_rect = wintypes.RECT()
        user32.GetCursorPos(ctypes.byref(cursor))
        user32.GetWindowRect(hwnd, ctypes.byref(maximized_rect))
        maximized_width = max(1, maximized_rect.right - maximized_rect.left)
        horizontal_ratio = min(
            1.0,
            max(0.0, (cursor.x - maximized_rect.left) / maximized_width),
        )
        user32.ShowWindow(hwnd, SW_RESTORE)
        restored_rect = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(restored_rect))
        restored_width = max(1, restored_rect.right - restored_rect.left)
        user32.SetWindowPos(
            hwnd,
            None,
            round(cursor.x - restored_width * horizontal_ratio),
            cursor.y - 16,
            0,
            0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
        )
        restored = True

    if not is_zoomed(hwnd):
        user32.ReleaseCapture()
        user32.PostMessageW(hwnd, WM_NCLBUTTONDOWN, hit_test, 0)
    return {"ok": True, "maximized": is_zoomed(hwnd), "restored": restored}
