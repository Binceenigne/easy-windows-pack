import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from easy_windows_pack import ApiToolsAdapter, DesktopApi, TurtleClawAdapter, WindowApi
from easy_windows_pack.adapters import API_TOOLS_METHODS, TURTLECLAW_METHODS


class AdapterTests(unittest.TestCase):
    def test_api_tools_allowlist(self):
        host = SimpleNamespace(**{name: Mock(return_value={"ok": True}) for name in API_TOOLS_METHODS})
        host.exit_app = Mock()
        adapter = ApiToolsAdapter(host)
        self.assertEqual(adapter.get_adapter_capabilities(), sorted(API_TOOLS_METHODS))
        self.assertFalse(hasattr(adapter, "exit_app"))
        for name in API_TOOLS_METHODS:
            self.assertEqual(getattr(adapter, name)(), {"ok": True})

    def test_settings_arguments_and_identity(self):
        result = {"ok": True, "backgroundUiMode": "release"}
        method = Mock(return_value=result)
        adapter = ApiToolsAdapter(SimpleNamespace(update_app_preferences=method))
        self.assertIs(adapter.update_app_preferences("daily", "hide", True, "minimal", "release"), result)
        method.assert_called_once_with("daily", "hide", True, "minimal", "release")

    def test_turtleclaw_token_and_ack(self):
        host = SimpleNamespace(**{name: Mock(return_value={"accepted": True}) for name in TURTLECLAW_METHODS})
        host.reset_all_data = Mock()
        adapter = TurtleClawAdapter(host)
        adapter.install_update("one-use-token")
        adapter.check_for_updates(True)
        adapter.confirm_update_ready()
        host.install_update.assert_called_once_with("one-use-token")
        host.check_for_updates.assert_called_once_with(True)
        host.confirm_update_ready.assert_called_once_with()
        self.assertFalse(hasattr(adapter, "reset_all_data"))
        self.assertFalse(hasattr(adapter, "restart_app"))

    def test_missing_methods_are_not_advertised(self):
        adapter = ApiToolsAdapter(object())
        self.assertEqual(adapter.get_adapter_capabilities(), [])
        with self.assertRaises(AttributeError):
            adapter.download_update()

    def test_host_errors_propagate(self):
        adapter = TurtleClawAdapter(SimpleNamespace(install_update=Mock(side_effect=ValueError("invalid token"))))
        with self.assertRaisesRegex(ValueError, "invalid token"):
            adapter.install_update("bad")

    def test_restart_is_explicit(self):
        restart = Mock(return_value={"accepted": True})
        adapter = TurtleClawAdapter(object(), restart=restart)
        self.assertEqual(adapter.restart_app(), {"accepted": True})
        restart.assert_called_once_with()
        with self.assertRaises(TypeError):
            TurtleClawAdapter(object(), restart="command")

    def test_duplicate_contract_is_rejected(self):
        method = SimpleNamespace(download_update=Mock())
        with self.assertRaisesRegex(ValueError, "download_update"):
            DesktopApi(ApiToolsAdapter(method), TurtleClawAdapter(method))

    def test_window_api_enumerates_adapter_without_shadowing(self):
        controller = SimpleNamespace(get_state=Mock(return_value={"visible": True}))
        host = SimpleNamespace(get_state=Mock(return_value={"keys": []}), window_action=Mock())
        api = WindowApi(controller, DesktopApi(ApiToolsAdapter(host)))
        self.assertIn("get_state", vars(api))
        self.assertEqual(api.get_state(), {"keys": []})
        self.assertEqual(api.get_window_state(), {"visible": True})
        self.assertNotIn("window_action", vars(api))


if __name__ == "__main__":
    unittest.main()