"""Runtime installer checks; only localhost traffic and disposable application IDs.

Registry unit tests use a fake HKCU. One Windows integration test uses a random
HKCU ID and always removes its exact key/value in finally. Hook side effects are
intentionally retained: the installer cannot undo arbitrary external commands.
"""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import io
import json
import os
import stat
import subprocess
import sys
import tempfile
import threading
import unittest
import uuid
import zipfile
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "backend/base/ewpcore/installer.py"
SPEC = importlib.util.spec_from_file_location("installer_under_test", SOURCE)
assert SPEC and SPEC.loader
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class FakeRegistry:
    HKEY_CURRENT_USER = "HKCU"
    KEY_READ = 1
    KEY_SET_VALUE = 2
    REG_SZ = 1

    class Handle:
        def __init__(self, name):
            self.name = name

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    def __init__(self):
        self.keys = {}
        self.fail_name = None

    def OpenKey(self, hive, name, reserved=0, access=0):
        assert hive == self.HKEY_CURRENT_USER
        if name not in self.keys:
            raise FileNotFoundError(name)
        return self.Handle(name)

    def CreateKeyEx(self, hive, name, reserved=0, access=0):
        assert hive == self.HKEY_CURRENT_USER
        self.keys.setdefault(name, {})
        return self.Handle(name)

    def QueryValueEx(self, handle, name):
        if name not in self.keys[handle.name]:
            raise FileNotFoundError(name)
        return self.keys[handle.name][name]

    def SetValueEx(self, handle, name, reserved, kind, value):
        if name == self.fail_name:
            self.fail_name = None
            raise PermissionError("Injected registry failure")
        self.keys[handle.name][name] = (value, kind)

    def DeleteValue(self, handle, name):
        del self.keys[handle.name][name]

    def QueryInfoKey(self, handle):
        prefix = handle.name + "\\"
        subkeys = {name[len(prefix):].split("\\")[0]
                   for name in self.keys if name.startswith(prefix)}
        return len(subkeys), len(self.keys[handle.name]), 0

    def DeleteKey(self, hive, name):
        assert hive == self.HKEY_CURRENT_USER
        if name not in self.keys:
            raise FileNotFoundError(name)
        if any(key.startswith(name + "\\") for key in self.keys):
            raise OSError("Key has subkeys")
        del self.keys[name]  # Windows deletes values along with the key.


def zipped(files):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return stream.getvalue()


