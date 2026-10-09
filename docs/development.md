# 开发手册 / Development guide

[文档导航 / Documentation](README.md) · [npm / Vite 完整指南 / Full guide](npm-vite.md) · [目录与迁移 / Architecture and migration](architecture.md) · [npm 验收 / Validation](npm-validation.md)

## 入口与环境 / Entry point and environment

首选 npm / Vite 工作流：Node >=22.12.0、Vite ^7.3.7；桌面、Python 测试与打包还需 Python >=3.10，Windows 桌面需 WebView2。frontend 是 private npm workspace，配置、锁文件、依赖及 packages 均在其中。两个 ESM 包 `easywindowspack` / `create-ewp` 的 **0.1.1 已发布且 registry 可用**；2026-10-09 的 `@latest` 创建与 Vue TS 项目安装、检查及前端构建冒烟已通过，见 [验收记录](npm-validation.md)。本文语言、帮助/菜单及完整构建约定属于 0.1.1。创建与本地 tarball 用法见 [npm 指南](npm-vite.md)。

Prefer the npm / Vite workflow: Node >=22.12.0 and Vite ^7.3.7. Desktop, Python tests and packaging also need Python >=3.10; Windows desktop needs WebView2. The private npm workspace, configuration, lockfile, dependencies and packages live under frontend. Both ESM packages are **published at 0.1.1 and available from the registry**; `@latest` creation and Vue TS installation, checks, and frontend build smoke tests passed on 2026-10-09. See the [validation record](npm-validation.md). Language, help/menu, and full-build contracts here describe 0.1.1. See the [npm guide](npm-vite.md) for creation and local tarballs.

本手册命令示例均从项目根执行，npm 显式加 `--prefix frontend`；若已进入 frontend，可省略该参数。Python `.venv` 和 `output/` 仍属于项目根。

Command examples in this guide run from the project root, with `--prefix frontend` for npm. Omit the prefix when already inside frontend. Python `.venv` and `output/` remain at the project root.

```powershell
npm --prefix frontend install
npm --prefix frontend run init
npm --prefix frontend run dev
npm --prefix frontend run dev -- --web
```

根唯一启动脚本 `startup.cmd` 经 [scripts/startup.cmd](../scripts/startup.cmd) 调用 [scripts/dev.py](../scripts/dev.py)，无参数按项目语言显示菜单；其他构建脚本位于 scripts。该脚本本身使用 Python 标准库；前端任务会调用 npm/Vite，因此当前应用开发和打包不能省略 Node。无需 Sass，除非宿主自行采用 SCSS。

The only root launcher, `startup.cmd`, delegates through [scripts/startup.cmd](../scripts/startup.cmd) to [scripts/dev.py](../scripts/dev.py), displaying the menu in the project language without arguments. Other build scripts live under scripts. The script itself uses the standard library, but frontend tasks invoke npm/Vite, so current app development and packaging require Node. Sass is needed only if the host chooses SCSS.

`init` 创建或复用项目 `.venv`，验证解释器后先安装 npm 依赖并构建 Vite 前端，再执行 `pip install -e ".[dev,tray]"`。这个顺序保证全新生成项目的 Python metadata 能找到编译资源。已有有效环境不会被删除重建；无效环境报错，需要先检查。仅使用框架库时仍可 `pip install -e .`；生成应用请使用完整初始化流程。

`init` creates or reuses project `.venv`, validates the interpreter, installs npm dependencies and builds the Vite frontend before running `pip install -e ".[dev,tray]"`. This lets a fresh app's Python metadata find its compiled assets. It preserves existing valid environments and reports invalid ones. Framework-only consumers can still use `pip install -e .`; generated apps should use the full initialization flow.

`scripts/startup.cmd` 优先使用项目 `.venv`，其次 `py -3`，最后 PATH 中的 `python`。Python 桌面、测试与打包任务要求有效项目环境并按需重新进入该解释器，无需手动激活；`init` / `info` / `browser` / `frontend` 不要求已有 `.venv`，但 legacy 菜单本身仍需 Python 启动。纯浏览器无需 Python 时直接用 npm 前端命令。源码迁移后重新执行 `init`，公开导入仍为 `easy_windows_pack`。

