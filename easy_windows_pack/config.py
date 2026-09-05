from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Literal

TitleBarMode = Literal["native", "default", "minimal"]
CloseAction = Literal["exit", "hide"]

_TITLE_BAR_ALIASES = {
    "native": "native",
    "original": "native",
    "system": "native",
    "default": "default",
    "minimal": "minimal",
}


def normalize_title_bar_mode(mode: object) -> TitleBarMode:
    """Normalize public mode names, including the legacy ``original`` alias."""
    return _TITLE_BAR_ALIASES.get(str(mode or "").strip().lower(), "default")  # type: ignore[return-value]


def _positive_int(value: object, fallback: int, minimum: int, maximum: int) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError, OverflowError):
        return fallback
    return min(max(number, minimum), maximum)


@dataclass(frozen=True, slots=True)
class WindowConfig:
    """Window creation and behavior parameters used by :func:`create_window`.

    ``native`` uses the operating system title bar. ``default`` and ``minimal``
    use the reusable HTML title bar from ``frontend/window-frame.html``.
    """

    title: str = "WebView Application"
    titlebar_mode: TitleBarMode | str = "default"
    width: int = 920
    height: int = 680
    min_width: int | None = None
    min_height: int | None = None
    max_width: int = 8192
    max_height: int = 8192
    resizable: bool = True
    shadow: bool = True
    always_on_top: bool = False
    background_color: str = "#ffffff"
    close_action: CloseAction = "exit"
    maximize_on_start: bool = False

    def normalized(self) -> "WindowConfig":
        mode = normalize_title_bar_mode(self.titlebar_mode)
        default_min_width, default_min_height = (
            (220, 96) if mode == "minimal" else (260, 120)
        )
        max_width = _positive_int(self.max_width, 8192, 320, 32768)
        max_height = _positive_int(self.max_height, 8192, 200, 32768)
        min_width = _positive_int(
            self.min_width if self.min_width is not None else default_min_width,
            default_min_width,
            120,
            max_width,
        )
        min_height = _positive_int(
            self.min_height if self.min_height is not None else default_min_height,
            default_min_height,
            80,
            max_height,
        )
        return replace(
            self,
            title=str(self.title or "WebView Application"),
            titlebar_mode=mode,
            width=_positive_int(self.width, 920, min_width, max_width),
            height=_positive_int(self.height, 680, min_height, max_height),
            min_width=min_width,
            min_height=min_height,
            max_width=max_width,
            max_height=max_height,
            close_action="hide" if self.close_action == "hide" else "exit",
        )

    @property
    def uses_native_titlebar(self) -> bool:
        return normalize_title_bar_mode(self.titlebar_mode) == "native"

    @property
    def frameless(self) -> bool:
        return not self.uses_native_titlebar

    @property
    def easy_drag(self) -> bool:
        return self.uses_native_titlebar
