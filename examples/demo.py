from pathlib import Path

import webview

from easy_windows_pack import WindowConfig, create_window


ROOT = Path(__file__).resolve().parents[1]


config = WindowConfig(
    title="easy-windows-pack demo",
    titlebar_mode="default",
    width=980,
    height=680,
    min_width=640,
    min_height=420,
    close_action="exit",
)


instance = create_window(
    config,
    url=(ROOT / "examples" / "index.html").as_uri(),
)
webview.start(gui="edgechromium")
