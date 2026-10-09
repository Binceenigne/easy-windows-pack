"""Focused CLI tests: no installs, package builds, or persistent servers."""
from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ewp_dev", PROJECT_ROOT / "scripts/dev.py")
assert SPEC is not None and SPEC.loader is not None
dev = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(dev)


class DevTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"EWP_LANG": "", "EWP_DEV_URL": "", dev.REENTRY: ""})
        environment.start()
        self.addCleanup(environment.stop)
        self.temporary = tempfile.TemporaryDirectory(prefix="ewp dev tests ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = io.StringIO()
        self.capture = redirect_stdout(self.output)
        self.capture.__enter__()
        self.addCleanup(self.capture.__exit__, None, None, None)
        self.npm = "npm.cmd" if sys.platform == "win32" else "npm"
        npm_path = patch.object(dev.shutil, "which", return_value=self.npm)
        npm_path.start()
        self.addCleanup(npm_path.stop)

    def fake_package(self, language="zh-CN"):
        (self.root / "frontend").mkdir(exist_ok=True)
        (self.root / "frontend/package.json").write_text(
            json.dumps({"scripts": {}, "ewp": {"language": language}}), encoding="utf-8")

    def fake_venv(self):
        python = dev.venv_python(self.root)
        python.parent.mkdir(parents=True)
        python.touch()
        (self.root / ".venv/pyvenv.cfg").write_text("home = placeholder\n", encoding="utf-8")
        return python

    def test_language_precedence_and_malformed_project_config(self):
        self.fake_package("en")
        self.assertEqual(dev.project_language(self.root), "en")
        with patch.dict(os.environ, {"EWP_LANG": "zh-CN"}):
            self.assertEqual(dev.project_language(self.root), "zh-CN")
            self.assertEqual(dev.project_language(self.root, "en"), "en")
        with patch.dict(os.environ, {"EWP_LANG": "invalid"}):
            self.assertEqual(dev.project_language(self.root, "invalid"), "en")
        manifest = self.root / "frontend/package.json"
        for content in ('{', '[]', '{"ewp":null}', '{"ewp":{"language":"invalid"}}'):
            manifest.write_text(content, encoding="utf-8")
            self.assertEqual(dev.project_language(self.root), "zh-CN")
        manifest.write_text('{"ewp":{"language":"en"}}', encoding="utf-8-sig")
        self.assertEqual(dev.project_language(self.root), "en")
        manifest.unlink()
        self.assertEqual(dev.project_language(self.root), "zh-CN")

    def test_help_and_parser_errors_use_only_selected_language(self):
        for language, usage, help_label, error_label, opposite in (
            ("zh-CN", "用法：", "显示帮助并退出", "错误", "show this help message"),
            ("en", "usage:", "show this help message", "error", "显示帮助并退出"),
        ):
            self.fake_package(language)
            for arguments in (["--help"], ["demo", "--help"], ["help", "demo"],
                              ["--lang", language, "demo", "--help"],
                              ["demo", "--help", f"--lang={language}"]):
                with self.subTest(language=language, arguments=arguments):
                    output = io.StringIO()
                    with redirect_stdout(output), self.assertRaises(SystemExit) as error:
                        dev.main(arguments, root=self.root)
                    self.assertEqual(error.exception.code, 0)
                    self.assertIn(usage, output.getvalue())
                    self.assertIn(help_label, output.getvalue())
                    self.assertNotIn(opposite, output.getvalue())
            for arguments, zh, en in (
                (["unknown"], "无效选项", "invalid choice"),
                (["demo", "--unknown"], "无法识别的参数", "unrecognized arguments"),
                (["browser", "--port", "abc"], "无效的整数值", "invalid int value"),
                (["browser", "--port"], "需要一个参数值", "expected one argument"),
                (["demo", "--lang", "invalid"], "无效选项", "invalid choice"),
                (["demo", "--lang"], "需要一个参数值", "expected one argument"),
            ):
                with self.subTest(language=language, arguments=arguments):
                    output = io.StringIO()
                    with redirect_stderr(output), self.assertRaises(SystemExit) as error:
                        dev.main(arguments, root=self.root)
                    self.assertEqual(error.exception.code, 2)
                    self.assertIn(usage, output.getvalue())
                    self.assertIn(error_label, output.getvalue())
                    self.assertIn(en if language == "en" else zh, output.getvalue())
                    self.assertNotIn(zh if language == "en" else en, output.getvalue())

    def test_last_language_override_and_context_are_not_leaked(self):
        self.fake_package("en")
        with patch.dict(os.environ, {"EWP_LANG": "en"}):
            self.assertEqual(dev.main(["--lang=en", "info", "--lang", "zh-CN"], root=self.root), 0)
            self.assertIn("项目目录", self.output.getvalue())
            self.assertNotIn("Project root:", self.output.getvalue())
            self.assertIsNone(dev.LANGUAGE.get())
            self.assertEqual(os.environ["EWP_LANG"], "en")
            self.output.seek(0)
            self.output.truncate(0)
            self.assertEqual(dev.main(["info"], root=self.root), 0)
            self.assertIn("Project root:", self.output.getvalue())
            self.assertNotIn("项目目录", self.output.getvalue())
        self.assertEqual(dev.language_override(["--lang=en", "--", "--lang=zh-CN"]), "en")

    def test_child_environment_preserves_dev_url_and_isolates_python(self):
        self.fake_package("en")
        with patch.dict(os.environ, {"PYTHONHOME": "foreign", "PYTHONPATH": "foreign",
                                     "EWP_DEV_URL": "http://127.0.0.1:3210/", "CUSTOM_SETTING": "keep"}):
            env = dev.child_environment(self.root)
            self.assertNotIn("PYTHONHOME", env)
            self.assertNotIn("PYTHONPATH", env)
            self.assertEqual(env["EWP_LANG"], "en")
            self.assertEqual(env["EWP_DEV_URL"], "http://127.0.0.1:3210/")
            self.assertEqual(env["CUSTOM_SETTING"], "keep")
            self.assertEqual(env["PYTHONUTF8"], "1")
            with dev.language_context(self.root, "zh-CN"):
                self.assertEqual(dev.child_environment(self.root)["EWP_LANG"], "zh-CN")
            self.assertEqual(os.environ["PYTHONPATH"], "foreign")

    def test_reentry_passes_selected_language_and_existing_dev_url(self):
        self.fake_package("en")
        self.fake_venv()
        with patch.dict(os.environ, {"EWP_DEV_URL": "http://127.0.0.1:3210/"}), \
                patch.object(dev, "in_project_venv", return_value=False), patch.object(dev, "run_command") as run:
            self.assertEqual(dev.main(["demo", "--debug", "--lang=zh-CN"], root=self.root), 0)
        self.assertEqual(run.call_args.args[0][-3:], ["demo", "--debug", "--lang=zh-CN"])
        self.assertEqual(run.call_args.kwargs["env"]["EWP_LANG"], "zh-CN")
        self.assertEqual(run.call_args.kwargs["env"]["EWP_DEV_URL"], "http://127.0.0.1:3210/")

    def test_npm_tasks_and_aliases_delegate_once_without_python_reentry(self):
        self.fake_package("en")
        for task, arguments, expected in (
            ("dev", ["--web", "--no-open", "--port", "3210"],
             ["run", "dev", "--", "--port", "3210", "--web", "--no-open"]),
            ("preview", [], ["run", "frontend:preview", "--", "--port", "0"]),
            ("frontend:preview", ["--no-open"], ["run", "frontend:preview", "--", "--port", "0", "--no-open"]),
            ("frontend:dev", [], ["run", "frontend:dev", "--", "--port", "0"]),
            ("frontend:build", [], ["run", "frontend:build"]),
            ("frontend", [], ["run", "frontend:build"]),
        ):
            with self.subTest(task=task), patch.object(dev, "reenter") as enter, \
                    patch.object(dev, "run_command") as run:
                self.assertEqual(dev.main([task, *arguments, "--lang=zh-CN"], root=self.root), 0)
            enter.assert_not_called()
            run.assert_called_once()
            self.assertEqual(run.call_args.args[0], [self.npm, *expected])
            self.assertEqual(run.call_args.kwargs["root"], self.root / "frontend")
            self.assertEqual(run.call_args.kwargs["env"]["EWP_LANG"], "zh-CN")
        for task in ("dev", "preview"):
            with patch.object(dev, "run_npm") as run:
                self.assertEqual(dev.main([task, "--port", "65536"], root=self.root), 1)
            run.assert_not_called()

    def test_full_build_alias_uses_the_same_python_stages(self):
        with patch.object(dev.sys, "platform", "win32"), patch.object(dev, "reenter", return_value=False), \
                patch.object(dev, "run_task") as run:
            self.assertEqual(dev.main(["full-build", "--lang=en"], root=self.root), 0)
        self.assertEqual([call.args[0] for call in run.call_args_list], ["test", "wheel", "exe", "bundle"])
        self.assertIn("Full build", dev.parser(self.root, "en").format_help())

    def test_build_defaults_to_exe_and_explicit_targets_dispatch_once(self):
        for arguments, expected in (
            (["build"], ["exe"]), (["build", "--exe"], ["exe"]),
            (["build", "-e"], ["exe"]), (["build", "--wheel"], ["wheel"]),
            (["build", "-w"], ["wheel"]),
            (["build", "--all"], ["test", "wheel", "exe", "bundle"]),
            (["build:all"], ["test", "wheel", "exe", "bundle"]),
        ):
            with self.subTest(arguments=arguments), patch.object(dev.sys, "platform", "win32"), \
                    patch.object(dev, "reenter", return_value=False), patch.object(dev, "run_task") as run:
                self.assertEqual(dev.main(arguments, root=self.root), 0)
            self.assertEqual([call.args[0] for call in run.call_args_list], expected)
        with patch.object(dev.sys, "platform", "linux"), patch.object(dev, "reenter", return_value=False), \
                patch.object(dev, "run_task") as run:
            self.assertEqual(dev.main(["build", "--wheel"], root=self.root), 0)
        run.assert_called_once()
        for language, expected in (("zh-CN", "不能与参数"), ("en", "not allowed with argument")):
            output = io.StringIO()
            with redirect_stderr(output), self.assertRaises(SystemExit) as error:
                dev.main(["build", "--wheel", "--all", "--lang", language], root=self.root)
            self.assertEqual(error.exception.code, 2)
            self.assertIn(expected, output.getvalue())

    def test_check_delegates_to_runtime_without_python_reentry(self):
        self.fake_package("en")
        with patch.object(dev, "reenter") as enter, patch.object(dev, "run_command") as run:
            self.assertEqual(dev.main(["check"], root=self.root), 0)
        enter.assert_not_called()
        self.assertEqual(run.call_args.args[0], [self.npm, "run", "ewp", "--", "check"])
        self.assertEqual(run.call_args.kwargs["env"]["EWP_LANG"], "en")

    def test_explicit_menu_retains_language_for_selected_tasks(self):
        self.fake_package("zh-CN")
        with patch("builtins.input", side_effect=["bad", "10", "0"]) as prompt:
            self.assertEqual(dev.main(["menu", "--lang=en"], root=self.root), 0)
        output = self.output.getvalue()
        self.assertIn("Development menu", output)
        self.assertIn("Invalid choice", output)
        self.assertIn("Project root:", output)
        self.assertNotIn("开发菜单", output)
        self.assertTrue(all(call.args[0] == "Select: " for call in prompt.call_args_list))

    def test_metadata_cleanup_requires_verified_replacement_and_preserves_source(self):
        legacy = self.root / "easy_windows_pack.egg-info"
        current = self.root / "backend/base/easy_windows_pack.egg-info"
        legacy.mkdir()
        (legacy / "PKG-INFO").write_text("Name: easy-windows-pack\n", encoding="utf-8")
        dev.cleanup_legacy_metadata(self.root)
        self.assertTrue(legacy.is_dir())
        current.mkdir(parents=True)
        (current / "PKG-INFO").write_text("Name: easy-windows-pack\n", encoding="utf-8")
        source = legacy / "keep.py"
        source.write_text("# source", encoding="utf-8")
        dev.cleanup_legacy_metadata(self.root)
        self.assertTrue(source.is_file())
        source.unlink()
        (legacy / "PKG-INFO").write_text("Name: other-package\n", encoding="utf-8")
        dev.cleanup_legacy_metadata(self.root)
        self.assertTrue(legacy.is_dir())
        (legacy / "PKG-INFO").write_text("Name: easy-windows-pack\n", encoding="utf-8")
        dev.cleanup_legacy_metadata(self.root)
        self.assertFalse(legacy.exists())
        self.assertTrue((current / "PKG-INFO").is_file())

    def test_init_failure_does_not_retire_legacy_metadata(self):
        self.fake_venv()
        with patch.object(dev, "run_command", side_effect=dev.DevError("failed", 19)), \
                patch.object(dev, "cleanup_legacy_metadata") as cleanup:
            self.assertEqual(dev.main(["init"], root=self.root), 19)
        cleanup.assert_not_called()

    @unittest.skipUnless(os.name == "nt", "Requires Windows junctions")
    def test_metadata_cleanup_never_follows_a_root_junction(self):
        external = self.root / "external"
        external.mkdir()
        (external / "PKG-INFO").write_text("Name: easy-windows-pack\n", encoding="utf-8")
        current = self.root / "backend/base/easy_windows_pack.egg-info"
        current.mkdir(parents=True)
        (current / "PKG-INFO").write_text("Name: easy-windows-pack\n", encoding="utf-8")
        legacy = self.root / "easy_windows_pack.egg-info"
        subprocess.run(["cmd", "/d", "/c", "mklink", "/J", str(legacy), str(external)],
                       check=True, capture_output=True)
        try:
            dev.cleanup_legacy_metadata(self.root)
            self.assertTrue((external / "PKG-INFO").is_file())
            self.assertTrue(legacy.exists())
        finally:
            legacy.rmdir()

    def test_real_child_inherits_language_and_dev_url_without_logging(self):
        self.fake_package("en")
        marker = self.root / "child-env.json"
        command = [sys.executable, "-c",
                   "import json,os,pathlib,sys; pathlib.Path(sys.argv[1]).write_text("
                   "json.dumps({key:os.environ.get(key) for key in "
                   "('EWP_LANG','EWP_DEV_URL','PYTHONHOME','PYTHONPATH')}), encoding='utf-8')", str(marker)]
        with patch.dict(os.environ, {"EWP_DEV_URL": "http://127.0.0.1:3210/", "PYTHONPATH": "foreign"}):
            dev.run_command(command, root=self.root)
        self.assertEqual(json.loads(marker.read_text(encoding="utf-8")), {
            "EWP_LANG": "en", "EWP_DEV_URL": "http://127.0.0.1:3210/", "PYTHONHOME": None, "PYTHONPATH": None,
        })
        self.assertIn("Run:", self.output.getvalue())
        self.assertNotIn("执行：", self.output.getvalue())

    def test_missing_environment_is_actionable_and_info_is_read_only(self):
        for command in ("demo", "wheel", "bundle", "test"):
            with self.subTest(command=command):
                self.assertNotEqual(dev.main([command], root=self.root), 0)
        self.assertIn("startup.cmd init", self.output.getvalue())
        self.assertEqual(dev.main(["info"], root=self.root), 0)
        self.assertFalse((self.root / "output").exists())

    def test_reentry_is_bounded_and_forwards_arguments(self):
        python = self.fake_venv()
        with patch.object(dev, "in_project_venv", return_value=False), \
                patch.dict(os.environ, {dev.REENTRY: str(self.root.resolve())}):
            with self.assertRaises(dev.DevError):
                dev.reenter(self.root, ["test"])
        with patch.object(dev, "in_project_venv", return_value=False), \
                patch.dict(os.environ, {dev.REENTRY: ""}), \
                patch.object(dev, "run_command") as run:
            self.assertTrue(dev.reenter(self.root, ["demo", "--debug"]))
            self.assertEqual(run.call_args.args[0],
                             [str(python), "-u", str(self.root / "scripts/dev.py"), "demo", "--debug"])
            self.assertEqual(run.call_args.kwargs["env"][dev.REENTRY], str(self.root.resolve()))

    def test_init_keeps_existing_environment_and_installs_with_its_python(self):
        python = self.fake_venv()
        marker = self.root / ".venv/keep.txt"
        marker.write_text("keep", encoding="utf-8")
        with patch.object(dev, "run_command") as run:
            self.assertEqual(dev.main(["init"], root=self.root), 0)
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(len(commands), 2)
        self.assertTrue(all(command[0] == str(python) for command in commands))
        self.assertEqual(commands[-1][1:], ["-m", "pip", "install", "-e", ".[dev,tray]"])
        self.assertEqual(run.call_args.kwargs["env"]["PIP_REQUIRE_VIRTUALENV"], "true")
        self.assertEqual(marker.read_text(encoding="utf-8"), "keep")
        self.assertIn("3/3 100%", self.output.getvalue())

    def test_clean_init_builds_frontend_before_pip_when_manifest_exists(self):
        self.fake_package()
        self.assertFalse((self.root / ".venv").exists())
        compiled = self.root / "output/frontend/index.html"
        self.assertFalse(compiled.exists())

        def run(command, **kwargs):
            if command[1:3] == ["-m", "venv"]:
                self.fake_venv()
            elif command[1] == "-c":
                self.assertTrue(dev.require_venv(self.root).is_file())
            elif command == [self.npm, "install"]:
                (self.root / "frontend/node_modules").mkdir()
            elif command == [self.npm, "run", "frontend:build"]:
                self.assertTrue((self.root / "frontend/node_modules").is_dir())
                compiled.parent.mkdir(parents=True)
                compiled.write_text("<html>built</html>", encoding="utf-8")
            elif "pip" in command:
                self.assertTrue(compiled.is_file(), "editable metadata requires compiled frontend")

        with patch.object(dev, "run_command", side_effect=run) as child:
            self.assertEqual(dev.main(["init"], root=self.root), 0)
        commands = [call.args[0] for call in child.call_args_list]
        self.assertEqual(len(commands), 5)
        self.assertEqual(commands[0], [sys.executable, "-m", "venv", str(self.root / ".venv")])
        self.assertEqual(commands[1][0:2], [str(dev.venv_python(self.root)), "-c"])
        self.assertEqual(commands[2:4], [[self.npm, "install"], [self.npm, "run", "frontend:build"]])
        self.assertEqual(commands[-1], [str(dev.venv_python(self.root)), "-m", "pip", "install", "-e", ".[dev,tray]"])
        self.assertEqual(child.call_args.kwargs["env"]["PIP_REQUIRE_VIRTUALENV"], "true")
        for call in child.call_args_list:
            expected = self.root / "frontend" if call.args[0][0] == self.npm else self.root
            self.assertEqual(call.kwargs["root"], expected)
        text = self.output.getvalue()
        for label in ("创建或复用环境", "检查解释器", "安装前端依赖", "构建前端", "安装开发依赖"):
            self.assertIn(label, text)
        self.assertNotIn("Starting:", text)
        self.assertNotIn("Create or reuse environment", text)
        self.assertIn("5/5 100%", text)

    def test_init_reuses_environment_and_builds_frontend_before_pip(self):
        self.fake_venv()
        self.fake_package()
        with patch.object(dev, "run_command") as run:
            self.assertEqual(dev.main(["init"], root=self.root), 0)
        self.assertEqual(len(run.call_args_list), 4)
        self.assertEqual([call.args[0] for call in run.call_args_list[1:3]],
                         [[self.npm, "install"], [self.npm, "run", "frontend:build"]])
        self.assertEqual(run.call_args.args[0][1:],
                         ["-m", "pip", "install", "-e", ".[dev,tray]"])
        self.assertEqual(run.call_args.kwargs["root"], self.root)
        self.assertIn("5/5 100%", self.output.getvalue())

    def test_init_stops_on_verify_npm_build_or_pip_failure_with_child_exit_code(self):
        self.fake_venv()
        self.fake_package()
        for failed_command, expected_calls, completed in (("verify", 1, 1), ("npm", 2, 2),
                                                         ("build", 3, 3), ("pip", 4, 4)):
            with self.subTest(failed_command=failed_command):
                self.output.truncate(0)
                self.output.seek(0)

                def fail(command, **kwargs):
                    if ((failed_command == "verify" and command[1] == "-c") or
                            (failed_command == "pip" and "pip" in command) or
                            (failed_command == "npm" and command == [self.npm, "install"]) or
                            (failed_command == "build" and command == [self.npm, "run", "frontend:build"])):
                        raise dev.DevError("dependency install failed", 17)

                with patch.object(dev, "run_command", side_effect=fail) as run:
                    self.assertEqual(dev.main(["init"], root=self.root), 17)
                self.assertEqual(run.call_count, expected_calls)
                if failed_command != "pip":
                    self.assertFalse(any("pip" in call.args[0] for call in run.call_args_list))
                self.assertIn(f"失败或中断（{completed}/5）", self.output.getvalue())
                self.assertNotIn("100%", self.output.getvalue())

    def test_init_does_not_replace_broken_environment(self):
        (self.root / ".venv").mkdir()
        marker = self.root / ".venv/keep"
        marker.touch()
        with patch.object(dev, "run_command") as run:
            self.assertEqual(dev.main(["init"], root=self.root), 1)
        run.assert_not_called()
        self.assertTrue(marker.exists())
        self.assertNotIn("100%", self.output.getvalue())

    def test_init_creation_failure_stops_before_install(self):
        with patch.object(dev, "run_command", side_effect=dev.DevError("creation failed", 9)) as run:
            self.assertEqual(dev.main(["init"], root=self.root), 9)
        self.assertEqual(run.call_args.args[0], [sys.executable, "-m", "venv", str(self.root / ".venv")])
        run.assert_called_once()
        self.assertNotIn("100%", self.output.getvalue())

    def test_build_failure_keeps_real_progress_and_stops_later_tasks(self):
        self.fake_package()
        def run(command, **kwargs):
            if command[2] == "build":
                raise dev.DevError("wheel failed", 7)

        with patch.object(dev.sys, "platform", "win32"), \
                patch.object(dev, "reenter", return_value=False), \
                patch.object(dev, "run_command", side_effect=run) as child:
            self.assertEqual(dev.main(["full-build"], root=self.root), 7)
        self.assertEqual([call.args[0] for call in child.call_args_list], [
            dev.task_command("test", self.root), [self.npm, "run", "frontend:build"],
            dev.task_command("wheel", self.root),
        ])
        text = self.output.getvalue()
        self.assertIn("0/4 0%", text)
        self.assertIn("1/4 25%", text)
        self.assertNotIn("100%", text)
        logs = list((self.root / "output/logs").glob("*.log"))
        self.assertEqual(len(logs), 1)
        self.assertIn("wheel failed", logs[0].read_text(encoding="utf-8"))

    def test_successful_build_order_and_artifact_boundaries(self):
        self.fake_package()
        core = self.root / "backend/base/ewpcore"
        core.mkdir(parents=True)
        (core / "__init__.py").write_text("# core", encoding="utf-8")
        artifact = self.root / "output/exe/easy-windows-pack-demo.exe"
        artifact.parent.mkdir(parents=True)
        artifact.write_bytes(b"MZ-test")
        with patch.object(dev.sys, "platform", "win32"), \
            patch.object(dev, "check_packager"), \
                patch.object(dev, "reenter", return_value=False), \
                patch.object(dev, "run_command") as run:
            self.assertEqual(dev.main(["full-build"], root=self.root), 0)
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(commands, [
            dev.task_command("test", self.root), [self.npm, "run", "frontend:build"],
            dev.task_command("wheel", self.root), [self.npm, "run", "frontend:build"],
            dev.task_command("exe", self.root), dev.task_command("bundle", self.root),
        ])
        for call in run.call_args_list:
            expected = self.root / "frontend" if call.args[0][0] == self.npm else self.root
            self.assertEqual(call.kwargs["root"], expected)
        self.assertTrue(all(command[0] == str(dev.venv_python(self.root)) for command in
                            (commands[0], commands[2], commands[4], commands[5])))
        self.assertEqual(commands[2][3:], ["--wheel", "--no-isolation", "--outdir", str(self.root / "output/wheels"), str(self.root)])
        exe = commands[4]
        for flag, value in {
            "--name": "easy-windows-pack-demo", "--paths": str(self.root / "build/exe-src"),
            "--specpath": str(self.root / "build/spec"), "--workpath": str(self.root / "build/pyinstaller"),
            "--distpath": str(self.root / "output/exe"),
            "--add-data": f"{self.root / 'output/frontend'};output/frontend",
        }.items():
            self.assertEqual(exe[exe.index(flag) + 1], value)
        self.assertIn("--onefile", exe)
        self.assertIn("--windowed", exe)
        self.assertEqual(exe[-1], str(self.root / "backend/src/demo.py"))
        self.assertEqual(exe.count("--add-data"), 1)
        self.assertEqual(commands[5][3:], ["bundle", "--output-dir", str(self.root / "output/bundles")])
        self.assertIn("4/4 100%", self.output.getvalue())
        self.assertTrue((self.root / "build/exe-src/easy_windows_pack/__init__.py").is_file())

    def test_exe_staging_removes_stale_modules_and_caches(self):
        source = self.root / "backend/base/ewpcore"
        source.mkdir(parents=True)
        (source / "__init__.py").write_text("# latest", encoding="utf-8")
        (source / "stale.pyc").touch()
        destination = self.root / "build/exe-src/easy_windows_pack"
        destination.mkdir(parents=True)
        (destination / "removed.py").touch()
        dev.prepare_exe_sources(self.root)
        self.assertEqual([p.name for p in destination.iterdir()], ["__init__.py"])

    def test_exe_missing_after_compilation_does_not_report_success(self):
        self.fake_package()
        with patch.object(dev, "check_packager"), \
                patch.object(dev, "prepare_exe_sources"), \
                patch.object(dev, "run_command"):
            with self.assertRaisesRegex(dev.DevError, "EXE 产物不存在或不可读"):
                dev.run_task("exe", self.root, None)

    def test_non_windows_full_build_fails_before_starting(self):
        with patch.object(dev.sys, "platform", "linux"), patch.object(dev, "reenter") as enter:
            self.assertEqual(dev.main(["exe"], root=self.root), 1)
            self.assertEqual(dev.main(["build"], root=self.root), 1)
            self.assertEqual(dev.main(["full-build"], root=self.root), 1)
        enter.assert_not_called()
        self.assertIn("Windows", self.output.getvalue())

    def test_demo_debug_and_test_do_not_create_build_logs(self):
        self.fake_package()
        with patch.dict(os.environ, {"EWP_DEV_URL": ""}), \
                patch.object(dev, "reenter", return_value=False), patch.object(dev, "run_command") as run:
            self.assertEqual(dev.main(["demo", "--debug"], root=self.root), 0)
            self.assertEqual(run.call_args_list[0].args[0], [self.npm, "run", "frontend:build"])
            self.assertEqual(run.call_args.args[0][-2:], [str(self.root / "backend/src/demo.py"), "--debug"])
            self.assertEqual(dev.main(["test"], root=self.root), 0)
            self.assertEqual(run.call_args.args[0][1:], ["-m", "unittest", "discover", "-s", "tests", "-v"])
        self.assertFalse((self.root / "output").exists())

    def test_demo_uses_existing_dev_url_without_building(self):
        with patch.dict(os.environ, {"EWP_DEV_URL": "http://127.0.0.1:54321/"}), \
                patch.object(dev, "reenter", return_value=False), patch.object(dev, "run_command") as run:
            self.assertEqual(dev.main(["demo"], root=self.root), 0)
            self.assertEqual(dev.child_environment()["EWP_DEV_URL"], "http://127.0.0.1:54321/")
        run.assert_called_once_with(
            [str(dev.venv_python(self.root)), str(self.root / "backend/src/demo.py")], root=self.root)

    def test_frontend_failure_stops_demo_wheel_exe_and_full_build(self):
        self.fake_package()
        for task in ("demo", "wheel", "exe", "build", "full-build"):
            with self.subTest(task=task):
                self.output.truncate(0)
                self.output.seek(0)

                def fail(command, **kwargs):
                    if command[0] == self.npm:
                        raise dev.DevError("frontend failed", 23)

                with patch.dict(os.environ, {"EWP_DEV_URL": ""}), \
                        patch.object(dev.sys, "platform", "win32"), \
                        patch.object(dev, "reenter", return_value=False), \
                        patch.object(dev, "check_packager") as check, \
                        patch.object(dev, "prepare_exe_sources") as stage, \
                        patch.object(dev, "run_command", side_effect=fail) as run:
                    self.assertEqual(dev.main([task], root=self.root), 23)
                check.assert_not_called()
                stage.assert_not_called()
                self.assertEqual(run.call_count, 2 if task == "full-build" else 1)
                self.assertNotIn("100%", self.output.getvalue())
                if task == "full-build":
                    self.assertIn("失败或中断（1/4）", self.output.getvalue())

    def test_exe_builds_frontend_before_packager_and_core_staging(self):
        events = []
        artifact = self.root / "output/exe/easy-windows-pack-demo.exe"
        artifact.parent.mkdir(parents=True)
        artifact.write_bytes(b"MZ-demo")
        with patch.object(dev, "build_frontend", side_effect=lambda *args: events.append("frontend")), \
                patch.object(dev, "check_packager", side_effect=lambda: events.append("check")), \
                patch.object(dev, "prepare_exe_sources", side_effect=lambda *args: events.append("core")), \
                patch.object(dev, "run_command", side_effect=lambda *args, **kwargs: events.append("exe")):
            dev.run_task("exe", self.root, None)
        self.assertEqual(events, ["frontend", "check", "core", "exe"])

    def test_real_child_output_unicode_failure_and_space_arguments(self):
        log = io.StringIO()
        command = [sys.executable, "-u", "-c",
                   "import sys; print(sys.argv[1], flush=True); print('stderr text', file=sys.stderr); sys.exit(7)",
                   "中文 path with spaces"]
        with self.assertRaises(dev.DevError) as caught:
            dev.run_command(command, root=self.root, log=log)
        self.assertEqual(caught.exception.code, 7)
        self.assertIn("中文 path with spaces", log.getvalue())
        self.assertIn("stderr text", log.getvalue())
        self.assertIn("stderr text", self.output.getvalue())

    def test_interrupt_cleans_up_child_and_returns_130(self):
        with patch.object(dev, "reenter", return_value=False), \
                patch.object(dev.subprocess, "Popen") as spawn, \
                patch.object(dev, "stop_process") as stop:
            process = spawn.return_value
            process.stdout = None
            process.wait.side_effect = KeyboardInterrupt
            self.assertEqual(dev.main(["test"], root=self.root), 130)
            stop.assert_called_once_with(process)

    def test_stop_process_reaps_a_real_child(self):
        kwargs = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
        process = subprocess.Popen([sys.executable, "-c", "import sys; sys.stdin.read()"], stdin=subprocess.PIPE, **kwargs)
        try:
            dev.stop_process(process)
            self.assertIsNotNone(process.poll())
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stdin.close()

    def test_menu_failure_retry_exit_and_eof(self):
        with patch("builtins.input", side_effect=["bad", "8", "9", "0"]), \
                patch.object(dev, "execute", side_effect=[7, 0]) as execute:
            self.assertEqual(dev.main([], root=self.root), 0)
            self.assertEqual(execute.call_count, 2)
        self.assertIn("任务失败，可重试（退出码 7）", self.output.getvalue())
        self.assertNotIn("Task failed", self.output.getvalue())
        with patch("builtins.input", side_effect=EOFError):
            self.assertEqual(dev.main([], root=self.root), 0)

    def test_browser_options_stop_and_invalid_port(self):
        self.fake_package()
        with patch.object(dev, "reenter") as enter, patch.object(dev, "make_server") as create, \
                patch.object(dev, "run_command") as run:
            self.assertEqual(dev.main(["browser", "--no-open", "--port", "12345"], root=self.root), 0)
            self.assertEqual(run.call_args.args[0],
                             [self.npm, "run", "frontend:dev", "--", "--port", "12345", "--no-open"])
            self.assertEqual(run.call_args.kwargs,
                             {"root": self.root / "frontend", "log": None, "env": dev.child_environment(self.root)})
            run.assert_called_once()
            enter.assert_not_called()
            create.assert_not_called()
            run.reset_mock()
            self.assertEqual(dev.main(["browser"], root=self.root), 0)
            self.assertEqual(run.call_args.args[0],
                             [self.npm, "run", "frontend:dev", "--", "--port", "0"])
            run.reset_mock()
            self.assertEqual(dev.main(["browser", "--port", "-1"], root=self.root), 1)
            self.assertEqual(dev.main(["browser", "--port", "65536"], root=self.root), 1)
            run.assert_not_called()
        with patch.object(dev, "run_command", side_effect=KeyboardInterrupt):
            self.assertEqual(dev.main(["browser", "--no-open"], root=self.root), 130)

    def test_frontend_command_and_menu_need_no_python_venv(self):
        self.fake_package()
        with patch.object(dev, "reenter") as enter, patch.object(dev, "run_command") as run:
            self.assertEqual(dev.main(["frontend"], root=self.root), 0)
        enter.assert_not_called()
        self.assertEqual(run.call_args.args[0], [self.npm, "run", "frontend:build"])
        self.assertEqual(run.call_args.kwargs["root"], self.root / "frontend")
        self.assertIn("构建前端", self.output.getvalue())
        self.assertNotIn("Build frontend", self.output.getvalue())
        with patch("builtins.input", side_effect=[str(list(dev.LABELS).index("frontend") + 1), "0"]), \
                patch.object(dev, "execute", return_value=0) as execute:
            self.assertEqual(dev.main([], root=self.root), 0)
        self.assertEqual(execute.call_args.args[1], ["frontend"])

    def test_npm_resolution_on_windows_and_linux_and_missing_npm(self):
        self.fake_package()
        for platform, executable in (("win32", "npm.cmd"), ("linux", "npm")):
            with self.subTest(platform=platform), patch.object(dev.sys, "platform", platform), \
                    patch.object(dev.shutil, "which", return_value=executable) as which, \
                    patch.object(dev, "run_command") as run:
                dev.build_frontend(self.root)
                which.assert_called_once_with(executable)
                run.assert_called_once_with([executable, "run", "frontend:build"], root=self.root / "frontend",
                                            log=None, env=dev.child_environment(self.root))
        with patch.object(dev.shutil, "which", return_value=None), patch.object(dev, "run_command") as run:
            self.assertEqual(dev.main(["frontend"], root=self.root), 1)
        run.assert_not_called()
        self.assertIn("缺少 npm，请安装 Node.js 并重新打开终端", self.output.getvalue())
        self.assertNotIn("Missing npm", self.output.getvalue())

    def test_npm_requires_frontend_manifest_before_lookup_or_execution(self):
        # Neither a stale root manifest nor a workspace child is the frontend project.
        (self.root / "package.json").touch()
        nested = self.root / "frontend/packages/child"
        nested.mkdir(parents=True)
        (nested / "package.json").touch()
        with patch.object(dev.shutil, "which") as which, patch.object(dev, "run_command") as run:
            with self.assertRaisesRegex(dev.DevError, "缺少 frontend/package.json"):
                dev.run_npm(self.root, ["install"])
        which.assert_not_called()
        run.assert_not_called()

    def test_windows_batch_quotes_literal_tokens_and_rejects_expansion(self):
        with patch.object(dev.sys, "platform", "win32"):
            command = dev.process_command([r"C:\Node & tools!\npm.cmd", "run", "frontend:dev", "--", "--port", "123"])
            self.assertIsInstance(command, str)
            self.assertIn('/d /s /v:off /c ""C:\\Node & tools!\\npm.cmd" "run"', command)
            self.assertTrue(command.endswith('"123""'))
            for token in ('a"b', "a%b", "a\nb", "a\rb", "a\0b"):
                with self.subTest(token=repr(token)), self.assertRaises(dev.DevError):
                    dev.process_command(["npm.cmd", token])
            unsafe = self.root / "project%PATH%"
            (unsafe / "frontend").mkdir(parents=True)
            (unsafe / "frontend/package.json").touch()
            with patch.object(dev, "run_command") as run, self.assertRaises(dev.DevError):
                dev.run_npm(unsafe, ["install"])
            run.assert_not_called()
        with patch.object(dev.sys, "platform", "linux"):
            self.assertEqual(dev.process_command(["npm", "run", "frontend:build"]),
                             ["npm", "run", "frontend:build"])

    @unittest.skipUnless(os.name == "nt", "Requires real Windows cmd.exe")
    def test_real_windows_batch_handles_spaces_metacharacters_and_failure(self):
        directory = self.root / "Node & tools!"
        directory.mkdir()
        batch = directory / "fake npm.cmd"
        batch.write_bytes(b'@echo off\r\necho [%~1] [%~2] [%~3] [%~4] [%~5] [%~6]\r\nexit /b 19\r\n')
        log = io.StringIO()
        with self.assertRaises(dev.DevError) as error:
            dev.run_command([str(batch), "run", "frontend:dev", "--", "--port", "123", "--no-open"],
                            root=directory, log=log)
        self.assertEqual(error.exception.code, 19)
        self.assertIn("[run] [frontend:dev] [--] [--port] [123] [--no-open]", log.getvalue())

    def test_http_only_serves_frontend_even_for_traversal(self):
        frontend = self.root / "frontend"
        (frontend / "src").mkdir(parents=True)
        (frontend / "src/index.html").write_text("frontend page", encoding="utf-8")
        (self.root / ".venv").mkdir()
        (self.root / ".venv/secret.txt").write_text("private-secret", encoding="utf-8")
        (self.root / "repository.txt").write_text("private-secret", encoding="utf-8")
        server = dev.make_server(self.root)
        self.assertEqual(server.server_address[0], "127.0.0.1")
        worker = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        worker.start()
        try:
            for path, expected in (("/src/index.html", 200), ("/", 403),
                                   ("/repository.txt", 404), ("/../.venv/secret.txt", 404),
                                   ("/%2e%2e/.venv/secret.txt", 404), ("/src/../../repository.txt", 404)):
                with self.subTest(path=path):
                    connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
                    try:
                        connection.request("GET", path)
                        response = connection.getresponse()
                        self.assertEqual(response.status, expected)
                        self.assertNotIn(b"private-secret", response.read())
                    finally:
                        connection.close()
        finally:
            server.shutdown()
            worker.join(timeout=3)
            server.server_close()
        self.assertFalse(worker.is_alive())

    def test_http_rejects_symlink_escape_including_directory_index(self):
        frontend = self.root / "frontend"
        (frontend / "src").mkdir(parents=True)
        secret = self.root / "secret.txt"
        secret.write_text("private-secret", encoding="utf-8")
        try:
            (frontend / "escape.txt").symlink_to(secret)
            (frontend / "src/index.html").symlink_to(secret)
        except OSError:
            self.skipTest("Symlink creation unavailable on this Windows account")
        with dev.make_server(self.root) as server:
            worker = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
            worker.start()
            try:
                for path in ("/escape.txt", "/src/"):
                    connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
                    try:
                        connection.request("GET", path)
                        response = connection.getresponse()
                        self.assertEqual(response.status, 403)
                        self.assertNotIn(b"private-secret", response.read())
                    finally:
                        connection.close()
            finally:
                server.shutdown()
                worker.join(timeout=3)

    def test_launcher_is_ascii_crlf_and_propagates_exit_code(self):
        for launcher in ("startup.cmd", "scripts/startup.cmd", "scripts/build.cmd"):
            with self.subTest(launcher=launcher):
                content = (PROJECT_ROOT / launcher).read_bytes()
                content.decode("ascii")
                self.assertNotIn(b"\n", content.replace(b"\r\n", b""))
                if os.name == "nt":
                    # Harmless real launch from another cwd; parser errors need no environment.
                    result = subprocess.run(["cmd.exe", "/d", "/c", str(PROJECT_ROOT / launcher), "unknown-command"],
                                            cwd=self.root, capture_output=True)
                    self.assertEqual(result.returncode, 2, result.stdout + result.stderr)

    @unittest.skipUnless(os.name == "nt", "Requires real Windows cmd.exe")
    def test_startup_forwards_options_and_uses_project_root_from_another_cwd(self):
        result = subprocess.run(
            ["cmd.exe", "/d", "/c", str(PROJECT_ROOT / "startup.cmd"), "info"],
            cwd=self.root, capture_output=True, encoding="utf-8",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(str(PROJECT_ROOT), result.stdout)
        self.assertIn(str(dev.venv_python(PROJECT_ROOT)), result.stdout)
        result = subprocess.run(
            ["cmd.exe", "/d", "/c", str(PROJECT_ROOT / "startup.cmd"), "browser", "--port", "-1"],
            cwd=self.root, capture_output=True, encoding="utf-8",
        )
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("端口必须为", result.stdout)

    @unittest.skipUnless(os.name == "nt", "Requires Windows PowerShell")
    def test_missing_python_startup_fallback_resolves_language_and_returns_failure(self):
        scripts = self.root / "scripts"
        scripts.mkdir()
        source = (PROJECT_ROOT / "scripts/startup.cmd").read_bytes()
        # Force just the executable probes to fail while exercising actual CMD/PowerShell logic.
        source = source.replace(b"where py >nul 2>nul", b"cmd /d /c exit 1")
        source = source.replace(b"where python >nul 2>nul", b"cmd /d /c exit 1")
        launcher = scripts / "startup.cmd"
        launcher.write_bytes(source)
        for configured, inherited, arguments, selected in (
            ("en", "", ["info"], "en"),
            ("zh-CN", "", ["info"], "zh-CN"),
            ("en", "zh-CN", ["info"], "zh-CN"),
            ("zh-CN", "en", ["info"], "en"),
            ("en", "en", ["info", "--lang", "zh-CN"], "zh-CN"),
            ("zh-CN", "zh-CN", ["--lang=en", "info"], "en"),
            ("en", "", ["info", "--lang=zh-CN", "--lang=en"], "en"),
            ("en", "", ["info", "--lang=zh-CN", "--lang=invalid"], "en"),
            ("en", "", ["info", "--", "--lang=zh-CN"], "en"),
        ):
            with self.subTest(configured=configured, inherited=inherited, arguments=arguments):
                self.fake_package(configured)
                env = os.environ.copy()
                env["EWP_LANG"] = inherited
                result = subprocess.run(["cmd.exe", "/d", "/c", str(launcher), *arguments],
                                        cwd=PROJECT_ROOT, capture_output=True, encoding="utf-8", env=env)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stderr, "")
                self.assertIn("startup.cmd init", result.stdout)
                if selected == "en":
                    self.assertIn("Python 3.10 or newer is required", result.stdout)
                    self.assertNotIn("需要", result.stdout)
                else:
                    self.assertIn("需要 Python 3.10 或以上", result.stdout)
                    self.assertNotIn("or newer is required", result.stdout)

    @unittest.skipUnless(os.name == "nt", "Requires real Windows cmd.exe")
    def test_startup_help_errors_and_explicit_menu_follow_language(self):
        for language, usage, error_text, menu_text, opposite in (
            ("zh-CN", "用法：", "无效选项", "开发菜单", "Development menu"),
            ("en", "usage:", "invalid choice", "Development menu", "开发菜单"),
        ):
            for arguments, code, text in ((["demo", "--help"], 0, usage),
                                          (["invalid"], 2, error_text),
                                          (["menu"], 0, menu_text)):
                with self.subTest(language=language, arguments=arguments):
                    result = subprocess.run(
                        ["cmd.exe", "/d", "/c", str(PROJECT_ROOT / "startup.cmd"), *arguments, "--lang", language],
                        cwd=self.root, input="0\n", capture_output=True, encoding="utf-8")
                    self.assertEqual(result.returncode, code, result.stdout + result.stderr)
                    self.assertIn(text, result.stdout + result.stderr)
                    self.assertNotIn(opposite, result.stdout + result.stderr)

    @unittest.skipUnless(os.name == "nt", "Requires Windows PowerShell")
    def test_powershell_demo_wrapper_propagates_child_failure(self):
        batch = self.root / "fake python.cmd"
        batch.write_bytes(b"@echo off\r\nexit /b 29\r\n")
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
             str(PROJECT_ROOT / "scripts/build-demo.ps1"), "-Python", str(batch)],
            cwd=self.root, capture_output=True,
        )
        self.assertEqual(result.returncode, 29, result.stdout + result.stderr)
        self.assertNotIn(b"Demo EXE:", result.stdout)

    @unittest.skipUnless(os.name == "nt", "Requires Windows PowerShell")
    def test_powershell_build_wrapper_uses_project_root_and_propagates_failure(self):
        batch = self.root / "fake python.cmd"
        batch.write_bytes(b"@echo off\r\necho [%CD%]\r\necho [%*]\r\nexit /b 29\r\n")
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
             str(PROJECT_ROOT / "scripts/build.ps1"), "-Command", "build", "-SkipTests",
             "-SkipWheel", "-OutputDir", "output/custom artifacts", "-Python", str(batch)],
            cwd=self.root, capture_output=True,
        )
        self.assertEqual(result.returncode, 29, result.stdout + result.stderr)
        self.assertIn(str(PROJECT_ROOT).lower().encode(), result.stdout.lower())
        self.assertIn(b"-m easy_windows_pack.cli build", result.stdout)
        self.assertIn(b'--output-dir "output/custom artifacts" --skip-tests --skip-wheel', result.stdout)


if __name__ == "__main__":
    unittest.main()