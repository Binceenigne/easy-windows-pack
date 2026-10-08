# 开发手册 / Development guide

[文档导航 / Documentation](README.md) · [npm / Vite 完整指南 / Full guide](npm-vite.md) · [目录与迁移 / Architecture and migration](architecture.md) · [npm 验收 / Validation](npm-validation.md)

## 入口与环境 / Entry point and environment

首选 npm / Vite 工作流：Node >=22.12.0、Vite ^7.3.7；桌面、Python 测试与打包还需 Python >=3.10，Windows 桌面需 WebView2。根目录是 private npm workspace，两个 ESM 包 `easywindowspack` / `create-ewp` 版本为 0.1.0。创建项目及发布状态边界见 [npm 指南](npm-vite.md)。

Prefer the npm / Vite workflow: Node >=22.12.0 and Vite ^7.3.7. Desktop, Python tests and packaging also need Python >=3.10; Windows desktop needs WebView2. The root is a private npm workspace with ESM `easywindowspack` / `create-ewp` packages at 0.1.0. See the [npm guide](npm-vite.md) for creation and publication boundaries.

```powershell
npm install
npm run init
npm run dev
npm run dev -- --web
```

兼容入口 `build.cmd` 无参数仍显示双语菜单，调用 [scripts/dev.py](../scripts/dev.py)。该脚本本身使用 Python 标准库；前端任务会调用 npm/Vite，因此当前应用开发和打包不能省略 Node。无需 Sass，除非宿主自行采用 SCSS。

The compatible `build.cmd` entry still displays a bilingual menu without arguments and calls [scripts/dev.py](../scripts/dev.py). The script itself uses the standard library, but frontend tasks invoke npm/Vite, so current app development and packaging require Node. Sass is needed only if the host chooses SCSS.

`init` 创建或复用项目 `.venv`，验证解释器后先安装 npm 依赖并构建 Vite 前端，再执行 `pip install -e ".[dev,tray]"`。这个顺序保证全新生成项目的 Python metadata 能找到编译资源。已有有效环境不会被删除重建；无效环境报错，需要先检查。仅使用框架库时仍可 `pip install -e .`；生成应用请使用完整初始化流程。

`init` creates or reuses project `.venv`, validates the interpreter, installs npm dependencies and builds the Vite frontend before running `pip install -e ".[dev,tray]"`. This lets a fresh app's Python metadata find its compiled assets. It preserves existing valid environments and reports invalid ones. Framework-only consumers can still use `pip install -e .`; generated apps should use the full initialization flow.

`build.cmd` 优先使用项目 `.venv`，其次 `py -3`，最后 PATH 中的 `python`。Python 桌面、测试与打包任务要求有效项目环境并按需重新进入该解释器，无需手动激活；`init` / `info` / `browser` / `frontend` 不要求已有 `.venv`，但 legacy 菜单本身仍需 Python 启动。纯浏览器无需 Python 时直接用 npm 前端命令。源码迁移后重新执行 `init`，公开导入仍为 `easy_windows_pack`。

`build.cmd` prefers project `.venv`, then `py -3`, then `python` on PATH. Desktop, Python tests and packaging require the project environment and re-enter it when needed, without manual activation. `init` / `info` / `browser` / `frontend` need no existing `.venv`, although the legacy menu itself still starts in Python. Use npm frontend commands for browser development without Python. Reinitialize after source migration; public imports remain `easy_windows_pack`.

## 菜单与命令 / Menu and commands

无参数进入菜单，输入对应编号执行任务，`0` 退出。菜单与命令行共用实现；需要可选参数时直接传命令。

With no arguments, choose a numbered task from the menu; `0` exits. Menu and command-line tasks share the same implementation. Pass commands directly when optional flags are needed.

