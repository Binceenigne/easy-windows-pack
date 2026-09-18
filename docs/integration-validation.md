# Integration validation (2026-09-18)

- Python 3.12.10: 28 unittest cases passed (8 new adapter cases).
- Browser: 27 assertions passed in tests/frontend.html, including resizing,
  stable fill, input bounds, disposal, guarded entrance, reduced motion,
  curtain watchdog, ACK deduplication, explicit installation and host contracts.
- Demo screenshots reviewed at 1280x850 and 390x844; no horizontal overflow.
  Slider, matrix selector and unlimited toggle exercised in the mobile viewport.
- Existing dispatcher serialization and minimize-in-flight regression tests passed.
- No edits to controller.py, api.py, create.py, win32.py or window-frame assets.
- Built wheel and source bundle using the repository CLI; frontend resources
  included in both distributions. Version remains 0.2.1; no release/tag published.
- No live download, executable replacement, native restart or real host database
  modification was attempted. Adapter tests use controlled hosts.
- Remote GitHub CI is not certified by these local checks; existing CI failures
  must not be interpreted as repaired by this task.

Reproduce: run `python -m easy_windows_pack.cli build` from the repository and
open tests/frontend.html in a browser. Inspect `window.testResults`: `passed`
must be 27 with no `error`. The demo is examples/components.html, also offline.