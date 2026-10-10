from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
import posixpath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))

from easy_windows_pack import cli
from easy_windows_pack.cli import build_bundle, clean_project, _read_project_version
from easy_windows_pack.packaging import load_pack_config


PROJECT_ROOT = Path(__file__).parents[1]


class CliTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"EWP_LANG": ""})
        environment.start()
        self.addCleanup(environment.stop)

    def test_language_precedence_fallback_and_bom(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "frontend").mkdir()
            manifest = root / "frontend/package.json"
            manifest.write_text('{"ewp":{"language":"en"}}', encoding="utf-8-sig")
            self.assertEqual(cli.project_language(root), "en")
            with patch.dict(os.environ, {"EWP_LANG": "zh-CN"}):
                self.assertEqual(cli.project_language(root), "zh-CN")
                self.assertEqual(cli.project_language(root, "en"), "en")
            with patch.dict(os.environ, {"EWP_LANG": "invalid"}):
                self.assertEqual(cli.project_language(root, "invalid"), "en")
            for content in ('{', '[]', '{"ewp":[]}', '{"ewp":{"language":"fr"}}'):
                manifest.write_text(content, encoding="utf-8")
                self.assertEqual(cli.project_language(root), "zh-CN")
            manifest.unlink()
            self.assertEqual(cli.project_language(root), "zh-CN")

    def test_cli_help_and_errors_are_single_language(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "frontend").mkdir()
            for language, usage, help_text, opposite in (
                ("zh-CN", "用法：", "显示帮助并退出", "show this help message"),
                ("en", "usage:", "show this help message", "显示帮助并退出"),
            ):
                (root / "frontend/package.json").write_text(
                    json.dumps({"ewp": {"language": language}}), encoding="utf-8")
                with patch.object(cli, "PROJECT_ROOT", root):
                    for arguments in (["--help"], ["build", "--help"],
                                      ["--lang", language, "bundle", "--help"],
                                      ["test", "--help", f"--lang={language}"]):
                        with self.subTest(language=language, arguments=arguments):
                            output = io.StringIO()
                            with redirect_stdout(output), self.assertRaises(SystemExit) as error:
                                cli.main(arguments)
                            self.assertEqual(error.exception.code, 0)
                            self.assertIn(usage, output.getvalue())
                            self.assertIn(help_text, output.getvalue())
                            self.assertNotIn(opposite, output.getvalue())
                    for arguments, zh, en in (
                        ([], "缺少必需参数", "the following arguments are required"),
                        (["invalid"], "无效选项", "invalid choice"),
                        (["build", "--unknown"], "无法识别的参数", "unrecognized arguments"),
                        (["build", "--python"], "需要一个参数值", "expected one argument"),
                        (["info", "--lang=invalid"], "无效选项", "invalid choice"),
                    ):
                        with self.subTest(language=language, arguments=arguments):
                            output = io.StringIO()
                            with redirect_stderr(output), self.assertRaises(SystemExit) as error:
                                cli.main(arguments)
                            self.assertEqual(error.exception.code, 2)
                            self.assertIn(usage, output.getvalue())
                            self.assertIn(en if language == "en" else zh, output.getvalue())
                            self.assertNotIn(zh if language == "en" else en, output.getvalue())

    def test_cli_build_errors_use_override_and_preserve_exit_code(self):
        for language, expected, opposite in (("zh-CN", "[错误]", "[error]"), ("en", "[error]", "[错误]")):
            output = io.StringIO()
            with redirect_stderr(output), patch.object(cli, "run_tests", side_effect=cli.BuildError("failure", 23)):
                self.assertEqual(cli.main(["test", "--lang", language]), 23)
            self.assertIn(expected, output.getvalue())
            self.assertNotIn(opposite, output.getvalue())
            self.assertIsNone(cli._LANGUAGE.get())

    def test_cli_child_environment_uses_last_override_and_preserves_dev_url(self):
        with patch.dict(os.environ, {"EWP_LANG": "zh-CN", "EWP_DEV_URL": "http://127.0.0.1:3210/",
                                     "PYTHONPATH": "foreign", "PYTHONHOME": "foreign"}), \
                patch.object(cli.subprocess, "run") as run:
            run.return_value.returncode = 0
            with redirect_stdout(io.StringIO()):
                self.assertEqual(cli.main(["--lang=zh-CN", "test", "--lang=en"]), 0)
            env = run.call_args.kwargs["env"]
            self.assertEqual(env["EWP_LANG"], "en")
            self.assertEqual(env["EWP_DEV_URL"], "http://127.0.0.1:3210/")
            self.assertNotIn("PYTHONHOME", env)
            self.assertNotIn("PYTHONPATH", env)
            self.assertEqual(env["PYTHONUTF8"], "1")
            self.assertEqual(os.environ["EWP_LANG"], "zh-CN")

    def test_cli_actual_subprocess_inherits_project_language(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "frontend").mkdir()
            (root / "frontend/package.json").write_text('{"ewp":{"language":"en"}}', encoding="utf-8")
            marker = root / "child.txt"
            with redirect_stdout(io.StringIO()) as output:
                cli._run([sys.executable, "-c", "import os,pathlib,sys; pathlib.Path(sys.argv[1]).write_text(os.environ['EWP_LANG'])",
                          str(marker)], cwd=root)
            self.assertEqual(marker.read_text(), "en")
            self.assertIn("[run]", output.getvalue())
            self.assertNotIn("[执行]", output.getvalue())

    def test_clean_removes_both_metadata_locations_but_preserves_sources(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.make_app(root)
            for directory in ("easy_windows_pack.egg-info", "backend/base/easy_windows_pack.egg-info",
                              "backend/base/ewpcore/__pycache__", "output", "build", "dist"):
                target = root / directory
                target.mkdir(parents=True)
                (target / "PKG-INFO").write_text("generated", encoding="utf-8")
            protected = root / "backend/base/source.egg-info/keep.py"
            protected.parent.mkdir()
            protected.write_text("# source", encoding="utf-8")
            docs = root / "docs/keep.md"
            docs.parent.mkdir()
            docs.write_text("# docs", encoding="utf-8")
            for language, expected, opposite in (("en", "[clean]", "[清理]"),):
                with cli._language_context(root, language), redirect_stdout(io.StringIO()) as output:
                    clean_project(root)
                self.assertIn(expected, output.getvalue())
                self.assertNotIn(opposite, output.getvalue())
                self.assertEqual(output.getvalue().count("[ok] removed"), 1)
            self.assertFalse((root / "easy_windows_pack.egg-info").exists())
            self.assertFalse((root / "backend/base/easy_windows_pack.egg-info").exists())
            self.assertTrue((root / "backend/base/ewpcore/__init__.py").is_file())
            self.assertTrue(protected.is_file())
            self.assertTrue(docs.is_file())

    def test_clean_never_follows_generated_directory_symlinks(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "project"
            external = Path(temporary) / "external"
            root.mkdir()
            external.mkdir()
            source = external / "keep.py"
            source.write_text("# source", encoding="utf-8")
            try:
                (root / "build").symlink_to(external, target_is_directory=True)
            except OSError:
                self.skipTest("Symlink creation unavailable")
            with redirect_stdout(io.StringIO()):
                clean_project(root)
            self.assertFalse((root / "build").exists())
            self.assertTrue(source.is_file())

    def test_generated_ai_bundle_preserves_all_guidance_links(self):
        creator = PROJECT_ROOT / "frontend/packages/create-ewp/bin/create-ewp.mjs"
        prepared = creator.parent.parent / "templates/common/startup.cmd"
        node = shutil.which("node")
        if not node or not prepared.is_file():
            self.skipTest("Requires Node and npm run prepare:npm")
        with tempfile.TemporaryDirectory(prefix="ewp ai bundle ") as temporary:
            for mask in range(8):
                tools = [tool for index, tool in enumerate(("codex", "claude", "copilot"))
                         if mask & (1 << index)]
                project = Path(temporary) / f"app-{mask}"
                with self.subTest(tools=tools):
                    subprocess.run(
                        [node, str(creator), str(project), "--template", "vue-ts",
                         "--ai", ",".join(tools) or "none", "--no-install", "--no-start"],
                        cwd=temporary, check=True, capture_output=True,
                    )
                    with zipfile.ZipFile(build_bundle(project)) as bundle:
                        prefix = f"app-{mask}-desktop-0.1.0-bundle/"
                        names = set(bundle.namelist())
                        manifest = json.loads(bundle.read(prefix + "easy-windows-pack.manifest.json"))
                        for filename in ("frontend/package.json", "frontend/vite.config.mjs",
                                         "frontend/tsconfig.json", "startup.cmd", "scripts/startup.cmd"):
                            self.assertIn(prefix + filename, names)
                        self.assertEqual(prefix + "docs/.easy-dev/agent.md" in names, bool(tools))
                        for filename in manifest["files"]:
                            if not filename.endswith(".md") or not (
                                filename.startswith("docs/") or filename in (
                                    "AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md")
                            ):
                                continue
                            content = bundle.read(prefix + filename).decode("utf-8")
                            for target in re.findall(r"\]\(([^)]+)\)", content):
                                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(filename), target))
                                self.assertIn(prefix + resolved, names, f"{filename}: {target}")

    def test_reads_project_version(self) -> None:
        self.assertEqual(_read_project_version(PROJECT_ROOT), "0.3.0")

    def test_bundle_contains_runtime_sources_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            archive = build_bundle(PROJECT_ROOT, Path(temporary))
            with zipfile.ZipFile(archive) as zip_file:
                names = set(zip_file.namelist())
                root = "easy-windows-pack-0.3.0-bundle/"
                self.assertIn(root + "backend/base/ewpcore/controller.py", names)
                self.assertIn(root + "frontend/frame/ewpframe/window-frame.js", names)
                self.assertIn(root + "frontend/components/desktop/desktop-components.js", names)
                self.assertIn(root + "frontend/frame/ewpframe/desktop-updates.js", names)
                self.assertIn(root + "frontend/components/desktop/desktop-components.css", names)
                self.assertIn(root + "backend/base/ewpcore/adapters.py", names)
                self.assertIn(root + "backend/base/ewpcore/packaging.py", names)
                self.assertIn(root + "backend/base/ewpcore/installer.py", names)
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
                self.assertEqual(manifest["version"], "0.3.0")
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

    def test_bundle_preserves_pack_config_and_configured_sources(self):
        with tempfile.TemporaryDirectory(prefix="ewp bundle resources ") as temporary:
            project_root = Path(temporary) / "original app"
            self.make_app(project_root)
            resources = {
                "resources/optional files/read me.txt": b"Optional feature content\r\n",
                "resources/optional files/nested/data.bin": bytes(range(256)),
                "outside-resources/optional.bin": b"\x00outside the bundle whitelist\xff",
                "data/settings.json": b'{"theme":"dark"}\n',
                "scripts/hooks/configure.py": b"print('configure')\n",
                "scripts/hooks/tool.exe": b"MZ\x00hook tool fixture\xff",
            }
            for filename, content in resources.items():
                target = project_root / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
            (project_root / "private.txt").write_bytes(b"unlisted source")
            config = {
                "schemaVersion": 1,
                "application": {"id": "sample-desktop", "name": "Sample", "version": "0.1.0"},
                "build": {"mode": "onedir", "installer": True},
                "features": [{
                    "id": "extras", "default": False, "required": False,
                    "files": [
                        {"source": "resources/optional files", "destination": "examples"},
                        {"source": "resources/optional files", "destination": "extra examples"},
                        {"source": "outside-resources/optional.bin", "destination": "optional.bin"},
                        {"source": "data/settings.json", "destination": "settings.json"},
                    ],
                }],
                "installer": {"language": "en", "files": [
                    {"source": "scripts/hooks", "destination": "tools"},
                    {"source": "scripts/hooks/configure.py", "destination": "setup.py"},
                    {"source": "resources/optional files/nested", "destination": "shared"},
                ]},
                "hooks": {"afterInstall": [["{installDir}/tools/tool.exe", "{executable}"]]},
            }
            config_file = project_root / "ewp.pack.json"
            config_file.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8-sig")
            expected = {"ewp.pack.json": config_file.read_bytes(), **resources}
            validated = load_pack_config(project_root)
            with redirect_stdout(io.StringIO()):
                archive = build_bundle(project_root)
            prefix = "sample-desktop-0.1.0-bundle/"
            with zipfile.ZipFile(archive) as bundle:
                names = bundle.namelist()
                self.assertEqual(len(names), len(set(names)))
                manifest = json.loads(bundle.read(prefix + "easy-windows-pack.manifest.json"))
                for filename, content in expected.items():
                    self.assertEqual(bundle.read(prefix + filename), content, filename)
                    self.assertIn(filename, manifest["files"])
                self.assertNotIn(prefix + "private.txt", names)
                self.assertFalse(any(name.startswith(prefix + "docs/") for name in names))
                bundle.extractall(Path(temporary) / "restored source")
            restored = Path(temporary) / "restored source" / prefix.rstrip("/")
            self.assertEqual(load_pack_config(restored), validated)
            self.assertFalse(load_pack_config(restored)["features"][0]["default"])
            with redirect_stdout(io.StringIO()):
                rebuilt = build_bundle(restored)
            with zipfile.ZipFile(rebuilt) as bundle:
                for filename, content in expected.items():
                    self.assertEqual(bundle.read(prefix + filename), content, filename)

    def test_bundle_preserves_empty_config_source_directories_after_extraction_and_rebuild(self):
        for collection in ("features", "installer"):
            with self.subTest(collection=collection), \
                    tempfile.TemporaryDirectory(prefix="ewp bundle empty sources ") as temporary:
                project_root = Path(temporary) / "original app"
                self.make_app(project_root)
                empty_directories = (
                    "resources/empty source",
                    "resources/mixed source/nested empty",
                    "resources/mixed source/empty branch/leaf",
                    "resources/mixed source/filtered empty",
                )
                for directory in empty_directories:
                    (project_root / directory).mkdir(parents=True)
                filename = "resources/mixed source/nested files/data.bin"
                content = bytes(range(256))
                target = project_root / filename
                target.parent.mkdir(parents=True)
                target.write_bytes(content)
                filtered = project_root / "resources/mixed source/filtered empty"
                (filtered / "__pycache__").mkdir()
                (filtered / "__pycache__/ignored.pyc").write_bytes(b"cache")
                (filtered / "ignored.pyc").write_bytes(b"bytecode")
                entries = [
                    {"source": "resources/empty source", "destination": "empty"},
                    {"source": "resources/mixed source", "destination": "mixed"},
                ]
                config = ({"features": [{"id": "extras", "files": entries}]}
                          if collection == "features" else {"installer": {"files": entries}})
                config["application"] = {"id": "sample-desktop", "name": "Sample", "version": "0.1.0"}
                (project_root / "ewp.pack.json").write_text(json.dumps(config), encoding="utf-8")
                validated = load_pack_config(project_root)
                prefix = "sample-desktop-0.1.0-bundle/"
                manifest_name = prefix + "easy-windows-pack.manifest.json"
                for generation in range(2):
                    with redirect_stdout(io.StringIO()):
                        archive = build_bundle(project_root)
                    with zipfile.ZipFile(archive) as bundle:
                        names = bundle.namelist()
                        self.assertEqual(len(names), len(set(names)))
                        self.assertEqual(
                            {info.filename for info in bundle.infolist() if info.is_dir()},
                            {prefix + directory + "/" for directory in empty_directories},
                        )
                        for directory in empty_directories:
                            info = bundle.getinfo(prefix + directory + "/")
                            self.assertTrue(stat.S_ISDIR(info.external_attr >> 16), directory)
                            self.assertTrue(info.external_attr & 0x10, directory)
                            self.assertEqual(info.file_size, 0, directory)
                        self.assertEqual(bundle.read(prefix + filename), content)
                        self.assertFalse(any("__pycache__" in name or name.endswith(".pyc") for name in names))
                        manifest = json.loads(bundle.read(manifest_name))
                        self.assertEqual(set(manifest["files"]), {
                            info.filename[len(prefix):] for info in bundle.infolist()
                            if not info.is_dir() and info.filename != manifest_name
                        })
                        restored_parent = Path(temporary) / f"restored source {generation}"
                        bundle.extractall(restored_parent)
                    project_root = restored_parent / prefix.rstrip("/")
                    for directory in empty_directories:
                        restored_directory = project_root / directory
                        self.assertTrue(restored_directory.is_dir(), directory)
                        self.assertEqual(list(restored_directory.iterdir()), [], directory)
                    self.assertEqual((project_root / filename).read_bytes(), content)
                    self.assertEqual(load_pack_config(project_root), validated)

    def test_bundle_rejects_generated_and_unsafe_config_sources(self):
        with tempfile.TemporaryDirectory(prefix="ewp bundle invalid source ") as temporary:
            project_root = Path(temporary) / "app"
            self.make_app(project_root)
            output = Path(temporary) / "bundle artifacts"
            config_file = project_root / "ewp.pack.json"
            excluded = (
                "build", "output", "node_modules", ".venv", "dist", ".git", "__pycache__",
                ".pytest_cache", ".mypy_cache", ".ruff_cache", "app.egg-info",
                "frontend/node_modules", "resources/output", "data/BUILD",
            )
            for directory in excluded:
                target = project_root / directory / "generated.bin"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b"generated dependency or artifact")
            (project_root / "resources/cached.pyc").write_bytes(b"compiled Python")
            outside = Path(temporary) / "outside.bin"
            outside.write_bytes(b"outside project")
            unsafe = ("../outside.bin", outside.as_posix(), "resources/missing.bin")
            link = project_root / "resources/linked.bin"
            try:
                link.symlink_to(outside)
            except OSError:
                pass
            else:
                unsafe += ("resources/linked.bin",)
            generated = tuple(f"{directory}/generated.bin" for directory in excluded)
            generated += ("resources/cached.pyc", "resources/output")
            for collection in ("features", "installer"):
                for source in (*generated, *unsafe):
                    with self.subTest(collection=collection, source=source):
                        entry = {"source": source, "destination": "extras"}
                        config = ({"features": [{"id": "extras", "files": [entry]}]}
                                  if collection == "features" else {"installer": {"files": [entry]}})
                        config_file.write_text(json.dumps(config), encoding="utf-8")
                        if source in generated:
                            # App/installer validation still accepts generated files.
                            load_pack_config(project_root)
                        with cli._language_context(project_root, "en"), \
                                self.assertRaisesRegex(cli.BuildError, "Source bundle") as error:
                            build_bundle(project_root, output)
                        if source in generated:
                            self.assertIn(source, str(error.exception))
                            self.assertIn("generated or dependency", str(error.exception))
                        self.assertFalse(output.exists())
                config_file.write_text('{"schemaVersion":', encoding="utf-8")
                with cli._language_context(project_root, "en"), \
                        self.assertRaisesRegex(cli.BuildError, "Source bundle.*ewp.pack.json"):
                    build_bundle(project_root, output)
                self.assertFalse(output.exists())
            config_file.write_text(json.dumps({"installer": {"files": [{
                "source": "output/generated.bin", "destination": "extras",
            }]}}), encoding="utf-8")
            for language, message in (("en", "Source bundle"), ("zh-CN", "源码包")):
                with self.subTest(language=language), redirect_stderr(io.StringIO()) as error:
                    self.assertEqual(cli.main([
                        "bundle", "--project-root", str(project_root),
                        "--output-dir", str(output), "--lang", language,
                    ]), 1)
                self.assertIn(message, error.getvalue())
                self.assertIn("output/generated.bin", error.getvalue())
                self.assertFalse(output.exists())

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
                        with self.assertRaisesRegex(cli.BuildError, "源码包源文件不存在"):
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
                "docs/.easy-dev/agent.md",
                "docs/.easy-dev/skills/easy-dev/SKILL.md",
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

    def test_native_cli_parser_preserves_unspecified_config_values(self):
        for name in ("app", "exe", "installer"):
            with self.subTest(command=name):
                defaults = cli._build_parser().parse_args([name])
                self.assertIsNone(defaults.config)
                self.assertIsNone(defaults.mode)
                self.assertIsNone(defaults.installer)
                options = cli._build_parser().parse_args([
                    name, "--mode", "onedir", "--installer", "--config", "configs/custom pack.json",
                    "--project-root", "host with spaces",
                ])
                self.assertEqual(options.config, "configs/custom pack.json")
                self.assertEqual(options.mode, "onedir")
                self.assertTrue(options.installer)
                self.assertEqual(options.project_root, "host with spaces")
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            cli._build_parser().parse_args(["app", "--mode", "invalid"])
        self.assertEqual(error.exception.code, 2)

    def test_native_cli_prepares_frontend_then_calls_public_api(self):
        with tempfile.TemporaryDirectory(prefix="ewp native host ") as temporary:
            root = Path(temporary)
            self.make_app(root)
            for name, installer in (("app", None), ("exe", None), ("installer", True)):
                events = []
                with self.subTest(command=name), patch.object(cli, "PROJECT_ROOT", root), \
                        patch.object(cli, "_run", side_effect=lambda *args, **kwargs: events.append("frontend")) as run, \
                        patch.object(cli, "build_package", side_effect=lambda *args, **kwargs:
                                     events.append("package") or {"application": root / "output/apps/sample.exe"}) as build, \
                        redirect_stdout(io.StringIO()):
                    self.assertEqual(cli.main([name, "--config", "configs/custom pack.json", "--mode", "onedir"]), 0)
                self.assertEqual(events, ["frontend", "package"])
                run.assert_called_once_with([sys.executable, str(root / "scripts/dev.py"), "frontend"], cwd=root)
                build.assert_called_once_with(root, Path("configs/custom pack.json"), installer=installer, mode="onedir")

    def test_native_cli_installer_flag_and_explicit_root_work_from_other_cwd(self):
        with tempfile.TemporaryDirectory(prefix="ewp standalone host ") as temporary:
            root = Path(temporary)
            (root / "frontend").mkdir()
            (root / "frontend/package.json").write_text('{"ewp":{"language":"en"}}', encoding="utf-8")
            for arguments in (["--project-root", str(root), "app"],
                              ["app", "--project-root", str(root)]):
                with self.subTest(arguments=arguments), patch.object(cli, "_run") as run, \
                        patch.object(cli, "build_package", return_value={"application": root / "output/apps/app.exe"}) as build, \
                        redirect_stdout(io.StringIO()) as output:
                    self.assertEqual(cli.main([*arguments, "--installer"]), 0)
                run.assert_not_called()
                build.assert_called_once_with(root, None, installer=True, mode=None)
                self.assertIn("[ok] artifact:", output.getvalue())
                self.assertFalse((root / "scripts/dev.py").exists())

    def test_native_cli_runs_npm_build_without_repository_script(self):
        with tempfile.TemporaryDirectory(prefix="ewp standalone host ") as temporary:
            root = Path(temporary)
            (root / "frontend").mkdir()
            (root / "frontend/package.json").write_text(
                '{"scripts":{"frontend:build":"vite build"}}', encoding="utf-8")
            npm = r"C:\Node & tools!\npm.cmd" if sys.platform == "win32" else "/usr/bin/npm"
            with patch.object(cli.shutil, "which", return_value=npm), patch.object(cli, "_run") as run, \
                    patch.object(cli, "build_package", return_value={}) as build:
                self.assertEqual(cli.main(["exe", "--project-root", str(root), "--mode=onefile"]), 0)
            run.assert_called_once_with([npm, "run", "frontend:build"], cwd=root / "frontend")
            build.assert_called_once_with(root, None, installer=None, mode="onefile")

    @unittest.skipUnless(os.name == "nt", "Requires real Windows cmd.exe")
    def test_native_cli_real_npm_batch_failure_with_spaces_and_metacharacters(self):
        with tempfile.TemporaryDirectory(prefix="ewp CLI & tools! ") as temporary:
            root = Path(temporary)
            (root / "frontend").mkdir()
            (root / "frontend/package.json").write_text(
                '{"scripts":{"frontend:build":"vite build"}}', encoding="utf-8")
            batch = root / "fake npm.cmd"
            batch.write_bytes(b'@echo off\r\nif not "%~1"=="run" exit /b 99\r\n'
                              b'if not "%~2"=="frontend:build" exit /b 98\r\nexit /b 47\r\n')
            with patch.object(cli.shutil, "which", return_value=str(batch)), \
                    patch.object(cli, "build_package") as build, redirect_stdout(io.StringIO()), \
                    redirect_stderr(io.StringIO()):
                self.assertEqual(cli.main(["app", "--project-root", str(root)]), 47)
            build.assert_not_called()

    def test_native_cli_frontend_failure_preserves_exit_and_never_packages(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.make_app(root)
            for name in ("app", "exe", "installer"):
                with self.subTest(command=name), patch.object(cli, "_run", side_effect=cli.BuildError("frontend failed", 37)), \
                        patch.object(cli, "build_package") as build, redirect_stderr(io.StringIO()):
                    self.assertEqual(cli.main([name, "--project-root", str(root)]), 37)
                build.assert_not_called()

    def test_native_cli_errors_are_actionable_and_preserve_subprocess_codes(self):
        for failure, code in ((ValueError("invalid config"), 1), (OSError("missing file"), 1),
                              (RuntimeError("command failed with exit code 41: PyInstaller"), 41),
                              (subprocess.CalledProcessError(43, ["PyInstaller"]), 43),
                              (KeyboardInterrupt(), 130)):
            with self.subTest(failure=type(failure).__name__), patch.object(cli, "_build_frontend"), \
                    patch.object(cli, "build_package", side_effect=failure), redirect_stderr(io.StringIO()) as output:
                self.assertEqual(cli.main(["app"]), code)
            self.assertNotIn("Traceback", output.getvalue())

    def test_public_packaging_exports_and_setuptools_metadata(self):
        import easy_windows_pack
        from easy_windows_pack import installer, packaging
        from setuptools import Distribution
        from setuptools.config.pyprojecttoml import read_configuration

        for name in ("load_pack_config", "validate_pack_config", "build_application", "build_installer", "build_package"):
            self.assertIs(getattr(easy_windows_pack, name), getattr(packaging, name))
            self.assertIn(name, easy_windows_pack.__all__)
        self.assertEqual(installer.__name__, "easy_windows_pack.installer")
        config = read_configuration(str(PROJECT_ROOT / "pyproject.toml"))
        self.assertEqual(config["project"]["version"], "0.3.0")
        distribution = Distribution({
            "name": config["project"]["name"], "version": config["project"]["version"],
            "packages": config["tool"]["setuptools"]["packages"],
            "package_dir": config["tool"]["setuptools"]["package-dir"],
        })
        distribution.script_name = str(PROJECT_ROOT / "setup.py")
        self.assertEqual(distribution.metadata.version, "0.3.0")
        build_py = distribution.get_command_obj("build_py")
        build_py.ensure_finalized()
        modules = {name for package, name, source in build_py.find_package_modules(
            "easy_windows_pack", str(PROJECT_ROOT / "backend/base/ewpcore"))}
        self.assertTrue({"__init__", "cli", "packaging", "installer"}.issubset(modules))

    def test_package_import_and_cli_work_from_a_standalone_install_layout(self):
        with tempfile.TemporaryDirectory(prefix="ewp installed layout ") as temporary:
            root = Path(temporary)
            site = root / "site"
            package = site / "easy_windows_pack"
            shutil.copytree(PROJECT_ROOT / "backend/base/ewpcore", package,
                            ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            host = root / "host"
            host.mkdir()
            code = (
                "import pathlib,sys; from unittest.mock import patch; "
                "sys.path.insert(0, sys.argv[1]); "
                "import easy_windows_pack as e; from easy_windows_pack import cli,packaging,installer; "
                "assert pathlib.Path(e.__file__).is_relative_to(pathlib.Path(sys.argv[1])); "
                "assert cli.PROJECT_ROOT == pathlib.Path.cwd(); "
                "assert e.build_package is packaging.build_package; "
                "build = patch.object(cli, 'build_package', return_value={}).start(); "
                "assert cli.main(['app','--config','custom pack.json','--mode','onedir','--installer']) == 0; "
                "build.assert_called_once_with(pathlib.Path.cwd(), pathlib.Path('custom pack.json'), installer=True, mode='onedir')"
            )
            completed = subprocess.run([sys.executable, "-I", "-c", code, str(site)], cwd=host,
                                       capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)

    def test_native_cli_honors_installer_config_and_mode_override(self):
        from easy_windows_pack import packaging

        with tempfile.TemporaryDirectory(prefix="ewp configured host ") as temporary:
            root = Path(temporary)
            config = root / "configs/custom pack.json"
            config.parent.mkdir()
            config.write_text(json.dumps({"application": {"id": "configured-app"},
                                          "build": {"installer": True, "mode": "onefile"}}), encoding="utf-8")
            application = root / "output/apps/configured-app"
            setup = root / "output/installers/configured-app-setup.exe"
            with patch.object(packaging, "build_application", return_value=application) as build, \
                    patch.object(packaging, "build_installer", return_value=setup) as installer, \
                    redirect_stdout(io.StringIO()) as output:
                self.assertEqual(cli.main(["app", "--project-root", str(root), "--config", "configs/custom pack.json",
                                           "--mode", "onedir"]), 0)
            self.assertEqual(build.call_args.args[1]["build"], {"installer": True, "mode": "onedir"})
            installer.assert_called_once_with(root, build.call_args.args[1], application)
            self.assertIn(str(application), output.getvalue())
            self.assertIn(str(setup), output.getvalue())


if __name__ == "__main__":
    unittest.main()
