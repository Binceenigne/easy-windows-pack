"""Reusable pywebview window chrome for Windows desktop applications."""

from .api import WindowApi
from .adapters import ApiToolsAdapter, DesktopApi, TurtleClawAdapter
from .config import TitleBarMode, WindowConfig, normalize_title_bar_mode
from .controller import WindowController
from .create import WindowInstance, create_window
from .tray import TRAY_SEPARATOR, TrayController, TrayMenuItem, TraySeparator

__all__ = [
    "TRAY_SEPARATOR",
    "TrayController",
    "TrayMenuItem",
    "TraySeparator",
    "ApiToolsAdapter",
    "DesktopApi",
    "TurtleClawAdapter",
    "TitleBarMode",
    "WindowApi",
    "WindowConfig",
    "WindowController",
    "WindowInstance",
    "create_window",
    "normalize_title_bar_mode",
]
