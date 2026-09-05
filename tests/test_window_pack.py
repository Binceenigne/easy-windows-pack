from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).parents[1]))

from easy_windows_pack.config import WindowConfig, normalize_title_bar_mode
from easy_windows_pack.controller import WindowController
from easy_windows_pack import win32


class WindowConfigTests(unittest.TestCase):
    def test_modes_and_legacy_alias_are_normalized(self) -> None:
        self.assertEqual(normalize_title_bar_mode("original"), "native")
        self.assertEqual(normalize_title_bar_mode("minimal"), "minimal")
        self.assertEqual(normalize_title_bar_mode("unknown"), "default")

    def test_minimal_mode_has_smaller_defaults(self) -> None:
        config = WindowConfig(titlebar_mode="minimal").normalized()
        self.assertEqual((config.min_width, config.min_height), (220, 96))
        self.assertTrue(config.frameless)
        self.assertFalse(config.easy_drag)

    def test_native_mode_uses_system_frame(self) -> None:
        config = WindowConfig(titlebar_mode="native").normalized()
        self.assertFalse(config.frameless)
        self.assertTrue(config.easy_drag)

    def test_non_resizable_windows_preserve_the_configuration(self) -> None:
        config = WindowConfig(resizable=False).normalized()
        self.assertFalse(config.resizable)

    def test_topmost_flags_do_not_move_the_window(self) -> None:
        self.assertEqual(win32.SWP_NOMOVE | win32.SWP_NOSIZE | win32.SWP_NOACTIVATE, 0x13)

    def test_size_is_clamped_to_configured_bounds(self) -> None:
        config = WindowConfig(width=1, height=99999, min_width=500, min_height=400).normalized()
        self.assertEqual((config.width, config.height), (500, 8192))


class WindowControllerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.window = SimpleNamespace(
            width=900,
            height=600,
            native=None,
            evaluate_js=Mock(),
            maximize=Mock(),
            restore=Mock(),
            minimize=Mock(),
            destroy=Mock(),
            hide=Mock(),
            show=Mock(),
        )
        self.controller = WindowController(WindowConfig(title="Test"))
        self.controller.bind_window(self.window)

    @patch.object(win32, "window_handle", return_value=0)
    def test_three_window_buttons_delegate_to_pywebview(self, _handle: Mock) -> None:
        minimized = self.controller.window_action("minimize")
        self.assertTrue(minimized["ok"])
        self.window.minimize.assert_called_once_with()

        self.controller.window_action("maximize")
        self.window.maximize.assert_called_once_with()

        closed = self.controller.window_action("close")
        self.assertEqual(closed["action"], "exit")
        self.window.destroy.assert_called_once_with()

    @patch("easy_windows_pack.controller.threading.Timer")
    def test_native_close_to_hide_is_deferred(self, timer_class: Mock) -> None:
        self.controller.config = WindowConfig(close_action="hide").normalized()
        timer = timer_class.return_value
        result = self.controller._request_close(from_native_event=True)
        self.assertEqual(result["action"], "hide")
        timer_class.assert_called_once_with(0.01, self.controller.hide_window)
        timer.daemon = True
        timer.start.assert_called_once_with()

    @patch.object(win32, "window_handle", return_value=0)
    def test_invalid_actions_are_rejected(self, _handle: Mock) -> None:
        result = self.controller.window_action("tile")
        self.assertFalse(result["ok"])
        self.assertIn("Unsupported", result["error"])

    def test_switching_between_custom_modes_is_immediate(self) -> None:
        result = self.controller.set_titlebar_mode("minimal")
        self.assertFalse(result["restartRequired"])
        self.assertEqual(result["activeTitleBarMode"], "minimal")
        scripts = [call.args[0] for call in self.window.evaluate_js.call_args_list]
        self.assertTrue(any("easyWindowsPackSetTitleBarMode" in script for script in scripts))

    def test_switching_native_boundary_reports_restart(self) -> None:
        result = self.controller.set_titlebar_mode("native")
        self.assertTrue(result["restartRequired"])
        self.assertEqual(result["activeTitleBarMode"], "default")

    def test_state_includes_resizable_flag(self) -> None:
        self.controller.config = WindowConfig(resizable=False).normalized()
        self.assertFalse(self.controller.get_state()["resizable"])

    def test_all_resize_directions_are_exposed(self) -> None:
        self.assertEqual(len(win32.HIT_TESTS), 9)
        self.assertEqual(win32.HIT_TESTS["move"], win32.HTCAPTION)
        self.assertEqual(win32.HIT_TESTS["bottom-right"], win32.HTBOTTOMRIGHT)

    def test_business_api_is_exposed_without_overriding_window_api(self) -> None:
        from easy_windows_pack.api import WindowApi

        delegate = SimpleNamespace(get_profile=lambda: {"name": "demo"})
        api = WindowApi(self.controller, delegate)
        self.assertEqual(api.get_profile(), {"name": "demo"})
        self.assertIs(api.window_action.__self__, api)


if __name__ == "__main__":
    unittest.main()