| 命令 / Command | 行为 / Behavior |
| --- | --- |
| `build.cmd init` | 创建/复用 `.venv` 并安装 Python 与 npm 依赖 / Create/reuse `.venv`, install Python and npm dependencies |
| `build.cmd browser` | 转 `npm run frontend:dev`，本机 Vite 预览 / Delegate to local Vite browser development |
| `build.cmd frontend` | 编译前端至 `output/frontend/` / Compile frontend |
| `build.cmd demo` | 编译前端后启动 `backend/src/demo.py` / Compile frontend, then launch desktop demo |
| `build.cmd demo --debug` | 桌面演示启用开发者工具 / Enable desktop developer tools |
| `build.cmd wheel` | 构建 wheel / Build wheel |
| `build.cmd exe` | Windows 单文件 PyInstaller 演示程序 / Windows single-file PyInstaller demo |
| `build.cmd bundle` | 构建含源码与开发文档的 source bundle / Build source bundle with developer documentation |
| `build.cmd build` | 依次 test → wheel → exe → bundle，仅 Windows / Sequential full build, Windows only |
| `build.cmd test` | Python unittest / Python unittest suite |
| `build.cmd info` | 显示解释器、项目环境和产物目录 / Show interpreter, project environment and output locations |

## 浏览器预览 / Browser preview

```powershell
.\build.cmd browser
.\build.cmd browser --port 8080 --no-open
```

`browser` 转 Vite；也可用 `npm run frontend:dev` 或 `npm run dev -- --web`。服务只绑定 `127.0.0.1`，默认端口 `0` 选择可用动态端口，终端显示实际 URL。主页面为 `frontend/index.html`，同一服务上的 `/src/components.html` 是组件演示。旧 `/src/index.html` 为弃用兼容入口。`--port` 可指定 0–65535；`--no-open` 保留服务但不自动打开浏览器。按 Ctrl+C 停止服务。

`browser` delegates to Vite; `npm run frontend:dev` and `npm run dev -- --web` also provide browser development. The server binds only to `127.0.0.1`, chooses an available dynamic port by default and prints its actual URL. The main page is `frontend/index.html`; `/src/components.html` remains the component demo. The old `/src/index.html` is deprecated. `--port` accepts 0–65535; `--no-open` suppresses automatic browser launch. Ctrl+C stops the server.

Vite 页面根为 `frontend/`，通过严格 fs allow 范围读取前端及 runtime 包资源，不把整个仓库当静态根；当前仓库配置拒绝后端、脚本和私密文件。不要为修复资源路径而扩大到仓库根目录。预览没有真实 `window.pywebview.api`，仅用于布局、主题、组件与浏览器交互。Windows 拖拽、缩放、Snap、托盘、安装与重启需桌面或真实宿主验收。

Vite's page root is `frontend/`; strict fs allow rules cover frontend and runtime package resources, not the repository as a static root. Repository configuration denies backend, scripts and private files. Do not expand serving to the repository root to fix paths. Preview has no real `window.pywebview.api`; use it for layout, themes, components and browser-compatible interaction. Verify native actions in desktop or real host environments.

## 桌面调试 / Desktop debugging

```powershell
npm run dev
.\build.cmd demo --debug
```

桌面入口位于 [backend/src/demo.py](../backend/src/demo.py)。`npm run dev` 等待 Vite 就绪，以 `EWP_DEV_URL` 传入实际 URL，启动 debug pywebview 并保留 HMR；Ctrl+C 释放服务和桌面进程树。legacy `demo` 编译前端后加载 `output/frontend/index.html`，不提供 HMR。生产 EXE 同样加载编译页面。示例负责宿主装配，框架在 `backend/base/ewpcore/`。窗口生命周期与宿主更新分开验收。

The desktop entry is [backend/src/demo.py](../backend/src/demo.py). `npm run dev` waits for Vite, passes its actual URL via `EWP_DEV_URL` and starts debug pywebview with HMR. Ctrl+C releases the server and desktop process tree. Legacy `demo` builds and loads `output/frontend/index.html` without HMR; production EXEs load the compiled page as well. The demo owns host wiring; framework source lives under `backend/base/ewpcore/`. Validate lifecycle and host updates separately.

## 构建、进度与日志 / Builds, progress and logs

```powershell
npm run frontend:build
npm run build
npm run build -- -w
npm run build -- -e
.\build.cmd wheel
.\build.cmd exe
.\build.cmd bundle
.\build.cmd build
```

