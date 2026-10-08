# Integration validation (2026-09-18)

[Documentation / 文档导航](README.md) · [Current development guide / 当前开发手册](development.md)

This is a historical record for the integration checked on 2026-09-18. Counts,
screenshots, package contents and unchanged-file claims below describe that task
only. They do not certify the current directory migration, build menu or remote CI.

这是 2026-09-18 原集成任务的历史验收记录。下列断言数、截图、产物检查与“未改动”说明
仅适用于当时任务，不代表本次目录迁移、开发菜单或远程 CI 已通过。

- Python 3.12.10: 28 unittest cases passed (8 new adapter cases).
- Browser: 27 assertions passed in [tests/frontend.html](../tests/frontend.html), including resizing,
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

## Current reproduction entry points / 当前复验入口

After `build.cmd init`, use `build.cmd test` for Python tests. Open
[tests/frontend.html](../tests/frontend.html) separately in a browser and inspect
`window.testResults`; record the current `passed` count and any `error` rather
than assuming the historical count of 27. The frontend-only preview server does
not expose `tests/`. The offline demo is now
[frontend/src/components.html](../frontend/src/components.html).

Use `build.cmd wheel` / `bundle` for separate package checks, or `build.cmd build`
on Windows for test + wheel + EXE + bundle. The compatible low-level command
`python -m easy_windows_pack.cli build` still covers tests + wheel + bundle only.
Inspect current artifacts under `output/` and verify the nested frontend paths,
public Python package name and source bundle manifest. These are reproduction
instructions, not a report that they have been executed for this migration.

当前复验应重新记录实际结果：Python 使用 `build.cmd test`，浏览器单独打开测试页面，
原生行为在 Windows 桌面验证。构建产物按 `output/` 分类，检查新目录、公开包名与 manifest。
此处只更新复验入口，没有把历史结果改写成本次成功。