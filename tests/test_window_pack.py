from __future__ import annotations

import sys
import threading
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
        self.addCleanup(self.controller._stop_js_dispatcher)

    @patch.object(win32, "set_topmost", return_value=True)
    def test_topmost_api_notifies_and_syncs_without_direct_js(self, native: Mock) -> None:
        from easy_windows_pack.api import WindowApi

        listener = Mock()
        existing = Mock()
        self.controller.on_state_change = existing
        self.controller.add_state_listener(listener)
        api = WindowApi(self.controller)
        self.assertTrue(api.toggle_always_on_top()["alwaysOnTop"])
        self.assertEqual(api.get_always_on_top(), {"ok": True, "alwaysOnTop": True})
        listener.assert_called_once()
        existing.assert_called_once()
        self.assertTrue(self.controller._wait_for_js_idle())
        self.assertIn('"alwaysOnTop": true', self.controller._window_state_script())
        self.controller.remove_state_listener(listener)
        api.set_always_on_top(False)
        listener.assert_called_once()
        self.assertFalse(api.get_always_on_top()["alwaysOnTop"])

    @patch.object(win32, "IS_WINDOWS", True)
    @patch.object(win32, "set_topmost", return_value=False)
    def test_failed_topmost_keeps_previous_state(self, native: Mock) -> None:
        listener = Mock()
        self.controller.add_state_listener(listener)
        self.assertEqual(self.controller.set_always_on_top(True),
                         {"ok": False, "alwaysOnTop": False})
        listener.assert_not_called()

    @patch.object(win32, "set_topmost", return_value=True)
    def test_concurrent_topmost_toggles_are_serialized(self, native: Mock) -> None:
        threads = [threading.Thread(target=self.controller.toggle_always_on_top)
                   for _ in range(10)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(2)
            self.assertFalse(thread.is_alive())
        self.assertFalse(self.controller.always_on_top)
        self.assertEqual([call.args[1] for call in native.call_args_list], [True, False] * 5)

    @patch.object(win32, "set_topmost")
    def test_native_topmost_can_notify_from_another_thread(self, native: Mock) -> None:
        completed = threading.Event()

        def native_call(*args):
            def notify():
                self.controller._notify_state()
                completed.set()

            worker = threading.Thread(target=notify, daemon=True)
            worker.start()
            self.assertTrue(completed.wait(1), "Native event blocked on the topmost lock")
            worker.join(1)
            return True

        native.side_effect = native_call
        self.assertTrue(self.controller.toggle_always_on_top()["ok"])

    def test_listener_failure_does_not_prevent_close_or_other_listeners(self) -> None:
        listener = Mock()
        self.controller.add_state_listener(Mock(side_effect=ValueError("broken listener")))
        self.controller.add_state_listener(listener)
        self.controller.on_state_change = Mock(side_effect=ValueError("broken observer"))
        with self.assertLogs("easy_windows_pack.controller", level="ERROR"):
            self.controller.window_action("close")
        listener.assert_called_once()
        self.window.destroy.assert_called_once()

    @patch.object(win32, "set_topmost", return_value=True)
    def test_topmost_while_hidden_does_not_evaluate_js(self, native: Mock) -> None:
        self.assertTrue(self.controller._wait_for_js_idle())
        self.controller.hide_window()
        self.window.evaluate_js.reset_mock()
        self.controller.toggle_always_on_top()
        self.assertTrue(self.controller._wait_for_js_idle())
        self.window.evaluate_js.assert_not_called()

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

    @patch.object(win32, "post_minimize", return_value=True)
    def test_minimize_event_does_not_evaluate_js_during_transition(self, post_minimize: Mock) -> None:
        self.window.evaluate_js.reset_mock()
        result = self.controller.window_action("minimize")
        self.controller._on_minimized()

        self.assertFalse(result["visible"])
        self.assertTrue(self.controller._wait_for_js_idle())
        post_minimize.assert_called_once()
        self.window.evaluate_js.assert_not_called()

    @patch.object(win32, "post_minimize", return_value=True)
    def test_minimize_does_not_wait_for_an_inflight_js_call(self, post_minimize: Mock) -> None:
        js_started = __import__("threading").Event()
        release_js = __import__("threading").Event()

        def blocking_evaluate(_script: str) -> None:
            js_started.set()
            release_js.wait(1)

        self.window.evaluate_js.side_effect = blocking_evaluate
        self.controller._sync_state()
        self.assertTrue(js_started.wait(1))

        result = self.controller.window_action("minimize")

        self.assertFalse(result["visible"])
        post_minimize.assert_called_once()
        release_js.set()
        self.assertTrue(self.controller._wait_for_js_idle())

    def test_javascript_dispatcher_serializes_evaluations(self) -> None:
        active_calls = 0
        maximum_active_calls = 0
        calls_lock = __import__("threading").Lock()
        release_js = __import__("threading").Event()

        def tracked_evaluate(_script: str) -> None:
            nonlocal active_calls, maximum_active_calls
            with calls_lock:
                active_calls += 1
                maximum_active_calls = max(maximum_active_calls, active_calls)
            release_js.wait(1)
            with calls_lock:
                active_calls -= 1

        self.window.evaluate_js.side_effect = tracked_evaluate
        self.controller._run_js("window.first();")
        self.assertTrue(self.controller._wait_for_js_idle(0.5) is False)
        self.controller._run_js("window.second();")
        self.assertEqual(maximum_active_calls, 1)
        release_js.set()
        self.assertTrue(self.controller._wait_for_js_idle())
        self.assertEqual(maximum_active_calls, 1)

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
        self.assertTrue(self.controller._wait_for_js_idle())
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
