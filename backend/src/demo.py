from pathlib import Path
import argparse
import os
import sys

import webview

from easy_windows_pack import WindowConfig, create_window


ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2]))
parser = argparse.ArgumentParser(description="桌面演示 / Desktop demo")
parser.add_argument("--debug", action="store_true", help="开发者工具 / Developer tools")
args = parser.parse_args()


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
    url=os.environ.get("EWP_DEV_URL") or (ROOT / "output" / "frontend" / "index.html").as_uri(),
)
webview.start(gui="edgechromium", debug=args.debug)
