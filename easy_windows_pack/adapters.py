"""Opt-in desktop bridges. No host imports, process management or JS dispatch."""
from __future__ import annotations

from typing import Any, Callable


API_TOOLS_METHODS = (
    "get_state", "add_key", "delete_key", "refresh_now",
    "update_thresholds", "update_rate_limit_progress_mode",
    "update_refresh_intervals", "update_app_preferences",
    "initialize_assets", "get_asset_status", "complete_initialization",
    "check_for_updates", "download_update", "defer_update_restart",
    "restart_update", "dismiss_update_prompt", "ignore_update_version",
    "restart_app",
)
TURTLECLAW_METHODS = (
    "get_update_state", "check_for_updates", "download_update",
    "cancel_update_download", "install_update", "confirm_update_ready",
)


class _AllowlistedAdapter:
    def __init__(self, host: Any, names: tuple[str, ...]) -> None:
        for name in names:
            method = getattr(host, name, None)
            if callable(method):
                setattr(self, name, method)

    def get_adapter_capabilities(self) -> list[str]:
        """Only methods actually supplied by this host are advertised."""
        return sorted(name for name in vars(self) if not name.startswith("_"))


class ApiToolsAdapter(_AllowlistedAdapter):
    """Wrap API_TOOLS WebApi or UiWebApi, not its unrestricted controller."""

    def __init__(self, host: Any) -> None:
        super().__init__(host, API_TOOLS_METHODS)


class TurtleClawAdapter(_AllowlistedAdapter):
    """Preserve DesktopSettingsBridge's tokens, ownership checks and ACK flow.

    A non-destructive restart is optional: the current host has no public
    restart-only method. Never use reset_all_data as a restart substitute.
    """

    def __init__(self, host: Any, *, restart: Callable[[], Any] | None = None) -> None:
        super().__init__(host, TURTLECLAW_METHODS)
        if restart is not None:
            if not callable(restart):
                raise TypeError("restart must be callable")
            self.restart_app = restart


class DesktopApi:
    """Compose explicit adapters, rejecting ambiguous method names."""

    def __init__(self, *adapters: _AllowlistedAdapter) -> None:
        for adapter in adapters:
            for name in adapter.get_adapter_capabilities():
                if hasattr(self, name):
                    raise ValueError(f"Duplicate desktop API method: {name}")
                setattr(self, name, getattr(adapter, name))

    def get_adapter_capabilities(self) -> list[str]:
        return sorted(name for name in vars(self) if not name.startswith("_"))