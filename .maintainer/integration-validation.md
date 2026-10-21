# 集成历史验收（2026-09-18）

[维护导航](README.md) · [桌面集成](desktop-integrations.md) · [完整原文](history.md)

原阶段 Python 3.12.10 的 28 unittest（8 个新增 adapter）与浏览器 27 断言通过。浏览器涵盖矩阵填充/尺寸/销毁、受保护入口、减弱动画、遮罩 watchdog、ACK 去重、显式安装和宿主契约。1280×850 与 390×844 截图/交互无横向溢出；dispatcher 串行与最小化回归通过。

当时未改 controller/api/create/win32 或窗口资源；构建 wheel 和源码包，版本 0.2.1，未发布 release/tag。未测试真实下载、EXE 替换、原生重启或宿主数据库；受控适配器测试不证明线上更新或远程 CI。

复验入口为根 startup.cmd test，以及单独打开 [tests/frontend.html](../tests/frontend.html) 查看 window.testResults；frontend-only 服务不暴露 tests。组件示例为 [components.html](../frontend/src/components.html)。独立 wheel/bundle 或完整 full-build 的当前语义见 [开发手册](development.md)。此次仅迁移记录，未重新执行上述检查。