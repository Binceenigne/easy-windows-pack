# 后端与窗口维护

创建器提供 Python、golang、rust、cpp，默认 Python，独立于六种前端模板。`frontend/package.json` 中的 `ewp.backend` 是任务路由依据；旧项目缺省仍按 Python 处理。应用 docs 仅保留精简摘要和所选 AI 指引，维护资料不进入新项目。

| 后端 | 宿主 | 前置工具 | 应用入口 |
| --- | --- | --- | --- |
| Python | pywebview / WebView2 | Python >=3.10 | backend/src/demo.py |
| golang | webview_go / CGO | Go >=1.22、MinGW-w64 C++、Windows SDK | backend/main_windows.go |
| rust | Wry + tao | Rust / Cargo、MSVC、Windows SDK | backend/src/main.rs |
| cpp | webview/webview | CMake >=3.24、C++17、Windows SDK | backend/src/main.cpp |

Windows 桌面均需要 WebView2 Runtime。Go 依赖固定 commit，Rust/C++ 依赖固定版本；第一次构建需要下载对应依赖。工具链应加入 PATH；可用 `EWP_GO`、`EWP_CARGO`、`EWP_CMAKE` 指定可执行文件。原生安装器需要 NSIS 3 的 makensis，或 `EWP_MAKENSIS` 路径。`EWP_CMAKE_ARGS` 是 JSON 字符串数组，可指定生成器或预先下载的 FetchContent 源；不经 shell 拼接执行。

## 开发、构建与分发

根 startup.cmd 优先 Node runtime，再为旧 Python 项目保留无 Node 的脚本回退。scripts 下的批处理和 PowerShell 构建入口按所选后端路由。原生项目不生成 Python runtime、pyproject 或 dev.py。

`scripts/backend.mjs` 是通用原生任务驱动，由 prepare 复制到公共模板。`init` 每次先安装/校验 frontend 的 npm 依赖（包含开发依赖），检测工具链并在缺失时给出官方下载链接，再编译前端和调试宿主；失败后可用相同命令重试，不删除源码或清空编译缓存。系统工具链不自动下载。`dev` 使用真实 Vite URL 和调试宿主，`demo` 使用生产页面，`backend:build` 编译宿主。Ctrl+C 关闭编译或桌面进程树并释放 Vite。Python 继续使用 scripts/dev.py。

`app` 输出 output/apps/<id>；无配置覆盖的 `exe/build` 输出 output/exe/<id>。目录包含 <id>.exe、frontend 编译资源与许可证。Rust 使用静态 CRT，C++ 使用静态 MSVC runtime；Go 的编译器决定额外 runtime 依赖，实际分发前检查 DLL。独立目录可以直接启动，不需要 Node/Python。

原生后端支持 onedir，明确拒绝 onefile；安装器封装为单个 setup.exe，使用当前用户权限，提供目录、组件、进度及完成页面。开机启动与安装后运行分别可选。卸载按清单删除安装文件，保留额外用户文件。WebView2 是安装前置要求，原生安装器暂不自动下载运行库。features/prerequisites/hooks 等高级 Python 配置在原生驱动中明确拒绝，避免静默忽略。

`bundle` 生成 ZIP 源码包，排除依赖、缓存、凭据和维护资料。`full-build` 执行测试、前端和宿主构建、应用分发、源码包；wheel 仅 Python。

## 桥接与窗口

原生宿主接收 --url 或 --assets，并支持 --title、--titlebar-mode、--debug。生产资源限定在 frontend，开发页面限定 loopback origin；禁止远程文档取得桥接。兼容 window.pywebview.api，窗口外壳仍复用现有公开 API。跨 native/custom 标题栏边界返回 restartRequired，实际 chrome 只在重启宿主时改变。

Python 无边框窗口通过 HWND subclass 保留系统移动、缩放与贴靠所需样式。WM_GETMINMAXINFO 使用当前显示器 rcWork，WM_NCCALCSIZE 约束最大化客户端；GetWindowRect 可含不可见缩放框，验收应比较客户端、WebView 和 DWM 可见边界。系统贴靠由 Windows 执行，不在 JS 模拟。

## 本轮验证入口

- `node --test tests/native-driver.test.mjs tests/npm-runtime.test.mjs tests/create-ewp.test.mjs`：驱动、路由与生成矩阵。
- `node tests/npm-pack.integration.mjs`：真实 tarball 的六前端编译、类型检查、Chrome、HMR、生命周期。
- `node tests/generated-native.integration.mjs <cpp|golang|rust> [--installer]`：本机隔离工具链环境下真实新项目与安装部署。
- `node tests/native-backends-verify.mjs`：桥接、生产资源、native chrome、路径/导航策略；详细工具链与依赖证据在 tests/native-backends-validation.md。
- Python 工作区、Snap 集成脚本位于 tests/windows-*.integration.py。当前会话可验证工作区和系统消息，但真实鼠标/键盘注入受限，Snap 最终位置标记 unsupported；多显示器/DPI 与 Win11 hover Snap Layout 尚未验收。

报告在 build/generated-native、build/native-backends、build/python-window-validation 和 build/npm-pack-validation。历史或本机通过不替代干净机器验收；本轮源码与本地 tarball 更新不表示 npm 已发布。