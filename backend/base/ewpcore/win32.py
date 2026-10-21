from __future__ import annotations

import ctypes
import logging
import sys
from ctypes import wintypes
from typing import Any

IS_WINDOWS = sys.platform == "win32"

WM_NCLBUTTONDOWN = 0x00A1
WM_NCCALCSIZE = 0x0083
WM_GETMINMAXINFO = 0x0024
WM_NCDESTROY = 0x0082
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
SWP_FRAMECHANGED = 0x0020
GWL_STYLE = -16
WS_THICKFRAME = 0x00040000
WS_MAXIMIZEBOX = 0x00010000
WS_MINIMIZEBOX = 0x00020000
WS_CAPTION = 0x00C00000
WS_SYSMENU = 0x00080000
HWND_TOPMOST = -1
HWND_NOTOPMOST = -2
DWMWA_WINDOW_CORNER_PREFERENCE = 33
DWMWCP_DONOTROUND = 1
DWMWCP_ROUND = 2


class MONITORINFO(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT),
                ("rcWork", wintypes.RECT), ("dwFlags", wintypes.DWORD)]


class MINMAXINFO(ctypes.Structure):
    _fields_ = [("ptReserved", wintypes.POINT), ("ptMaxSize", wintypes.POINT),
                ("ptMaxPosition", wintypes.POINT), ("ptMinTrackSize", wintypes.POINT),
                ("ptMaxTrackSize", wintypes.POINT)]

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
_comctl32: Any = None
if IS_WINDOWS:
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    _dwmapi = ctypes.WinDLL("dwmapi", use_last_error=True)
    _comctl32 = ctypes.WinDLL("comctl32", use_last_error=True)
    _SUBCLASSPROC = ctypes.WINFUNCTYPE(
        ctypes.c_ssize_t, wintypes.HWND, wintypes.UINT, wintypes.WPARAM,
        wintypes.LPARAM, ctypes.c_size_t, ctypes.c_size_t,
    )
    _comctl32.SetWindowSubclass.argtypes = [wintypes.HWND, _SUBCLASSPROC, ctypes.c_size_t, ctypes.c_size_t]
    _comctl32.SetWindowSubclass.restype = wintypes.BOOL
    _comctl32.RemoveWindowSubclass.argtypes = [wintypes.HWND, _SUBCLASSPROC, ctypes.c_size_t]
    _comctl32.RemoveWindowSubclass.restype = wintypes.BOOL
    _comctl32.DefSubclassProc.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    _comctl32.DefSubclassProc.restype = ctypes.c_ssize_t
    user32.MonitorFromWindow.argtypes = [wintypes.HWND, wintypes.DWORD]
    user32.MonitorFromWindow.restype = wintypes.HANDLE
    user32.GetMonitorInfoW.argtypes = [wintypes.HANDLE, ctypes.POINTER(MONITORINFO)]
    user32.GetMonitorInfoW.restype = wintypes.BOOL
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
    user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.GetWindowLongW.restype = ctypes.c_long
    user32.SetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_long]
    user32.SetWindowLongW.restype = ctypes.c_long
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


def apply_work_area(hwnd: int, limits: MINMAXINFO) -> bool:
    """Use physical, monitor-relative work-area coordinates; keep restore/min sizes."""
    if not IS_WINDOWS or not hwnd:
        return False
    monitor = user32.MonitorFromWindow(hwnd, 2)  # MONITOR_DEFAULTTONEAREST
    info = MONITORINFO(cbSize=ctypes.sizeof(MONITORINFO))
    if not monitor or not user32.GetMonitorInfoW(monitor, ctypes.byref(info)):
        return False
    work, screen = info.rcWork, info.rcMonitor
    if work.right <= work.left or work.bottom <= work.top:
        return False
    limits.ptMaxPosition.x = work.left - screen.left
    limits.ptMaxPosition.y = work.top - screen.top
    limits.ptMaxSize.x = work.right - work.left
    limits.ptMaxSize.y = work.bottom - work.top
    return True


