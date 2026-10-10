"""Builder contract tests: mock only PyInstaller, keep real files/ZIP/validation."""
from __future__ import annotations

import copy
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import importlib
import importlib.util
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

PROJECT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("packaging_under_test", PROJECT / "backend/base/ewpcore/packaging.py")
assert SPEC and SPEC.loader
packaging = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(packaging)


def pe_bytes() -> bytes:
    """A small structural PE fixture, never executed or substituted for a real build."""
    data = bytearray(512)
    data[:2] = b"MZ"
    struct.pack_into("<I", data, 60, 128)
    data[128:132] = b"PE\0\0"
    struct.pack_into("<HHIIIHH", data, 132, 0x8664, 1, 0, 0, 0, 240, 2)
    struct.pack_into("<H", data, 152, 0x20B)
    return bytes(data)


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="ewp packaging tests ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "same name project"
        self.root.mkdir()
        self.write("backend/base/ewpcore/__init__.py", b"VALUE = 'actual core'\n")
        self.write("backend/base/ewpcore/module.py", b"VALUE = 42\n")
        self.write("backend/src/demo.py", b"from easy_windows_pack import VALUE\n")
        self.write("output/frontend/index.html", b"<html>compiled</html>")
        self.write("optional files/read me.txt", b"optional content")
        self.write("optional files/nested/data.json", b'{"value":1}')
        self.write("hook files/tool.exe", pe_bytes())
        self.commands = []
        self.payloads = []
        self.bundles = {}

    def write(self, relative, content):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def config(self, mode="onefile", installer=True):
        return {
            "schemaVersion": 1,
            "application": {"id": "same-name", "name": "Same Name", "version": "1.2.3"},
            "build": {"mode": mode, "installer": installer},
            "features": [
                {"id": "extras", "name": "Extra files", "description": "Optional files",
                 "default": False, "required": False,
                 "files": [{"source": "optional files", "destination": "extras data"}]},
                {"id": "empty", "required": True, "files": []},
            ],
            "prerequisites": [{"id": "python", "name": "Python runtime", "type": "zip",
                               "sha256": "A" * 64, "urls": ["https://example.org/runtime.zip"],
                               "mirrors": ["https://mirror.example.org/runtime.zip"],
                               "mirrorApi": "https://example.org/mirrors.json",
                               "destination": "runtime/python", "filename": "runtime.zip",
                               "features": ["extras"], "check": "runtime/python/python.exe",
                               "commands": [["{runtimeDir}/python.exe", "--version"]]}],
            "postInstall": [{"id": "launch", "type": "launch"},
                            {"id": "startup", "type": "startup"},
                            {"id": "theme", "type": "setting", "key": "theme", "value": "dark"}],
            "hooks": {"beforeInstall": [["{installDir}/tools/tool.exe", "before"]],
                      "afterInstall": [], "beforeUninstall": [], "afterUninstall": []},
            "installer": {"language": "en", "defaultDirectory": "%LOCALAPPDATA%/Same Name",
                          "welcome": "Welcome", "files": [{"source": "hook files/tool.exe",
                                                            "destination": "tools/tool.exe"}]},
        }

    def config_file(self, config=None, relative="ewp.pack.json"):
        return self.write(relative, json.dumps(config if config is not None else self.config()).encode("utf-8"))

    def fake_run(self, command, root):
        self.assertEqual(root, self.root.resolve())
        self.commands.append(command)
        name = command[command.index("--name") + 1]
        output = Path(command[command.index("--distpath") + 1])
        bundle = self.root / "frozen bundles" / name
        bundle.mkdir(parents=True, exist_ok=True)
        self.bundles[name] = bundle
        # --add-data destinations are directories, including for a single file.
        # Materialize resources from the actual argv using PyInstaller's layout.
        for index, argument in enumerate(command[:-1]):
            if argument == "--add-data":
                source, destination = command[index + 1].rsplit(os.pathsep, 1)
                source = Path(source)
                target = bundle / destination
                if source.is_dir():
                    shutil.copytree(source, target, dirs_exist_ok=True)
                else:
                    target.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target / source.name)
        if name.endswith("-setup"):
            with zipfile.ZipFile(bundle / "payload.zip") as archive:
                self.payloads.append({entry.filename: archive.read(entry) for entry in archive.infolist()})
        if "--onedir" in command:
            output = output / name
            (output / "_internal/output/frontend").mkdir(parents=True)
            (output / "_internal/output/frontend/index.html").write_bytes(b"compiled inside onedir")
            (output / "_internal/library.dll").write_bytes(b"library content")
        output.mkdir(parents=True, exist_ok=True)
        (output / f"{name}.exe").write_bytes(pe_bytes())

    def application(self, mode="onefile"):
        path = self.root / "output/apps" / ("same-name" if mode == "onedir" else "same-name.exe")
        if mode == "onedir":
            path.mkdir(parents=True, exist_ok=True)
            (path / "same-name.exe").write_bytes(pe_bytes())
            (path / "library.dll").write_bytes(b"library content")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(pe_bytes())
        return path

    def make_link(self, target, link, *, directory=False):
        try:
            link.symlink_to(target, target_is_directory=directory)
        except OSError:
            if os.name != "nt" or not directory:
                self.skipTest("Symlink creation unavailable")
            completed = subprocess.run(["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(target)],
                                       capture_output=True)
            if completed.returncode:
                self.skipTest("Directory junction creation unavailable")
        self.addCleanup(lambda: link.rmdir() if directory else link.unlink())

    def installed_package(self):
        """Load real package files from a wheel-shaped tree outside the project."""
        source = Path(self.temporary.name) / "installed folder/easy_windows_pack"
        shutil.copytree(PROJECT / "backend/base/ewpcore", source,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo"))
        (source / "installed_only.py").write_bytes(b"VALUE = 'installed core'\n")
        (source / "resources").mkdir()
        (source / "resources/data.json").write_bytes(b'{"installed":true}')
        (source / "__pycache__").mkdir()
        (source / "__pycache__/module.pyc").write_bytes(b"cache")
        (source / "stale.pyo").write_bytes(b"cache")
        (source.parent / "private sibling.txt").write_bytes(b"must not be copied")
        name = "_ewp_installed_packaging_test"
        spec = importlib.util.spec_from_file_location(name, source / "__init__.py",
                                                    submodule_search_locations=[str(source)])
        assert spec and spec.loader
        package = importlib.util.module_from_spec(spec)
        modules = patch.dict(sys.modules)
        modules.start()
        self.addCleanup(modules.stop)
        sys.modules[name] = package
        spec.loader.exec_module(package)
        cli = importlib.import_module(f"{name}.cli")
        self.assertEqual(Path(package.packaging.__file__).parent, source)
        self.assertIs(package.build_package, cli.build_package)
        return package, cli, source

    def assert_installed_sources(self, source):
        destination = self.root / "build/exe-src/easy_windows_pack"
        expected = {path.relative_to(source).as_posix(): path.read_bytes()
                    for path in source.rglob("*") if path.is_file()
                    and "__pycache__" not in path.relative_to(source).parts
                    and path.suffix not in (".pyc", ".pyo")}
        actual = {path.relative_to(destination).as_posix(): path.read_bytes()
                  for path in destination.rglob("*") if path.is_file()}
        self.assertEqual(actual, expected)
        self.assertFalse((destination / "__pycache__").exists())
        self.assertFalse((self.root / "backend/base/ewpcore").exists())

    def test_installed_package_api_builds_without_project_core(self):
        package, _, source = self.installed_package()
        shutil.rmtree(self.root / "backend/base")
        for mode in ("onefile", "onedir"):
            with self.subTest(mode=mode):
                self.commands.clear()
                self.write("build/exe-src/easy_windows_pack/removed.py", b"stale")
                self.config_file(self.config(mode))
                with patch.object(package.packaging, "_run", side_effect=self.fake_run):
                    result = package.build_package(self.root)
                self.assertEqual(len(self.commands), 3)
                self.assertEqual(result["application"].is_dir(), mode == "onedir")
                self.assertTrue(result["installer"].is_file())
                self.assertEqual(self.commands[0][-1], str(self.root / "backend/src/demo.py"))
                self.assertEqual(self.commands[0][self.commands[0].index("--paths") + 1],
                                 str(self.root / "build/exe-src"))
                self.assertEqual(self.commands[0][self.commands[0].index("--add-data") + 1],
                                 f"{self.root / 'output/frontend'}{os.pathsep}output/frontend")
                self.assertEqual(self.commands[1][-1], str(source / "installer.py"))
                self.assertEqual(self.commands[2][-1], str(source / "installer.py"))
                self.assert_installed_sources(source)

    def test_installed_package_cli_packages_source_free_project(self):
        package, cli, source = self.installed_package()
        shutil.rmtree(self.root / "backend/base")
        self.config_file(self.config(installer=False), "config folder/package.json")
        for command, mode, count in (("app", "onefile", 1), ("installer", "onedir", 3)):
            with self.subTest(command=command):
                self.commands.clear()
                output, errors = io.StringIO(), io.StringIO()
                with patch.object(package.packaging, "_run", side_effect=self.fake_run), \
                        redirect_stdout(output), redirect_stderr(errors):
                    code = cli.main([command, "--project-root", str(self.root), "--lang", "en",
                                     "--config", "config folder/package.json", "--mode", mode])
                self.assertEqual(code, 0, errors.getvalue())
                self.assertEqual(len(self.commands), count)
                self.assertIn(str(self.root / "output/apps"), output.getvalue())
                if command == "installer":
                    self.assertIn(str(self.root / "output/installers"), output.getvalue())
                self.assert_installed_sources(source)

    def test_project_core_precedes_installed_and_stale_public_name(self):
        package, _, source = self.installed_package()
        self.write("backend/base/easy_windows_pack/__init__.py", b"stale public name")
        self.write("build/exe-src/easy_windows_pack/removed.py", b"stale")
        package.packaging.prepare_sources(self.root)
        destination = self.root / "build/exe-src/easy_windows_pack"
        self.assertEqual(sorted(path.name for path in destination.iterdir()), ["__init__.py", "module.py"])
        self.assertEqual((destination / "__init__.py").read_bytes(), b"VALUE = 'actual core'\n")
        self.assertTrue((source / "installed_only.py").is_file())

    def test_installed_fallback_ignores_project_core_without_init(self):
        package, _, source = self.installed_package()
        (self.root / "backend/base/ewpcore/__init__.py").unlink()
        package.packaging.prepare_sources(self.root)
        destination = self.root / "build/exe-src/easy_windows_pack"
        self.assertEqual((destination / "__init__.py").read_bytes(), (source / "__init__.py").read_bytes())
        self.assertTrue((destination / "installed_only.py").is_file())
        self.assertFalse((destination / "module.py").exists())

    def test_installed_fallback_requires_init_before_replacing_staged_core(self):
        package, _, source = self.installed_package()
        (self.root / "backend/base/ewpcore/__init__.py").unlink()
        (source / "__init__.py").unlink()
        stale = self.write("build/exe-src/easy_windows_pack/keep.py", b"preserved")
        with patch.object(package.packaging, "_run") as run, self.assertRaisesRegex(ValueError, "__init__"):
            package.build_package(self.root)
        run.assert_not_called()
        self.assertEqual(stale.read_bytes(), b"preserved")

    def test_installed_fallback_rejects_linked_descendants(self):
        package, _, source = self.installed_package()
        shutil.rmtree(self.root / "backend/base")
        outside = Path(self.temporary.name) / "outside private files"
        outside.mkdir()
        (outside / "secret.txt").write_bytes(b"must not be copied")
        self.make_link(outside, source / "linked tree", directory=True)
        stale = self.write("build/exe-src/easy_windows_pack/keep.py", b"preserved")
        with patch.object(package.packaging, "_run") as run, self.assertRaisesRegex(ValueError, "Links/reparse"):
            package.build_package(self.root)
        run.assert_not_called()
        self.assertEqual(stale.read_bytes(), b"preserved")

    def test_defaults_are_safe_and_input_is_not_mutated(self):
        for name in ("normal project", "CON", "uninstall", "...", "\u5e94\u7528"):
            with self.subTest(name=name):
                root = Path(self.temporary.name) / name
                root.mkdir(exist_ok=True)
                config = packaging.load_pack_config(root)
                self.assertEqual(config["schemaVersion"], 1)
                self.assertEqual(config["build"], {"mode": "onefile", "installer": False})
                self.assertEqual(config["installer"]["language"], "zh-CN")
                self.assertRegex(config["application"]["id"], r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
        original = self.config()
        before = copy.deepcopy(original)
        normalized = packaging.validate_pack_config(original, self.root)
        self.assertEqual(original, before)
        self.assertTrue(normalized["features"][1]["required"])
        self.assertFalse(normalized["postInstall"][0]["default"])

    def test_relative_config_is_project_relative_and_bom_is_accepted(self):
        data = json.dumps(self.config()).encode("utf-8-sig")
        self.write("config folder/package.json", data)
        loaded = packaging.load_pack_config(self.root, Path("config folder/package.json"))
        self.assertEqual(loaded["application"]["id"], "same-name")
        self.assertEqual(packaging.load_pack_config(self.root, self.root / "config folder/package.json"), loaded)

    def test_explicit_missing_config_never_uses_defaults(self):
        for path in (Path("missing.json"), self.root / "missing.json", Path("backend")):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, "Configuration file"):
                packaging.load_pack_config(self.root, path)
        for content in (b"[1]", b"not json", b'{"build": null}'):
            self.write("ewp.pack.json", content)
            with self.subTest(content=content), self.assertRaises(ValueError):
                packaging.load_pack_config(self.root)

    def test_config_cannot_escape_root(self):
        outside = Path(self.temporary.name) / "outside.json"
        outside.write_text("{}", encoding="utf-8")
        for path in (outside, Path("../outside.json")):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, "escapes"):
                packaging.load_pack_config(self.root, path)

    def test_invalid_ids_and_application_metadata(self):
        for identifier in ("", "a b", "CON", "con.txt", "LPT1", "COM9", "a.", "../a", "--name",
                           "a;echo", "a&echo", "a%PATH%", "\u4e2d\u6587", "a" * 81, None, 1, "uninstall"):
            config = self.config()
            config["application"]["id"] = identifier
            with self.subTest(identifier=identifier), self.assertRaises(ValueError):
                packaging.validate_pack_config(config, self.root)
        for key, value in (("name", ""), ("name", "bad\0name"), ("version", 3), ("version", "")):
            config = self.config()
            config["application"][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                packaging.validate_pack_config(config, self.root)

    def test_schema_containers_modes_and_flags(self):
        changes = [("schemaVersion", True), ("schemaVersion", 2), ("schemaVersion", "1"),
                   ("application", []), ("build", None), ("features", {}), ("prerequisites", None),
                   ("postInstall", "launch"), ("hooks", []), ("installer", []), ("unknown", 1)]
        for field, value in changes:
            config = self.config()
            config[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                packaging.validate_pack_config(config, self.root)
        for value in ("single", "", False, [], None):
            config = self.config()
            config["build"]["mode"] = value
            with self.subTest(mode=value), self.assertRaises(ValueError):
                packaging.validate_pack_config(config, self.root)
        config = self.config()
        config["build"]["installer"] = 1
        with self.assertRaises(ValueError):
            packaging.validate_pack_config(config, self.root)
        for flag in ("default", "required"):
            config = self.config()
            config["features"][0][flag] = "true"
            with self.subTest(flag=flag), self.assertRaises(ValueError):
                packaging.validate_pack_config(config, self.root)

    def test_duplicate_ids_and_unknown_features(self):
        for collection in ("features", "prerequisites", "postInstall"):
            config = self.config()
            item = copy.deepcopy(config[collection][0])
            item["id"] = item["id"].upper()
            config[collection].append(item)
            with self.subTest(collection=collection), self.assertRaisesRegex(ValueError, "Duplicate"):
                packaging.validate_pack_config(config, self.root)
        for features in (["unknown"], ["EXTRAS"], ["extras", "extras"], "extras", [{}]):
            config = self.config()
            config["prerequisites"][0]["features"] = features
            with self.subTest(features=features), self.assertRaises(ValueError):
                packaging.validate_pack_config(config, self.root)

    def test_unsafe_source_and_destination_paths(self):
        bad = ["../outside", "a/../b", "./file", "/absolute", "C:/absolute", "C:relative", "a\\b",
               "//server/share", "a//b", "a/", "a\0b", "a:b", "CON", "a/LPT1.txt", "a.", "a "]
        for field in ("source", "destination"):
            for value in bad:
                config = self.config()
                config["features"][0]["files"] = [{"source": "optional files/read me.txt", "destination": "safe.txt"}]
                config["features"][0]["files"][0][field] = value
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    packaging.validate_pack_config(config, self.root)
        for source in ("missing file",):
            config = self.config()
            config["installer"]["files"][0]["source"] = source
            with self.assertRaisesRegex(ValueError, "Missing source"):
                packaging.validate_pack_config(config, self.root)

    def test_reserved_destinations_and_file_schema(self):
        for destination in ("uninstall.exe", "UNINSTALL.EXE/child", "features/other/a", "runtime/python/a",
                            "ewp-installer.json", ".ewp-install-state.json", ".ewp-installer.log",
                            ".ewp-installer.lock", "ewp-options.json/settings"):
            for collection in ("features", "installer"):
                config = self.config()
                files = config["features"][0]["files"] if collection == "features" else config["installer"]["files"]
                files[0]["destination"] = destination
                with self.subTest(destination=destination, collection=collection), self.assertRaises(ValueError):
                    packaging.validate_pack_config(config, self.root)
        for files in (None, {}, [None], [{"source": "optional files"}],
                      [{"source": "optional files", "destination": "extras", "typo": True}]):
            config = self.config()
            config["features"][0]["files"] = files
            with self.subTest(files=files), self.assertRaises(ValueError):
                packaging.validate_pack_config(config, self.root)

    def test_directory_links_rejected_in_source_and_descendants(self):
        outside = Path(self.temporary.name) / "outside tree"
        outside.mkdir()
        (outside / "secret.txt").write_bytes(b"must not be copied")
        link = self.root / "optional files/linked tree"
        self.make_link(outside, link, directory=True)
        for source in ("optional files", "optional files/linked tree", "optional files/linked tree/secret.txt"):
            config = self.config()
            config["features"][0]["files"][0]["source"] = source
            with self.subTest(source=source), self.assertRaisesRegex(ValueError, "Links/reparse"):
                packaging.validate_pack_config(config, self.root)

    def test_file_symlink_is_rejected(self):
        link = self.root / "linked file.txt"
        self.make_link(self.root / "optional files/read me.txt", link)
        config = self.config()
        config["installer"]["files"] = [{"source": "linked file.txt", "destination": "file.txt"}]
        with self.assertRaisesRegex(ValueError, "Links/reparse"):
            packaging.validate_pack_config(config, self.root)

    def test_case_and_file_directory_collisions_across_features(self):
        for destination in ("extras data/read me.txt", "EXTRAS DATA/other.txt", "extras data", "tools/tool.exe"):
            config = self.config()
            config["features"][1]["files"] = [{"source": "optional files/read me.txt", "destination": destination}]
            with self.subTest(destination=destination), self.assertRaisesRegex(ValueError, "collision"):
                packaging.validate_pack_config(config, self.root)

    def test_prerequisites_require_valid_hash_urls_type_and_paths(self):
        changes = [("sha256", None), ("sha256", ""), ("sha256", "0" * 63), ("sha256", "G" * 64),
                   ("type", "msi"), ("destination", "runtime/other"), ("filename", "a/b.zip"),
                   ("filename", "CON.zip"), ("check", "../python.exe"), ("urls", "https://example.org"),
                   ("urls", ["file:///runtime.zip"]), ("urls", ["https://user:secret@example.org/a"]),
                   ("mirrors", ["https://example.org:bad/a"]), ("mirrorApi", ""), ("mirrorApi", 5)]
        for field, value in changes:
            config = self.config()
            config["prerequisites"][0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                packaging.validate_pack_config(config, self.root)
        config = self.config()
        item = config["prerequisites"][0]
        item.pop("sha256")
        with self.assertRaises(ValueError):
            packaging.validate_pack_config(config, self.root)
        config = self.config()
        item = config["prerequisites"][0]
        item.pop("mirrorApi")
        item["urls"] = item["mirrors"] = []
        with self.assertRaisesRegex(ValueError, "requires URLs"):
            packaging.validate_pack_config(config, self.root)
        item["mirrorApi"] = "https://example.org/mirrors.json"
        self.assertEqual(packaging.validate_pack_config(config, self.root)["prerequisites"][0]["urls"], [])

    def test_hook_and_command_schema(self):
        for commands in ("echo", ["echo"], [[]], [[1]], [[""]], [["program.exe", "bad\0arg"]],
                         [["script.cmd"]], [["script.BAT"]]):
            for location in ("hooks", "prerequisites"):
                config = self.config()
                if location == "hooks":
                    config["hooks"]["beforeInstall"] = commands
                else:
                    config["prerequisites"][0]["commands"] = commands
                with self.subTest(commands=commands, location=location), self.assertRaises(ValueError):
                    packaging.validate_pack_config(config, self.root)
        config = self.config()
        config["hooks"]["onInstall"] = []
        with self.assertRaises(ValueError):
            packaging.validate_pack_config(config, self.root)
        config = self.config()
        config["hooks"]["afterInstall"] = [["program.exe", "", "literal spaces & characters"]]
        self.assertEqual(packaging.validate_pack_config(config, self.root)["hooks"], config["hooks"])

    def test_postinstall_and_installer_validation(self):
        for value in ("launch", {}, [{"id": "a", "type": "unknown"}],
                      [{"id": "a", "type": "launch", "default": "false"}],
                      [{"id": "a", "type": "setting", "value": float("nan")}],
                      [{"id": "a", "type": "setting", "key": ""}]):
            config = self.config()
            config["postInstall"] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                packaging.validate_pack_config(config, self.root)
        for kind in ("startup", "launch", "setting"):
            config = self.config()
            config["postInstall"] = [{"id": "a", "type": kind, "key": "same"},
                                     {"id": "b", "type": kind, "key": "same"}]
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, "Duplicate"):
                packaging.validate_pack_config(config, self.root)
        for field, value in (("language", "fr"), ("defaultDirectory", []), ("welcome", "bad\ntext")):
            config = self.config()
            config["installer"][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                packaging.validate_pack_config(config, self.root)

    def test_onefile_and_onedir_full_builder_pipeline(self):
        for mode in ("onefile", "onedir"):
            with self.subTest(mode=mode):
                self.commands.clear()
                self.payloads.clear()
                original = self.config(mode)
                before = copy.deepcopy(original)
                self.config_file(original)
                self.write("output/apps/sibling private file.txt", b"must stay outside payload")
                with patch.object(packaging, "_run", side_effect=self.fake_run):
                    result = packaging.build_package(self.root)
                self.assertEqual(original, before)
                application = self.root / "output/apps" / ("same-name.exe" if mode == "onefile" else "same-name")
                self.assertEqual(result["application"], application)
                self.assertEqual(result["installer"], self.root / "output/installers/same-name-setup.exe")
                self.assertTrue(result["installer"].is_file())
                self.assertEqual(len(self.commands), 3)
                app, uninstall, setup = self.commands
                self.assertEqual(app[-1], str(self.root / "backend/src/demo.py"))
                self.assertEqual(uninstall[-1], str(PROJECT / "backend/base/ewpcore/installer.py"))
                self.assertEqual(setup[-1], uninstall[-1])
                self.assertIn("--windowed", app)
                for command in (uninstall, setup):
                    self.assertIn("--onefile", command)
                    self.assertIn("--windowed", command)
                    self.assertNotIn("--paths", command)
                    self.assertNotIn("output/frontend", " ".join(command))
                self.assertNotIn("--add-data", uninstall)
                self.assertEqual(list(self.bundles["uninstall"].iterdir()), [])
                self.assertEqual(setup.count("--add-data"), 1)
                self.assertLess(setup.index("--add-data"), len(setup) - 2)
                payload_source, payload_destination = setup[setup.index("--add-data") + 1].rsplit(os.pathsep, 1)
                self.assertEqual(Path(payload_source).name, "payload.zip")
                self.assertEqual(payload_destination, ".")
                self.assertTrue((self.bundles["same-name-setup"] / "payload.zip").is_file())
                for flag in ("--specpath", "--workpath", "--distpath"):
                    self.assertEqual(len({c[c.index(flag) + 1] for c in self.commands}), 3)
                self.assertEqual(app[app.index("--add-data") + 1],
                                 f"{self.root / 'output/frontend'}{os.pathsep}output/frontend")
                alias = self.root / "build/exe-src/easy_windows_pack"
                self.assertEqual((alias / "module.py").read_bytes(), b"VALUE = 42\n")
                payload = self.payloads[0]
                self.assertEqual(payload["same-name.exe"], pe_bytes())
                self.assertEqual(payload["uninstall.exe"], pe_bytes())
                self.assertEqual(payload["features/extras/extras data/read me.txt"], b"optional content")
                self.assertEqual(payload["features/extras/extras data/nested/data.json"], b'{"value":1}')
                self.assertIn("features/empty/", payload)
                self.assertEqual(payload["tools/tool.exe"], pe_bytes())
                manifest = json.loads(payload[packaging.MANIFEST_NAME])
                self.assertEqual(manifest["appPath"], "same-name.exe")
                self.assertEqual(manifest["applicationPath"], manifest["appPath"])
                self.assertEqual(manifest["features"][0]["payload"], "features/extras")
                self.assertNotIn("files", manifest["features"][0])
                self.assertNotIn("files", manifest["installer"])
                self.assertNotIn("source", payload[packaging.MANIFEST_NAME].decode())
                self.assertNotIn(str(self.root), payload[packaging.MANIFEST_NAME].decode())
                self.assertNotIn("sibling private file.txt", payload)
                self.assertEqual(manifest["build"], {"mode": mode, "installer": True})
                if mode == "onedir":
                    self.assertEqual(payload["_internal/library.dll"], b"library content")
                    self.assertNotIn("same-name/same-name.exe", payload)
                else:
                    self.assertFalse(any(name.startswith("_internal/") for name in payload))
                self.assertFalse(list((self.root / "build").glob("ewp-application-*")))
                self.assertFalse(list((self.root / "build").glob("ewp-installer-*")))

    def test_built_payload_is_consumed_by_standalone_installer(self):
        runtime_spec = importlib.util.spec_from_file_location("installer_contract_test", PROJECT / "backend/base/ewpcore/installer.py")
        assert runtime_spec and runtime_spec.loader
        runtime = importlib.util.module_from_spec(runtime_spec)
        runtime_spec.loader.exec_module(runtime)
        for mode in ("onefile", "onedir"):
            with self.subTest(mode=mode):
                self.payloads.clear()
                config = self.config(mode)
                # Exercise extraction and installation without network, running
                # the structural PE fixtures, or writing to the real registry.
                config["prerequisites"] = []
                config["hooks"] = {}
                self.config_file(config)
                with patch.object(packaging, "_run", side_effect=self.fake_run):
                    artifacts = packaging.build_package(self.root)
                bundle = self.bundles["same-name-setup"]
                payload = bundle / "payload.zip"
                manifest = runtime.read_manifest(payload)
                self.assertEqual(manifest["appPath"], "same-name.exe")
                for selection in ([], ["extras"]):
                    destination = self.root / f"installed {mode} {len(selection)}"
                    errors = io.StringIO()
                    with patch.object(runtime, "_registry", return_value=None), \
                            patch.object(runtime.sys, "frozen", True, create=True), \
                            patch.object(runtime.sys, "_MEIPASS", str(bundle), create=True), \
                            patch.object(runtime.sys, "executable", str(artifacts["installer"])), \
                            redirect_stderr(errors):
                        code = runtime.main(["--silent", "--install-dir", str(destination),
                                             "--features=" + ",".join(selection), "--options="])
                    self.assertEqual(code, 0, errors.getvalue())
                    state = json.loads((destination / runtime.STATE).read_text(encoding="utf-8"))
                    self.assertEqual(state["features"], sorted(["empty", *selection]))
                    self.assertEqual(state["options"], [])
                    self.assertEqual((destination / "same-name.exe").read_bytes(), pe_bytes())
                    self.assertEqual((destination / "uninstall.exe").read_bytes(), pe_bytes())
                    self.assertEqual((destination / "tools/tool.exe").read_bytes(), pe_bytes())
                    self.assertEqual((destination / "extras data/read me.txt").exists(), bool(selection))
                    self.assertFalse((destination / "features").exists())
                    if mode == "onedir":
                        self.assertEqual((destination / "_internal/library.dll").read_bytes(), b"library content")

    def test_mode_and_installer_overrides_reach_manifest_and_can_disable_setup(self):
        config_path = self.config_file(self.config("onefile", False), "config folder/package.json")
        with patch.object(packaging, "_run", side_effect=self.fake_run):
            result = packaging.build_package(self.root, Path("config folder/package.json"), installer=True, mode="onedir")
        self.assertTrue(result["application"].is_dir())
        self.assertEqual(json.loads(self.payloads[0][packaging.MANIFEST_NAME])["build"],
                         {"mode": "onedir", "installer": True})
        self.assertEqual(json.loads(config_path.read_text())["build"], {"mode": "onefile", "installer": False})
        self.commands.clear()
        self.config_file(self.config("onefile", True))
        with patch.object(packaging, "_run", side_effect=self.fake_run):
            result = packaging.build_package(self.root, installer=False)
        self.assertEqual(list(result), ["application"])
        self.assertEqual(len(self.commands), 1)
        for overrides in ({"mode": ""}, {"mode": "unknown"}, {"installer": 1}):
            with self.subTest(overrides=overrides), patch.object(packaging, "_run") as run, self.assertRaises(ValueError):
                packaging.build_package(self.root, **overrides)
            run.assert_not_called()

    def test_application_requires_compiled_frontend_and_entry(self):
        for relative in ("output/frontend/index.html", "backend/src/demo.py"):
            path = self.root / relative
            previous = path.read_bytes()
            path.unlink()
            with self.subTest(relative=relative), patch.object(packaging, "_run") as run, self.assertRaises(ValueError):
                packaging.build_application(self.root, self.config())
            run.assert_not_called()
            path.write_bytes(previous)

    def test_publication_copies_onedir_when_directory_replace_is_denied_and_replaces_files(self):
        replace = Path.replace
        replaced = []

        def deny_directory_replace(source, destination):
            if source.is_dir():
                raise PermissionError(5, "Access denied by DLL scanner", str(source))
            replaced.append((source, destination))
            return replace(source, destination)

        for mode in ("onefile", "onedir"):
            with self.subTest(mode=mode):
                previous = self.application(mode)
                if mode == "onedir":
                    (previous / "stale.dll").write_bytes(b"old library")
                else:
                    previous.write_bytes(b"old executable")
                with patch.object(packaging, "_run", side_effect=self.fake_run), \
                        patch.object(Path, "replace", deny_directory_replace):
                    result = packaging.build_application(self.root, self.config(mode))
                self.assertEqual(result, previous)
                executable = result / "same-name.exe" if mode == "onedir" else result
                self.assertEqual(packaging.validate_pe(executable), executable)
                self.assertEqual(executable.read_bytes(), pe_bytes())
                if mode == "onedir":
                    self.assertEqual((result / "_internal/library.dll").read_bytes(), b"library content")
                    self.assertEqual((result / "_internal/output/frontend/index.html").read_bytes(),
                                     b"compiled inside onedir")
                    self.assertFalse((result / "stale.dll").exists())
                self.assertFalse(list((self.root / "build").glob("ewp-application-*")))
        self.assertEqual(len(replaced), 1)
        self.assertEqual(replaced[0][1], self.root / "output/apps/same-name.exe")

    def test_publish_directory_never_replaces_and_preserves_source_tree_bytes(self):
        source = self.write("build/staged/same-name/same-name.exe", pe_bytes()).parent
        self.write("build/staged/same-name/_internal/library.dll", bytes(range(256)))
        self.write("build/staged/same-name/_internal/output/frontend/index.html", b"compiled frontend")
        (source / "empty directory").mkdir()
        expected = {path.relative_to(source).as_posix(): None if path.is_dir() else path.read_bytes()
                    for path in source.rglob("*")}
        sibling = self.write("output/apps/other-app/keep.txt", b"preserved sibling")
        destination = self.root / "output/apps/same-name"

        for previous in ("absent", "file", "directory"):
            with self.subTest(previous=previous):
                if destination.exists():
                    shutil.rmtree(destination)
                if previous == "file":
                    destination.write_bytes(b"old file")
                elif previous == "directory":
                    destination.mkdir()
                    (destination / "stale.dll").write_bytes(b"old library")
                with patch.object(Path, "replace", side_effect=PermissionError(
                        5, "Access denied by DLL scanner", str(source))) as replace:
                    result = packaging._publish(self.root, source, "output/apps/same-name")
                replace.assert_not_called()
                self.assertEqual(result, destination)
                self.assertTrue(source.is_dir())
                self.assertTrue(destination.is_dir())
                for tree in (source, destination):
                    actual = {path.relative_to(tree).as_posix(): None if path.is_dir() else path.read_bytes()
                              for path in tree.rglob("*")}
                    self.assertEqual(actual, expected)
                self.assertEqual(sibling.read_bytes(), b"preserved sibling")

    def test_publish_file_still_replaces_existing_output(self):
        source = self.write("build/staged/same-name.exe", pe_bytes())
        destination = self.write("output/apps/same-name.exe", b"old executable")
        replace = Path.replace
        with patch.object(Path, "replace", autospec=True, side_effect=replace) as replaced, \
                patch.object(packaging.shutil, "copytree") as copytree:
            result = packaging._publish(self.root, source, "output/apps/same-name.exe")
        replaced.assert_called_once_with(source, destination)
        copytree.assert_not_called()
        self.assertEqual(result, destination)
        self.assertEqual(destination.read_bytes(), pe_bytes())
        self.assertFalse(source.exists())

    def test_failed_directory_copy_removes_only_partial_destination_and_preserves_source(self):
        source = self.write("build/staged/same-name/same-name.exe", pe_bytes()).parent
        library = self.write("build/staged/same-name/_internal/library.dll", b"source library")
        sibling = self.write("output/apps/other-app/keep.txt", b"preserved sibling")
        destination = self.root / "output/apps/same-name"

        def fail_copy(incoming, target, **kwargs):
            self.assertEqual(incoming, source)
            self.assertEqual(target, destination)
            target.mkdir(exist_ok=True)
            (target / "same-name.exe").write_bytes(b"partial executable")
            (target / "_internal").mkdir()
            (target / "_internal/library.dll").write_bytes(b"partial library")
            raise shutil.Error("copy failed")

        for previous in ("absent", "file", "directory"):
            with self.subTest(previous=previous):
                if previous == "file":
                    destination.write_bytes(b"old file")
                elif previous == "directory":
                    (destination / "old.txt").parent.mkdir()
                    (destination / "old.txt").write_bytes(b"old directory")
                with patch.object(Path, "replace", side_effect=PermissionError(
                    5, "Access denied by DLL scanner", str(source))) as replace, \
                    patch.object(packaging.shutil, "copytree", side_effect=fail_copy) as copytree, \
                        self.assertRaisesRegex(shutil.Error, "copy failed"):
                    packaging._publish(self.root, source, "output/apps/same-name")
                replace.assert_not_called()
                copytree.assert_called_once()
                self.assertFalse(destination.exists())
                self.assertEqual((source / "same-name.exe").read_bytes(), pe_bytes())
                self.assertEqual(library.read_bytes(), b"source library")
                self.assertEqual(sibling.read_bytes(), b"preserved sibling")

    def test_copied_directory_executable_is_validated_before_publication_succeeds(self):
        source = self.write("build/staged/same-name/same-name.exe", pe_bytes()).parent
        self.write("build/staged/same-name/library.dll", b"library content")
        destination = self.root / "output/apps/same-name"
        copytree = shutil.copytree

        def corrupt_copy(incoming, target, **kwargs):
            copied = copytree(incoming, target, **kwargs)
            (target / "same-name.exe").write_bytes(b"MZ-invalid")
            return copied

        with patch.object(packaging.shutil, "copytree", side_effect=corrupt_copy), \
                self.assertRaisesRegex(ValueError, "Invalid PE"):
            packaging._publish(self.root, source, "output/apps/same-name")
        self.assertFalse(destination.exists())
        self.assertEqual((source / "same-name.exe").read_bytes(), pe_bytes())
        self.assertEqual((source / "library.dll").read_bytes(), b"library content")

    def test_directory_publication_keeps_existing_tree_when_cleanup_is_denied(self):
        source = self.write("build/staged/same-name/same-name.exe", pe_bytes()).parent
        previous = self.write("output/apps/same-name/keep.txt", b"previous output")
        with patch.object(packaging.shutil, "rmtree", side_effect=PermissionError("cleanup denied")), \
                patch.object(packaging.shutil, "copytree") as copytree, \
                self.assertRaisesRegex(PermissionError, "cleanup denied"):
            packaging._publish(self.root, source, "output/apps/same-name")
        copytree.assert_not_called()
        self.assertEqual(previous.read_bytes(), b"previous output")
        self.assertEqual((source / "same-name.exe").read_bytes(), pe_bytes())

    def test_directory_publication_rejects_links_before_cleaning_previous_output(self):
        source = self.write("build/staged/same-name/same-name.exe", pe_bytes()).parent
        previous = self.write("output/apps/same-name/keep.txt", b"previous output")
        outside = Path(self.temporary.name) / "outside publication"
        outside.mkdir()
        marker = outside / "keep.txt"
        marker.write_bytes(b"outside preserved")
        self.make_link(outside, previous.parent / "linked tree", directory=True)
        with patch.object(packaging.shutil, "copytree") as copytree, \
                self.assertRaisesRegex(ValueError, "Links/reparse"):
            packaging._publish(self.root, source, "output/apps/same-name")
        copytree.assert_not_called()
        self.assertEqual(previous.read_bytes(), b"previous output")
        self.assertEqual(marker.read_bytes(), b"outside preserved")
        self.assertEqual((source / "same-name.exe").read_bytes(), pe_bytes())

    def test_directory_publication_does_not_clean_destination_created_by_another_writer(self):
        source = self.write("build/staged/same-name/same-name.exe", pe_bytes()).parent
        destination = self.root / "output/apps/same-name"
        mkdir = Path.mkdir

        def competing_mkdir(path, *args, **kwargs):
            if path == destination:
                mkdir(path)
                (path / "keep.txt").write_bytes(b"other writer")
                raise FileExistsError("other writer created destination")
            return mkdir(path, *args, **kwargs)

        with patch.object(Path, "mkdir", competing_mkdir), \
                patch.object(packaging.shutil, "copytree") as copytree, \
                self.assertRaisesRegex(FileExistsError, "other writer"):
            packaging._publish(self.root, source, "output/apps/same-name")
        copytree.assert_not_called()
        self.assertEqual((destination / "keep.txt").read_bytes(), b"other writer")
        self.assertEqual((source / "same-name.exe").read_bytes(), pe_bytes())

    @unittest.skipUnless(os.name == "nt", "Requires Windows DLL sharing semantics")
    def test_onedir_build_succeeds_while_scanner_blocks_staged_library_deletion(self):
        import ctypes
        from ctypes import wintypes

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                      wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
        kernel.CreateFileW.restype = wintypes.HANDLE
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.CloseHandle.restype = wintypes.BOOL
        handle = None
        staged = None

        def build_with_scanner(command, root):
            nonlocal handle, staged
            self.fake_run(command, root)
            staged = Path(command[command.index("--distpath") + 1])
            library = staged / "same-name/_internal/library.dll"
            # GENERIC_READ + FILE_SHARE_READ allows copying, but denies moving
            # the parent directory and deleting the staged DLL during cleanup.
            handle = kernel.CreateFileW(str(library), 0x80000000, 1, None, 3, 0, None)
            if handle == ctypes.c_void_p(-1).value:
                handle = None
                raise ctypes.WinError(ctypes.get_last_error())

        try:
            with patch.object(packaging, "_run", side_effect=build_with_scanner):
                result = packaging.build_application(self.root, self.config("onedir"))
            self.assertEqual(result, self.root / "output/apps/same-name")
            self.assertEqual((result / "same-name.exe").read_bytes(), pe_bytes())
            self.assertEqual((result / "_internal/library.dll").read_bytes(), b"library content")
            self.assertIsNotNone(staged)
            self.assertTrue((staged / "same-name/_internal/library.dll").exists())
        finally:
            if handle is not None:
                kernel.CloseHandle(handle)
            if staged is not None and staged.exists():
                shutil.rmtree(staged)

    def test_missing_invalid_and_wrong_named_outputs_fail_without_stale_success(self):
        stale = self.write("output/apps/same-name.exe", pe_bytes())
        for output in (None, b"MZ-not-a-PE", pe_bytes()):
            def invalid_run(command, root):
                directory = Path(command[command.index("--distpath") + 1])
                directory.mkdir(parents=True, exist_ok=True)
                if output is not None:
                    (directory / ("wrong-name.exe" if output == pe_bytes() else "same-name.exe")).write_bytes(output)
            with self.subTest(output=output), patch.object(packaging, "_run", side_effect=invalid_run), self.assertRaises(ValueError):
                packaging.build_application(self.root, self.config())
            self.assertEqual(stale.read_bytes(), pe_bytes())
        with patch.object(packaging, "_run", side_effect=RuntimeError("builder failed")), self.assertRaisesRegex(RuntimeError, "builder failed"):
            packaging.build_application(self.root, self.config())

    def test_onedir_requires_real_exe_and_rejects_symlink_tree(self):
        app = self.application("onedir")
        (app / "same-name.exe").unlink()
        with patch.object(packaging, "_run") as run, self.assertRaises(ValueError):
            packaging.build_installer(self.root, self.config("onedir"), app)
        run.assert_not_called()
        (app / "same-name.exe").write_bytes(pe_bytes())
        outside = Path(self.temporary.name) / "outside"
        outside.mkdir()
        self.make_link(outside, app / "linked", directory=True)
        with patch.object(packaging, "_run") as run, self.assertRaisesRegex(ValueError, "Links/reparse"):
            packaging.build_installer(self.root, self.config("onedir"), app)
        run.assert_not_called()

    def test_installer_validates_uninstaller_and_setup_outputs(self):
        app = self.application()
        for failing in ("uninstall", "same-name-setup"):
            for malformed in (False, True):
                self.commands.clear()
                stale = self.write("output/installers/same-name-setup.exe", pe_bytes())
                def fail_one(command, root):
                    name = command[command.index("--name") + 1]
                    if name != failing:
                        self.fake_run(command, root)
                    elif malformed:
                        output = Path(command[command.index("--distpath") + 1])
                        output.mkdir(parents=True, exist_ok=True)
                        (output / f"{name}.exe").write_bytes(b"MZ-invalid")
                with self.subTest(failing=failing, malformed=malformed), patch.object(packaging, "_run", side_effect=fail_one), self.assertRaises(ValueError):
                    packaging.build_installer(self.root, self.config(), app)
                self.assertEqual(stale.read_bytes(), pe_bytes())
                self.assertFalse(list((self.root / "build").glob("ewp-installer-*")))

    def test_payload_rejects_app_collisions_before_running_pyinstaller(self):
        app = self.application("onedir")
        for destination in ("same-name.exe", "SAME-NAME.EXE", "library.dll/child", "library.dll"):
            config = self.config("onedir")
            config["features"][0]["files"] = [{"source": "optional files/read me.txt", "destination": destination}]
            with self.subTest(destination=destination), patch.object(packaging, "_run") as run, self.assertRaisesRegex(ValueError, "collision"):
                packaging.build_installer(self.root, config, app)
            run.assert_not_called()
        for reserved in ("uninstall.exe", "features", "ewp-installer.json", "runtime"):
            path = app / reserved
            path.write_bytes(b"conflict")
            with self.subTest(reserved=reserved), patch.object(packaging, "_run") as run, self.assertRaises(ValueError):
                packaging.build_installer(self.root, self.config("onedir"), app)
            run.assert_not_called()
            path.unlink()

    def test_build_cache_and_output_links_cannot_escape_root(self):
        outside = Path(self.temporary.name) / "external output"
        outside.mkdir()
        marker = outside / "marker"
        marker.write_bytes(b"preserved")
        self.make_link(outside, self.root / "output/apps", directory=True)
        with patch.object(packaging, "_run", side_effect=self.fake_run), self.assertRaisesRegex(ValueError, "Links/reparse"):
            packaging.build_application(self.root, self.config())
        self.assertEqual(marker.read_bytes(), b"preserved")
        self.assertFalse((outside / "same-name.exe").exists())

    def test_prepare_sources_uses_actual_core_and_cleans_stale_alias(self):
        self.write("backend/base/ewpcore/__pycache__/module.pyc", b"cache")
        self.write("backend/base/ewpcore/stale.pyc", b"cache")
        self.write("build/exe-src/easy_windows_pack/removed.py", b"stale")
        packaging.prepare_sources(self.root)
        destination = self.root / "build/exe-src/easy_windows_pack"
        self.assertEqual(sorted(path.name for path in destination.iterdir()), ["__init__.py", "module.py"])
        self.assertEqual((destination / "__init__.py").read_bytes(), (self.root / "backend/base/ewpcore/__init__.py").read_bytes())

    def test_validate_pe_rejects_truncated_headers_dlls_and_non_exes(self):
        path = self.write("test.exe", pe_bytes())
        self.assertEqual(packaging.validate_pe(path), path)
        variants = [b"", b"MZ", b"MZ" + b"\0" * 100, pe_bytes()[:200]]
        for offset, value in ((128, b"NOPE"), (132, b"\0\0"), (134, b"\0\0"),
                              (148, b"\0\0"), (150, b"\x02\x20"), (152, b"XX")):
            malformed = bytearray(pe_bytes())
            malformed[offset:offset + len(value)] = value
            variants.append(bytes(malformed))
        for data in variants:
            path.write_bytes(data)
            with self.subTest(data=data[:4], length=len(data)), self.assertRaises(ValueError):
                packaging.validate_pe(path)
        with self.assertRaises(ValueError):
            packaging.validate_pe(self.write("test.dll", pe_bytes()))

    def test_helpers_fail_closed_and_keep_static_mirror_order(self):
        path = self.root / "optional files/read me.txt"
        expected = hashlib.sha256(path.read_bytes()).hexdigest()
        self.assertTrue(packaging.verify_sha256(path, expected.upper()))
        for digest in (None, "", "0" * 63, "G" * 64, "0" * 64):
            with self.subTest(digest=digest):
                self.assertFalse(packaging.verify_sha256(path, digest))
        self.assertEqual(list(packaging.mirror_urls({"urls": ["https://a.org/x", "https://b.org/x"],
                                                   "mirrors": ["https://a.org/x", "https://c.org/x"]})),
                         ["https://a.org/x", "https://b.org/x", "https://c.org/x"])
        with self.assertRaises(ValueError):
            packaging.mirror_urls({"urls": "https://a.org/x"})
        self.assertEqual(len(packaging.selected_features(self.config())), 2)

    def test_run_uses_argv_and_removes_python_environment_injection(self):
        with patch.dict(os.environ, {"PYTHONHOME": "wrong", "PYTHONPATH": "wrong", "KEEP": "yes"}), \
                patch.object(packaging.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run:
            packaging._run(["python path", "script path"], self.root)
        self.assertEqual(run.call_args.args[0], ["python path", "script path"])
        self.assertFalse(run.call_args.kwargs["shell"])
        self.assertNotIn("PYTHONHOME", run.call_args.kwargs["env"])
        self.assertNotIn("PYTHONPATH", run.call_args.kwargs["env"])
        self.assertEqual(run.call_args.kwargs["env"]["KEEP"], "yes")
        with patch.object(packaging.subprocess, "run", return_value=subprocess.CompletedProcess([], 7)), self.assertRaisesRegex(RuntimeError, "exit code 7"):
            packaging._run(["python"], self.root)


if __name__ == "__main__":
    unittest.main()