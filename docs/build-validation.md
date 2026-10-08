# 历史目录迁移与构建验证 / Historical layout and build validation

本记录对应 2026-10-08 前后端目录迁移与双语开发菜单阶段的历史 migration checks；以下数量、旧前端路径、EXE 大小与哈希只属于当时检查。它不包含后来 npm workspace、Vite/HMR、六模板、tarball 或编译前端打包的验收，不替代当前测试。

This is historical evidence from the 2026-10-08 layout/menu migration stage. Counts, old frontend paths, EXE size and hash below apply only to that stage. They do not certify subsequent npm workspaces, Vite/HMR, six templates, tarballs or compiled frontend packaging. Current evidence belongs in [npm-validation.md](npm-validation.md); commands and current boundaries are in [npm-vite.md](npm-vite.md).

| 检查 / Check | 结果 / Result |
| --- | --- |
| Python 单元测试 / Unit tests | 66 passed |
| 完整构建入口 / Full build entry | 根目录 build.cmd build 单次完成测试、wheel、EXE、bundle，4/4 100% / All four stages passed in one invocation |
| 真实交互菜单 / Interactive menu | cmd.exe 启动菜单，显示全部双语选项，输入 0 正常退出，exit 0 / Real CMD menu displayed all bilingual options and exited successfully on 0 |
| 前端回归 / Frontend regression | 本机 Chrome headless 连续三轮 27/27，通过尺寸异步等待修复 / Three local Chrome runs passed 27/27 |
| 浏览器预览 / Browser preview | 仅服务 frontend 的本地 HTTP 服务；页面和分层资源返回 200 / Frontend-only loopback server and assets verified |
| 既有环境初始化 / Existing environment initialization | 占用解除后重新运行 init 成功，3/3 100% / Reinitialization passed after file locks cleared, 3/3 100% |
| 全新源码包初始化 / Fresh source bundle initialization | 带空格路径下创建独立 .venv 并安装全部依赖成功 / Fresh .venv and all dependencies installed in a path containing spaces |
| Wheel | 已生成，核对公开 easy_windows_pack 模块及分层前端资源 / Built and inspected |
| Source bundle | 已生成，包含新目录、菜单、docs、开发入口及显式 easy-dev 技能 / Built with development docs and explicit skill files |
| PyInstaller 模块发现 / Module discovery | 实际 ModuleGraph 识别 build/exe-src/easy_windows_pack / Verified |
| EXE 编译与运行 / EXE compilation and launch | 原工作区构建及 PE 产物检查通过，实际窗口启动成功 / Workspace build, PE check and native window launch passed |

过程中出现 `WinError 32`、`Access denied`、启动器缺失与早期 EXE 产物消失，具体外部来源未确认，未关闭防护或添加排除项。随后通过原工作区 `build.cmd init` 成功恢复 PyInstaller 6.22.2，再执行 `build.cmd exe` 成功。菜单保留启动器预检查与编译后的 PE 文件检查，防止产物缺失时返回成功。

Earlier local file locks/access denials interrupted dependency repair. Re-running `build.cmd init` in the original workspace subsequently restored PyInstaller 6.22.2, and `build.cmd exe` passed. Protection settings were not changed. Bootloader and output PE checks remain in place to report missing artifacts as failures.

最终验收 / Final evidence:

- 产物 / Artifact: `output/exe/easy-windows-pack-demo.exe`, 19,202,361 bytes.
- SHA256: `D43B94786CE38306B4A9AB7B4D60235D3164CF1EA904168E5624E9AA5686B6E9`.
- 原生窗口标题 / Native window title: `easy-windows-pack demo`; 验收时进程 / PID `31544`, 窗口句柄 / HWND `7474180`.
- 已检查内嵌公开包 `easy_windows_pack` 及 adapters/api/config/controller/create/tray/win32 模块，同时包含 `frontend/src/index.html`、标题栏 CSS 和框架 JS / Public package modules and layered frontend resources verified in the executable archive.