`npm run build` 默认 EXE；`-- -w` / `-- --wheel` 选择 wheel，`-- -e` 显式选择 EXE。裸 `-w` 是 npm workspace 参数。`build.cmd build` 保留 test → wheel → exe → bundle。两者构建语义不同，不用旧菜单的“完整构建”描述 npm 默认构建。

`npm run build` defaults to EXE; `-- -w` / `-- --wheel` selects wheel and `-- -e` explicitly selects EXE. Bare `-w` belongs to npm workspace selection. `build.cmd build` retains test → wheel → exe → bundle. These are separate build semantics.

| 目录 / Directory | 内容 / Contents |
| --- | --- |
| `output/frontend/` | Vite 编译页面与 assets，生产 `base: './'` / Compiled pages/assets with relative production URLs |
| `output/wheels/` | 框架源资源 wheel 或生成应用编译资源 wheel，按各自 metadata / Framework source-asset or generated app compiled-asset wheel, according to metadata |
| `output/exe/` | `easy-windows-pack-demo.exe`，PyInstaller `--onefile --windowed` 桌面演示 / Single-file windowed demo |
| `output/bundles/` | 源码 zip、展开目录及 manifest / Source zip, staging directory and manifest |
| `output/npm/` | workspace npm pack 的 tarball / Workspace npm tarballs |
| `output/logs/` | 初始化和构建任务的 UTF-8 日志 / UTF-8 initialization and build logs |
| `build/spec/` | PyInstaller spec 配置 / PyInstaller spec files |
| `build/pyinstaller/` | PyInstaller 中间工作缓存 / PyInstaller work cache |

`build/` 与 `output/` 都是生成物，不作为源代码或开发文档维护位置。完整构建顺序执行，任何阶段失败即停止；EXE 和完整构建仅支持 Windows。进度条基于完成阶段数显示比例，例如完成四个阶段中的一个显示 25%，不是耗时估算，也不模拟下载或编译百分比。子进程输出实时显示，失败或 Ctrl+C 会记录已完成阶段与错误，不输出虚假的全部成功。

Both `build/` and `output/` are generated directories, not source or documentation locations. Full builds run sequentially and stop on failure. EXE and full builds require Windows. Progress reflects completed stages: one of four stages is 25%, not a time estimate or simulated download/compiler progress. Child output streams to the terminal; errors and Ctrl+C record completed stages without claiming success.

初始化、wheel、exe、bundle、完整构建会打印日志位置。独立 `test`、browser、demo 和 info 主要输出到终端；完整构建中的测试输出包含在日志中。资源分别检查：框架 wheel 保留 `easy_windows_pack` 核心及 `share/easy-windows-pack/frontend/` 源组件/桥接/契约；生成应用 wheel 根据自身 metadata 携带编译页面/assets；EXE 只携带 `output/frontend/` 编译前端；source bundle 保留源码和 docs，不夹带 `.venv`、缓存或历史产物。单源 prepare 与 npm pack 见 [npm 指南](npm-vite.md)。

Initialization and packaging tasks print a log path; standalone test, browser, demo and info mainly use the terminal. Inspect distributions separately: framework wheels contain core plus source components/bridges/contracts; generated app wheels include compiled assets according to their metadata; EXEs carry only compiled `output/frontend/` as frontend resources; source bundles retain sources and docs, excluding environments, caches and old outputs. See the [npm guide](npm-vite.md) for preparation and packing.

## 兼容命令 / Compatible commands

原 CLI 与 [build.ps1](../build.ps1) 保留：

The original CLI and [build.ps1](../build.ps1) remain available:

```powershell
python -m easy_windows_pack.cli build
easy-windows-pack build
python -m easy_windows_pack.cli test
python -m easy_windows_pack.cli bundle
python -m easy_windows_pack.cli info
python -m easy_windows_pack.cli build --output-dir .\artifacts
python -m easy_windows_pack.cli build --skip-tests --skip-bundle
.\build.ps1 -Python .\.venv\Scripts\python.exe
.\build-demo.ps1 -Python .\.venv\Scripts\python.exe
```