`scripts/startup.cmd` prefers project `.venv`, then `py -3`, then `python` on PATH. Desktop, Python tests and packaging require the project environment and re-enter it when needed, without manual activation. `init` / `info` / `browser` / `frontend` need no existing `.venv`, although the legacy menu itself still starts in Python. Use npm frontend commands for browser development without Python. Reinitialize after source migration; public imports remain `easy_windows_pack`.

## 项目语言 / Project language

0.1.1 创建流程第一步选择人类语言 `zh-CN` / `en`，后续再选 JavaScript / TypeScript；创建时保存到 `frontend/package.json` 的 `ewp.language`。命令输出的语言优先级为 **显式 `--lang` → `EWP_LANG` → 保存值 → `zh-CN`**。已有项目运行时的 `--lang` / 环境变量只临时覆盖，不改配置；README、AI 指引与 demo 在创建时选语言，临时切换 CLI 不重写这些文件。

The first 0.1.1 creation prompt selects human language, `zh-CN` / `en`; JavaScript / TypeScript is a later choice. Creation saves it as `ewp.language` in `frontend/package.json`. Command output resolves **explicit `--lang` → `EWP_LANG` → saved value → `zh-CN`**. Runtime overrides are temporary and leave configuration intact. README, AI guidance, and demo text use the creation language; CLI overrides do not rewrite those files.

```powershell
npm --prefix frontend run help -- --lang en
npm --prefix frontend run ewp -- info --lang zh-CN
.\startup.cmd menu --lang en
```

语言选择后，自有帮助、菜单和任务提示使用所选单语；npm 的 `Ok to proceed?` 及 npm / pip / Vite 第三方输出不翻译。生成器 `--yes` 不控制 npm 自己的确认；非交互语言按上述优先级，无设置时默认 `zh-CN`。

After language selection, first-party help, menus, and task messages use one selected language. npm's `Ok to proceed?` prompt and npm / pip / Vite output are not translated. Generator `--yes` does not control npm's confirmation; non-interactive language follows the priority above, defaulting to `zh-CN` when unset.

## 菜单与命令 / Menu and commands

根 `.\startup.cmd` 无参数进入菜单，输入编号执行任务，`0` 退出。全局安装后 `ewp` 无参数、`ewp -h` / `ewp --help` 输出帮助，无需已有项目；菜单需显式 `ewp menu`。菜单与直接任务共用实现；可选参数直接传命令。

Root `.\startup.cmd` without arguments opens the numbered menu; `0` exits. With global installation, `ewp` without arguments, `ewp -h`, or `ewp --help` shows help without a project. Use `ewp menu` to open the menu. Menu and direct tasks share the implementation; pass optional flags directly.

frontend 内可运行 `npm run help` / `info` / `menu` 和 `npm run ewp -- <task> [options]`。全局安装后项目根可直接 `ewp <task>`；未全局安装则从根 `npm --prefix frontend run ewp -- <task>`。以下每个菜单任务均支持这三个入口，`startup.cmd` 列为 PowerShell 根目录写法。

Inside frontend, run `npm run help` / `info` / `menu` or `npm run ewp -- <task> [options]`. Global installation allows `ewp <task>` at the project root; without it, use `npm --prefix frontend run ewp -- <task>`. Every menu task below supports all three entries; launcher examples use PowerShell at the project root.

