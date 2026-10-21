# 历史目录迁移与构建验证

[维护导航](README.md) · [完整原文](history.md)

2026-10-08 历史阶段：Python 66 passed；当时根 build.cmd build 完成四阶段；CMD 菜单输入 0 正常退出；Chrome 三轮 27/27；既有环境与带空格目录源码包初始化通过；wheel、source bundle、PyInstaller ModuleGraph 与 EXE 启动检查通过。这些旧入口/资源路径不代表后续 Vite/npm/编译资源流程。

当时出现 WinError 32、Access denied、runw.exe 缺失与早期产物消失，外部来源未确认，未关闭防护；解除占用并 init 后恢复 PyInstaller 6.22.2，再 exe 成功。启动器预检查与 PE 检查防止缺产物误报成功。

历史 EXE：output/exe/easy-windows-pack-demo.exe，19,202,361 bytes，SHA-256 `D43B94786CE38306B4A9AB7B4D60235D3164CF1EA904168E5624E9AA5686B6E9`。当时 PID 31544、HWND 7474180，标题 easy-windows-pack demo；含公开包及旧 frontend/src/index.html 资源。这不是当前 EXE 的哈希或运行状态。当前入口见 [开发手册](development.md)，后续证据见 [npm 历史](npm-validation.md)。