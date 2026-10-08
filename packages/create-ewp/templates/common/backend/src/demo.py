"""Desktop host: development uses EWP_DEV_URL, production uses the Vite build."""
import argparse
import json
import os
from pathlib import Path
import sys

import webview
from easy_windows_pack import WindowConfig, create_window


def main():
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2]))
    parser = argparse.ArgumentParser(description="桌面应用 / Desktop application")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()
    manifest = root / "package.json"
    title = json.loads(manifest.read_text(encoding="utf-8"))["name"] if manifest.is_file() else "Desktop App"
    url = os.environ.get("EWP_DEV_URL")
    if not url:
        page = root / "output/frontend/index.html"
        if not page.is_file():
            raise FileNotFoundError("请先运行 npm run frontend:build / Run npm run frontend:build first")
        url = page.as_uri()
    create_window(WindowConfig(title=title, width=980, height=680, min_width=640,
                              min_height=420, titlebar_mode="default", close_action="exit"), url=url)
    webview.start(gui="edgechromium" if sys.platform == "win32" else None, debug=args.debug)


if __name__ == "__main__":
    main()