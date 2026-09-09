from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).parents[1]))

from easy_windows_pack.cli import build_bundle, clean_project, _read_project_version


PROJECT_ROOT = Path(__file__).parents[1]


class CliTests(unittest.TestCase):
    def test_reads_project_version(self) -> None:
        self.assertEqual(_read_project_version(PROJECT_ROOT), "0.2.1")

    def test_bundle_contains_runtime_sources_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            archive = build_bundle(PROJECT_ROOT, Path(temporary))
            with zipfile.ZipFile(archive) as zip_file:
                names = set(zip_file.namelist())
                root = "easy-windows-pack-0.2.1-bundle/"
                self.assertIn(root + "easy_windows_pack/controller.py", names)
                self.assertIn(root + "frontend/window-frame.js", names)
                self.assertIn(root + "examples/demo.py", names)
                self.assertIn(root + "LICENSE", names)
                self.assertFalse(any("__pycache__" in name for name in names))
                self.assertFalse(any(name.endswith(".pyc") for name in names))
                manifest = json.loads(zip_file.read(root + "easy-windows-pack.manifest.json"))
                self.assertEqual(manifest["version"], "0.2.1")
                self.assertIn("frontend/window-frame.js", manifest["files"])

    def test_clean_removes_only_generated_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary)
            (project_root / "build").mkdir()
            (project_root / "dist").mkdir()
            (project_root / "easy_windows_pack.egg-info").mkdir()
            (project_root / "keep.txt").write_text("keep", encoding="utf-8")
            clean_project(project_root)
            self.assertFalse((project_root / "build").exists())
            self.assertFalse((project_root / "dist").exists())
            self.assertFalse((project_root / "easy_windows_pack.egg-info").exists())
            self.assertTrue((project_root / "keep.txt").exists())


if __name__ == "__main__":
    unittest.main()
