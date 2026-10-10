"""Drive real Tk pages through after callbacks; worker engines are always mocked.

Run with unittest discovery from tests. No payload, download, registry write or
installation is performed by these GUI tests. Fixtures only use temporary files.
"""
from __future__ import annotations

import copy
import sys
import tempfile
import threading
import tkinter as tk
import unittest
from pathlib import Path
from tkinter import messagebox, ttk
from unittest.mock import patch

from test_installer import installer


@unittest.skipUnless(sys.platform == "win32", "Real Windows Tk wizard")
class InstallerGuiTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="ewp gui tests ")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.destination = self.base / "new app"
        self.payload = self.base / "not-created.zip"
        self.release = threading.Event()
        self.manifest = {
            "application": {"id": "gui-test", "name": "Wizard Test", "version": "1.0"},
            "applicationPath": "app.exe", "installer": {"language": "en"},
            "features": [
                {"id": "core", "name": "Core feature", "payload": "features/core",
                 "required": True, "default": False, "description": "Required support files"},
                {"id": "tools", "name": "Optional tools", "payload": "features/tools", "default": True},
                {"id": "extras", "name": "Extra documents", "payload": "features/extras", "default": False},
            ],
            "prerequisites": [
                self.runtime("common", kind="file"),
                self.runtime("tools-runtime", features=["tools"], kind="exe",
                             mirrors=["https://mirror.example.org/tools.exe"],
                             mirrorApi="https://api.example.org/mirrors",
                             check="runtime/tools-runtime/ready.dat", commands=[["configure.exe"]]),
                self.runtime("either-runtime", features=["tools", "extras"]),
                self.runtime("extras-runtime", features=["extras"]),
            ],
            "postInstall": [
                {"id": "startup", "name": "Start with Windows", "type": "startup", "default": True},
                {"id": "launch", "name": "Launch application", "type": "launch", "default": False},
                {"id": "compact", "name": "Compact view", "type": "setting", "value": True},
            ],
        }
        installer.validate_manifest(self.manifest)

    @staticmethod
    def runtime(identifier, *, features=None, kind="zip", **kwargs):
        return {"id": identifier, "name": identifier, "type": kind,
                "destination": "runtime/" + identifier, "sha256": "0" * 64,
                "urls": ["https://downloads.example.org/" + identifier],
                "features": features or [], **kwargs}

    @staticmethod
    def descendants(parent):
        for child in parent.winfo_children():
            yield child
            yield from InstallerGuiTests.descendants(child)

    def texts(self, parent):
        return "\n".join(str(widget.cget("text")) for widget in self.descendants(parent)
                         if isinstance(widget, (ttk.Label, ttk.LabelFrame, ttk.Checkbutton)))

    def assert_page(self, ui, name):
        ui["root"].update_idletasks()
        self.assertEqual(ui["state"]["page"], name)
        for key, panel in ui["pages"].items():
            self.assertEqual(bool(panel.winfo_viewable()), key == name, (key, name))
        self.assertEqual(bool(ui["entry"].winfo_viewable()), name == "directory")
        self.assertEqual(bool(ui["browse"].winfo_viewable()), name == "directory")
        self.assertEqual(bool(ui["details"].winfo_viewable()), name == "progress")
        self.assertEqual(bool(ui["bar"].winfo_viewable()), name == "progress")
        for collection, page in (("features", "features"), ("postInstall", "options")):
            for widget in ui["controls"][collection].values():
                self.assertEqual(bool(widget.winfo_viewable()), name == page, (collection, name))
        words = installer._UI[self.manifest["installer"]["language"]]
        title = words["uninstall"] if self.removing and name == "confirm" else words[name]
        if name == "complete":
            title = words["success" if ui["state"]["succeeded"] else "failure"]
        order = ui["state"]["steps"]
        self.assertEqual(ui["indicator"].get(), words["step"].format(
            current=order.index(name) + 1, total=len(order), title=title))

    def run_wizard(self, scenario, *, operation=None, removing=False, features=None, options=None):
        """Each generator yield schedules a fresh Tk turn; predicates wait for worker events."""
        self.removing = removing
        failures = []
        views = []
        finished = []

        def exists(root):
            try:
                return bool(root.winfo_exists())
            except tk.TclError:
                return False

        def observe(ui):
            views.append(ui)
            root = ui["root"]
            routine = scenario(ui)
            waiting = lambda: root.winfo_viewable()

            def page_ready():
                # Windows mapping/unmapping can finish after the geometry idle tasks.
                # Wait for native visibility rather than guessing a fixed delay.
                root.update_idletasks()
                name = ui["state"]["page"]
                if not ui["pages"][name].winfo_viewable() or not ui["contents"][name].winfo_viewable():
                    return False
                for collection, page in (("features", "features"), ("postInstall", "options")):
                    for widget in ui["controls"][collection].values():
                        if bool(widget.winfo_viewable()) != (name == page):
                            return False
                return all(bool(ui[key].winfo_viewable()) == (name == "directory")
                           for key in ("entry", "browse"))

            def drive():
                nonlocal waiting
                try:
                    if not page_ready() or (waiting is not None and not waiting()):
                        root.after(10, drive)
                        return
                    waiting = next(routine)
                except StopIteration:
                    finished.append(True)
                    if exists(root):
                        root.quit()
                    return
                except BaseException:
                    failures.append(sys.exc_info())
                    self.release.set()
                    if exists(root):
                        root.quit()
                    return
                if exists(root):
                    root.after(20, drive)

            def callback_error(*error):
                failures.append(error)
                self.release.set()
                root.quit()

            def timeout():
                failures.append((AssertionError, AssertionError("Tk scenario timed out"), None))
                self.release.set()
                root.quit()

            root.report_callback_exception = callback_error
            root.after(20, drive)
            root.after(8000, timeout)

        with patch.object(installer, "install", side_effect=operation, return_value={"warnings": []}) as install, \
                patch.object(installer, "uninstall", side_effect=operation, return_value={"retained": []}) as uninstall, \
                patch.object(messagebox, "showerror") as error_dialog, \
                patch.object(messagebox, "showinfo") as info_dialog, \
                patch.object(installer.urllib.request, "urlopen") as network:
            self.engine = uninstall if removing else install
            self.error_dialog = error_dialog
            self.info_dialog = info_dialog
            try:
                result = installer._gui(None if removing else self.payload, self.destination, self.manifest,
                                        features, options, removing, _observer=observe)
            finally:
                self.release.set()
                for thread in threading.enumerate():
                    if thread.name == "ewp-installer":
                        thread.join(4)
                for ui in views:
                    root = ui["root"]
                    if exists(root):
                        for callback in root.tk.call("after", "info"):
                            root.after_cancel(callback)
                        root.destroy()
            network.assert_not_called()
            (install if removing else uninstall).assert_not_called()
            if failures:
                _, error, traceback = failures[0]
                raise error.with_traceback(traceback)
            self.assertTrue(finished, "Scenario must finish its assertions")
            self.assertFalse(self.destination.exists(), "Mock workers must not create an installation")
            return result

    def test_pages_keep_selections_filter_dependencies_and_install_once(self):
        def operation(payload, target, features, options, progress):
            self.assertIsNot(threading.current_thread(), threading.main_thread())
            self.assertEqual(payload, self.payload)
            self.assertEqual(target, str(self.destination))
            self.assertEqual(features, ["core", "extras"])
            self.assertEqual(options, ["compact", "launch"])
            progress({"stage": "copy", "message": "Copying selected application files", "percent": 50})
            if not self.release.wait(4):
                raise AssertionError("Tk did not stay responsive")
            return {"warnings": ["Launch warning"]}

        def scenario(ui):
            self.assertIsInstance(ui["root"], tk.Tk)
            self.assert_page(ui, "directory")
            ui["action"].invoke()
            yield
            self.assert_page(ui, "features")
            core = ui["controls"]["features"]["core"]
            self.assertTrue(core.instate(["disabled"]))
            core.invoke()
            self.assertTrue(ui["selections"]["features"]["core"].get())
            ui["action"].invoke()
            yield
            self.assert_page(ui, "prerequisites")
            self.assertEqual(set(ui["runtime_rows"]), {"common", "tools-runtime", "either-runtime"})
            words = installer._UI["en"]
            text = self.texts(ui["runtime_rows"]["tools-runtime"])
            self.assertIn(words["size"], text)
            self.assertIn("downloads.example.org, mirror.example.org", text)
            self.assertIn("api.example.org", text)
            self.assertIn(words["runtime_exe"], text)
            self.assertIn("ready.dat", text)
            self.assertIn(words["runtime_commands"].format(count=1), text)
            ui["back"].invoke()
            yield
            self.assert_page(ui, "features")
            ui["controls"]["features"]["tools"].invoke()
            ui["controls"]["features"]["extras"].invoke()
            ui["back"].invoke()
            yield
            self.assert_page(ui, "directory")
            self.assertEqual(ui["directory"].get(), str(self.destination))
            ui["action"].invoke()
            yield
            self.assert_page(ui, "features")
            self.assertFalse(ui["selections"]["features"]["tools"].get())
            self.assertTrue(ui["selections"]["features"]["extras"].get())
            ui["action"].invoke()
            yield
            self.assert_page(ui, "prerequisites")
            self.assertEqual(set(ui["runtime_rows"]), {"common", "either-runtime", "extras-runtime"})
            self.assertIn(words["runtime_file"], self.texts(ui["runtime_rows"]["common"]))
            self.assertIn(words["runtime_zip"], self.texts(ui["runtime_rows"]["extras-runtime"]))
            ui["action"].invoke()
            yield
            self.assert_page(ui, "options")
            for key in ("startup", "launch", "compact"):
                ui["controls"]["postInstall"][key].invoke()
            ui["back"].invoke()
            yield
            self.assert_page(ui, "prerequisites")
            ui["action"].invoke()
            yield
            self.assert_page(ui, "options")
            self.assertFalse(ui["selections"]["postInstall"]["startup"].get())
            self.assertTrue(ui["selections"]["postInstall"]["launch"].get())
            ui["action"].invoke()
            yield
            self.assert_page(ui, "confirm")
            text = self.texts(ui["contents"]["confirm"])
            for expected in (str(self.destination), "Core feature", "Extra documents", "extras-runtime",
                             "Launch application", "Compact view"):
                self.assertIn(expected, text)
            self.assertNotIn("Optional tools", text)
            self.assertNotIn("Start with Windows", text)
            self.engine.assert_not_called()
            self.assertFalse(self.destination.exists())
            ui["action"].invoke()
            yield lambda: self.engine.call_count == 1 and "Copying" in ui["details"].get("1.0", "end")
            self.assert_page(ui, "progress")
            self.assertTrue(ui["cancel"].instate(["disabled"]))
            self.assertFalse(ui["back"].winfo_ismapped())
            self.assertFalse(ui["action"].winfo_ismapped())
            ui["action"].invoke()  # A queued duplicate click must not start another worker.
            ui["back"].invoke()
            ui["root"].tk.call(ui["root"].protocol("WM_DELETE_WINDOW"))
            self.info_dialog.assert_called_once()
            self.assertTrue(ui["root"].winfo_exists())
            self.engine.assert_called_once()
            self.release.set()
            yield lambda: ui["state"]["page"] == "complete"
            self.assert_page(ui, "complete")
            self.assertTrue(ui["state"]["succeeded"])
            self.assertFalse(ui["back"].winfo_ismapped())
            self.assertFalse(ui["cancel"].winfo_ismapped())
            self.assertEqual(ui["action"].cget("text"), words["finish"])
            self.assertIn("Launch warning", self.texts(ui["contents"]["complete"]))
            ui["back"].invoke()
            self.assert_page(ui, "complete")
            self.engine.assert_called_once()
            ui["action"].invoke()
            self.engine.assert_called_once()

        self.assertEqual(self.run_wizard(scenario, operation=operation), 0)

    def test_empty_optional_steps_and_cancel_from_confirmation(self):
        self.manifest.update(features=[], prerequisites=[], postInstall=[])

        def scenario(ui):
            self.assert_page(ui, "directory")
            self.assertEqual(ui["state"]["steps"], ["directory", "confirm", "progress", "complete"])
            ui["action"].invoke()
            yield
            self.assert_page(ui, "confirm")
            self.assertIn(installer._UI["en"]["none"], self.texts(ui["contents"]["confirm"]))
            ui["back"].invoke()
            yield
            self.assert_page(ui, "directory")
            ui["action"].invoke()
            yield
            self.assert_page(ui, "confirm")
            ui["cancel"].invoke()
            self.engine.assert_not_called()

        self.assertEqual(self.run_wizard(scenario), 0)

    def test_filtered_empty_runtime_step_skips_both_directions_and_reappears(self):
        self.manifest["prerequisites"] = [self.runtime("only-tools", features=["tools"])]

        def scenario(ui):
            ui["action"].invoke()
            yield
            self.assert_page(ui, "features")
            self.assertFalse(ui["selections"]["features"]["tools"].get())
            ui["action"].invoke()
            yield
            self.assert_page(ui, "options")
            self.assertNotIn("prerequisites", ui["state"]["steps"])
            ui["back"].invoke()
            yield
            self.assert_page(ui, "features")
            ui["controls"]["features"]["tools"].invoke()
            ui["action"].invoke()
            yield
            self.assert_page(ui, "prerequisites")
            self.assertEqual(set(ui["runtime_rows"]), {"only-tools"})
            ui["back"].invoke()
            yield
            self.assert_page(ui, "features")
            ui["controls"]["features"]["tools"].invoke()
            ui["action"].invoke()
            yield
            self.assert_page(ui, "options")
            ui["cancel"].invoke()
            self.engine.assert_not_called()

        self.assertEqual(self.run_wizard(scenario, features=[], options=[]), 0)

    def test_runtime_only_and_dynamic_mirror_information_without_optional_pages(self):
        self.manifest.update(features=[], postInstall=[], prerequisites=[
            self.runtime("dynamic", urls=[], mirrorApi="https://api.example.org/mirrors")])

        def scenario(ui):
            ui["action"].invoke()
            yield
            self.assert_page(ui, "prerequisites")
            text = self.texts(ui["runtime_rows"]["dynamic"])
            self.assertIn(installer._UI["en"]["dynamic_sources"], text)
            self.assertIn("api.example.org", text)
            self.assertEqual(ui["state"]["steps"],
                             ["directory", "prerequisites", "confirm", "progress", "complete"])
            ui["action"].invoke()
            yield
            self.assert_page(ui, "confirm")
            ui["back"].invoke()
            yield
            self.assert_page(ui, "prerequisites")
            ui["cancel"].invoke()
            self.engine.assert_not_called()

        self.assertEqual(self.run_wizard(scenario), 0)

    def test_location_validation_is_read_only_and_accepts_new_nested_directory(self):
        self.manifest.update(features=[], prerequisites=[], postInstall=[])
        occupied = self.base / "occupied"
        occupied.mkdir()
        user_file = occupied / "user.txt"
        user_file.write_text("keep", encoding="utf-8")
        parent_file = self.base / "file-parent"
        parent_file.write_text("keep", encoding="utf-8")
        owned = self.base / "owned"
        owned.mkdir()
        (owned / installer.STATE).write_text("{}", encoding="utf-8")
        new_path = self.base / "missing parent" / "new app"

        def scenario(ui):
            invalid = ["", "   ", "relative/app", str(Path(self.base.anchor)), str(occupied),
                       str(parent_file), str(parent_file / "child"), str(owned),
                       str(self.base / "NUL"), str(self.base / "trailing."),
                       str(self.base / "bad:name"), str(self.base / "bad?name")]
            with patch.object(Path, "mkdir", side_effect=AssertionError("Preflight wrote a directory")), \
                    patch.object(installer, "_registry", side_effect=AssertionError("Preflight touched registry")):
                for value in invalid:
                    ui["directory"].set(value)
                    ui["action"].invoke()
                    yield
                    self.assert_page(ui, "directory")
                    self.assertEqual(ui["directory"].get(), value)
                    self.engine.assert_not_called()
                ui["directory"].set(str(new_path))
                with patch.object(installer.os, "access", return_value=False):
                    ui["action"].invoke()
                yield
                self.assert_page(ui, "directory")
                self.assertEqual(self.error_dialog.call_count, len(invalid) + 1)
                ui["action"].invoke()
                yield
                self.assert_page(ui, "confirm")
                self.assertFalse(new_path.parent.exists())
                self.assertEqual(user_file.read_text(encoding="utf-8"), "keep")
                ui["back"].invoke()
                yield
                self.assert_page(ui, "directory")
                self.assertEqual(ui["directory"].get(), str(new_path))
            ui["cancel"].invoke()
            self.engine.assert_not_called()

        self.assertEqual(self.run_wizard(scenario), 0)

    def test_confirmation_rechecks_directory_if_it_became_nonempty(self):
        self.manifest.update(features=[], prerequisites=[], postInstall=[])

        def scenario(ui):
            ui["action"].invoke()
            yield
            self.assert_page(ui, "confirm")
            self.destination.mkdir()
            user_file = self.destination / "new-user-file.txt"
            user_file.write_text("keep", encoding="utf-8")
            ui["action"].invoke()
            yield
            self.assert_page(ui, "directory")
            self.error_dialog.assert_called_once()
            self.assertEqual(user_file.read_text(encoding="utf-8"), "keep")
            self.engine.assert_not_called()
            user_file.unlink()  # Remove only this test fixture for the common harness assertion.
            self.destination.rmdir()
            ui["cancel"].invoke()

        self.assertEqual(self.run_wizard(scenario), 0)

    def test_install_error_can_review_edit_and_retry_then_only_finish(self):
        self.manifest.update(prerequisites=[], postInstall=[])
        attempts = []

        def operation(_payload, _target, features, _options, progress):
            attempts.append(features)
            if len(attempts) == 1:
                progress({"stage": "error", "message": "Injected install failure", "percent": 0})
                raise installer.InstallerError("Injected install failure")
            progress({"stage": "copy", "message": "Second attempt", "percent": 50})
            if not self.release.wait(4):
                raise AssertionError("Retry blocked Tk")
            return {"warnings": []}

        def scenario(ui):
            ui["action"].invoke()
            yield
            self.assert_page(ui, "features")
            ui["action"].invoke()
            yield
            self.assert_page(ui, "confirm")
            ui["action"].invoke()
            yield lambda: ui["state"]["page"] == "complete"
            self.assert_page(ui, "complete")
            self.assertFalse(ui["state"]["succeeded"])
            self.assertIn("Injected install failure", self.texts(ui["contents"]["complete"]))
            self.assertIn("Injected install failure", ui["details"].get("1.0", "end"))
            self.error_dialog.assert_called_once()
            self.assertEqual(ui["action"].cget("text"), installer._UI["en"]["retry"])
            ui["back"].invoke()
            yield
            self.assert_page(ui, "confirm")
            self.assertTrue(ui["selections"]["features"]["tools"].get())
            ui["back"].invoke()
            yield
            self.assert_page(ui, "features")
            ui["controls"]["features"]["tools"].invoke()
            ui["action"].invoke()
            yield
            self.assert_page(ui, "confirm")
            self.assertNotIn("Optional tools", self.texts(ui["contents"]["confirm"]))
            ui["action"].invoke()
            yield lambda: self.engine.call_count == 2 and "Second attempt" in ui["details"].get("1.0", "end")
            self.assert_page(ui, "progress")
            self.assertNotIn("Injected install failure", ui["details"].get("1.0", "end"))
            ui["action"].invoke()
            self.release.set()
            yield lambda: ui["state"]["page"] == "complete"
            self.assert_page(ui, "complete")
            self.assertTrue(ui["state"]["succeeded"])
            self.assertEqual(attempts, [["core", "tools"], ["core"]])
            self.assertEqual(self.engine.call_count, 2)
            ui["back"].invoke()
            self.assert_page(ui, "complete")
            ui["action"].invoke()
            self.assertEqual(self.engine.call_count, 2)

        self.assertEqual(self.run_wizard(scenario, operation=operation), 0)

    def test_failure_direct_retry_and_cancel_returns_failure_code(self):
        self.manifest.update(features=[], prerequisites=[], postInstall=[])
        attempts = []

        def operation(*_args):
            attempts.append(True)
            if len(attempts) == 1:
                raise installer.InstallerError()  # Even an empty error message must enter the failure page.
            raise installer.InstallerError("Retry still failed")

        def scenario(ui):
            if not self.removing:
                ui["action"].invoke()
                yield
            self.assert_page(ui, "confirm")
            ui["action"].invoke()
            yield lambda: ui["state"]["page"] == "complete"
            self.assert_page(ui, "complete")
            self.assertFalse(ui["state"]["succeeded"])
            self.assertIn("InstallerError", self.texts(ui["contents"]["complete"]))
            ui["action"].invoke()
            yield lambda: ui["state"]["page"] == "complete" and self.engine.call_count == 2
            self.assert_page(ui, "complete")
            self.assertFalse(ui["state"]["succeeded"])
            self.assertEqual(self.error_dialog.call_count, 2)
            ui["cancel"].invoke()

        for removing in (False, True):
            with self.subTest(removing=removing):
                attempts.clear()
                self.assertEqual(self.run_wizard(scenario, operation=operation, removing=removing), 1)

    def test_uninstall_confirmation_progress_completion_never_repeats(self):
        def operation(target, progress):
            self.assertEqual(target, str(self.destination))
            progress({"stage": "remove", "message": "Removing installed files", "percent": 35})
            if not self.release.wait(4):
                raise AssertionError("Uninstall blocked Tk")
            return {"retained": ["changed.txt"], "pending": True}

        def scenario(ui):
            self.assert_page(ui, "confirm")
            self.assertEqual(ui["state"]["steps"], ["confirm", "progress", "complete"])
            text = self.texts(ui["contents"]["confirm"])
            self.assertIn(installer._UI["en"]["uninstall_help"], text)
            self.assertIn(str(self.destination), text)
            self.assertNotIn("Optional tools", text)
            self.assertTrue(ui["back"].instate(["disabled"]))
            self.engine.assert_not_called()
            ui["action"].invoke()
            yield lambda: self.engine.call_count == 1
            self.assert_page(ui, "progress")
            ui["action"].invoke()
            ui["root"].tk.call(ui["root"].protocol("WM_DELETE_WINDOW"))
            self.info_dialog.assert_called_once()
            self.release.set()
            yield lambda: ui["state"]["page"] == "complete"
            self.assert_page(ui, "complete")
            text = self.texts(ui["contents"]["complete"])
            self.assertIn("Preserved changed files: changed.txt", text)
            self.assertIn(installer._UI["en"]["pending"], text)
            ui["back"].invoke()
            self.assert_page(ui, "complete")
            self.engine.assert_called_once()
            ui["action"].invoke()
            self.engine.assert_called_once()

        self.assertEqual(self.run_wizard(scenario, operation=operation, removing=True), 0)

    def test_small_window_scrolls_only_current_page_and_labels_use_selected_language(self):
        self.assertEqual(set(installer._UI["zh-CN"]), set(installer._UI["en"]))
        for language in ("zh-CN", "en"):
            with self.subTest(language=language):
                self.manifest["installer"]["language"] = language
                original_features = copy.deepcopy(self.manifest["features"])
                self.manifest["features"] += [
                    {"id": "item-" + str(i), "name": "Feature " + str(i),
                     "payload": "features/item-" + str(i), "description": "Long description. " * 15}
                    for i in range(20)]

                def scenario(ui):
                    ui["root"].geometry("600x540")
                    yield
                    self.assert_page(ui, "directory")
                    self.assertEqual(ui["action"].cget("text"), installer._UI[language]["next"])
                    self.assertEqual(ui["cancel"].cget("text"), installer._UI[language]["cancel"])
                    ui["action"].invoke()
                    yield
                    self.assert_page(ui, "features")
                    canvas = ui["canvases"]["features"]
                    self.assertGreater(canvas.bbox("all")[3], canvas.winfo_height())
                    canvas.event_generate("<MouseWheel>", delta=-120)
                    yield
                    self.assertGreater(canvas.yview()[0], 0)
                    for name, other in ui["canvases"].items():
                        if name != "features":
                            self.assertEqual(other.yview()[0], 0, name)
                    self.assertLessEqual(ui["action"].winfo_rooty() + ui["action"].winfo_height(),
                                         ui["root"].winfo_rooty() + ui["root"].winfo_height())
                    ui["action"].invoke()
                    yield
                    self.assert_page(ui, "prerequisites")
                    text = self.texts(ui["runtime_rows"]["tools-runtime"])
                    self.assertIn(installer._UI[language]["size"], text)
                    self.assertIn(installer._UI[language]["runtime_exe"], text)
                    other = "en" if language == "zh-CN" else "zh-CN"
                    self.assertNotIn(installer._UI[other]["size"], text)
                    self.assertEqual(ui["canvases"]["prerequisites"].yview()[0], 0)
                    ui["action"].invoke()
                    yield
                    self.assert_page(ui, "options")
                    self.assertIn(installer._UI[language]["startup"], self.texts(ui["contents"]["options"]))
                    ui["action"].invoke()
                    yield
                    self.assert_page(ui, "confirm")
                    self.assertEqual(ui["action"].cget("text"), installer._UI[language]["install"])
                    ui["cancel"].invoke()
                    self.engine.assert_not_called()

                self.assertEqual(self.run_wizard(scenario), 0)
                self.manifest["features"] = original_features


if __name__ == "__main__":
    unittest.main()