@contextmanager
def local_server(routes):
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            status, content, declared_length = routes.get(self.path, (404, b"missing", None))
            self.send_response(status)
            if declared_length is not None:
                self.send_header("Content-Length", str(declared_length))
            self.end_headers()
            self.wfile.write(content)
            self.close_connection = True

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", requests
    finally:
        server.shutdown()
        server.server_close()
        thread.join(2)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="ewp installer tests ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.destination = self.root / "installed app with spaces"
        self.registry = FakeRegistry()
        self.registry_patch = patch.object(installer, "_registry", return_value=self.registry)
        self.registry_patch.start()
        self.addCleanup(self.registry_patch.stop)
        self.manifest = {
            "application": {"id": "ewp-test-" + uuid.uuid4().hex, "name": "Test App", "version": "1.2.3"},
            "applicationPath": "app.exe", "features": [], "prerequisites": [], "postInstall": [],
            "installer": {"language": "en", "welcome": "Welcome to setup"},
        }

    def payload(self, manifest=None, files=None):
        payload = self.root / (uuid.uuid4().hex + ".zip")
        contents = {"app.exe": b"application", "uninstall.exe": b"uninstaller"}
        contents.update(files or {})
        with zipfile.ZipFile(payload, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(installer.MANIFEST, json.dumps(manifest or self.manifest))
            for name, content in contents.items():
                info = zipfile.ZipInfo(name)
                info.filename = name  # Preserve malicious raw backslashes for the reader check.
                archive.writestr(info, content)
        return payload

    def prerequisite(self, url, data, kind="file", **extra):
        return {"id": "local-runtime", "name": "Local runtime", "urls": [url], "mirrors": [],
                "sha256": hashlib.sha256(data).hexdigest(), "type": kind,
                "destination": "runtime/local-runtime", **extra}

    def test_features_required_defaults_isolated_payload_and_settings(self):
        self.manifest["features"] = [
            {"id": "required", "name": "Required", "required": True, "default": False,
             "payload": "features/required"},
            {"id": "optional", "name": "Optional", "description": "Extra files", "default": True,
             "payload": "features/optional"},
        ]
        self.manifest["postInstall"] = [
            {"id": "dark", "name": "Dark", "type": "setting", "key": "theme", "value": {"dark": True}},
            {"id": "unused", "name": "Unused", "type": "setting", "value": 42},
        ]
        events = []
        payload = self.payload(files={"features/required/docs/readme.txt": "required",
                                      "features/optional/extra.txt": "optional", "_internal/library.dll": "dll"})
        result = installer.install(payload, self.destination, features=[], options=["dark"], progress=events.append)
        self.assertEqual(result["features"], ["required"])
        self.assertTrue((self.destination / "docs/readme.txt").is_file())
        self.assertFalse((self.destination / "extra.txt").exists())
        self.assertFalse((self.destination / "features").exists())
        self.assertTrue((self.destination / "_internal/library.dll").is_file())
        self.assertEqual(json.loads((self.destination / "ewp-options.json").read_text()), {"theme": {"dark": True}})
        self.assertEqual(events[-1]["percent"], 100)
        installer.uninstall(self.destination)
        self.assertFalse(self.destination.exists())
        installer.install(payload, self.destination)
        self.assertTrue((self.destination / "extra.txt").is_file())
        self.assertFalse((self.destination / "ewp-options.json").exists())

    def test_empty_application_feature_and_runtime_directories_are_owned_and_removed(self):
        self.manifest["features"] = [
            {"id": "selected", "payload": "features/selected", "required": True},
            {"id": "omitted", "payload": "features/omitted", "default": True},
        ]
        data = zipped({"cache/empty/": b"", "bin/runtime.dll": b"runtime"})
        with local_server({"/runtime": (200, data, len(data))}) as (url, _requests):
            self.manifest["prerequisites"] = [self.prerequisite(url + "/runtime", data, "zip")]
            payload = self.payload(files={"app-data/empty/": b"",
                                          "features/selected/feature-data/empty/": b"",
                                          "features/omitted/not-selected/empty/": b""})
            result = installer.install(payload, self.destination, features=[])
        expected = {"app-data", "app-data/empty", "feature-data", "feature-data/empty",
                    "runtime", "runtime/local-runtime", "runtime/local-runtime/cache",
                    "runtime/local-runtime/cache/empty", "runtime/local-runtime/bin"}
        state = json.loads((self.destination / installer.STATE).read_text())
        self.assertEqual(set(result["state"]["directories"]), expected)
        self.assertEqual(set(state["directories"]), expected)
        for relative in expected:
            self.assertTrue((self.destination / relative).is_dir(), relative)
        self.assertFalse((self.destination / "features").exists())
        self.assertFalse((self.destination / "not-selected").exists())
        self.assertTrue(all(entry["path"] not in expected for entry in state["files"]))
        installer.uninstall(self.destination)
        self.assertFalse(self.destination.exists())

    def test_uninstall_empty_owned_directories_preserves_user_contents_and_unowned_directories(self):
        installer.install(self.payload(files={"empty/remove/": b"", "empty/keep/": b""}),
                          self.destination)
        (self.destination / "empty/keep/user.txt").write_text("keep")
        (self.destination / "empty/user-directory").mkdir()
        result = installer.uninstall(self.destination)
        self.assertFalse(result["pending"])
        self.assertFalse((self.destination / "empty/remove").exists())
        self.assertEqual((self.destination / "empty/keep/user.txt").read_text(), "keep")
        self.assertTrue((self.destination / "empty/user-directory").is_dir())
        self.assertFalse((self.destination / installer.STATE).exists())
        self.assertFalse((self.destination / "app.exe").exists())

    def test_empty_directories_roll_back_after_failure_and_preserve_hook_created_content(self):
        self.manifest["features"] = [{"id": "selected", "payload": "features/selected", "required": True}]
        data = zipped({"cache/empty/": b""})
        script = ("from pathlib import Path\nimport sys\nroot=Path(sys.argv[1])\n"
                  "for name in ('app-data/empty', 'feature-data/empty', 'runtime/local-runtime/cache/empty'):\n"
                  " assert (root/name).is_dir(), name\n"
                  "if sys.argv[2]=='keep': (root/'app-data/empty/user.txt').write_text('keep')\n"
                  "raise SystemExit(7)\n")
        for keep_user_content in (False, True):
            with self.subTest(keep_user_content=keep_user_content), \
                    local_server({"/runtime": (200, data, len(data))}) as (url, _requests):
                self.manifest["prerequisites"] = [self.prerequisite(url + "/runtime", data, "zip")]
                self.manifest["hooks"] = {"afterInstall": [[sys.executable, "-c", script, "{installDir}",
                                                         "keep" if keep_user_content else "remove"]]}
                payload = self.payload(files={"app-data/empty/": b"",
                                              "features/selected/feature-data/empty/": b""})
                with self.assertRaisesRegex(installer.InstallerError, "exit code 7"):
                    installer.install(payload, self.destination)
                self.assertEqual(self.registry.keys, {})
                if keep_user_content:
                    self.assertEqual((self.destination / "app-data/empty/user.txt").read_text(), "keep")
                    self.assertFalse((self.destination / "feature-data").exists())
                    self.assertFalse((self.destination / "runtime").exists())
                    self.assertFalse((self.destination / "app.exe").exists())
                    self.assertFalse((self.destination / installer.STATE).exists())
                    self.assertFalse((self.destination / installer.LOCK).exists())
                else:
                    self.assertFalse(self.destination.exists())

    def test_interrupted_install_journals_empty_directories_for_uninstall(self):
        self.destination.mkdir()
        transaction = installer._Transaction(self.destination, self.manifest, set(), set())
        transaction.save()
        transaction.directory(self.destination / "empty/nested")
        state = json.loads((self.destination / installer.STATE).read_text())
        self.assertEqual(state["phase"], "installing")
        self.assertEqual(set(state["directories"]), {"empty", "empty/nested"})
        self.assertEqual(state["files"], [])
        installer.uninstall(self.destination)
        self.assertFalse(self.destination.exists())

    def test_directory_journal_failure_rolls_back_new_empty_directories(self):
        original_save = installer._atomic_state

        def fail_directory_save(root, state):
            if "empty/nested" in state["directories"]:
                raise OSError("Injected directory journal failure")
            return original_save(root, state)

        with patch.object(installer, "_atomic_state", side_effect=fail_directory_save), \
                self.assertRaisesRegex(installer.InstallerError, "directory journal failure"):
            installer.install(self.payload(files={"empty/nested/": b""}), self.destination)
        self.assertFalse(self.destination.exists())
        self.assertEqual(self.registry.keys, {})

    def test_unknown_selection_rejected_before_writes(self):
        for kwargs in ({"features": ["unknown"]}, {"options": ["unknown"]}):
            with self.subTest(kwargs=kwargs), self.assertRaises(installer.InstallerError):
                installer.install(self.payload(), self.destination, **kwargs)
        self.assertFalse(self.destination.exists())

    def test_bad_urls_truncated_hash_failure_then_mirror_and_streamed_progress(self):
        data = zipped({"bin/runtime.dll": b"runtime-data"})
        with local_server({"/bad": (503, b"bad", 3), "/hash": (200, b"wrong", 5),
                           "/partial": (200, b"partial", 999), "/good": (200, data, len(data))}) as (url, requests):
            item = self.prerequisite(url + "/bad", data, "zip", filename="runtime.zip")
            item["urls"] += [url + "/partial", url + "/hash"]
            item["mirrors"] = [url + "/good"]
            self.manifest["prerequisites"] = [item]
            events = []
            installer.install(self.payload(), self.destination, progress=events.append, retries=2, timeout=2)
        self.assertEqual(requests, ["/bad", "/bad", "/partial", "/partial", "/hash", "/hash", "/good"])
        self.assertEqual((self.destination / "runtime/local-runtime/bin/runtime.dll").read_bytes(), b"runtime-data")
        self.assertTrue(any(event.get("bytes") == len(data) for event in events))
        self.assertFalse(list(self.destination.rglob("*.partial")))
        self.assertFalse(list(self.destination.rglob("*.zip")))

    def test_mirror_api_prioritized_and_failure_falls_back_to_original(self):
        data = b"good-runtime"
        routes = {}
        with local_server(routes) as (url, requests):
            routes.update({"/api": (200, json.dumps({"urls": [url + "/good"]}).encode(), None),
                           "/good": (200, data, len(data)), "/broken": (200, b"not-json", None)})
            self.manifest["prerequisites"] = [self.prerequisite(url + "/static", data, mirrorApi=url + "/api")]
            installer.install(self.payload(), self.destination, retries=1)
            self.assertEqual(requests, ["/api", "/good"])
            installer.uninstall(self.destination)
            requests.clear()
            self.manifest["prerequisites"] = [self.prerequisite(url + "/good", data, mirrorApi=url + "/broken")]
            installer.install(self.payload(), self.destination, retries=1)
            self.assertEqual(requests, ["/broken", "/good"])

    def test_download_size_limit_and_total_failure_cleanup(self):
        data = b"x" * 2048
        for length in (len(data), None):
            with self.subTest(length=length), local_server({"/big": (200, data, length)}) as (url, requests):
                self.manifest["prerequisites"] = [self.prerequisite(url + "/big", data)]
                with self.assertRaisesRegex(installer.InstallerError, "byte limit"):
                    installer.install(self.payload(), self.destination, retries=1, max_download_bytes=1024)
            self.assertFalse(self.destination.exists())
            self.assertEqual(self.registry.keys, {})

    def test_invalid_hash_is_rejected_without_network_or_destination(self):
        self.manifest["prerequisites"] = [self.prerequisite("http://127.0.0.1:1/missing", b"data", sha256="bad")]
        with self.assertRaisesRegex(installer.InstallerError, "SHA-256"), patch.object(installer.urllib.request, "urlopen") as request:
            installer.install(self.payload(), self.destination)
        request.assert_not_called()
        self.assertFalse(self.destination.exists())

    def test_feature_filtered_prerequisite_and_existing_check_skip(self):
        self.manifest["features"] = [{"id": "extra", "name": "Extra", "payload": "features/extra", "default": False}]
        data = b"irrelevant"
        self.manifest["prerequisites"] = [
            self.prerequisite("http://127.0.0.1:1/no", data, features=["extra"]),
            {**self.prerequisite("http://127.0.0.1:1/no", data), "id": "checked",
             "destination": "runtime/checked", "check": "existing/check.txt",
             "commands": [["missing-command"]]},
        ]
        with patch.object(installer.urllib.request, "urlopen") as request:
            installer.install(self.payload(files={"existing/check.txt": "present"}), self.destination)
        request.assert_not_called()
        self.assertFalse((self.destination / "runtime").exists())

    def test_exe_is_downloaded_without_implicit_execution(self):
        data = b"not-an-executable"
        with local_server({"/exe": (200, data, len(data))}) as (url, requests):
            self.manifest["prerequisites"] = [self.prerequisite(url + "/exe", data, "exe", filename="setup.exe")]
            with patch.object(installer.subprocess, "run") as run:
                installer.install(self.payload(), self.destination)
            run.assert_not_called()
        self.assertEqual((self.destination / "runtime/local-runtime/setup.exe").read_bytes(), data)

    def test_real_hook_argv_order_placeholders_configuration_and_uninstall(self):
        trace = self.root / "trace with spaces.jsonl"
        script = (
            "from pathlib import Path\nimport json,sys\n"
            "trace=Path(sys.argv[1])\n"
            "with trace.open('a',encoding='utf-8') as out: out.write(json.dumps(sys.argv[2:])+chr(10))\n"
            "if sys.argv[2]=='configure':\n"
            " assert Path(sys.argv[4]).is_file()\n"
            " Path(sys.argv[3], 'configured.txt').write_text('configured')\n"
            "if sys.argv[2]=='after-uninstall': assert not Path(sys.argv[3], 'app.exe').exists()\n"
        )

        def command(phase):
            return [sys.executable, "{installDir}/hooks/tool.py", str(trace), phase, "{installDir}",
                    "{download}", "{runtimeDir}", "{executable}", "literal & spaced argument"]

        self.manifest["hooks"] = {
            "beforeInstall": [command("before")], "afterInstall": [command("after")],
            "beforeUninstall": [command("before-uninstall")], "afterUninstall": [command("after-uninstall")],
        }
        data = b"runtime"
        with local_server({"/runtime": (200, data, len(data))}) as (url, requests):
            self.manifest["prerequisites"] = [self.prerequisite(url + "/runtime", data, commands=[command("configure")])]
            payload = self.payload(files={"hooks/tool.py": script, "configured.txt": "not configured yet"})
            installer.install(payload, self.destination)
        self.assertEqual((self.destination / "configured.txt").read_text(), "configured")
        installer.uninstall(self.destination)
        rows = [json.loads(line) for line in trace.read_text().splitlines()]
        self.assertEqual([row[0] for row in rows], ["before", "configure", "after", "before-uninstall", "after-uninstall"])
        self.assertEqual(rows[1][1], str(self.destination))
        self.assertEqual(rows[1][3], str(self.destination / "runtime/local-runtime"))
        self.assertEqual(rows[1][-1], "literal & spaced argument")
        self.assertFalse(self.destination.exists())

    def test_failing_hook_rolls_back_owned_files_preserves_external_side_effect(self):
        external = self.root / "external effect.txt"
        self.manifest["hooks"] = {"afterInstall": [[sys.executable, "-c",
            "from pathlib import Path; import sys; Path(sys.argv[1]).write_text('external'); sys.exit(7)", str(external)]]}
        with self.assertRaisesRegex(installer.InstallerError, "exit code 7"):
            installer.install(self.payload(files={"nested/owned.txt": "owned"}), self.destination)
        self.assertFalse(self.destination.exists())
        self.assertEqual(external.read_text(), "external")
        self.assertEqual(self.registry.keys, {})

    def test_hook_created_unowned_file_is_preserved_during_rollback(self):
        self.manifest["hooks"] = {"afterInstall": [[sys.executable, "-c",
            "from pathlib import Path; import sys; Path(sys.argv[1]).write_text('keep'); sys.exit(4)",
            "{installDir}/user-created.txt"]]}
        with self.assertRaises(installer.InstallerError):
            installer.install(self.payload(), self.destination)
        self.assertEqual([path.name for path in self.destination.iterdir()], ["user-created.txt"])

    def test_registry_failure_rolls_back_previous_startup_value_and_owned_files(self):
        app_id = self.manifest["application"]["id"]
        self.registry.keys[installer.RUN_KEY] = {app_id: ("previous", 1), "unrelated": ("keep", 1)}
        self.registry.fail_name = "DisplayVersion"
        self.manifest["postInstall"] = [{"id": "auto", "name": "Startup", "type": "startup"}]
        with self.assertRaisesRegex(installer.InstallerError, "registry failure"):
            installer.install(self.payload(), self.destination, options=["auto"])
        self.assertFalse(self.destination.exists())
        self.assertEqual(self.registry.keys, {installer.RUN_KEY: {app_id: ("previous", 1), "unrelated": ("keep", 1)}})

    def test_first_registry_write_failure_removes_empty_owned_key(self):
        self.registry.fail_name = "DisplayName"
        with self.assertRaises(installer.InstallerError):
            installer.install(self.payload(), self.destination)
        self.assertFalse(self.destination.exists())
        self.assertEqual(self.registry.keys, {})

    def test_hook_removing_application_is_failed_and_rolled_back(self):
        self.manifest["hooks"] = {"afterInstall": [[sys.executable, "-c",
            "from pathlib import Path; import sys; Path(sys.argv[1]).unlink()", "{executable}"]]}
        with self.assertRaisesRegex(installer.InstallerError, "required installed executable"):
            installer.install(self.payload(), self.destination)
        self.assertFalse(self.destination.exists())
        self.assertEqual(self.registry.keys, {})

    def test_registry_quoted_startup_uninstall_registration_and_unknown_values_kept(self):
        app_id = self.manifest["application"]["id"]
        self.registry.keys[installer.RUN_KEY] = {app_id: ("previous", 1), "unrelated": ("keep", 1)}
        self.manifest["postInstall"] = [{"id": "auto", "name": "Startup", "type": "startup"}]
        installer.install(self.payload(), self.destination, options=["auto"])
        key = installer.UNINSTALL_KEY + "\\" + app_id
        self.assertEqual(self.registry.keys[installer.RUN_KEY][app_id][0], f'"{self.destination / "app.exe"}"')
        self.assertEqual(self.registry.keys[key]["UninstallString"][0],
                 f'"{self.destination / "uninstall.exe"}" --uninstall --install-dir "{self.destination}"')
        self.assertEqual(self.registry.keys[key]["QuietUninstallString"][0],
                 f'"{self.destination / "uninstall.exe"}" --uninstall --silent --install-dir "{self.destination}"')
        self.registry.keys[key]["user-value"] = ("keep", 1)
        installer.uninstall(self.destination)
        self.assertEqual(self.registry.keys[key], {"user-value": ("keep", 1)})
        self.assertEqual(self.registry.keys[installer.RUN_KEY][app_id], ("previous", 1))

    def test_registry_restore_preserves_previous_and_user_changed_owned_values(self):
        key = installer.UNINSTALL_KEY + "\\" + self.manifest["application"]["id"]
        self.registry.keys[key] = {"DisplayName": ("installed", 1),
                                   "DisplayVersion": ("1.2.3", 1),
                                   "UninstallString": ("user changed", 1)}
        records = [
            {"key": key, "name": "DisplayName", "value": ["installed", 1], "previous": None},
            {"key": key, "name": "DisplayVersion", "value": ["1.2.3", 1], "previous": ["previous", 1]},
            {"key": key, "name": "UninstallString", "value": ["installed command", 1], "previous": None},
        ]
        installer._registry_restore(self.registry, records)
        self.assertEqual(self.registry.keys[key], {"DisplayVersion": ("previous", 1),
                                                   "UninstallString": ("user changed", 1)})

    def test_registry_restore_preserves_user_subkeys(self):
        installer.install(self.payload(), self.destination)
        key = installer.UNINSTALL_KEY + "\\" + self.manifest["application"]["id"]
        self.registry.keys[key + "\\user-subkey"] = {"user-value": ("keep", 1)}
        with patch.object(self.registry, "DeleteKey", wraps=self.registry.DeleteKey) as delete:
            installer.uninstall(self.destination)
        delete.assert_not_called()
        self.assertEqual(self.registry.keys, {key: {}, key + "\\user-subkey": {"user-value": ("keep", 1)}})

    def test_user_changed_startup_value_is_preserved(self):
        self.manifest["postInstall"] = [{"id": "auto", "name": "Startup", "type": "startup", "default": True}]
        installer.install(self.payload(), self.destination)
        app_id = self.manifest["application"]["id"]
        self.registry.keys[installer.RUN_KEY][app_id] = ("user modified", 1)
        installer.uninstall(self.destination)
        self.assertEqual(self.registry.keys[installer.RUN_KEY][app_id], ("user modified", 1))

    def test_uninstall_preserves_new_files_changed_owned_files_and_config(self):
        self.manifest["postInstall"] = [{"id": "setting", "name": "Setting", "type": "setting", "default": True, "value": 1}]
        installer.install(self.payload(files={"data/original.txt": "original"}), self.destination)
        (self.destination / "data/new.txt").write_text("new")
        (self.destination / "data/original.txt").write_text("modified")
        (self.destination / "ewp-options.json").write_text('{"user":"modified"}')
        result = installer.uninstall(self.destination)
        self.assertEqual(set(result["retained"]), {"data/original.txt", "ewp-options.json"})
        self.assertEqual((self.destination / "data/new.txt").read_text(), "new")
        self.assertFalse((self.destination / "app.exe").exists())
        self.assertFalse((self.destination / installer.STATE).exists())

    def test_nonempty_unowned_directory_and_upgrade_refused(self):
        self.destination.mkdir()
        (self.destination / "user.txt").write_text("keep")
        with self.assertRaisesRegex(installer.InstallerError, "nonempty"):
            installer.install(self.payload(), self.destination)
        with self.assertRaises(installer.InstallerError):
            installer.uninstall(self.destination)
        self.assertEqual((self.destination / "user.txt").read_text(), "keep")
        (self.destination / "user.txt").unlink()
        payload = self.payload()
        installer.install(payload, self.destination)
        with self.assertRaisesRegex(installer.InstallerError, "uninstall"):
            installer.install(payload, self.destination)
        with self.assertRaisesRegex(installer.InstallerError, "registered"):
            installer.install(payload, self.root / "second location")

    def test_payload_traversal_absolute_device_case_collision_symlink_and_expansion_limit(self):
        names = ["../outside", "/absolute", "C:/drive", "C:relative", "\\\\server\\file", "bad\\name", "file:stream",
                 "CON.txt", "nested/trailing.", "nested/trailing ", "nested/../outside"]
        for name in names:
            with self.subTest(name=name), self.assertRaises(installer.InstallerError):
                installer.install(self.payload(files={name: "bad"}), self.destination)
            self.assertFalse(self.destination.exists())
        for files in ({"Case.txt": "a", "case.txt": "b"}, {"parent": "file", "parent/child": "file"}):
            with self.subTest(files=files), self.assertRaises(installer.InstallerError):
                installer.install(self.payload(files=files), self.destination)
        payload = self.payload()
        with zipfile.ZipFile(payload, "a") as archive:
            info = zipfile.ZipInfo("linked")
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(info, "../outside")
        with self.assertRaisesRegex(installer.InstallerError, "links"):
            installer.install(payload, self.destination)
        with self.assertRaisesRegex(installer.InstallerError, "expanded byte limit"):
            installer.install(self.payload(files={"huge": "x" * 2000}), self.destination, max_archive_bytes=1000)

    def test_runtime_archive_traversal_rolls_back_and_cannot_escape(self):
        for name in ("../../escaped.txt", "C:/escaped.txt", "linked"):
            data = zipped({name: "bad"})
            if name == "linked":
                stream = io.BytesIO()
                with zipfile.ZipFile(stream, "w") as archive:
                    info = zipfile.ZipInfo("linked")
                    info.create_system = 3
                    info.external_attr = (stat.S_IFLNK | 0o777) << 16
                    archive.writestr(info, "outside")
                data = stream.getvalue()
            with self.subTest(name=name), local_server({"/zip": (200, data, len(data))}) as (url, requests):
                self.manifest["prerequisites"] = [self.prerequisite(url + "/zip", data, "zip")]
                with self.assertRaises(installer.InstallerError):
                    installer.install(self.payload(), self.destination)
            self.assertFalse(self.destination.exists())
        self.assertFalse((self.root / "escaped.txt").exists())

    def test_feature_collision_with_core_and_installer_metadata_rejected(self):
        self.manifest["features"] = [{"id": "extra", "name": "Extra", "payload": "features/extra"}]
        for name in ("features/extra/app.exe", installer.STATE, "ewp-options.json"):
            with self.subTest(name=name), self.assertRaises(installer.InstallerError):
                installer.install(self.payload(files={name: "bad"}), self.destination)
        self.assertFalse(self.destination.exists())

    def test_uninstall_rejects_tampered_ownership_paths_registry_and_wrong_root(self):
        installer.install(self.payload(), self.destination)
        state_path = self.destination / installer.STATE
        state = json.loads(state_path.read_text())
        for mutate in (
                lambda value: value["files"].append({"path": "../outside", "sha256": "0" * 64}),
                lambda value: value["directories"].append("../outside"),
                lambda value: value["registry"].append({"key": "Software\\unrelated", "name": "unknown"}),
                lambda value: value.update(root=str(self.root))):
            damaged = copy.deepcopy(state)
            mutate(damaged)
            state_path.write_text(json.dumps(damaged))
            with self.assertRaises(installer.InstallerError):
                installer.uninstall(self.destination)
            self.assertTrue((self.destination / "app.exe").exists())
        state_path.write_text(json.dumps(state))
        installer.uninstall(self.destination)

    def test_uninstall_failure_retains_metadata_and_files(self):
        self.manifest["hooks"] = {"beforeUninstall": [[sys.executable, "-c", "raise SystemExit(5)"]]}
        installer.install(self.payload(), self.destination)
        with self.assertRaisesRegex(installer.InstallerError, "exit code 5"):
            installer.uninstall(self.destination)
        self.assertTrue((self.destination / installer.STATE).exists())
        self.assertTrue((self.destination / "app.exe").exists())
        self.assertFalse((self.destination / installer.LOCK).exists())
        self.assertIn("Uninstall failed", (self.destination / installer.LOG).read_text())

    @unittest.skipUnless(sys.platform == "win32", "Windows case-insensitive hook paths")
    def test_windows_uppercase_hooks_reject_changed_or_missing_owned_resources(self):
        for phase in ("beforeUninstall", "afterUninstall"):
            for resource in ("Tool.py", "Tool.exe"):
                for change in ("modified", "missing"):
                    with self.subTest(phase=phase, resource=resource, change=change):
                        destination = self.root / (phase + resource + change)
                        self.manifest["application"]["id"] = "ewp-test-" + uuid.uuid4().hex
                        command = ["{installDir}/HOOKS/" + resource.upper()]
                        if resource.endswith(".py"):
                            command.insert(0, sys.executable)
                        self.manifest["hooks"] = {phase: [command]}
                        installer.install(self.payload(files={"hooks/" + resource: "original"}), destination)
                        path = destination / "hooks" / resource
                        if change == "modified":
                            path.write_text("changed")
                        else:
                            path.unlink()
                        registered = copy.deepcopy(self.registry.keys)
                        with patch.object(installer, "_run_commands") as run, \
                                self.assertRaisesRegex(installer.InstallerError, "hook resource was changed or removed"):
                            installer.uninstall(destination)
                        run.assert_not_called()
                        self.assertEqual(self.registry.keys, registered)
                        self.assertTrue((destination / "app.exe").is_file())
                        self.assertTrue((destination / installer.STATE).is_file())
                        self.assertFalse((destination / installer.LOCK).exists())

    @unittest.skipUnless(sys.platform == "win32", "Windows case-insensitive hook paths")
    def test_windows_uppercase_hooks_run_both_phases_and_keep_after_script_until_done(self):
        for after_path in ("{installDir}/HOOKS/AFTER.PY", "HOOKS/../HOOKS/AFTER.PY"):
            with self.subTest(after_path=after_path):
                self.destination = self.root / uuid.uuid4().hex
                self.manifest["application"]["id"] = "ewp-test-" + uuid.uuid4().hex
                trace = self.root / (uuid.uuid4().hex + ".jsonl")
                self.manifest["hooks"] = {
                    "beforeUninstall": [[sys.executable, "{installDir}/HOOKS/BEFORE.PY", str(trace)]],
                    "afterUninstall": [[sys.executable, after_path, str(trace)]],
                }
                script = ("from pathlib import Path\nimport json,sys\n"
                          "with Path(sys.argv[1]).open('a') as out:\n"
                          " out.write(json.dumps([Path(__file__).name.lower(), Path('app.exe').exists()])+chr(10))\n")
                installer.install(self.payload(files={"hooks/Before.py": script, "hooks/After.py": script}),
                                  self.destination)
                result = installer.uninstall(self.destination)
                rows = [json.loads(line) for line in trace.read_text().splitlines()]
                self.assertEqual(rows, [["before.py", True], ["after.py", False]])
                self.assertEqual(result["retained"], [])
                self.assertFalse(self.destination.exists())

    def test_after_uninstall_failure_can_retry_without_repeating_completed_before_hook(self):
        trace = self.root / "retry trace.txt"
        fail_once = self.root / "fail-once.txt"
        self.manifest["hooks"] = {
            "beforeUninstall": [[sys.executable, "-c", "from pathlib import Path; import sys; "
                                 "p=Path(sys.argv[1]); p.write_text(p.read_text()+'before' if p.exists() else 'before')",
                                 str(trace)]],
            "afterUninstall": [[sys.executable, "{installDir}/AFTER.PY" if sys.platform == "win32"
                                else "{installDir}/after.py", str(fail_once)]],
        }
        script = ("from pathlib import Path\nimport sys\np=Path(sys.argv[1])\n"
                  "if not p.exists():\n p.write_text('failed'); raise SystemExit(8)\n")
        installer.install(self.payload(files={"after.py": script}), self.destination)
        with self.assertRaisesRegex(installer.InstallerError, "exit code 8"):
            installer.uninstall(self.destination)
        self.assertTrue((self.destination / "after.py").exists())
        self.assertFalse((self.destination / "app.exe").exists())
        installer.uninstall(self.destination)
        self.assertEqual(trace.read_text(), "before")
        self.assertFalse(self.destination.exists())

    def test_modified_log_is_preserved_without_blocking_uninstall(self):
        installer.install(self.payload(), self.destination)
        (self.destination / installer.LOG).write_text("user modified log")
        result = installer.uninstall(self.destination)
        self.assertIn(installer.LOG, result["retained"])
        self.assertEqual((self.destination / installer.LOG).read_text(), "user modified log")

    def test_incomplete_install_cleanup_skips_unavailable_hooks_and_preserves_unhashed_files(self):
        self.manifest["hooks"] = {"beforeUninstall": [["{installDir}/missing.exe"]]}
        installer.install(self.payload(), self.destination)
        state = json.loads((self.destination / installer.STATE).read_text())
        state["phase"] = "installing"
        next(entry for entry in state["files"] if entry["path"] == "app.exe")["sha256"] = None
        (self.destination / installer.STATE).write_text(json.dumps(state))
        result = installer.uninstall(self.destination)
        self.assertIn("app.exe", result["retained"])
        self.assertFalse((self.destination / "uninstall.exe").exists())

    def test_existing_reparse_directory_is_rejected(self):
        outside = self.root / "outside"
        outside.mkdir()
        if sys.platform == "win32":
            completed = subprocess.run([os.environ.get("COMSPEC", "cmd.exe"), "/c", "mklink", "/J",
                                        str(self.destination), str(outside)], capture_output=True)
            if completed.returncode:
                self.skipTest("Cannot create a test junction")
            self.addCleanup(lambda: self.destination.rmdir() if self.destination.exists() else None)
        else:
            self.destination.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(installer.InstallerError, "reparse"):
            installer.install(self.payload(), self.destination)
        self.assertEqual(list(outside.iterdir()), [])

    def test_batch_commands_and_invalid_schema_are_rejected(self):
        for mutate in (
                lambda value: value["application"].update(id="../bad"),
                lambda value: value.update(applicationPath="directory"),
                lambda value: value.update(hooks={"afterInstall": [["hook.cmd", "arg"]]}),
                lambda value: value.update(hooks={"afterInstall": ["a shell string"]}),
                lambda value: value.update(installer={"language": "invalid"})):
            manifest = copy.deepcopy(self.manifest)
            mutate(manifest)
            with self.assertRaises(installer.InstallerError):
                installer.install(self.payload(manifest), self.destination)
        self.assertFalse(self.destination.exists())

    def test_selected_launch_only_after_commit_and_failure_is_warning(self):
        self.manifest["postInstall"] = [{"id": "run", "name": "Launch", "type": "launch"}]
        with patch.object(installer.subprocess, "Popen") as launch:
            installer.install(self.payload(), self.destination)
            launch.assert_not_called()
        installer.uninstall(self.destination)

        def failed_launch(*args, **kwargs):
            self.assertEqual(json.loads((self.destination / installer.STATE).read_text())["phase"], "installed")
            raise OSError("No launch")

        with patch.object(installer.subprocess, "Popen", side_effect=failed_launch):
            result = installer.install(self.payload(), self.destination, options=["run"])
        self.assertEqual(len(result["warnings"]), 1)
        self.assertTrue((self.destination / "app.exe").exists())

    def test_cli_silent_real_subprocess_install_and_uninstall_with_spaces(self):
        payload = self.payload()
        command = [sys.executable, str(SOURCE), "--silent", "--payload", str(payload),
                   "--install-dir", str(self.destination), "--features", "", "--options", ""]
        try:
            installed = subprocess.run(command, capture_output=True, text=True, timeout=30)
            self.assertEqual(installed.returncode, 0, installed.stderr)
            (self.destination / "keep.txt").write_text("user file")
            removed = subprocess.run([sys.executable, str(SOURCE), "--silent", "--uninstall",
                                      "--install-dir", str(self.destination)], capture_output=True, text=True, timeout=30)
            self.assertEqual(removed.returncode, 0, removed.stderr)
            self.assertEqual((self.destination / "keep.txt").read_text(), "user file")
            refused = subprocess.run(command, capture_output=True, text=True, timeout=30)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn("nonempty", refused.stderr)
        finally:
            self.clean_real_registry(self.manifest["application"]["id"])

    @staticmethod
    def clean_real_registry(app_id):
        if sys.platform != "win32":
            return
        import winreg
        key = installer.UNINSTALL_KEY + "\\" + app_id
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key)
        except FileNotFoundError:
            pass
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, installer.RUN_KEY, 0, winreg.KEY_SET_VALUE) as handle:
                winreg.DeleteValue(handle, app_id)
        except FileNotFoundError:
            pass

    @unittest.skipUnless(sys.platform == "win32", "Windows registry integration")
    def test_actual_hkcu_startup_and_uninstall_registration(self):
        import winreg
        self.manifest["postInstall"] = [{"id": "start", "name": "Startup", "type": "startup"}]
        self.registry_patch.stop()
        app_id = self.manifest["application"]["id"]
        uninstall_key = installer.UNINSTALL_KEY + "\\" + app_id
        try:
            for user_value in (False, True):
                with self.subTest(user_value=user_value):
                    installer.install(self.payload(), self.destination, options=["start"])
                    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, installer.RUN_KEY) as key:
                        self.assertEqual(winreg.QueryValueEx(key, app_id)[0], f'"{self.destination / "app.exe"}"')
                    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, uninstall_key, 0,
                                        winreg.KEY_READ | winreg.KEY_SET_VALUE) as key:
                        self.assertEqual(winreg.QueryValueEx(key, "InstallLocation")[0], str(self.destination))
                        if user_value:
                            winreg.SetValueEx(key, "user-value", 0, winreg.REG_SZ, "keep")
                    installer.uninstall(self.destination)
                    if user_value:
                        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, uninstall_key) as key:
                            self.assertEqual(winreg.QueryValueEx(key, "user-value"), ("keep", winreg.REG_SZ))
                            self.assertEqual(winreg.QueryInfoKey(key)[:2], (0, 1))
                    else:
                        with self.assertRaises(FileNotFoundError):
                            winreg.OpenKey(winreg.HKEY_CURRENT_USER, uninstall_key)
                    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, installer.RUN_KEY) as key:
                        with self.assertRaises(FileNotFoundError):
                            winreg.QueryValueEx(key, app_id)
        finally:
            self.clean_real_registry(app_id)

    def test_main_defaults_to_gui_without_stdin_and_missing_metadata_fails(self):
        with patch.object(installer, "_gui", return_value=0) as gui, patch("builtins.input", side_effect=AssertionError("stdin")):
            self.assertEqual(installer.main(["--payload", str(self.payload()), "--install-dir", str(self.destination)]), 0)
        gui.assert_called_once()
        self.assertFalse(gui.call_args.args[-1])
        with patch.object(sys, "stderr", io.StringIO()):
            self.assertNotEqual(installer.main(["--silent", "--uninstall", str(self.root)]), 0)

    def test_main_frozen_uninstaller_without_arguments_opens_uninstall_gui_at_exe_parent(self):
        installer.install(self.payload(), self.destination)
        for filename in ("uninstall.exe", "UnInstall.EXE"):
            executable = self.destination / filename
            with self.subTest(filename=filename), \
                    patch.object(sys, "frozen", True, create=True), \
                    patch.object(sys, "executable", str(executable)), \
                    patch.object(sys, "argv", [str(executable)]), \
                    patch.object(sys, "_MEIPASS", str(self.root), create=True), \
                    patch.dict(os.environ, {"EWP_INSTALL_DIR": str(self.root)}), \
                    patch.object(installer, "read_manifest", return_value=self.manifest) as read, \
                    patch.object(installer, "_gui", return_value=0) as gui, \
                    patch("builtins.input", side_effect=AssertionError("stdin")):
                self.assertEqual(installer.main(), 0)
                read.assert_not_called()
                gui.assert_called_once_with(None, executable.parent, self.manifest, None, None, True)
        self.assertTrue((self.destination / "app.exe").is_file())

    def test_main_auto_uninstall_requires_frozen_and_exact_executable_name(self):
        payload = self.payload()
        for frozen, filename in ((False, "uninstall.exe"), (True, "setup.exe"),
                                 (True, "my-uninstall.exe")):
            with self.subTest(frozen=frozen, filename=filename), \
                    patch.object(sys, "frozen", frozen, create=True), \
                    patch.object(sys, "executable", str(self.root / filename)), \
                    patch.object(installer, "_gui", return_value=0) as gui:
                self.assertEqual(installer.main(["--payload", str(payload),
                                                 "--install-dir", str(self.destination)]), 0)
                gui.assert_called_once_with(payload, self.destination, self.manifest, None, None, False)

    def test_main_frozen_uninstaller_rejects_unowned_or_wrong_root_before_removal(self):
        installer.install(self.payload(), self.destination)
        marker = self.root / "keep.txt"
        marker.write_text("keep")
        state_path = self.destination / installer.STATE
        original = state_path.read_text()
        damaged = json.loads(original)
        damaged["root"] = str(self.root)
        cases = ((self.root / "uninstall.exe", ["--silent"], "Missing"),
                 (self.destination / "uninstall.exe",
                  ["--silent", "--install-dir", str(self.root)], "Missing"),
                 (self.destination / "uninstall.exe", ["--silent"], "different directory"))
        for executable, argv, message in cases:
            state_path.write_text(json.dumps(damaged) if message == "different directory" else original)
            with self.subTest(argv=argv, message=message), \
                    patch.object(sys, "frozen", True, create=True), \
                    patch.object(sys, "executable", str(executable)), \
                    patch.object(installer, "uninstall") as remove, \
                    patch.object(installer, "read_manifest", wraps=installer.read_manifest) as read, \
                    patch.object(sys, "stderr", io.StringIO()) as errors:
                self.assertEqual(installer.main(argv), 1)
                self.assertIn(message, errors.getvalue())
                remove.assert_not_called()
                read.assert_not_called()
            self.assertEqual(marker.read_text(), "keep")
            self.assertTrue((self.destination / "app.exe").is_file())
            self.assertFalse((self.destination / installer.LOCK).exists())
        state_path.write_text(original)

    def test_default_directory_current_user_and_environment_expansion(self):
        with patch.dict(os.environ, {"LOCALAPPDATA": str(self.root)}):
            self.assertEqual(installer.default_directory(self.manifest), self.root / "Programs" / self.manifest["application"]["id"])
            self.manifest["installer"]["defaultDirectory"] = "%LOCALAPPDATA%/Programs/custom" if sys.platform == "win32" else "$LOCALAPPDATA/Programs/custom"
            self.assertEqual(installer.default_directory(self.manifest), self.root / "Programs/custom")
        self.manifest["installer"]["defaultDirectory"] = "relative/path"
        with self.assertRaises(installer.InstallerError):
            installer.default_directory(self.manifest)

    def delayed_helper_artifacts(self, process):
        """Inspect a mocked launch and remove only its private helper files."""
        argv = process.call_args.args[0]
        script_path = Path(argv[argv.index("-File") + 1])
        manifest_path = script_path.with_name("manifest.json")

        def cleanup():
            script_path.unlink(missing_ok=True)
            manifest_path.unlink(missing_ok=True)
            try:
                script_path.parent.rmdir()
            except FileNotFoundError:
                pass

        self.addCleanup(cleanup)
        self.assertTrue(script_path.read_bytes().startswith(b"\xef\xbb\xbf"))
        self.assertTrue(manifest_path.read_bytes().startswith(b"\xef\xbb\xbf"))
        self.assertEqual(installer._digest(manifest_path), argv[-1])
        return argv, script_path.read_text(encoding="utf-8-sig"), json.loads(
            manifest_path.read_text(encoding="utf-8-sig"))

    def pending_deletion(self, directories=()):
        installer.install(self.payload(), self.destination)
        state_path = self.destination / installer.STATE
        state = json.loads(state_path.read_text(encoding="utf-8"))
        state.update(phase="pending-delete", directories=list(directories))
        state_path.write_text(json.dumps(state), encoding="utf-8")
        files = [{"path": "uninstall.exe", "sha256": installer._digest(self.destination / "uninstall.exe")},
                 {"path": installer.STATE, "sha256": installer._digest(state_path)}]
        return state_path, files

    def test_delayed_deletion_is_literal_hash_guarded_no_recursive_remove(self):
        if sys.platform != "win32":
            self.skipTest("Windows delayed cleanup")
        self.destination = self.root / "\u5b89\u88c5 [literal] ' & spaces"
        _, files = self.pending_deletion()
        with patch.object(installer.subprocess, "Popen") as process:
            installer._schedule_delete(self.destination, list(reversed(files)), [])
        argv, script, manifest = self.delayed_helper_artifacts(process)
        self.assertEqual(manifest["root"], str(self.destination))
        self.assertEqual(manifest["files"], files)  # Self first, journal last regardless of input order.
        self.assertNotIn(str(self.destination), script)
        self.assertNotIn(str(self.destination), subprocess.list2cmdline(argv))
        self.assertNotIn("-EncodedCommand", argv)
        self.assertIn("WaitForExit()", script)
        self.assertIn("Get-FileHash", script)
        self.assertIn("Test-SafePath", script)
        self.assertIn("ReparsePoint", script)
        self.assertIn("-LiteralPath", script)
        self.assertIn("$entry.sha256", script)
        self.assertIn("-not $cleanupSucceeded", script)
        self.assertIn("Invalid cleanup manifest", script)
        self.assertIn("finally", script)
        self.assertNotIn("-Recurse", script)
        self.assertIn("[IO.Directory]::Delete($p, $false)", script)
        self.assertFalse(process.call_args.kwargs["shell"])
        self.assertEqual(process.call_args.kwargs["stdout"], subprocess.DEVNULL)
        self.assertEqual(process.call_args.kwargs["stderr"], subprocess.DEVNULL)
        self.assertEqual(process.call_args.kwargs["creationflags"], 0x08000000)
        script_path = Path(argv[argv.index("-File") + 1])
        self.assertEqual(script_path.parent.parent, Path(tempfile.gettempdir()))
        self.assertEqual({path.name for path in script_path.parent.iterdir()}, {"cleanup.ps1", "manifest.json"})

    @unittest.skipUnless(sys.platform == "win32", "Windows command line limit")
    def test_delayed_deletion_many_long_owned_directories_keep_command_line_short(self):
        self.destination = self.root / ("\u5b89\u88c5 [literal] ' & " + "d" * 91)
        self.assertEqual(len(self.destination.name), 108)
        directories = [f"{index:03d}" + "d" * 105 for index in range(48)]
        directories += [directories[0] + "/nested", directories[0]]
        _, files = self.pending_deletion(directories)
        with patch.object(installer.subprocess, "Popen") as process:
            installer._schedule_delete(self.destination, files, directories)
        argv, script, manifest = self.delayed_helper_artifacts(process)
        command = subprocess.list2cmdline(argv)
        self.assertLess(len(command.encode("utf-16-le")) // 2, 32767)
        self.assertLess(len(command), 1024)
        self.assertEqual(len(manifest["directories"]), 49)
        self.assertEqual(len(manifest["directories"][1]), 108)
        self.assertEqual(manifest["directories"][0], directories[0] + "/nested")
        self.assertEqual(set(manifest["directories"]), set(directories))
        self.assertEqual(manifest["files"], files)
        self.assertNotIn(directories[0], script)
        self.assertNotIn(directories[0], command)

    @unittest.skipUnless(sys.platform == "win32", "Windows delayed cleanup")
    def test_delayed_deletion_rejects_unowned_inputs_before_creating_helper_files(self):
        state_path, files = self.pending_deletion()
        original_state = state_path.read_bytes()
        for changed_files, directories in (
                ([{"path": "../outside", "sha256": "a" * 64}], []),
                ([{"path": "app.exe", "sha256": installer._digest(self.destination / "app.exe")}], []),
                ([dict(files[0], sha256="a" * 64)], []),
                ([dict(files[1], sha256="a" * 64)], []),
                (files, ["unowned"]), (files, ["../outside"])):
            with self.subTest(files=changed_files, directories=directories), \
                    patch.object(installer.tempfile, "mkdtemp") as make, \
                    patch.object(installer.subprocess, "Popen") as process, \
                    self.assertRaises(installer.InstallerError):
                installer._schedule_delete(self.destination, changed_files, directories)
            make.assert_not_called()
            process.assert_not_called()
        for updates in ({"phase": "installed"}, {"root": str(self.root)}):
            state = json.loads(original_state)
            state.update(updates)
            state_path.write_text(json.dumps(state))
            with self.subTest(state=updates), patch.object(installer.tempfile, "mkdtemp") as make, \
                    patch.object(installer.subprocess, "Popen") as process, \
                    self.assertRaises(installer.InstallerError):
                installer._schedule_delete(self.destination, files, [])
            make.assert_not_called()
            process.assert_not_called()
        state_path.write_bytes(original_state)

    @unittest.skipUnless(sys.platform == "win32", "Windows delayed cleanup")
    def test_delayed_deletion_launch_failure_removes_private_files(self):
        state_path, files = self.pending_deletion()
        captured = []
        failure = OSError(206, "Injected launch failure")

        def fail(argv, **kwargs):
            path = Path(argv[argv.index("-File") + 1])
            captured.append(path)
            self.assertTrue(path.is_file())
            self.assertTrue(path.with_name("manifest.json").is_file())
            raise failure

        with patch.object(installer.subprocess, "Popen", side_effect=fail), \
                self.assertRaises(OSError) as raised:
            installer._schedule_delete(self.destination, files, [])
        self.assertIs(raised.exception, failure)
        self.assertEqual(len(captured), 1)
        self.assertFalse(captured[0].parent.exists())
        self.assertEqual(installer._digest(state_path), files[1]["sha256"])
        self.assertEqual(installer._digest(self.destination / "uninstall.exe"), files[0]["sha256"])

    @unittest.skipUnless(sys.platform == "win32", "Windows delayed cleanup")
    def test_delayed_deletion_script_write_failure_removes_partial_manifest(self):
        _, files = self.pending_deletion()
        original_open = Path.open
        captured = []

        def fail(path, *args, **kwargs):
            if path.name == "cleanup.ps1":
                captured.append(path)
                raise PermissionError("Injected script write failure")
            return original_open(path, *args, **kwargs)

        with patch.object(Path, "open", fail), patch.object(installer.subprocess, "Popen") as process, \
                self.assertRaises(PermissionError):
            installer._schedule_delete(self.destination, files, [])
        process.assert_not_called()
        self.assertEqual(len(captured), 1)
        self.assertFalse(captured[0].parent.exists())

    @unittest.skipUnless(sys.platform == "win32", "Windows delayed cleanup")
    def test_delayed_helper_confirms_process_exit_without_timeout_or_polling(self):
        _, files = self.pending_deletion()
        for frozen in (False, True):
            with self.subTest(frozen=frozen), patch.object(sys, "frozen", frozen, create=True), \
                    patch.object(installer.os, "getpid", return_value=123456), \
                    patch.object(installer.os, "getppid", return_value=234567), \
                    patch.object(installer.subprocess, "Popen") as process:
                installer._schedule_delete(self.destination, files, [])
            _, script, manifest = self.delayed_helper_artifacts(process)
            self.assertEqual(manifest["processIds"], [123456, 234567] if frozen else [123456])
            wait_script = script.split("foreach ($processId", 1)[1].split("foreach ($entry", 1)[0]
            self.assertIn("GetProcessById($processId)", wait_script)
            self.assertIn("catch [ArgumentException] { continue }", wait_script)
            self.assertIn("$parent.WaitForExit()", wait_script)
            self.assertIn("if (-not $parent.HasExited) { throw", wait_script)
            self.assertIn("$parent.Dispose()", wait_script)
            self.assertNotIn("-Timeout", script)
            self.assertNotIn("while", wait_script)
            self.assertNotIn("Start-Sleep", wait_script)
            self.assertLess(script.index("$parent.WaitForExit()"), script.index("Remove-Item"))

    @unittest.skipUnless(sys.platform == "win32", "Windows process locking")
    def test_frozen_uninstaller_lock_schedules_only_owned_self_and_state(self):
        installer.install(self.payload(), self.destination)
        (self.destination / "new.txt").write_text("keep")
        (self.destination / "app.exe").write_bytes(b"user changed app")
        original_unlink = Path.unlink

        def unlink(path, *args, **kwargs):
            if path == self.destination / "uninstall.exe":
                raise PermissionError("Executable is locked")
            return original_unlink(path, *args, **kwargs)

        with patch.object(Path, "unlink", unlink), patch.object(sys, "frozen", True, create=True), \
                patch.object(sys, "executable", str(self.destination / "uninstall.exe")), \
                patch.object(sys, "_MEIPASS", str(self.root), create=True), \
                patch.dict(os.environ, {"EWP_INSTALL_DIR": str(self.root)}), \
                patch.object(installer, "uninstall", wraps=installer.uninstall) as remove, \
                patch.object(installer, "_schedule_delete") as schedule:
            self.assertEqual(installer.main(["--silent"]), 0)
        remove.assert_called_once_with(self.destination)
        schedule.assert_called_once()
        self.assertEqual(schedule.call_args.args[0], self.destination)
        files = schedule.call_args.args[1]
        self.assertEqual({entry["path"] for entry in files}, {"uninstall.exe", installer.STATE})
        for entry in files:
            self.assertEqual(entry["sha256"], installer._digest(self.destination / entry["path"]))
        self.assertEqual(schedule.call_args.args[2], [])
        self.assertEqual((self.destination / "new.txt").read_text(), "keep")
        self.assertEqual((self.destination / "app.exe").read_bytes(), b"user changed app")
        self.assertEqual(json.loads((self.destination / installer.STATE).read_text())["phase"], "pending-delete")

    @unittest.skipUnless(sys.platform == "win32", "Windows PowerShell cleanup integration")
    def test_actual_delayed_helper_waits_then_deletes_only_matching_owned_files(self):
        self.destination = self.root / "\u5b89\u88c5 [literal] ' & spaces"
        state_path, files = self.pending_deletion(["empty", "empty/nested", "user"])
        (self.destination / "empty/nested").mkdir(parents=True)
        (self.destination / "user").mkdir()
        (self.destination / "user/keep.txt").write_text("user content")
        (self.destination / "keep.txt").write_text("keep")
        waiting = subprocess.Popen([sys.executable, "-c", "input()"], stdin=subprocess.PIPE,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        bootloader = subprocess.Popen([sys.executable, "-c", "input()"], stdin=subprocess.PIPE,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        helper = None
        original_popen = subprocess.Popen
        helper_paths = []

        def capture_helper(*args, **kwargs):
            argv = args[0]
            helper_paths.append(Path(argv[argv.index("-File") + 1]))
            kwargs.update(stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return original_popen(*args, **kwargs)

        try:
            with patch.object(sys, "frozen", True, create=True), \
                    patch.object(installer.os, "getpid", return_value=waiting.pid), \
                    patch.object(installer.os, "getppid", return_value=bootloader.pid), \
                    patch.object(installer.subprocess, "Popen", side_effect=capture_helper):
                helper = installer._schedule_delete(self.destination, files, ["empty", "empty/nested", "user"])
            with self.assertRaises(subprocess.TimeoutExpired):
                helper.communicate(timeout=1)
            self.assertTrue((self.destination / "uninstall.exe").exists())
            self.assertTrue(state_path.exists())
            waiting.communicate(b"\n", timeout=10)
            with self.assertRaises(subprocess.TimeoutExpired):
                helper.communicate(timeout=1)
            self.assertTrue((self.destination / "uninstall.exe").exists())
            self.assertTrue(state_path.exists())
            bootloader.communicate(b"\n", timeout=10)
            helper_stdout, helper_stderr = helper.communicate(timeout=20)
            self.assertEqual(helper.returncode, 0, helper_stderr)
            self.assertEqual((helper_stdout, helper_stderr), (b"", b""))
        finally:
            for process in (waiting, bootloader, helper):
                if process is not None:
                    if process.poll() is None:
                        process.kill()
                    process.communicate(timeout=10)
        self.assertFalse((self.destination / "uninstall.exe").exists(), (helper_stdout, helper_stderr))
        self.assertFalse(state_path.exists())
        self.assertFalse((self.destination / "empty").exists())
        self.assertEqual((self.destination / "user/keep.txt").read_text(), "user content")
        self.assertEqual((self.destination / "keep.txt").read_text(), "keep")
        self.assertTrue((self.destination / "app.exe").exists())
        self.assertFalse(helper_paths[0].parent.exists())

    @unittest.skipUnless(sys.platform == "win32", "Windows PowerShell cleanup integration")
    def test_actual_delayed_helper_preserves_changed_files_and_cleans_temporary_files(self):
        state_path, files = self.pending_deletion()
        uninstaller = self.destination / "uninstall.exe"
        original_state = state_path.read_bytes()
        original_executable = uninstaller.read_bytes()
        (self.destination / "keep.txt").write_text("keep")
        original_popen = subprocess.Popen
        for changed in ("uninstall.exe", installer.STATE, "manifest.json"):
            state_path.write_bytes(original_state)
            uninstaller.write_bytes(original_executable)
            helper_paths = []

            def mutate_then_launch(argv, **kwargs):
                script_path = Path(argv[argv.index("-File") + 1])
                helper_paths.append(script_path)
                path = script_path.with_name(changed) if changed == "manifest.json" else self.destination / changed
                path.write_bytes(b"changed by user")
                kwargs.update(stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                return original_popen(argv, **kwargs)

            with self.subTest(changed=changed), patch.object(sys, "frozen", False, create=True), \
                    patch.object(installer.os, "getpid", return_value=2147483647), \
                    patch.object(installer.subprocess, "Popen", side_effect=mutate_then_launch):
                helper = installer._schedule_delete(self.destination, files, [])
            try:
                stdout, stderr = helper.communicate(timeout=20)
                self.assertEqual(helper.returncode, 1, stderr)
                self.assertEqual((stdout, stderr), (b"", b""))
            finally:
                if helper.poll() is None:
                    helper.kill()
                helper.communicate(timeout=10)
            self.assertTrue(state_path.exists())
            if changed == "uninstall.exe":
                self.assertEqual(uninstaller.read_bytes(), b"changed by user")
                self.assertEqual(state_path.read_bytes(), original_state)
            elif changed == installer.STATE:
                self.assertEqual(state_path.read_bytes(), b"changed by user")
                self.assertFalse(uninstaller.exists())
            else:
                self.assertEqual(uninstaller.read_bytes(), original_executable)
                self.assertEqual(state_path.read_bytes(), original_state)
            self.assertEqual((self.destination / "keep.txt").read_text(), "keep")
            self.assertFalse(helper_paths[0].parent.exists())

    @unittest.skipUnless(sys.platform == "win32", "Windows PowerShell reparse protection")
    def test_actual_delayed_helper_rechecks_reparse_paths_after_scheduling(self):
        state_path, files = self.pending_deletion(["owned"])
        (self.destination / "owned").mkdir()
        outside = self.root / "outside"
        outside.mkdir()
        # Hashes deliberately match: only the runtime reparse check protects these files.
        (outside / "uninstall.exe").write_bytes((self.destination / "uninstall.exe").read_bytes())
        (outside / installer.STATE).write_bytes(state_path.read_bytes())
        (outside / "owned").mkdir()
        original_popen = subprocess.Popen
        helper_paths = []
        moved = self.root / "original installation"

        def replace_root_then_launch(argv, **kwargs):
            self.destination.rename(moved)
            junction = original_popen([os.environ.get("COMSPEC", "cmd.exe"), "/c", "mklink", "/J",
                                       str(self.destination), str(outside)],
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            junction.communicate(timeout=10)
            if junction.returncode:
                self.skipTest("Cannot create a test junction")
            helper_paths.append(Path(argv[argv.index("-File") + 1]))
            kwargs.update(stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return original_popen(argv, **kwargs)

        helper = None
        try:
            with patch.object(sys, "frozen", False, create=True), \
                    patch.object(installer.os, "getpid", return_value=2147483647), \
                    patch.object(installer.subprocess, "Popen", side_effect=replace_root_then_launch):
                helper = installer._schedule_delete(self.destination, files, ["owned"])
            stdout, stderr = helper.communicate(timeout=20)
            self.assertEqual(helper.returncode, 1, stderr)
            self.assertEqual((stdout, stderr), (b"", b""))
            self.assertEqual(installer._digest(outside / "uninstall.exe"), files[0]["sha256"])
            self.assertEqual(installer._digest(outside / installer.STATE), files[1]["sha256"])
            self.assertTrue((outside / "owned").is_dir())
            self.assertFalse(helper_paths[0].parent.exists())
        finally:
            if helper is not None:
                if helper.poll() is None:
                    helper.kill()
                helper.communicate(timeout=10)
            if moved.exists() and self.destination.exists():
                self.destination.rmdir()  # Remove the junction itself, never its target.

    @unittest.skipUnless(sys.platform == "win32", "Tk native Windows check")
    def test_real_tk_gui_details_localize_stages_and_preserve_error_reason(self):
        import tkinter as tk
        from tkinter import messagebox, ttk
        from tkinter.scrolledtext import ScrolledText
        original_loop = tk.Tk.mainloop
        reason = "An uninstall hook resource was changed or removed"
        expected = {
            "zh-CN": "正在准备卸载\n正在移除安装文件\n正在下载运行库 · 1,024 / 2,048 字节\n"
                     "Custom event\n操作失败: " + reason + "\n",
            "en": "Preparing uninstall\nRemoving installed files\nRuntime · 1,024 / 2,048 bytes\n"
                  "Custom event\n" + reason + "\n",
        }

        def operation(destination, progress):
            progress({"stage": "beforeUninstall", "message": "Preparing uninstall", "percent": 10})
            progress({"stage": "remove", "message": "Removing installed files", "percent": 35})
            progress({"stage": "download", "message": "Runtime", "percent": 40,
                      "bytes": 1024, "total": 2048})
            progress({"stage": "custom", "message": "Custom event", "percent": 45})
            progress({"stage": "error", "message": reason, "percent": 0})
            raise installer.InstallerError(reason)

        def widgets(parent):
            for child in parent.winfo_children():
                yield child
                yield from widgets(child)

        for language in ("zh-CN", "en"):
            self.manifest["installer"]["language"] = language
            captured = []

            def mainloop(root, *args):
                button = next(widget for widget in widgets(root)
                              if isinstance(widget, ttk.Button) and widget.cget("text") in ("卸载", "Uninstall"))
                details = next(widget for widget in widgets(root) if isinstance(widget, ScrolledText))

                def inspect():
                    if not error_dialog.called:
                        root.after(20, inspect)
                        return
                    captured.append(details.get("1.0", "end-1c"))
                    root.quit()

                root.after(10, button.invoke)
                root.after(100, inspect)
                root.after(6000, root.quit)
                try:
                    return original_loop(root, *args)
                finally:
                    for callback in root.tk.call("after", "info"):
                        root.after_cancel(callback)
                    root.destroy()

            with self.subTest(language=language), patch.object(tk.Tk, "mainloop", mainloop), \
                    patch.object(installer, "uninstall", side_effect=operation), \
                    patch.object(messagebox, "showerror") as error_dialog:
                result = installer._gui(None, self.destination, self.manifest, None, None, True)
                self.assertEqual(result, 1)
                self.assertEqual(captured, [expected[language]])
                error_dialog.assert_called_once()
                self.assertEqual(error_dialog.call_args.args[1], reason)

    @unittest.skipUnless(sys.platform == "win32", "Tk native Windows check")
    def test_real_tk_gui_builds_and_remains_responsive_during_worker(self):
        import tkinter as tk
        from tkinter import ttk
        original_loop = tk.Tk.mainloop
        heartbeat = []
        release = threading.Event()
        completed = threading.Event()

        def operation(*args, **kwargs):
            self.assertNotEqual(threading.current_thread(), threading.main_thread())
            args[4]({"stage": "copy", "message": "Copying", "percent": 50})
            if not release.wait(5):
                raise AssertionError("Tk event loop was blocked")
            completed.set()
            return {"warnings": []}

        def widgets(parent):
            for child in parent.winfo_children():
                yield child
                yield from widgets(child)

        def mainloop(root, *args):
            button = next(widget for widget in widgets(root)
                          if isinstance(widget, ttk.Button) and widget.cget("text") == "Next")
            root.after(10, button.invoke)
            root.after(30, button.invoke)  # Empty optional steps: location -> confirmation -> install.
            root.after(50, lambda: heartbeat.append(True))
            root.after(100, release.set)

            def stop():
                if completed.is_set():
                    root.quit()
                else:
                    root.after(50, stop)

            root.after(250, stop)
            root.after(6000, root.quit)
            try:
                return original_loop(root, *args)
            finally:
                for callback in root.tk.call("after", "info"):
                    root.after_cancel(callback)
                root.destroy()

        with patch.object(tk.Tk, "mainloop", mainloop), patch.object(installer, "install", side_effect=operation):
            result = installer._gui(self.payload(), self.destination, self.manifest, None, None, False)
        self.assertEqual(result, 0)
        self.assertTrue(heartbeat)
        self.assertTrue(completed.is_set())


if __name__ == "__main__":
    unittest.main()