def constrain_maximized_client(hwnd: int, rect: wintypes.RECT) -> bool:
    """Clip the proposed client, not the shell's invisible maximized frame.

    With WS_CAPTION/WS_THICKFRAME Windows can expand the outer rectangle by
    the sizing border even after WM_GETMINMAXINFO. Returning that rectangle
    unchanged from WM_NCCALCSIZE would put WebView content under the taskbar.
    """
    if not IS_WINDOWS or not hwnd or not user32.IsZoomed(hwnd):
        return False
    monitor = user32.MonitorFromWindow(hwnd, 2)
    info = MONITORINFO(cbSize=ctypes.sizeof(MONITORINFO))
    if not monitor or not user32.GetMonitorInfoW(monitor, ctypes.byref(info)):
        return False
    work = info.rcWork
    left, top = max(rect.left, work.left), max(rect.top, work.top)
    right, bottom = min(rect.right, work.right), min(rect.bottom, work.bottom)
    if right <= left or bottom <= top:
        return False
    rect.left, rect.top, rect.right, rect.bottom = left, top, right, bottom
    return True


class WorkAreaConstraint:
    """HWND subclass owned by the controller; install only on the native UI thread.

    WM_GETMINMAXINFO covers the bridge, double-click, keyboard and system menu.
    Query each time so monitor origin, DPI and taskbar placement are not cached.
    Native destruction removes the subclass while its Python callback stays alive.
    """

    def __init__(self, hwnd: int, *, resizable: bool = True) -> None:
        self.hwnd = hwnd
        self.installed = False
        self._callback = _SUBCLASSPROC(self._dispatch)
        self.installed = bool(_comctl32.SetWindowSubclass(hwnd, self._callback, id(self), 0))
        if not self.installed:
            raise OSError("Cannot install the window work-area constraint")
        # The shell requires a sizing frame and maximize box for Aero Snap.
        # Keep these native capabilities while WM_NCCALCSIZE removes the chrome.
        if resizable:
            style = user32.GetWindowLongW(hwnd, GWL_STYLE)
            user32.SetWindowLongW(hwnd, GWL_STYLE, style | WS_CAPTION | WS_SYSMENU | WS_THICKFRAME | WS_MAXIMIZEBOX | WS_MINIMIZEBOX)
            user32.SetWindowPos(hwnd, None, 0, 0, 0, 0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED)

    def _dispatch(self, hwnd: int, message: int, wparam: int, lparam: int,
                  subclass_id: int, _data: int) -> int:
        if message == WM_NCCALCSIZE and lparam:
            try:
                # NCCALCSIZE_PARAMS starts with rgrc[0]; wParam=FALSE passes
                # a RECT directly. Both paths must remove the native caption.
                rect = ctypes.cast(lparam, ctypes.POINTER(wintypes.RECT)).contents
                constrain_maximized_client(hwnd, rect)
                return 0
            except Exception:
                logging.getLogger(__name__).exception("Window client constraint failed")
        result = _comctl32.DefSubclassProc(hwnd, message, wparam, lparam)
        try:
            if message == WM_GETMINMAXINFO and lparam:
                limits = ctypes.cast(lparam, ctypes.POINTER(MINMAXINFO)).contents
                apply_work_area(hwnd, limits)
            elif message == WM_NCDESTROY:
                _comctl32.RemoveWindowSubclass(hwnd, self._callback, subclass_id)
                self.installed = False
        except Exception:
            logging.getLogger(__name__).exception("Window work-area constraint failed")
        return result


def install_work_area_constraint(window: Any, *, resizable: bool = True) -> WorkAreaConstraint | None:
    """Marshal installation to WinForms if called from a pywebview event thread."""
    if not IS_WINDOWS:
        return None
    form = getattr(window, "native", None)
    if form is None:
        return None
    constraint = None

    def install() -> None:
        nonlocal constraint
        hwnd = window_handle(window)
        if hwnd:
            constraint = WorkAreaConstraint(hwnd, resizable=resizable)

    if getattr(form, "InvokeRequired", False):
        from System import Action

        form.Invoke(Action(install))
    else:
        install()
    return constraint


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

    maximized = is_zoomed(hwnd)
    if maximized and direction != "move":
        return {"ok": False, "maximized": True, "restored": False}
    cursor = wintypes.POINT()
    if not user32.GetCursorPos(ctypes.byref(cursor)):
        return {"ok": False, "maximized": maximized, "restored": False}
    user32.ReleaseCapture()
    # WM_NCLBUTTONDOWN uses signed screen coordinates, also on monitors
    # left/above the primary display. Windows owns move, drag-restore and Snap.
    position = (cursor.x & 0xffff) | ((cursor.y & 0xffff) << 16)
    posted = bool(user32.PostMessageW(hwnd, WM_NCLBUTTONDOWN, hit_test, position))
    return {"ok": posted, "maximized": is_zoomed(hwnd), "restored": False}