| 全局 CLI / Global CLI | 根启动脚本 / Root launcher | 行为 / Behavior |
| --- | --- | --- |
| `ewp help` / `ewp -h` / `ewp --help` | `.\startup.cmd help` / `.\startup.cmd -h` | 查看帮助 / Show help |
| `ewp menu` | `.\startup.cmd menu` 或无参数 / or no arguments | 交互菜单 / Interactive menu |
| `ewp init` | `.\startup.cmd init` | 创建/复用 `.venv`，安装依赖并编译前端 / Initialize dependencies and compile frontend |
| `ewp dev [--web]` | `.\startup.cmd dev [--web]` | 桌面 HMR；--web 仅浏览器 / Desktop HMR; --web for browser only |
| `ewp browser` | `.\startup.cmd browser` | Vite 浏览器 HMR，与 frontend:dev 相同 / Browser HMR, same as frontend:dev |
| `ewp frontend` | `.\startup.cmd frontend` | 编译至 `output/frontend/`，与 frontend:build 相同 / Compile, same as frontend:build |
| `ewp frontend:preview` / `ewp preview` | `.\startup.cmd frontend:preview` / `.\startup.cmd preview` | 预览编译结果，先构建 / Preview compiled output; build first |
| `ewp demo` | `.\startup.cmd demo` | 编译后启动桌面，无 HMR / Compile then launch desktop, no HMR |
| `ewp demo --debug` | `.\startup.cmd demo --debug` | 桌面演示启用开发者工具 / Enable demo developer tools |
| `ewp wheel` | `.\startup.cmd wheel` | 构建 wheel / Build wheel |
| `ewp exe` | `.\startup.cmd exe` | Windows 单文件 PyInstaller 程序 / Windows single-file executable |
| `ewp build` | `.\startup.cmd build` | 默认 EXE；-w/--wheel、-e/--exe、--all 三选一 / Default EXE; select one build target |
| `ewp bundle` | `.\startup.cmd bundle` | 含源码与文档的 source bundle / Source bundle with documentation |
| `ewp full-build` / `ewp build:all` | `.\startup.cmd full-build` / `.\startup.cmd build:all` | test → wheel → exe → bundle，仅 Windows / Full pipeline, Windows only |
| `ewp test` | `.\startup.cmd test` | Python unittest / Python unittest suite |
| `ewp info` | `.\startup.cmd info` | Node CLI 显示 Node/配置/.venv 路径；启动脚本显示实际 Python 解释器与产物目录 / Node/config/venv paths versus actual Python interpreter and output directories |
| `ewp check` | `.\startup.cmd check` | 运行 tests/npm-runtime.test.mjs；生成模板包含 3 项 Node runtime exports/config 检查 / Run the included three Node runtime exports/config checks in generated apps |

仓库与新生成应用均提供 npm scripts：`help`、`ewp`、`menu`、`init`、`dev`、`browser`、`frontend`、`demo`、`wheel`、`exe`、`bundle`、`build`、`build:all`、`full-build`、`test`、`info`、`check`；另有 `frontend:dev` / `frontend:build` / `frontend:preview`、`build:wheel` / `build:exe`。在 frontend 内运行 `npm run <task>`；任意 CLI 任务可用 `npm run ewp -- <task> [options]`。`typecheck` 仅 TypeScript 模板提供。生成模板附带 `tests/npm-runtime.test.mjs`，`npm run check` / `ewp check` / `startup.cmd check` 执行 3 项 Node runtime exports/config 检查：公共 API/CSS、Vite 配置及应用 manifest/HTML 入口。Node CLI 支持 `build:wheel` / `build:exe`，启动脚本则用 `wheel` / `exe`。

The checkout and new apps expose the npm scripts listed above. Run `npm run <task>` inside frontend, or `npm run ewp -- <task> [options]` for any CLI task. Only TypeScript templates provide `typecheck`. Generated templates include `tests/npm-runtime.test.mjs`; `npm run check`, `ewp check`, and `startup.cmd check` run three Node runtime exports/config checks: public API/CSS, Vite configuration, and application manifest/HTML entry points. Node CLI supports `build:wheel` / `build:exe`; use `wheel` / `exe` with the root launcher.

## 浏览器预览 / Browser preview

```powershell
.\startup.cmd browser
.\startup.cmd browser --port 8080 --no-open
```

`browser` 转 Vite；也可用 `npm run frontend:dev` 或 `npm run dev -- --web`。服务只绑定 `127.0.0.1`，默认端口 `0` 选择可用动态端口，终端显示实际 URL。主页面为 `frontend/index.html`，同一服务上的 `/src/components.html` 是组件演示。旧 `/src/index.html` 为弃用兼容入口。`--port` 可指定 0–65535；`--no-open` 保留服务但不自动打开浏览器。按 Ctrl+C 停止服务。

`browser` delegates to Vite; `npm run frontend:dev` and `npm run dev -- --web` also provide browser development. The server binds only to `127.0.0.1`, chooses an available dynamic port by default and prints its actual URL. The main page is `frontend/index.html`; `/src/components.html` remains the component demo. The old `/src/index.html` is deprecated. `--port` accepts 0–65535; `--no-open` suppresses automatic browser launch. Ctrl+C stops the server.

