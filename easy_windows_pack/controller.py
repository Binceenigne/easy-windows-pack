from __future__ import annotations

import json
import threading
from dataclasses import replace
from typing import Any, Callable

from .config import WindowConfig, normalize_title_bar_mode
from . import win32

CloseCallback = Callable[["WindowController"], str | bool | None]
StateCallback = Callable[[dict[str, Any]], None]


class WindowController:
    """Own the native window behavior behind the reusable WebView frame."""

    def __init__(
        self,
        config: WindowConfig | None = None,
        *,
        on_close: CloseCallback | None = None,
        on_state_change: StateCallback | None = None,
    ) -> None:
        self.config = (config or WindowConfig()).normalized()
        self.window: Any = None
        self.on_close = on_close
        self.on_state_change = on_state_change
        self.maximized = False
        self.visible = True
        self.always_on_top = self.config.always_on_top
        self._closing = False
        self._lock = threading.RLock()

    def bind_window(self, window: Any) -> None:
        self.window = window
        events = getattr(window, "events", None)
        bindings = {
            "loaded": self._on_loaded,
            "minimized": self._on_minimized,
            "maximized": self._on_maximized,
            "restored": self._on_restored,
            "resized": self._on_resized,
            "closing": self._on_closing,
        }
        for event_name, callback in bindings.items():
            event = getattr(events, event_name, None) if events else None
            if event is not None:
                event += callback
        if self.config.maximize_on_start:
            self.maximized = True
            self._call_window("maximize")
        self._sync_state()

    def get_state(self) -> dict[str, Any]:
        return {
            "ok": True,
            "visible": self.visible,
            "maximized": self.maximized,
            "alwaysOnTop": self.always_on_top,
            "resizable": self.config.resizable,
            "titleBarMode": self.config.titlebar_mode,
            "activeTitleBarMode": self.config.titlebar_mode,
            "windowSize": self._window_size(),
        }

    def window_action(self, action: object) -> dict[str, Any]:
        clean = str(action or "").strip().lower()
        if clean not in {"minimize", "maximize", "restore", "close"}:
            return {"ok": False, "error": f"Unsupported window action: {clean}"}
        if self.window is None:
            return {"ok": False, "error": "Window is not ready"}

        if clean == "minimize":
            self.visible = False
            hwnd = self._window_handle()
            if not win32.post_minimize(hwnd):
                self._call_window("minimize")
        elif clean in {"maximize", "restore"}:
            requested_maximized = clean == "maximize"
            if clean == "maximize":
                requested_maximized = not self._is_zoomed()
            if requested_maximized:
                self._call_window("maximize")
            else:
                self._call_window("restore")
            self.maximized = self._is_zoomed(fallback=requested_maximized)
            win32.set_corner(self._window_handle(), self.maximized)
            self.visible = True
        else:
            return self._request_close()

        self._sync_state()
        return self.get_state()

    def native_drag(self, direction: object) -> dict[str, Any]:
        clean = str(direction or "").strip().lower()
        if clean not in win32.HIT_TESTS:
            return {"ok": False, "error": f"Unsupported drag direction: {clean}"}
        if self.window is None:
            return {"ok": False, "error": "Window is not ready"}

        result: dict[str, object] = {
            "ok": True,
            "maximized": self.maximized,
            "restored": False,
        }
        finished = threading.Event()

        def perform_drag() -> None:
            try:
                drag_result = win32.native_drag(self.window, clean, self.config.title)
                result.update(drag_result)
                if drag_result.get("restored"):
                    self.maximized = False
                    win32.set_corner(self._window_handle(), False)
                    self._sync_state()
            finally:
                finished.set()

        native_form = getattr(self.window, "native", None)
        if getattr(native_form, "InvokeRequired", False):
            try:
                from System import Action

                native_form.BeginInvoke(Action(perform_drag))
            except (ImportError, AttributeError, RuntimeError):
                return {"ok": False, "error": "Unable to access the native UI thread"}
        else:
            perform_drag()
        finished.wait(timeout=2)
        result["maximized"] = self.maximized
        return result  # type: ignore[return-value]

    def set_titlebar_mode(self, mode: object) -> dict[str, Any]:
        requested = normalize_title_bar_mode(mode)
        current = normalize_title_bar_mode(self.config.titlebar_mode)
        native_boundary_changed = (requested == "native") != (current == "native")
        if native_boundary_changed:
            return {
                "ok": True,
                "titleBarMode": requested,
                "activeTitleBarMode": current,
                "restartRequired": True,
            }
        self.config = replace(self.config, titlebar_mode=requested)
        self._run_js(f"window.easyWindowsPackSetTitleBarMode({json.dumps(requested)});")
        self._sync_state()
        return {
            "ok": True,
            "titleBarMode": requested,
            "activeTitleBarMode": requested,
            "restartRequired": False,
        }

    def set_always_on_top(self, enabled: object) -> dict[str, Any]:
        self.always_on_top = bool(enabled)
        applied = win32.set_topmost(self._window_handle(), self.always_on_top)
        return {"ok": applied or not win32.IS_WINDOWS, "alwaysOnTop": self.always_on_top}

    def set_window_size(self, width: object, height: object) -> dict[str, Any]:
        size = self._normalize_size(width, height)
        if self.window is not None and not self.maximized:
            try:
                self.window.resize(size["width"], size["height"])
            except (AttributeError, RuntimeError):
                pass
        return {"ok": True, "windowSize": size}

    def hide_window(self) -> dict[str, Any]:
        self.visible = False
        self._call_window("hide")
        self._sync_state()
        return self.get_state()

    def show_window(self) -> dict[str, Any]:
        self.visible = True
        self._call_window("show")
        if self._is_iconic():
            win32.user32.ShowWindow(self._window_handle(), win32.SW_RESTORE)
        self._sync_state()
        return self.get_state()

    def _request_close(self, from_native_event: bool = False) -> dict[str, Any]:
        if self._closing:
            return {"ok": True, "action": "exit"}
        decision: str | bool | None = None
        if self.on_close is not None:
            decision = self.on_close(self)
        if decision is False or decision == "cancel":
            return {"ok": True, "action": "cancel"}
        action = decision if isinstance(decision, str) else self.config.close_action
        action = "hide" if action == "hide" else "exit"
        if action == "hide":
            if from_native_event:
                timer = threading.Timer(0.01, self.hide_window)
                timer.daemon = True
                timer.start()
            else:
                self.hide_window()
            return {"ok": True, "action": "hide"}
        self._closing = True
        if not from_native_event:
            self._call_window("destroy")
        return {"ok": True, "action": "exit"}

    def _on_closing(self, *_args: Any) -> bool:
        result = self._request_close(from_native_event=True)
        return result["action"] == "exit"

    def _on_loaded(self, *_args: Any) -> None:
        self._sync_state()

    def _on_minimized(self, *_args: Any) -> None:
        self.visible = False
        self._sync_state()

    def _on_maximized(self, *_args: Any) -> None:
        self.maximized = True
        self.visible = True
        win32.set_corner(self._window_handle(), True)
        self._sync_state()

    def _on_restored(self, *_args: Any) -> None:
        self.maximized = False
        self.visible = True
        win32.set_corner(self._window_handle(), False)
        self._sync_state()

    def _on_resized(self, *_args: Any) -> None:
        if not self._is_zoomed():
            self._notify_state()

    def _sync_state(self) -> None:
        self._run_js(
            "window.easyWindowsPackApplyState(%s);"
            % json.dumps(
                {
                    "maximized": self.maximized,
                    "visible": self.visible,
                    "resizable": self.config.resizable,
                    "titleBarMode": self.config.titlebar_mode,
                }
            )
        )
        self._notify_state()

    def _notify_state(self) -> None:
        if self.on_state_change is not None:
            self.on_state_change(self.get_state())

    def _run_js(self, script: str) -> None:
        if self.window is None:
            return
        try:
            self.window.evaluate_js(script)
        except (AttributeError, RuntimeError):
            pass

    def _call_window(self, method_name: str) -> None:
        method = getattr(self.window, method_name, None) if self.window else None
        if method is not None:
            method()

    def _window_handle(self) -> int:
        return win32.window_handle(self.window, self.config.title)

    def _is_zoomed(self, fallback: bool = False) -> bool:
        hwnd = self._window_handle()
        return win32.is_zoomed(hwnd) if hwnd else fallback

    def _is_iconic(self) -> bool:
        hwnd = self._window_handle()
        if not hwnd or not win32.IS_WINDOWS:
            return False
        return bool(win32.user32.IsIconic(hwnd))

    def _window_size(self) -> dict[str, int]:
        width = getattr(self.window, "width", self.config.width)
        height = getattr(self.window, "height", self.config.height)
        return self._normalize_size(width, height)

    def _normalize_size(self, width: object, height: object) -> dict[str, int]:
        def clean(value: object, fallback: int, minimum: int, maximum: int) -> int:
            try:
                number = int(round(float(value)))
            except (TypeError, ValueError, OverflowError):
                return fallback
            return min(max(number, minimum), maximum)

        return {
            "width": clean(width, self.config.width, self.config.min_width or 120, self.config.max_width),
            "height": clean(height, self.config.height, self.config.min_height or 80, self.config.max_height),
        }
