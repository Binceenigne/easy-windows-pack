from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

from .controller import WindowController

StateValue = bool | Callable[[], bool]
_log = logging.getLogger(__name__)


@dataclass(frozen=True)
class TrayMenuItem:
    """A host-only callback and optional dynamic menu state."""

    text: str
    callback: Callable[[], Any]
    enabled: StateValue = True
    checked: StateValue | None = None
    default: bool = False


@dataclass(frozen=True)
class TraySeparator:
    """A separator in a tray menu."""


TRAY_SEPARATOR = TraySeparator()


class TrayController:
    """Optional Windows tray; never expose this object as a JavaScript API."""

    def __init__(
        self,
        controller: WindowController,
        *,
        icon: Any,
        title: str = "Application",
        name: str = "easy-windows-pack",
        menu: Iterable[TrayMenuItem | TraySeparator] | None = None,
        on_exit: Callable[[], Any] | None = None,
    ) -> None:
        self._controller = controller
        self._image_source = icon
        self._title = title
        self._name = name
        self._on_exit = on_exit
        self._lock = threading.RLock()
        self._icon: Any = None
        self._backend: Any = None
        self._running = False
        self._exiting = False
        self.last_error: Exception | None = None
        self._menu = self._validate_menu(self.window_menu() if menu is None else menu)

    @property
    def running(self) -> bool:
        with self._lock:
            return self._running

    def window_menu(self) -> tuple[TrayMenuItem | TraySeparator, ...]:
        items: list[TrayMenuItem | TraySeparator] = [
            TrayMenuItem("Show window", self._controller.show_window, default=True),
            TrayMenuItem("Hide window", self._controller.hide_window,
                         enabled=lambda: self._controller.visible),
            TRAY_SEPARATOR,
            TrayMenuItem("Always on top", self._controller.toggle_always_on_top,
                         checked=lambda: self._controller.always_on_top),
        ]
        if self._on_exit is not None:
            items.extend([TRAY_SEPARATOR, TrayMenuItem("Exit", self.request_exit)])
        return tuple(items)

    @staticmethod
    def _validate_menu(menu: Iterable[TrayMenuItem | TraySeparator]) -> tuple:
        items = tuple(menu)
        for item in items:
            if isinstance(item, TraySeparator):
                continue
            if (not isinstance(item, TrayMenuItem) or not isinstance(item.text, str)
                    or not item.text.strip() or not callable(item.callback)):
                raise ValueError("Menu items require text and a Python callback")
            for state in (item.enabled, item.checked if item.checked is not None else False):
                if not isinstance(state, bool) and not callable(state):
                    raise ValueError("Menu state must be a bool or a Python callback")
            if not isinstance(item.default, bool):
                raise ValueError("The default flag must be a bool")
        if sum(item.default for item in items if isinstance(item, TrayMenuItem)) > 1:
            raise ValueError("Only one default tray item is allowed")
        return items

    @staticmethod
    def _load_backend() -> Any:
        try:
            import pystray
        except ImportError as exc:
            raise RuntimeError('Install tray support: pip install "easy-windows-pack[tray]"') from exc
        return pystray

    def _load_image(self) -> Any:
        from PIL import Image

        if isinstance(self._image_source, (str, Path)):
            with Image.open(self._image_source) as image:
                return image.convert("RGBA")
        return self._image_source.copy()

    def _value(self, value: StateValue) -> bool:
        try:
            return bool(value() if callable(value) else value)
        except Exception as exc:
            self.last_error = exc
            _log.exception("Unable to evaluate tray menu state")
            return False

    def _build_menu(self, items: tuple) -> Any:
        def convert(item: TrayMenuItem | TraySeparator) -> Any:
            if isinstance(item, TraySeparator):
                return self._backend.Menu.SEPARATOR

            def invoke(_icon: Any, _item: Any) -> None:
                try:
                    with self._lock:
                        active = self._running and self._icon is _icon and self._menu is items
                    if active and self._value(item.enabled):
                        item.callback()
                except Exception as exc:
                    self.last_error = exc
                    _log.exception("Tray menu callback failed: %s", item.text)
                finally:
                    self.refresh_menu()

            return self._backend.MenuItem(
                item.text, invoke,
                enabled=lambda _item: self._value(item.enabled),
                checked=(None if item.checked is None else
                         lambda _item: self._value(item.checked)),
                default=item.default,
            )

        return self._backend.Menu(*(convert(item) for item in items))

    def set_menu(self, menu: Iterable[TrayMenuItem | TraySeparator]) -> None:
        items = self._validate_menu(menu)
        with self._lock:
            previous = self._menu
            self._menu = items
            try:
                if self._icon is not None:
                    self._icon.menu = self._build_menu(items)
            except Exception:
                self._menu = previous
                raise

    def refresh_menu(self) -> None:
        with self._lock:
            if not self._running or self._icon is None:
                return
            try:
                self._icon.update_menu()
            except Exception as exc:
                self.last_error = exc
                _log.exception("Unable to refresh tray menu")

    def _state_changed(self, state: dict[str, Any]) -> None:
        if state.get("closed"):
            self.stop()
        else:
            self.refresh_menu()

    def start(self, timeout: float = 5.0) -> None:
        """Wait for icon readiness; repeated start is a no-op; failures raise."""
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        ready = threading.Event()
        errors: list[Exception] = []
        with self._lock:
            if self._icon is not None:
                if self._running:
                    return
                raise RuntimeError("Tray is already starting")
            if self._controller.get_state()["closed"]:
                raise RuntimeError("Cannot start a tray for a closed window")
            self._backend = self._load_backend()
            image = self._load_image()
            try:
                icon = self._backend.Icon(self._name, image, self._title,
                                          self._build_menu(self._menu))
            except Exception:
                image.close()
                raise
            self._icon = icon
            self.last_error = None
            self._exiting = False
            self._controller.add_state_listener(self._state_changed)

        def setup(active: Any) -> None:
            try:
                with self._lock:
                    cancelled = self._icon is not active
                    if not cancelled:
                        active.visible = True
                        self._running = True
                if cancelled:
                    active.stop()
            except Exception as exc:
                errors.append(exc)
                self.last_error = exc
                active.stop()
            finally:
                ready.set()

        def run() -> None:
            try:
                icon.run(setup=setup)
            except Exception as exc:
                errors.append(exc)
                self.last_error = exc
            finally:
                with self._lock:
                    if self._icon is icon:
                        self._icon = None
                        self._running = False
                        self._controller.remove_state_listener(self._state_changed)
                image.close()
                ready.set()

        worker = threading.Thread(target=run, name="window-tray", daemon=True)
        try:
            worker.start()
            if not ready.wait(timeout):
                raise TimeoutError("Tray did not become ready before the timeout")
            if errors:
                raise RuntimeError("Unable to start tray") from errors[0]
            if not self.running:
                raise RuntimeError("Tray stopped before becoming ready")
        except Exception as exc:
            self.last_error = exc
            self.stop()
            if worker.ident is None:
                image.close()
            raise

    def stop(self) -> None:
        """Request removal without joining the UI/tray thread or closing the window."""
        with self._lock:
            icon = self._icon
            self._icon = None
            self._running = False
            self._controller.remove_state_listener(self._state_changed)
        if icon is not None:
            icon.stop()

    def request_exit(self) -> None:
        """Stop the tray, then run the host shutdown callback once per start."""
        with self._lock:
            if self._on_exit is None:
                raise RuntimeError("An on_exit callback is required")
            if self._exiting:
                return
            self._exiting = True
        self.stop()
        self._on_exit()