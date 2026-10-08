from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .api import WindowApi
from .config import WindowConfig
from .controller import WindowController

try:
    import webview
except ImportError:  # pragma: no cover - exercised only when the optional dependency is absent
    webview = None


@dataclass(slots=True)
class WindowInstance:
    """The three objects an application needs after creating a window."""

    window: Any
    controller: WindowController
    api: WindowApi


def create_window(
    config: WindowConfig | None = None,
    *,
    url: str,
    app_api: Any = None,
    on_close: Any = None,
    on_state_change: Any = None,
) -> WindowInstance:
    """Create, bind, and return a configured pywebview window."""
    if webview is None:
        raise RuntimeError("easy-windows-pack requires pywebview")
    normalized = (config or WindowConfig()).normalized()
    controller = WindowController(
        normalized,
        on_close=on_close,
        on_state_change=on_state_change,
    )
    api = WindowApi(controller, delegate=app_api)
    window = webview.create_window(
        normalized.title,
        url=url,
        js_api=api,
        width=normalized.width,
        height=normalized.height,
        min_size=(normalized.min_width, normalized.min_height),
        resizable=normalized.resizable,
        frameless=normalized.frameless,
        easy_drag=normalized.easy_drag,
        shadow=normalized.shadow,
        on_top=normalized.always_on_top,
        background_color=normalized.background_color,
    )
    if window is None:
        raise RuntimeError("pywebview did not create a window")
    controller.bind_window(window)
    return WindowInstance(window=window, controller=controller, api=api)
