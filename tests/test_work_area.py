from __future__ import annotations

import ctypes
import unittest
from ctypes import wintypes
from types import SimpleNamespace
from unittest.mock import Mock, patch

from easy_windows_pack import win32
from easy_windows_pack.config import WindowConfig
from easy_windows_pack.controller import WindowController


class WorkAreaTests(unittest.TestCase):
    def test_work_area_is_monitor_relative_and_preserves_tracking_limits(self):
        cases = [
            ((0, 0, 1920, 1080), (0, 0, 1920, 1032), (0, 0, 1920, 1032)),
            ((-2560, -1440, 0, 0), (-2500, -1440, 0, 0), (60, 0, 2500, 1440)),
            ((1920, 0, 4480, 1440), (1920, 60, 4480, 1440), (0, 60, 2560, 1380)),
            ((0, 0, 1920, 1080), (0, 0, 1872, 1080), (0, 0, 1872, 1080)),
        ]
        for screen, work, expected in cases:
            with self.subTest(work=work):
                def fill(_monitor, pointer):
                    info = ctypes.cast(pointer, ctypes.POINTER(win32.MONITORINFO)).contents
                    info.rcMonitor = wintypes.RECT(*screen)
                    info.rcWork = wintypes.RECT(*work)
                    return True

                api = SimpleNamespace(MonitorFromWindow=Mock(return_value=10), GetMonitorInfoW=fill)
                limits = win32.MINMAXINFO()
                limits.ptMinTrackSize.x, limits.ptMinTrackSize.y = 260, 120
                limits.ptMaxTrackSize.x, limits.ptMaxTrackSize.y = 8192, 8192
                with patch.object(win32, "IS_WINDOWS", True), patch.object(win32, "user32", api):
                    self.assertTrue(win32.apply_work_area(100, limits))
                self.assertEqual((limits.ptMaxPosition.x, limits.ptMaxPosition.y,
                                  limits.ptMaxSize.x, limits.ptMaxSize.y), expected)
                self.assertEqual((limits.ptMinTrackSize.x, limits.ptMinTrackSize.y), (260, 120))
                self.assertEqual((limits.ptMaxTrackSize.x, limits.ptMaxTrackSize.y), (8192, 8192))

    def test_monitor_failure_keeps_system_defaults(self):
        limits = win32.MINMAXINFO()
        limits.ptMaxSize.x = 999
        api = SimpleNamespace(MonitorFromWindow=Mock(return_value=1), GetMonitorInfoW=Mock(return_value=False))
        with patch.object(win32, "IS_WINDOWS", True), patch.object(win32, "user32", api):
            self.assertFalse(win32.apply_work_area(1, limits))
        self.assertEqual(limits.ptMaxSize.x, 999)

    def test_maximized_client_clips_invisible_frame_on_each_monitor(self):
        cases = [
            ((0, 0, 1920, 1032), (-8, -8, 1928, 1040)),
            ((-2500, -1440, 0, 0), (-2516, -1456, 16, 16)),
            ((1920, 60, 4480, 1440), (1908, 48, 4492, 1452)),
            ((0, 0, 1872, 1080), (-8, -8, 1880, 1088)),
        ]
        for work, proposed in cases:
            with self.subTest(work=work):
                def fill(_monitor, pointer):
                    info = ctypes.cast(pointer, ctypes.POINTER(win32.MONITORINFO)).contents
                    info.rcWork = wintypes.RECT(*work)
                    return True

                api = SimpleNamespace(IsZoomed=Mock(return_value=True),
                                      MonitorFromWindow=Mock(return_value=10), GetMonitorInfoW=fill)
                rect = wintypes.RECT(*proposed)
                with patch.object(win32, "IS_WINDOWS", True), patch.object(win32, "user32", api):
                    self.assertTrue(win32.constrain_maximized_client(100, rect))
                self.assertEqual((rect.left, rect.top, rect.right, rect.bottom), work)

    def test_restored_client_is_not_inset_or_clamped(self):
        rect = wintypes.RECT(-20, -20, 900, 700)
        api = SimpleNamespace(IsZoomed=Mock(return_value=False), MonitorFromWindow=Mock())
        with patch.object(win32, "IS_WINDOWS", True), patch.object(win32, "user32", api):
            self.assertFalse(win32.constrain_maximized_client(100, rect))
        self.assertEqual((rect.left, rect.top, rect.right, rect.bottom), (-20, -20, 900, 700))
        api.MonitorFromWindow.assert_not_called()

    def test_client_monitor_failure_or_empty_intersection_preserves_rectangle(self):
        for work in [None, (0, 0, 0, 0), (2000, 0, 3000, 1000)]:
            with self.subTest(work=work):
                def fill(_monitor, pointer):
                    if work is None:
                        return False
                    ctypes.cast(pointer, ctypes.POINTER(win32.MONITORINFO)).contents.rcWork = wintypes.RECT(*work)
                    return True

                api = SimpleNamespace(IsZoomed=Mock(return_value=True),
                                      MonitorFromWindow=Mock(return_value=10), GetMonitorInfoW=fill)
                rect = wintypes.RECT(0, 0, 1000, 1000)
                with patch.object(win32, "IS_WINDOWS", True), patch.object(win32, "user32", api):
                    self.assertFalse(win32.constrain_maximized_client(100, rect))
                self.assertEqual((rect.left, rect.top, rect.right, rect.bottom), (0, 0, 1000, 1000))

    def test_both_nccalcsize_forms_remove_chrome_and_clip_client(self):
        constraint = object.__new__(win32.WorkAreaConstraint)
        comctl = SimpleNamespace(DefSubclassProc=Mock())
        for wparam in (0, 1):
            # rgrc[0] is at offset zero in NCCALCSIZE_PARAMS. Leave the saved
            # rectangles untouched; they belong to Windows, not our client.
            rects = (wintypes.RECT * 3)(wintypes.RECT(-8, -8, 1928, 1040),
                                       wintypes.RECT(1, 2, 3, 4), wintypes.RECT(5, 6, 7, 8))
            def clip(_hwnd, rect):
                rect.left, rect.top, rect.right, rect.bottom = 0, 0, 1920, 1032
                return True

            with patch.object(win32, "_comctl32", comctl), patch.object(win32, "constrain_maximized_client", side_effect=clip):
                self.assertEqual(constraint._dispatch(100, win32.WM_NCCALCSIZE, wparam,
                                                     ctypes.addressof(rects), 1, 0), 0)
            self.assertEqual((rects[0].left, rects[0].top, rects[0].right, rects[0].bottom), (0, 0, 1920, 1032))
            self.assertEqual((rects[1].left, rects[1].top, rects[2].right, rects[2].bottom), (1, 2, 7, 8))
        comctl.DefSubclassProc.assert_not_called()

    def test_getminmaxinfo_overrides_after_native_default_processing(self):
        constraint = object.__new__(win32.WorkAreaConstraint)
        limits = win32.MINMAXINFO()
        def default(*_args):
            limits.ptMaxSize.x = 1936
            return 17
        def constrain(_hwnd, value):
            self.assertEqual(value.ptMaxSize.x, 1936)
            value.ptMaxSize.x = 1920
            return True
        with patch.object(win32, "_comctl32", SimpleNamespace(DefSubclassProc=default)), patch.object(win32, "apply_work_area", side_effect=constrain):
            result = constraint._dispatch(100, win32.WM_GETMINMAXINFO, 0, ctypes.addressof(limits), 1, 0)
        self.assertEqual(result, 17)
        self.assertEqual(limits.ptMaxSize.x, 1920)

    @unittest.skipUnless(win32.IS_WINDOWS, "Native subclass callback requires Windows")
    def test_resizable_subclass_keeps_shell_snap_style_bits(self):
        api = SimpleNamespace(GetWindowLongW=Mock(return_value=0x16000000),
                              SetWindowLongW=Mock(), SetWindowPos=Mock())
        comctl = SimpleNamespace(SetWindowSubclass=Mock(return_value=True))
        with patch.object(win32, "user32", api), patch.object(win32, "_comctl32", comctl):
            constraint = win32.WorkAreaConstraint(100)
        self.assertTrue(constraint.installed)
        style = api.SetWindowLongW.call_args.args[2]
        for bit in (win32.WS_CAPTION, win32.WS_THICKFRAME, win32.WS_MAXIMIZEBOX,
                    win32.WS_MINIMIZEBOX, win32.WS_SYSMENU):
            self.assertEqual(style & bit, bit)
        self.assertTrue(api.SetWindowPos.call_args.args[-1] & win32.SWP_FRAMECHANGED)

    def test_native_drag_uses_signed_screen_coordinates_and_shell_drag_restore(self):
        for maximized in (False, True):
            with self.subTest(maximized=maximized):
                def cursor(pointer):
                    point = ctypes.cast(pointer, ctypes.POINTER(wintypes.POINT)).contents
                    point.x, point.y = -2500, -600
                    return True

                api = SimpleNamespace(GetCursorPos=cursor, ReleaseCapture=Mock(),
                                      PostMessageW=Mock(return_value=True), ShowWindow=Mock(), SetWindowPos=Mock())
                with patch.object(win32, "IS_WINDOWS", True), patch.object(win32, "user32", api), patch.object(win32, "window_handle", return_value=100), patch.object(win32, "is_zoomed", return_value=maximized):
                    result = win32.native_drag(None, "move")
                self.assertTrue(result["ok"])
                api.PostMessageW.assert_called_once_with(100, win32.WM_NCLBUTTONDOWN, win32.HTCAPTION,
                                                        (-2500 & 0xffff) | ((-600 & 0xffff) << 16))
                api.ShowWindow.assert_not_called()
                api.SetWindowPos.assert_not_called()

    def test_native_drag_reports_failed_message_and_rejects_maximized_resize(self):
        api = SimpleNamespace(GetCursorPos=Mock(return_value=True), ReleaseCapture=Mock(),
                              PostMessageW=Mock(return_value=False))
        with patch.object(win32, "IS_WINDOWS", True), patch.object(win32, "user32", api), patch.object(win32, "window_handle", return_value=100), patch.object(win32, "is_zoomed", return_value=False):
            self.assertFalse(win32.native_drag(None, "move")["ok"])
        api.PostMessageW.reset_mock()
        with patch.object(win32, "IS_WINDOWS", True), patch.object(win32, "user32", api), patch.object(win32, "window_handle", return_value=100), patch.object(win32, "is_zoomed", return_value=True):
            self.assertFalse(win32.native_drag(None, "left")["ok"])
        api.PostMessageW.assert_not_called()

    def test_startup_maximize_waits_until_native_window_is_shown(self):
        controller = WindowController(WindowConfig(maximize_on_start=True))
        self.addCleanup(controller._stop_js_dispatcher)
        window = SimpleNamespace(native=None, evaluate_js=Mock(), maximize=Mock())
        with patch.object(win32, "install_work_area_constraint", return_value=Mock()) as install:
            controller.bind_window(window)
            window.maximize.assert_not_called()
            controller._on_before_show()
            controller._on_shown()
            controller._on_shown()
            install.assert_called_once_with(window, resizable=True)
            window.maximize.assert_called_once_with()

    def test_native_titlebar_keeps_system_maximize_behavior(self):
        controller = WindowController(WindowConfig(titlebar_mode="native"))
        self.addCleanup(controller._stop_js_dispatcher)
        with patch.object(win32, "install_work_area_constraint") as install:
            controller._on_before_show()
            install.assert_not_called()

    def test_startup_does_not_toggle_an_already_maximized_window(self):
        controller = WindowController(WindowConfig(maximize_on_start=True))
        self.addCleanup(controller._stop_js_dispatcher)
        controller.window = SimpleNamespace(maximize=Mock(), restore=Mock())
        with patch.object(win32, "install_work_area_constraint", return_value=Mock()), patch.object(controller, "_is_zoomed", return_value=True):
            controller._on_shown()
        controller.window.maximize.assert_not_called()
        controller.window.restore.assert_not_called()


if __name__ == "__main__":
    unittest.main()