from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))

from easy_windows_pack import cli
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
                self.assertIn(root + "backend/base/ewpcore/controller.py", names)
                self.assertIn(root + "frontend/frame/ewpframe/window-frame.js", names)
                self.assertIn(root + "frontend/components/desktop/desktop-components.js", names)
                self.assertIn(root + "frontend/frame/ewpframe/desktop-updates.js", names)
                self.assertIn(root + "frontend/components/desktop/desktop-components.css", names)
                self.assertIn(root + "backend/base/ewpcore/adapters.py", names)
                self.assertIn(root + "tests/frontend.html", names)
                self.assertIn(root + "backend/src/demo.py", names)
                self.assertIn(root + "startup.cmd", names)
                self.assertIn(root + "scripts/startup.cmd", names)
                self.assertIn(root + "scripts/build.cmd", names)
                self.assertIn(root + "scripts/build.ps1", names)
                self.assertIn(root + "scripts/build-demo.ps1", names)
                self.assertIn(root + "scripts/dev.py", names)
                self.assertIn(root + "frontend/package.json", names)
                self.assertIn(root + "frontend/vite.config.mjs", names)
                self.assertIn(root + "frontend/packages/easywindowspack/bin/ewp.mjs", names)
                self.assertIn(root + "frontend/packages/create-ewp/lib/create.mjs", names)
                self.assertIn(root + "LICENSE", names)
                self.assertFalse(any("__pycache__" in name for name in names))
                self.assertFalse(any(name.endswith(".pyc") for name in names))
                manifest = json.loads(zip_file.read(root + "easy-windows-pack.manifest.json"))
                self.assertEqual(manifest["name"], "easy-windows-pack")
                self.assertEqual(manifest["version"], "0.2.1")
                self.assertEqual(manifest["entrypoints"]["frontend"], "frontend/frame/ewpframe/window-frame.js")
                self.assertIn("frontend/frame/ewpframe/window-frame.js", manifest["files"])

    def make_app(self, project_root: Path) -> None:
        for directory in ("backend/base/ewpcore", "frontend/src", "scripts"):
            (project_root / directory).mkdir(parents=True)
        files = {
            "backend/base/ewpcore/__init__.py": "# core",
            "backend/src/demo.py": "# demo",
            "frontend/index.html": "<html></html>",
            "frontend/src/main.js": "// app",
            "scripts/dev.py": "# dev",
            "startup.cmd": "@echo off\n",
            "scripts/startup.cmd": "@echo off\n",
            "README.md": "# Generated app",
            "LICENSE": "MIT",
            "pyproject.toml": '[project]\nname = "sample-desktop"\nversion = "0.1.0"\n',
            "frontend/package.json": '{"name":"sample"}',
            "frontend/package-lock.json": '{"name":"sample"}',
            "frontend/vite.config.mjs": "export default {};",
            "frontend/tsconfig.json": "{}",
            ".gitignore": "node_modules/\noutput/\n",
        }
        for filename, content in files.items():
            target = project_root / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")

    def test_generated_app_bundle_accepts_missing_optional_docs_and_framework_packages(self):
        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary) / "generated app"
            self.make_app(project_root)
            archive = build_bundle(project_root)
            self.assertEqual(archive.name, "sample-desktop-0.1.0-bundle.zip")
            with zipfile.ZipFile(archive) as bundle:
                prefix = "sample-desktop-0.1.0-bundle/"
                names = set(bundle.namelist())
                for filename in ("frontend/package.json", "frontend/package-lock.json",
                                 "frontend/vite.config.mjs", "frontend/tsconfig.json", "startup.cmd", "scripts/startup.cmd",
                                 ".gitignore", "scripts/dev.py", "frontend/index.html", "backend/src/demo.py"):
                    self.assertIn(prefix + filename, names)
                self.assertFalse(any(name.startswith(prefix + "docs/") for name in names))
                manifest = json.loads(bundle.read(prefix + "easy-windows-pack.manifest.json"))
                self.assertEqual(manifest["name"], "sample-desktop")
                self.assertEqual(manifest["version"], "0.1.0")
                self.assertEqual(manifest["entrypoints"], {
                    "python": "easy_windows_pack", "frontend": "frontend/index.html",
                    "example": "backend/src/demo.py",
                })
                self.assertIn(prefix + manifest["entrypoints"]["frontend"], names)
                self.assertIn(manifest["entrypoints"]["frontend"], manifest["files"])
                self.assertIn("frontend/package.json", manifest["files"])

    def test_project_name_reads_only_project_metadata_with_python310_fallback(self):
        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary)
            metadata = project_root / "pyproject.toml"
            for fallback in (False, True):
                with self.subTest(fallback=fallback), patch.dict(sys.modules, {"tomllib": None} if fallback else {}):
                    for quote in ('"', "'"):
                        metadata.write_text(
                            '[tool.app]\nname = "other-app"\n[project] # metadata\n'
                            f'  name = {quote}Sample_Desktop.app{quote} # package name\n'
                            'version = "0.1.0"\n[tool.other]\nname = "ignored"\n', encoding="utf-8")
                        self.assertEqual(cli._read_project_name(project_root), "Sample_Desktop.app")
                    metadata.write_text('[project]\nversion = "0.1.0"\n[tool.app]\nname = "ignored"\n',
                                        encoding="utf-8")
                    self.assertEqual(cli._read_project_name(project_root), "easy-windows-pack")
                    for value in ('"../outside"', '"nested/app"', '"nested\\\\app"', '"C:/app"',
                                  '"."', '".."', '""', '"bad name"', '"-app"', '42'):
                        with self.subTest(value=value):
                            metadata.write_text(f'[project]\nname = {value}\nversion = "0.1.0"\n',
                                                encoding="utf-8")
                            with self.assertRaises(cli.BuildError):
                                cli._read_project_name(project_root)

    def test_bundle_rejects_unsafe_project_name_before_creating_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary) / "app"
            self.make_app(project_root)
            (project_root / "pyproject.toml").write_text(
                '[project]\nname = "../outside"\nversion = "0.1.0"\n', encoding="utf-8")
            with self.assertRaises(cli.BuildError):
                build_bundle(project_root)
            self.assertFalse((project_root / "output").exists())

    def test_bundle_requires_runtime_and_project_entrypoints(self):
        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary)
            self.make_app(project_root)
            for source in cli.REQUIRED_BUNDLE_SOURCES:
                with self.subTest(source=source):
                    original = project_root / source
                    saved = original.with_name(original.name + ".saved")
                    original.rename(saved)
                    try:
                        with self.assertRaisesRegex(cli.BuildError, "Bundle source does not exist"):
                            build_bundle(project_root)
                        self.assertFalse((project_root / "output").exists())
                    finally:
                        saved.rename(original)

    def test_bundle_excludes_generated_directories_at_every_depth(self):
        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary) / "source"
            self.make_app(project_root)
            included = project_root / "frontend/packages/nested/templates/scripts/tool.py"
            included.parent.mkdir(parents=True)
            included.write_text("# source", encoding="utf-8")
            for parent in (project_root, project_root / "frontend", project_root / "scripts",
                           project_root / "frontend/packages/nested/templates"):
                for name in ("node_modules", ".venv", "output", "build", "dist", ".git", "__pycache__",
                             ".pytest_cache", ".mypy_cache", ".ruff_cache", "app.egg-info"):
                    target = parent / name / "must-not-be-bundled.txt"
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text("generated", encoding="utf-8")
            (included.parent / "tool.pyc").touch()
            archive = build_bundle(project_root)
            with zipfile.ZipFile(archive) as bundle:
                names = bundle.namelist()
                self.assertTrue(any(name.endswith("packages/nested/templates/scripts/tool.py") for name in names))
                self.assertFalse(any(name.endswith("must-not-be-bundled.txt") for name in names))
                self.assertFalse(any(name.endswith(".pyc") for name in names))
                manifest_name = next(name for name in names if name.endswith("manifest.json"))
                manifest = json.loads(bundle.read(manifest_name))
                self.assertFalse(any("must-not-be-bundled" in name for name in manifest["files"]))

    def test_bundle_includes_migrated_guidance_without_private_ai_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary) / "source"
            self.make_app(project_root)
            public = (
                "docs/agent.md", "docs/index.md", "docs/design.md",
                "AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md",
                "docs/.agents/skills/easy-dev/SKILL.md",
                "docs/.agents/skills/easy-dev/references/architecture.md",
                "docs/.claude/skills/easy-dev/SKILL.md",
                "docs/.easy-dev/install-state.json",
            )
            excluded = (
                "docs/.claude/settings.local.json", "docs/.claude/history.jsonl",
                "docs/.agents/private.json", "docs/.easy-dev/local.json",
                "docs/.agents/skills/easy-dev/__pycache__/cached.pyc",
                "docs/.claude/skills/other/private.txt",
                ".agents/skills/easy-dev/SKILL.md", ".claude/settings.local.json",
                "agent.md", "index.md", "design.md", "build.cmd", "build.ps1", "build-demo.ps1",
                "package.json", "vite.config.mjs", "packages/stale/package.json",
            )
            for filename in (*public, *excluded):
                target = project_root / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("fixture", encoding="utf-8")
            with zipfile.ZipFile(build_bundle(project_root)) as bundle:
                prefix = "sample-desktop-0.1.0-bundle/"
                names = set(bundle.namelist())
                manifest = json.loads(bundle.read(prefix + "easy-windows-pack.manifest.json"))
                for filename in public:
                    self.assertIn(prefix + filename, names)
                    self.assertIn(filename, manifest["files"])
                for filename in excluded:
                    self.assertNotIn(prefix + filename, names)
                    self.assertNotIn(filename, manifest["files"])

    def test_wheel_builds_vite_before_packaging_generated_app(self):
        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary)
            self.make_app(project_root)

            def run(command, **kwargs):
                if "wheel" in command:
                    wheelhouse = Path(command[command.index("--wheel-dir") + 1])
                    (wheelhouse / "sample_desktop-0.1.0-py3-none-any.whl").write_bytes(b"fixture wheel")

            with patch.object(cli, "_run", side_effect=run) as child:
                artifact = cli.build_wheel(project_root, python="chosen-python")
            self.assertEqual(child.call_args_list[0].args[0],
                             ["chosen-python", str(project_root / "scripts/dev.py"), "frontend"])
            self.assertEqual(child.call_args_list[1].args[0][:4], ["chosen-python", "-m", "pip", "wheel"])
            self.assertTrue(all(call.kwargs["cwd"] == project_root for call in child.call_args_list))
            self.assertEqual(artifact.read_bytes(), b"fixture wheel")

    def test_wheel_without_npm_manifest_preserves_python_only_build(self):
        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary)

            def run(command, **kwargs):
                wheelhouse = Path(command[command.index("--wheel-dir") + 1])
                (wheelhouse / "framework.whl").touch()

            with patch.object(cli, "_run", side_effect=run) as child:
                cli.build_wheel(project_root)
            child.assert_called_once()
            self.assertIn("wheel", child.call_args.args[0])

    def test_cli_frontend_failure_preserves_exit_code_and_stops_packaging(self):
        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary)
            self.make_app(project_root)
            with patch.object(cli, "PROJECT_ROOT", project_root), \
                    patch.object(cli.subprocess, "run") as child, patch.object(cli, "build_bundle") as bundle:
                child.return_value.returncode = 31
                self.assertEqual(cli.main(["build", "--skip-tests"]), 31)
            child.assert_called_once()
            self.assertEqual(child.call_args.args[0][-1], "frontend")
            bundle.assert_not_called()
            self.assertFalse((project_root / "output/wheels").exists())

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