Vite 页面根为 `frontend/`，通过严格 fs allow 范围读取前端及 runtime 包资源，不把整个仓库当静态根；当前仓库配置拒绝后端、脚本和私密文件。不要为修复资源路径而扩大到仓库根目录。预览没有真实 `window.pywebview.api`，仅用于布局、主题、组件与浏览器交互。Windows 拖拽、缩放、Snap、托盘、安装与重启需桌面或真实宿主验收。

Vite's page root is `frontend/`; strict fs allow rules cover frontend and runtime package resources, not the repository as a static root. Repository configuration denies backend, scripts and private files. Do not expand serving to the repository root to fix paths. Preview has no real `window.pywebview.api`; use it for layout, themes, components and browser-compatible interaction. Verify native actions in desktop or real host environments.

## 桌面调试 / Desktop debugging

```powershell
npm --prefix frontend run dev
.\startup.cmd demo --debug
```

桌面入口位于 [backend/src/demo.py](../backend/src/demo.py)。`npm run dev` 等待 Vite 就绪，以 `EWP_DEV_URL` 传入实际 URL，启动 debug pywebview 并保留 HMR；Ctrl+C 释放服务和桌面进程树。legacy `demo` 编译前端后加载 `output/frontend/index.html`，不提供 HMR。生产 EXE 同样加载编译页面。示例负责宿主装配，框架在 `backend/base/ewpcore/`。窗口生命周期与宿主更新分开验收。

The desktop entry is [backend/src/demo.py](../backend/src/demo.py). `npm run dev` waits for Vite, passes its actual URL via `EWP_DEV_URL` and starts debug pywebview with HMR. Ctrl+C releases the server and desktop process tree. Legacy `demo` builds and loads `output/frontend/index.html` without HMR; production EXEs load the compiled page as well. The demo owns host wiring; framework source lives under `backend/base/ewpcore/`. Validate lifecycle and host updates separately.

## 构建、进度与日志 / Builds, progress and logs

```powershell
npm --prefix frontend run frontend:build
npm --prefix frontend run build
npm --prefix frontend run build -- -w
npm --prefix frontend run build -- -e
.\startup.cmd wheel
.\startup.cmd exe
.\startup.cmd bundle
.\startup.cmd full-build
npm --prefix frontend run build:all
npm --prefix frontend run build -- --all
```

项目工具的 `build` 默认 EXE，包括 `ewp build`、`npm run build` 和 `startup.cmd build`；`--wheel` / `-w` 选择 wheel，`--exe` / `-e` 显式 EXE，`--all` 选择完整 pipeline。npm 参数通过 `--` 传递，裸 `-w` 是 npm workspace 参数。完整链为 test → wheel → exe → bundle，可用 `ewp full-build` / `ewp build --all`、`startup.cmd full-build` / `startup.cmd build --all`、`npm run build:all` / `npm run build -- --all`。

Project-tool `build` defaults to EXE for `ewp build`, `npm run build`, and `startup.cmd build`. `--wheel` / `-w` selects wheel, `--exe` / `-e` explicitly selects EXE, and `--all` selects the full pipeline. Pass npm arguments after `--`; bare `-w` belongs to npm workspace selection. The full test → wheel → exe → bundle sequence is available as `ewp full-build` / `ewp build --all`, `startup.cmd full-build` / `startup.cmd build --all`, and `npm run build:all` / `npm run build -- --all`.

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

原 CLI 与 [scripts/build.ps1](../scripts/build.ps1) 保留，[scripts/build.cmd](../scripts/build.cmd) 是菜单兼容入口：

The original CLI and [scripts/build.ps1](../scripts/build.ps1) remain available; [scripts/build.cmd](../scripts/build.cmd) is the compatible menu wrapper:

```powershell
python -m easy_windows_pack.cli build
easy-windows-pack build
python -m easy_windows_pack.cli test
python -m easy_windows_pack.cli bundle
python -m easy_windows_pack.cli info
python -m easy_windows_pack.cli build --output-dir .\artifacts
python -m easy_windows_pack.cli build --skip-tests --skip-bundle
.\scripts\build.ps1 -Python .\.venv\Scripts\python.exe
.\scripts\build-demo.ps1 -Python .\.venv\Scripts\python.exe
```

