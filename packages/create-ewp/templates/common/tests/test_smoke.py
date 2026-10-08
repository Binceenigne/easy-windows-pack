import unittest

from easy_windows_pack import WindowConfig


class ProjectSmokeTest(unittest.TestCase):
    def test_window_configuration_without_opening_a_window(self):
        config = WindowConfig(title="Desktop App", width=980, height=680).normalized()
        self.assertEqual(config.title, "Desktop App")
        self.assertTrue(config.frameless)
        self.assertGreaterEqual(config.width, config.min_width)


if __name__ == "__main__":
    unittest.main()