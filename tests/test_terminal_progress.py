"""Terminal viewport behavior without installations or builds."""
from contextlib import redirect_stdout
import importlib.util
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("ewp_progress_dev", Path(__file__).resolve().parents[1] / "scripts/dev.py")
assert SPEC is not None and SPEC.loader is not None
dev = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(dev)


class Terminal(io.StringIO):
    encoding = "utf-8"

    def isatty(self):
        return True


class TerminalProgressTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="ewp terminal ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = Terminal()
        self.restore_calls = []
        self.size = (80, 24)
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, {"EWP_LANG": "en", "TERM": "xterm-256color"}).start()
        for name in ("NO_COLOR", "FORCE_COLOR", "EWP_PROGRESS", "EWP_PROGRESS_ACTIVE"):
            os.environ.pop(name, None)
        # Restore all removals after each test, too.
        patch.object(dev.TerminalProgress, "_size", lambda terminal: self.size).start()

        def enable(terminal):
            terminal._restore_console = lambda: self.restore_calls.append(True)
            return True

        patch.object(dev.TerminalProgress, "_enable_vt", enable).start()
        capture = redirect_stdout(self.output)
        capture.__enter__()
        self.addCleanup(capture.__exit__, None, None, None)

    def test_footer_reserves_bottom_rows_and_draws_blue_unicode_bar(self):
        with dev.TerminalProgress() as terminal:
            terminal.update(21, 40, "Build frontend")
            output = self.output.getvalue()
            self.assertIn("\x1b[1;22r", output)
            self.assertIn("\x1b[23;1H", output)
            self.assertIn("\x1b[24;1H", output)
            self.assertIn("\x1b[94m", output)
            self.assertIn("52.5%", output)
            self.assertIn("━", output)
            self.assertIn("┄", output)
            self.assertTrue(output.endswith("\x1b8"))
        self.assertIn("\x1b[r", self.output.getvalue())
        self.assertEqual(self.restore_calls, [True])

    def test_completed_stages_pin_progress_and_keep_log_plain(self):
        def action(log):
            self.assertTrue(dev.ACTIVE_PROGRESS.get().active)
            dev.emit("child output", log)

        dev.run_stages(self.root, "build", [("compile", action), ("package", action)])
        output = self.output.getvalue()
        self.assertEqual(output.count("child output"), 2)
        self.assertIn("100.0%", output)
        self.assertIn("2/2", output)
        log = next((self.root / "output/logs").glob("*.log")).read_text(encoding="utf-8")
        self.assertIn("1/2 50% Completed: compile", log)
        self.assertIn("2/2 100% Completed: package", log)
        self.assertEqual(log.count("child output"), 2)
        self.assertNotIn("\x1b", log)
        self.assertIsNone(dev.ACTIVE_PROGRESS.get())

    def test_failure_does_not_claim_success_and_restores_terminal(self):
        def fail(log):
            raise dev.DevError("fixture failure", 7)

        following = []
        with self.assertRaisesRegex(dev.DevError, "fixture failure"):
            dev.run_stages(self.root, "failure", [("bad", fail), ("never", lambda log: following.append(True))])
        output = self.output.getvalue()
        self.assertIn("Failed or interrupted (0/2)", output)
        self.assertNotIn("100.0%", output)
        self.assertTrue(output.endswith("\x1b8"))
        self.assertIn("\x1b[r", output)
        self.assertEqual(following, [])
        self.assertIsNone(dev.ACTIVE_PROGRESS.get())
        self.assertEqual(self.restore_calls, [True])

    def test_ctrl_c_restores_scroll_region(self):
        def interrupt(log):
            raise KeyboardInterrupt()

        with self.assertRaises(KeyboardInterrupt):
            dev.run_stages(self.root, "cancel", [("interrupt", interrupt)], logged=False)
        self.assertIn("\x1b[r", self.output.getvalue())
        self.assertIsNone(dev.ACTIVE_PROGRESS.get())
        self.assertEqual(self.restore_calls, [True])

    def test_redirected_output_stays_plain_even_with_force_color(self):
        output = io.StringIO()
        with patch.dict(os.environ, {"FORCE_COLOR": "1"}), redirect_stdout(output):
            dev.run_stages(self.root, "pipe", [("check", lambda log: dev.emit("plain", log))])
        self.assertNotIn("\x1b", output.getvalue())
        self.assertIn("1/1 100%", output.getvalue())
        self.assertEqual(self.restore_calls, [])

    def test_explicit_plain_dumb_nested_and_small_terminal_fall_back(self):
        for variable, value in [("EWP_PROGRESS", "plain"), ("EWP_PROGRESS_ACTIVE", "1"), ("TERM", "dumb")]:
            with self.subTest(variable=variable), patch.dict(os.environ, {variable: value}):
                with dev.TerminalProgress() as terminal:
                    self.assertFalse(terminal.active)
        self.size = (19, 4)
        with dev.TerminalProgress() as terminal:
            self.assertFalse(terminal.active)
        self.assertEqual(self.output.getvalue(), "")

    def test_vt_unavailable_does_not_emit_escape_codes(self):
        with patch.object(dev.TerminalProgress, "_enable_vt", return_value=False):
            dev.run_stages(self.root, "legacy", [("check", lambda log: None)], logged=False)
        self.assertNotIn("\x1b", self.output.getvalue())
        self.assertIn("1/1 100%", self.output.getvalue())

    def test_no_color_keeps_footer_fixed_without_coloring(self):
        for setting in ({"NO_COLOR": "", "FORCE_COLOR": "1"}, {"FORCE_COLOR": "0"}):
            self.output.seek(0)
            self.output.truncate()
            with patch.dict(os.environ, setting), dev.TerminalProgress() as terminal:
                terminal.update(1, 2, "compile")
            self.assertIn("\x1b[1;22r", self.output.getvalue())
            self.assertNotIn("\x1b[94m", self.output.getvalue())

    def test_resize_repositions_footer_clears_old_rows_and_bounds_cursor(self):
        with dev.TerminalProgress() as terminal:
            terminal.update(1, 2, "Compile")
            self.output.seek(0)
            self.output.truncate()
            self.size = (45, 30)
            terminal.refresh()
            resized = self.output.getvalue()
            for code in ("\x1b[23;1H\x1b[2K", "\x1b[24;1H\x1b[2K", "\x1b[1;28r", "\x1b[29;1H", "\x1b[30;1H"):
                self.assertIn(code, resized)
            self.assertTrue(resized.endswith("\x1b8"))
            self.size = (30, 10)
            terminal.refresh()
            self.assertIn("\x1b[1;8r", self.output.getvalue())
            self.assertLess(len(terminal._bar(30)), 30)

    def test_resize_to_too_small_releases_region_and_switches_to_plain(self):
        with dev.TerminalProgress() as terminal:
            token = dev.ACTIVE_PROGRESS.set(terminal)
            try:
                terminal.update(0, 1, "compile")
                self.size = (15, 3)
                dev.progress(1, 1, "Completed", None)
                self.assertFalse(terminal.active)
                self.assertIn("1/1 100% Completed", self.output.getvalue())
            finally:
                dev.ACTIVE_PROGRESS.reset(token)
        self.assertEqual(self.restore_calls, [True])

    def test_windows_echo_cursor_is_returned_to_log_region(self):
        with dev.TerminalProgress() as terminal:
            terminal._cursor_position = lambda: (1, 24)
            self.output.seek(0)
            self.output.truncate()
            terminal.update(1, 2, "compile")
            self.assertTrue(self.output.getvalue().startswith("\x1b[22;1H\n\x1b7"))

    def test_resize_preserves_unfinished_line_column(self):
        with dev.TerminalProgress() as terminal:
            terminal.update(0, 1, "compile")
            terminal._cursor_position = lambda: (12, 18)
            self.size = (100, 30)
            terminal.refresh()
            self.assertTrue(self.output.getvalue().endswith("\x1b[18;12H"))
            terminal._cursor_position = lambda: (12, 18)
            self.size = (30, 10)
            terminal.refresh()
            self.assertTrue(self.output.getvalue().endswith("\x1b[8;12H"))

    def test_partial_ansi_sequences_are_not_interleaved_with_footer_codes(self):
        for value in ("\x1b[31mRED\x1b[0m", "\x1b]0;title\x07", "\x1b]8;;https://example.test\x1b\\"):
            for split in range(1, len(value)):
                complete, pending = dev.TerminalProgress._complete_output(value[:split])
                rest, pending = dev.TerminalProgress._complete_output(pending + value[split:])
                self.assertEqual(complete + rest, value)
                self.assertEqual(pending, "")
        with dev.TerminalProgress() as terminal:
            terminal.write("first \x1b[3")
            self.assertEqual(terminal._output_tail, "\x1b[3")
            self.assertNotIn("first \x1b[3", self.output.getvalue())
            terminal.refresh()
            terminal.write("1mRED\x1b[0m")
            self.assertIn("\x1b[31mRED\x1b[0m", self.output.getvalue())

    def test_wide_text_and_control_sequences_cannot_wrap_status_row(self):
        self.assertEqual(dev.TerminalProgress._fit("打包前端", 5), "打包")
        self.assertEqual(dev.TerminalProgress._fit("\x1b[31mHello\nworld\r", 5), "Hello")
        self.assertLess(len(dev.TerminalProgress()._bar(80)), 80)

    def test_legacy_encoding_has_ascii_bar_fallback(self):
        class LegacyTerminal(Terminal):
            encoding = "ascii"

        terminal = dev.TerminalProgress(LegacyTerminal())
        terminal.done, terminal.total = 1, 2
        self.assertRegex(terminal._bar(80), r"\[#+-+\].*50\.0%")

    def test_nested_stages_do_not_take_over_the_outer_scroll_region(self):
        def nested(log):
            def inner(inner_log):
                self.assertIsNotNone(dev.active_terminal())
                self.assertEqual(dev.child_environment(self.root)["EWP_PROGRESS_ACTIVE"], "1")
                dev.run_command([sys.executable, "-c", "import os; print('nested='+os.environ['EWP_PROGRESS_ACTIVE'])"], root=self.root)

            dev.run_stages(self.root, "nested", [("inner", inner)], logged=False)

        dev.run_stages(self.root, "outer", [("outer", nested)])
        self.assertEqual(self.output.getvalue().count("\x1b[1;22r"), 1)
        self.assertIn("nested=1", self.output.getvalue())
        self.assertEqual(self.restore_calls, [True])

    def test_logged_false_still_captures_real_child_output_without_losing_text(self):
        command = [sys.executable, "-c", "import os,sys; print('line one'); print('line two',file=sys.stderr); print('nested='+os.environ.get('EWP_PROGRESS_ACTIVE',''))"]
        environment = dev.child_environment(self.root)
        dev.run_stages(self.root, "child", [("run", lambda log: dev.run_command(command, root=self.root, log=log, env=environment))], logged=False)
        output = self.output.getvalue()
        self.assertIn("line one", output)
        self.assertIn("line two", output)
        self.assertIn("nested=1", output)
        self.assertNotIn("EWP_PROGRESS_ACTIVE", environment)
        self.assertFalse((self.root / "output").exists())


if __name__ == "__main__":
    unittest.main()