底层 CLI 的 `build` 是测试 + wheel + bundle，不包含 EXE；无参数的 `build.ps1` 运行该构建，不是新交互菜单。底层 CLI 默认也按 `output/` 分类；显式 `--output-dir` 控制产物目录。`clean` 是底层 CLI 的清理命令，会删除生成物，运行前查看其当前范围；开发菜单不提供 `clean`。`build-demo.ps1` 委托 `scripts/dev.py exe`，不再维护独立打包流程。

The low-level CLI `build` runs tests + wheel + bundle, without EXE. With no arguments, `build.ps1` runs that build rather than the new interactive menu. Default outputs are categorized under `output/`; `--output-dir` overrides artifact placement. Low-level `clean` removes generated content: inspect its current scope before use. It is not a menu task. `build-demo.ps1` delegates to `scripts/dev.py exe` instead of maintaining a separate packaging flow.

## 验证与故障定位 / Validation and troubleshooting

EXE 构建先检查 PyInstaller 的 Windows 启动器，再将底层源码暂存为 `build/exe-src/easy_windows_pack`。该暂存解决 editable 安装的动态包名映射无法被 PyInstaller 静态分析发现的问题；只复制源码，不另维护一套框架。当前开发依赖固定 PyInstaller 6.22.2。

EXE builds check the Windows bootloader and stage the core as `build/exe-src/easy_windows_pack`, allowing PyInstaller to discover the public package without relying on editable import hooks. This is generated source staging, not another maintained framework copy. Development dependencies pin PyInstaller 6.22.2.

出现 `WinError 32`、`Access denied` 或缺少 `runw.exe` 时，先关闭正在运行的构建程序并查看系统文件占用或防护记录；脚本不会自动提权、关闭防护或宣称构建成功。解除实际占用后重新执行 `init`，再执行 `exe`。

For `WinError 32`, `Access denied`, or missing `runw.exe`, close running build processes and inspect file locks or protection records. The tool does not elevate, disable protection, or report success. Run `init` and then `exe` again after the actual lock is resolved.

- `build.cmd info`：先确认解释器与项目环境；缺少依赖或迁移后导入失败时重新运行 `init`。不要用 `import ewpcore` 绕过公开包映射。
- `build.cmd test`：验证 Python 行为。浏览器断言入口是 [tests/frontend.html](../tests/frontend.html)，它不由只服务 `frontend/` 的预览服务器暴露；在浏览器中单独打开，查看 `window.testResults` 并记录实际断言数与错误。
- 原生行为需在 Windows 桌面实测；打包成功并不证明原生交互或真实更新已成功。
- 端口占用时省略 `--port` 使用随机端口，或选择其他端口；自动打开失败时手动访问终端 URL。停止预览后地址不再可用。
- 构建失败先查看终端打印的 `output/logs/` 日志，修复失败阶段原因后重跑相关任务。菜单可再次选择任务；不会把失败当成功继续完整构建。
- [历史集成](integration-validation.md)与[目录迁移验收](build-validation.md)只描述各自阶段；npm/Vite 当前测试、产物与原生验收单独写入 [npm-validation.md](npm-validation.md)，不沿用历史通过数。

English troubleshooting:

- Use `build.cmd info` to confirm the interpreter and environment. Re-run `init` for missing dependencies or stale editable installs after migration; do not bypass public mapping with `import ewpcore`.
- `build.cmd test` validates Python behavior. Open [tests/frontend.html](../tests/frontend.html) separately in a browser; the frontend-only preview does not serve it. Inspect `window.testResults` and record the actual assertion count and errors.
- Test native behavior on Windows. Successful packaging does not prove native interaction or real updates work.
- If a port is occupied, omit `--port` or select another port. Open the printed URL manually if browser launch fails. The URL stops serving after Ctrl+C.
- Read the printed build log, fix the failing stage and rerun the relevant task. The menu allows another selection after failure; full builds do not continue as if a failed stage passed.
- [Historical integration](integration-validation.md) and [layout migration](build-validation.md) describe their own stages only. Record current npm/Vite tests, artifacts and native validation in [npm-validation.md](npm-validation.md), without reusing old pass counts.