from __future__ import annotations

import threading
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from easy_windows_pack import (
    TRAY_SEPARATOR, TrayController, TrayMenuItem, WindowApi, WindowController,
)
from easy_windows_pack import win32


class FakeMenu:
    SEPARATOR = object()

    def __init__(self, *items):
        self.items = items


class FakeMenuItem:
    def __init__(self, text, action, **kwargs):
        self.text = text
        self.action = action
        self.__dict__.update(kwargs)


class FakeIcon:
    def __init__(self, name, image, title, menu):
        self.name, self.image, self.title, self.menu = name, image, title, menu
        self.visible = False
        self.stopped = threading.Event()
        self.finished = threading.Event()
        self.update_menu = Mock()
        self.stop_calls = 0

    def run(self, setup):
        try:
            setup(self)
            self.stopped.wait(2)
        finally:
            self.finished.set()

    def stop(self):
        self.stop_calls += 1
        self.stopped.set()


class TrayTests(unittest.TestCase):
    def setUp(self):
        self.controller = WindowController()
        self.controller.bind_window(SimpleNamespace(
            width=800, height=600, show=Mock(), hide=Mock(), destroy=Mock(),
            evaluate_js=Mock(), native=None,
        ))
        self.addCleanup(self.controller._stop_js_dispatcher)
        self.icons = []
        self.images = []

        def make_icon(*args):
            icon = FakeIcon(*args)
            self.icons.append(icon)
            return icon

        def load_image():
            image = Mock()
            self.images.append(image)
            return image

        self.backend = SimpleNamespace(Icon=Mock(side_effect=make_icon),
                                       Menu=FakeMenu, MenuItem=FakeMenuItem)
        self.backend_patch = patch.object(TrayController, "_load_backend", return_value=self.backend)
        self.image_patch = patch.object(TrayController, "_load_image", side_effect=load_image)
        self.backend_patch.start()
        self.image_patch.start()
        self.addCleanup(self.backend_patch.stop)
        self.addCleanup(self.image_patch.stop)
        self.tray = TrayController(self.controller, icon=object())
        self.addCleanup(self.cleanup_tray)

    def cleanup_tray(self):
        self.tray.stop()
        for icon in self.icons:
            icon.stop()
            self.assertTrue(icon.finished.wait(2))

    def test_start_stop_are_idempotent_and_restart_uses_new_icon(self):
        self.tray.start()
        first = self.icons[-1]
        self.assertTrue(self.tray.running)
        self.assertTrue(first.visible)
        self.tray.start()
        self.assertEqual(len(self.icons), 1)
        self.tray.stop()
        self.tray.stop()
        self.assertEqual(first.stop_calls, 1)
        self.assertFalse(self.tray.running)
        self.assertNotIn(self.tray._state_changed, self.controller._state_listeners)
        self.tray.start()
        self.assertIsNot(self.icons[-1], first)

    @patch.object(win32, "set_topmost", return_value=True)
    def test_window_menu_follows_python_and_js_window_state(self, native):
        observer = Mock()
        self.controller.on_state_change = observer
        self.tray.start()
        icon = self.icons[-1]
        show, hide, separator, topmost = icon.menu.items
        self.assertIs(separator, FakeMenu.SEPARATOR)
        self.assertTrue(show.default)
        hide.action(icon, hide)
        self.assertFalse(hide.enabled(hide))
        self.assertFalse(self.controller.visible)
        self.controller.window.hide.assert_called_once()
        self.assertTrue(self.controller._wait_for_js_idle())
        self.controller.window.evaluate_js.reset_mock()
        topmost.action(icon, topmost)
        self.assertTrue(topmost.checked(topmost))
        self.assertTrue(self.controller._wait_for_js_idle())
        self.controller.window.evaluate_js.assert_not_called()
        WindowApi(self.controller).set_always_on_top(False)
        self.assertFalse(topmost.checked(topmost))
        show.action(icon, show)
        self.assertTrue(hide.enabled(hide))
        self.controller.window.show.assert_called_once()
        self.assertTrue(self.controller._wait_for_js_idle())
        self.assertIn('"alwaysOnTop": false', self.controller._window_state_script())
        self.assertTrue(observer.called)
        self.assertTrue(icon.update_menu.called)

    def test_custom_menu_disabled_checked_and_dynamic_replacement(self):
        callback = Mock()
        state = {"enabled": False, "checked": True}
        self.tray.set_menu([
            TrayMenuItem("Custom", callback, enabled=lambda: state["enabled"],
                         checked=lambda: state["checked"]), TRAY_SEPARATOR,
        ])
        self.tray.start()
        icon = self.icons[-1]
        item = icon.menu.items[0]
        self.assertTrue(item.checked(item))
        item.action(icon, item)
        callback.assert_not_called()
        state["enabled"] = True
        state["checked"] = False
        self.tray.refresh_menu()
        self.assertFalse(item.checked(item))
        item.action(icon, item)
        callback.assert_called_once()
        replacement = Mock()
        self.tray.set_menu([TrayMenuItem("Replacement", replacement)])
        item.action(icon, item)
        callback.assert_called_once()
        icon.menu.items[0].action(icon, icon.menu.items[0])
        replacement.assert_called_once()

    def test_stale_callback_cannot_run_after_stop_or_restart(self):
        callback = Mock()
        self.tray.set_menu([TrayMenuItem("Action", callback)])
        self.tray.start()
        first = self.icons[-1]
        item = first.menu.items[0]
        self.tray.stop()
        item.action(first, item)
        self.tray.start()
        item.action(first, item)
        callback.assert_not_called()

    def test_callback_and_state_errors_are_recorded_without_killing_tray(self):
        failure = ValueError("callback failed")
        self.tray.set_menu([TrayMenuItem("Action", Mock(side_effect=failure))])
        self.tray.start()
        icon = self.icons[-1]
        with self.assertLogs("easy_windows_pack.tray", level="ERROR"):
            icon.menu.items[0].action(icon, icon.menu.items[0])
        self.assertIs(self.tray.last_error, failure)
        self.assertTrue(self.tray.running)
        self.tray.set_menu([TrayMenuItem("Broken state", Mock(), enabled=Mock(side_effect=failure))])
        with self.assertLogs("easy_windows_pack.tray", level="ERROR"):
            self.assertFalse(icon.menu.items[0].enabled(None))

    def test_close_stops_tray_but_hide_keeps_it_running(self):
        self.tray.start()
        self.controller.hide_window()
        self.assertTrue(self.tray.running)
        self.controller.window_action("close")
        self.assertFalse(self.tray.running)
        with self.assertRaisesRegex(RuntimeError, "closed window"):
            self.tray.start()

    def test_exit_callback_runs_once_and_stops_tray_first(self):
        callback = Mock(side_effect=lambda: self.assertFalse(self.tray.running))
        self.tray = TrayController(self.controller, icon=object(), on_exit=callback)
        self.tray.start()
        self.tray.request_exit()
        self.tray.request_exit()
        callback.assert_called_once()
        self.controller.window.destroy.assert_not_called()

    def test_start_failure_cleans_state_and_listener(self):
        failure = RuntimeError("backend failed")
        original = self.backend.Icon.side_effect

        def failing_icon(*args):
            icon = original(*args)

            def fail(setup):
                icon.finished.set()
                raise failure

            icon.run = fail
            return icon

        self.backend.Icon.side_effect = failing_icon
        with self.assertRaisesRegex(RuntimeError, "Unable to start"):
            self.tray.start()
        self.assertFalse(self.tray.running)
        self.assertNotIn(self.tray._state_changed, self.controller._state_listeners)
        self.images[-1].close.assert_called_once()

    def test_missing_optional_dependency_is_actionable(self):
        self.backend_patch.stop()
        with patch.dict("sys.modules", {"pystray": None}):
            with self.assertRaisesRegex(RuntimeError, r"easy-windows-pack\[tray\]"):
                self.tray.start()
        self.assertFalse(self.tray.running)

    def test_start_timeout_cancels_late_setup(self):
        release_setup = threading.Event()
        self.addCleanup(release_setup.set)
        original = self.backend.Icon.side_effect

        def delayed_icon(*args):
            icon = original(*args)

            def run(setup):
                try:
                    release_setup.wait(2)
                    setup(icon)
                finally:
                    icon.finished.set()

            icon.run = run
            return icon

        self.backend.Icon.side_effect = delayed_icon
        with self.assertRaises(TimeoutError):
            self.tray.start(timeout=0.01)
        self.assertFalse(self.tray.running)
        self.assertNotIn(self.tray._state_changed, self.controller._state_listeners)
        release_setup.set()
        self.assertTrue(self.icons[-1].finished.wait(2))
        self.assertFalse(self.icons[-1].visible)

    def test_refresh_error_is_recorded_and_stop_still_works(self):
        self.tray.start()
        self.icons[-1].update_menu.side_effect = RuntimeError("refresh failed")
        with self.assertLogs("easy_windows_pack.tray", level="ERROR"):
            self.tray.refresh_menu()
        self.assertIsInstance(self.tray.last_error, RuntimeError)
        self.tray.stop()
        self.assertFalse(self.tray.running)

    def test_native_closed_event_stops_tray(self):
        self.tray.start()
        self.controller._on_closed()
        self.assertFalse(self.tray.running)

    def test_menu_rejects_command_strings_and_invalid_flags(self):
        for menu in (["command"], [TrayMenuItem("Run", "calc.exe")],
                     [TrayMenuItem(" ", Mock())], [TrayMenuItem(123, Mock())],
                     [TrayMenuItem("Bad", Mock(), enabled=None)],
                     [TrayMenuItem("Bad", Mock(), checked="yes")],
                     [TrayMenuItem("Bad", Mock(), default="yes")],
                     [TrayMenuItem("One", Mock(), default=True),
                      TrayMenuItem("Two", Mock(), default=True)]):
            with self.subTest(menu=menu), self.assertRaises(ValueError):
                self.tray.set_menu(menu)
        api = WindowApi(self.controller)
        for name in ("set_menu", "start", "request_exit", "execute", "run_command"):
            self.assertFalse(hasattr(api, name))


if __name__ == "__main__":
    unittest.main()