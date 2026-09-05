from __future__ import annotations

from typing import Any

from .controller import WindowController


class WindowApi:
    """Expose window methods to JavaScript and optionally delegate app methods."""

    def __init__(self, controller: WindowController, delegate: Any = None) -> None:
        self._controller = controller
        self._delegate = delegate
        if delegate is not None:
            for name in dir(delegate):
                if name.startswith("_") or name in self.__dict__ or name in type(self).__dict__:
                    continue
                method = getattr(delegate, name)
                if callable(method):
                    setattr(self, name, method)

    def get_window_state(self) -> dict[str, Any]:
        return self._controller.get_state()

    def window_action(self, action: str) -> dict[str, Any]:
        return self._controller.window_action(action)

    def native_drag(self, direction: str) -> dict[str, Any]:
        return self._controller.native_drag(direction)

    def set_titlebar_mode(self, mode: str) -> dict[str, Any]:
        return self._controller.set_titlebar_mode(mode)

    def set_always_on_top(self, enabled: bool) -> dict[str, Any]:
        return self._controller.set_always_on_top(enabled)

    def set_window_size(self, width: Any, height: Any) -> dict[str, Any]:
        return self._controller.set_window_size(width, height)

    def hide_window(self) -> dict[str, Any]:
        return self._controller.hide_window()

    def show_window(self) -> dict[str, Any]:
        return self._controller.show_window()

    def __getattr__(self, name: str) -> Any:
        if self._delegate is None:
            raise AttributeError(name)
        return getattr(self._delegate, name)
