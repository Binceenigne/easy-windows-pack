"""__EWP_hostDoc__"""
import argparse
import json
import os
from pathlib import Path
import sys

import webview
from easy_windows_pack import WindowConfig, create_window


class DemoParser(argparse.ArgumentParser):
    def format_usage(self):
        return super().format_usage().replace("usage: ", "__EWP_usage__", 1)

    def format_help(self):
        return super().format_help().replace("usage: ", "__EWP_usage__", 1)

    def error(self, message):
        self.print_usage(sys.stderr)
        message = message.replace("unrecognized arguments: ", "__EWP_unknownArguments__", 1)
        self.exit(2, f"{self.prog}: __EWP_error__: {message}\n")


def main():
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2]))
    parser = DemoParser(description="__EWP_hostDescription__", add_help=False)
    parser._optionals.title = "__EWP_options__"
    parser.add_argument("-h", "--help", action="help", help="__EWP_help__")
    parser.add_argument("--debug", action="store_true", help="__EWP_debugHelp__")
    args = parser.parse_args()
    manifest = root / "frontend/package.json"
    title = json.loads(manifest.read_text(encoding="utf-8"))["name"] if manifest.is_file() else "__EWP_hostTitle__"
    url = os.environ.get("EWP_DEV_URL")
    if not url:
        page = root / "output/frontend/index.html"
        if not page.is_file():
            raise FileNotFoundError("__EWP_buildFirst__")
        url = page.as_uri()
    create_window(WindowConfig(title=title, width=980, height=680, min_width=640,
                              min_height=420, titlebar_mode="default", close_action="exit"), url=url)
    webview.start(gui="edgechromium" if sys.platform == "win32" else None, debug=args.debug)


if __name__ == "__main__":
    main()