底层 Python CLI 的 `build` 保持兼容：测试 + wheel + bundle，不包含 EXE；此语义不随项目工具 `build` 默认 EXE / `full-build` 改变。无参数的 `scripts/build.ps1` 运行底层构建，不是新交互菜单。底层 CLI 默认也按 `output/` 分类；显式 `--output-dir` 控制产物目录。`clean` 是底层 CLI 的清理命令，会删除生成物，运行前查看其当前范围；开发菜单不提供 `clean`。`scripts/build-demo.ps1` 委托 `scripts/dev.py exe`，不再维护独立打包流程。

The low-level CLI `build` runs tests + wheel + bundle, without EXE. With no arguments, `scripts/build.ps1` runs that build rather than the new interactive menu. Default outputs are categorized under `output/`; `--output-dir` overrides artifact placement. Low-level `clean` removes generated content: inspect its current scope before use. It is not a menu task. `scripts/build-demo.ps1` delegates to `scripts/dev.py exe` instead of maintaining a separate packaging flow.

## 验证与故障定位 / Validation and troubleshooting

EXE 构建先检查 PyInstaller 的 Windows 启动器，再将底层源码暂存为 `build/exe-src/easy_windows_pack`。该暂存解决 editable 安装的动态包名映射无法被 PyInstaller 静态分析发现的问题；只复制源码，不另维护一套框架。当前开发依赖固定 PyInstaller 6.22.2。

EXE builds check the Windows bootloader and stage the core as `build/exe-src/easy_windows_pack`, allowing PyInstaller to discover the public package without relying on editable import hooks. This is generated source staging, not another maintained framework copy. Development dependencies pin PyInstaller 6.22.2.

出现 `WinError 32`、`Access denied` 或缺少 `runw.exe` 时，先关闭正在运行的构建程序并查看系统文件占用或防护记录；脚本不会自动提权、关闭防护或宣称构建成功。解除实际占用后重新执行 `init`，再执行 `exe`。

For `WinError 32`, `Access denied`, or missing `runw.exe`, close running build processes and inspect file locks or protection records. The tool does not elevate, disable protection, or report success. Run `init` and then `exe` again after the actual lock is resolved.

- `startup.cmd info`：先确认解释器与项目环境；缺少依赖或迁移后导入失败时重新运行 `init`。不要用 `import ewpcore` 绕过公开包映射。
- `startup.cmd test`：验证 Python 行为。浏览器断言入口是 [tests/frontend.html](../tests/frontend.html)，它不由只服务 `frontend/` 的预览服务器暴露；在浏览器中单独打开，查看 `window.testResults` 并记录实际断言数与错误。
- 原生行为需在 Windows 桌面实测；打包成功并不证明原生交互或真实更新已成功。
- 端口占用时省略 `--port` 使用随机端口，或选择其他端口；自动打开失败时手动访问终端 URL。停止预览后地址不再可用。
- 构建失败先查看终端打印的 `output/logs/` 日志，修复失败阶段原因后重跑相关任务。菜单可再次选择任务；不会把失败当成功继续完整构建。
- [历史集成](integration-validation.md)与[目录迁移验收](build-validation.md)只描述各自阶段；npm/Vite 当前测试、产物与原生验收单独写入 [npm-validation.md](npm-validation.md)，不沿用历史通过数。

English troubleshooting:

- Use `startup.cmd info` to confirm the interpreter and environment. Re-run `init` for missing dependencies or stale editable installs after migration; do not bypass public mapping with `import ewpcore`.
- `startup.cmd test` validates Python behavior. Open [tests/frontend.html](../tests/frontend.html) separately in a browser; the frontend-only preview does not serve it. Inspect `window.testResults` and record the actual assertion count and errors.
- Test native behavior on Windows. Successful packaging does not prove native interaction or real updates work.
- If a port is occupied, omit `--port` or select another port. Open the printed URL manually if browser launch fails. The URL stops serving after Ctrl+C.
- Read the printed build log, fix the failing stage and rerun the relevant task. The menu allows another selection after failure; full builds do not continue as if a failed stage passed.
- [Historical integration](integration-validation.md) and [layout migration](build-validation.md) describe their own stages only. Record current npm/Vite tests, artifacts and native validation in [npm-validation.md](npm-validation.md), without reusing old pass counts.