# npm 与 Vite 指南 / npm and Vite guide

[文档导航 / Documentation](README.md) · [开发与兼容入口 / Development](development.md) · [应用与安装包 / Packaging](packaging.md) · [架构 / Architecture](architecture.md) · [本轮验收 / Validation](npm-validation.md)

## 包与环境 / Packages and requirements

`frontend/` 是 `private: true` 的 npm workspace，不作为 npm 包发布；package.json、package-lock.json、vite.config.mjs 和 npm 依赖均放在 frontend，两个包位于 frontend/packages。`create-ewp` 与 `easywindowspack` 当前为 **0.1.2 待发布**，与 Python 分发 `easy-windows-pack` 的源码版本 **0.3.0** 分开管理，PyPI 发布未验证。本文语言、帮助/菜单及构建约定描述当前源码；历史发布、registry 冒烟与本地验收见 [验收记录](npm-validation.md)。

`frontend/` is the private npm workspace and is not published. Its package.json, package-lock.json, vite.config.mjs and dependencies live there; packages live under frontend/packages. Both packages are **0.1.2, pending publication**. Python `easy-windows-pack` sources are separately versioned at **0.3.0**, with PyPI publication unverified. Language, help/menu and build contracts below describe current sources. See the [validation record](npm-validation.md) for publication history, registry smoke tests and local checks.

| 包 / Package | 用途 / Purpose |
| --- | --- |
| `easywindowspack` | 窗口外壳、CSS、桌面组件、可选 Vue/React 包装层，提供 `ewp` 命令 / Window frame, CSS, desktop components, optional Vue/React wrappers and the `ewp` binary |
| `create-ewp` | 基于 `@clack/prompts` 的交互式六模板生成器，提供 `create-ewp` 和 `create-ewp/cli` / Interactive six-template generator using `@clack/prompts`, exposing `create-ewp` and `create-ewp/cli` |

需要 Node.js **>=22.12.0**；当前仓库 Vite 依赖为 **^7.3.7**。Python 初始化、桌面、Python 测试及打包需要 **Python >=3.10**；Windows 桌面还需要 **WebView2**。纯浏览器开发和前端编译不需要 Python。macOS 窗口外观是 UI 主题，不代表已提供 macOS 原生打包。

Require Node.js **>=22.12.0**; the repository uses **Vite ^7.3.7**. Python initialization, desktop execution, Python tests and packaging require **Python >=3.10**. Windows desktop also requires **WebView2**. Browser development and frontend compilation do not require Python. The macOS appearance is a UI theme, not evidence of native macOS packaging support.

## 发布状态与创建项目 / Publication status and project creation

两个包当前为 **0.1.2 待发布**，包含六模板新版 SVG welcome 与配置打包入口。0.1.1 已发布及 Vue TS registry 冒烟通过的历史证据保留在 [验收记录](npm-validation.md)，不作为 0.1.2 的发布验证结果。

Both packages are **0.1.2, pending publication**, including the six-template SVG welcome and configured packaging entries. Historical 0.1.1 publication and Vue TS registry smoke evidence remain in the [validation record](npm-validation.md), without certifying 0.1.2.

所有 npm manifests 与锁文件已同步为 0.1.2，runtime 对 creator 的依赖及新生成项目的 runtime 依赖均为 `^0.1.2`。历史本地 tarball 验收保留原日期与范围；执行发布按用户授权与当前任务范围决定。

All npm manifests and the lockfile are aligned at 0.1.2; the runtime's creator dependency and generated apps' runtime dependency use `^0.1.2`. Historical local tarball checks retain their dates and scope. Publication follows user authorization and the current task scope.

**安装与升级 / Installation and upgrades:** 新建项目可用 `npm create ewp@latest`；全局 CLI 可用 `npm install -g easywindowspack@latest`。`@latest` 跟随 registry 已发布版本；0.1.2 发布后，可用 `@0.1.2` 固定版本，已有项目在 frontend 内用 `npm install easywindowspack@^0.1.2`。依赖升级不自动改写已有 scripts、README、AI 指引或 demo；旧项目按 [任务映射](development.md#菜单与命令--menu-and-commands) 补所需入口。`@latest` follows the published registry version; after 0.1.2 publication, use `@0.1.2` to pin it or upgrade app runtime inside frontend with `^0.1.2`. These upgrades do not rewrite existing project files; add missing task scripts using the development guide.

无需全局安装即可创建；以下为语言与模板选项示例：

Create without a global installation; these examples select language and template:

```powershell
npm create ewp@latest
npm create ewp@latest "My App" -- --lang en --template react-ts --no-install --no-start
```

也可安装或升级全局 CLI，再从任意目录创建项目：

Alternatively, install or upgrade the CLI globally and create from any directory:

```powershell
npm install -g easywindowspack@latest
ewp create
ewp create "My App" --lang en --template vue-ts --no-install --no-start
```

`ewp create` 转调用依赖包的 `create-ewp/cli`，不需要事先找到项目根目录。`create-ewp` 仅拥有自己的 binary，不注册第二个 `ewp`。全局 `ewp` 无参数、`-h` / `--help` 输出帮助，创建帮助用 `ewp create -h`，均无需项目。其余开发任务在项目根或 frontend 内执行。

`ewp create` delegates to the dependency's `create-ewp/cli` without requiring an existing project root. `create-ewp` owns only its own binary and does not register another `ewp`. Global `ewp` with no arguments, `-h`, or `--help` shows help; `ewp create -h` shows creation help. None requires a project. Run other tasks from the project root or frontend.

开发时仍可从源码仓库根目录使用本地生成器：

For development, you can still use the local generator from the checkout root:

```powershell
npm --prefix frontend install
npm --prefix frontend run prepare:npm
node frontend/packages/create-ewp/bin/create-ewp.mjs "../My App" --lang en --template vanilla-ts --no-install --no-start
```

本地生成不需要 registry 中的 `create-ewp`；新生成项目依赖 `easywindowspack@^0.1.2`，该版本待发布，本地安装验收可使用对应 tarball 或明确的本地依赖覆盖。本地生成/pack 不能替代 registry 安装证据。

Local generation needs no registry copy of `create-ewp`. New projects depend on `easywindowspack@^0.1.2`, which is pending publication; local installation checks can use the corresponding tarball or explicit dependency overrides. Local generation/packing does not replace registry installation evidence.

## 交互、模板与选项 / Prompts, templates and options

0.1.2 交互的**第一步选择人类语言** `zh-CN` / `en`，随后选择项目名称、框架、**编程语言** JavaScript / TypeScript、AI 工具、是否安装 npm 依赖、是否初始化 Python 并启动桌面。显式 `--lang` 跳过语言提示。AI 默认全不选，可多选 codex / claude / copilot，资源布局见下节。共六套模板：

In 0.1.2, the **first prompt selects human language**, `zh-CN` / `en`, followed by project name, framework, **programming language** (JavaScript / TypeScript), AI tools, npm installation, and Python initialization/desktop startup. Explicit `--lang` skips the language prompt. AI selection defaults to none; codex / claude / copilot support multiple selection. There are six templates:

| 框架 / Framework | JavaScript | TypeScript |
| --- | --- | --- |
| Vanilla | `vanilla` | `vanilla-ts` |
| Vue | `vue` | `vue-ts` |
| React | `react` | `react-ts` |

| 选项 / Option | 行为 / Behavior |
| --- | --- |
| `--lang zh-CN\|en` | 创建语言或本次命令的显式语言 / Explicit creation or invocation language |
| `--template <name>` | 选择上表模板 / Select a template above |
| `--dir <path>` | 指定目标目录，可包含空格 / Set destination, including paths with spaces |
| `--ai codex,claude,copilot\|none` | 多选 AI 工具，默认 none / Select AI tools; default none |
| `--yes`, `-y` | 跳过交互 / Skip prompts |
| `--install`, `--no-install` | 安装或不安装 npm 依赖 / Install or skip npm dependencies |
| `--start`, `--no-start` | 初始化 Python 并启动桌面，或不启动 / Initialize Python and launch desktop, or skip startup |
| `--help`, `-h` | 显示用法 / Show help |

非交互和 `--yes` 的默认值为 `ewp-app`、Vanilla JavaScript、AI 全不选、不安装、不启动；语言按下节优先级解析，无设置时为 `zh-CN`。显式选项覆盖默认值。安装选择只在 frontend 内执行 `npm install`；启动在所需 npm 安装后执行 `npm run init`、`npm run dev`。`--start --no-install` 冲突。目标必须为空，包括仅含 `.git` 的目录也会拒绝；目录可含空格，npm 包名另行规范化。取消提示返回 130，不创建项目。

Non-interactive and `--yes` defaults are `ewp-app`, Vanilla JavaScript, no AI tools, no installation and no startup. Language follows the priority below, defaulting to `zh-CN` when unset. Explicit options override defaults. Installation alone runs `npm install` inside frontend. Startup performs the required npm installation, then `npm run init` and `npm run dev`. `--start --no-install` conflicts. Targets must be empty, including directories containing only `.git`. Directory names may contain spaces; npm names are normalized separately. Cancelling a prompt returns 130 without creating a project.

## 项目语言与输出 / Project language and output

创建结果把语言写入 `frontend/package.json` 的 `ewp.language`，值为 `zh-CN` 或 `en`。创建时选定的语言用于生成项目 README、自有 AI 指引与 demo 文案；运行时自有 CLI 的帮助、菜单、提示和任务说明按 **显式 `--lang` → 环境变量 `EWP_LANG` → 保存的 `ewp.language` → `zh-CN`** 解析。运行已有项目时，`--lang` 和环境变量只覆盖命令输出，不改保存值，也不重写 README/AI/demo。修改保存值改变后续命令默认语言，已有应用文案自行维护。

Creation writes `zh-CN` or `en` to `ewp.language` in `frontend/package.json`. The creation language selects the generated README, first-party AI guidance, and demo text. First-party CLI help, menus, prompts, and task messages resolve **explicit `--lang` → environment variable `EWP_LANG` → saved `ewp.language` → `zh-CN`**. In existing projects, flags and environment overrides affect output only, without changing the saved value or rewriting README/AI/demo files. Editing the saved value changes future command defaults; maintain existing application text separately.

```powershell
npm run help -- --lang en
npm run ewp -- info --lang zh-CN
ewp menu --lang en
```

上面的 npm 命令在 frontend 内执行。语言选择后自有内容使用所选单语。第三方 **npm / pip / Vite** 安装、构建和错误日志，以及 npm 自己的 `Ok to proceed?` 确认保留原生输出；生成器 `--yes` 不控制 npm 的确认。

Run the npm examples inside frontend. After language selection, first-party content uses one selected language. Third-party **npm / pip / Vite** output and npm's own `Ok to proceed?` confirmation remain untranslated. Generator `--yes` does not control npm's confirmation.

## AI 资源布局 / AI resource layout

生成器按选择生成 AI 资源，默认不创建 AI 指引或入口。选择任一工具时，共用指引位于 `docs/.easy-dev/agent.md`，共用 Skill 位于 `docs/.easy-dev/skills/easy-dev/SKILL.md`；所选工具的入口/Skill 读取该共用内容。**仅生成所选工具的目录**，Claude 单独使用不依赖 Codex 目录。

The generator emits AI resources only for selected tools; none are selected by default. Selecting any tool creates shared guidance at `docs/.easy-dev/agent.md` and the shared skill at `docs/.easy-dev/skills/easy-dev/SKILL.md`. Selected tool entries/skills load that shared content. **Only selected tool directories are generated**; selecting Claude alone does not require Codex directories.

| 选择 / Selection | 标准入口 / Standard entry | Skill 路由 / Skill route |
| --- | --- | --- |
| Codex | 根 / Root `AGENTS.md` | `docs/.agents/skills/easy-dev/SKILL.md` → 共用 Skill / shared skill |
| Claude | 根 / Root `CLAUDE.md` | `docs/.claude/skills/easy-dev/SKILL.md` → 共用 Skill / shared skill |
| Copilot | `.github/copilot-instructions.md` | 直接读共用指引与 Skill / Reads shared guidance and skill directly |

docs 下的 Skills 不再属于工具默认自动发现目录，标准入口必须显式引导读取指引和 Skill，再按任务读取分片。当前源码仓库使用 `docs/agent.md` 路由与 docs 内 index/design 摘要，`docs/.easy-dev/install-state.json` 保留安装追踪；生成项目的共用指引布局与仓库摘要布局分别维护。此节为生成器约定，当前生成验收以 [npm-validation.md](npm-validation.md) 的实际记录为准。

Skills under docs are outside default tool discovery locations. Standard entries explicitly load guidance and skill, then task-specific references. This checkout uses `docs/agent.md` to route framework development and retains installation tracking in `docs/.easy-dev/install-state.json`. Application summaries and generator guidance have separate roles. Actual generation validation is recorded in [npm-validation.md](npm-validation.md).

生成应用的 `docs/index.md` / `docs/design.md` 是简短的应用入口和 UI 摘要，随真实业务补充，不要求数量盘点或框架内部清单。本仓库 [agent 路由](agent.md) 服务框架 developer，按任务读取 architecture、npm、development 或 packaging；内部开发不自动写业务摘要。生成器模板由 create-ewp 权威实现维护，技能 templates 仅提供精简示例。

Generated `docs/index.md` / `docs/design.md` are brief application entry and UI summaries to update as actual business features develop, without inventory counts or framework internals. The checkout's [agent route](agent.md) serves framework developers through architecture, npm, development or packaging guides. Internal work does not automatically rewrite business summaries. create-ewp owns generated templates; skill templates are small examples.

## 初始化与开发 / Initialization and development

在仓库或生成项目的 frontend 目录执行以下开发/构建命令（先从项目根 `cd frontend`）；从项目根执行时加 `--prefix frontend`，例如 `npm --prefix frontend run dev`。Python 环境和产物仍位于项目根下的 `.venv` / `output`：

Run the following development/build commands inside frontend in the checkout or generated project (first `cd frontend` from the root). From the root use `--prefix frontend`, for example `npm --prefix frontend run dev`. Python environments and outputs remain under the project root's `.venv` / `output`:

```powershell
npm install
npm run init
npm run dev
```

`npm run init` 创建或复用 `.venv`，验证 Python >=3.10，安装 npm 依赖、先编译前端，再安装 Python 开发/托盘依赖，确保首次 editable metadata 能找到编译资源。无效的既有 `.venv` 会报错，不会自动删除。初始化在缺少 `.venv` 时可查找系统 Python；桌面开发、Python 测试及打包使用项目解释器，不必手动激活。

`npm run init` creates or reuses `.venv`, validates Python >=3.10, installs npm dependencies and compiles the frontend before installing Python development/tray dependencies so first-run editable metadata can find compiled assets. An invalid existing `.venv` reports an error and is not automatically deleted. Initialization may use system Python when `.venv` is absent. Desktop development, Python tests and packaging use the project interpreter without manual activation.

`npm run dev` 默认启动本机 Vite，绑定 `127.0.0.1` 并选择可用动态端口；等待服务就绪后，将实际 URL 通过 `EWP_DEV_URL` 传给启用 debug 的 pywebview。前端使用 Vite HMR。实际地址以终端输出为准，不固定为 5173。Ctrl+C 关闭 Vite 与桌面进程树。

`npm run dev` starts Vite on loopback `127.0.0.1` with an available dynamic port. Once ready, it passes the actual URL through `EWP_DEV_URL` to pywebview running with debug enabled. Frontend changes use Vite HMR. Read the printed URL rather than assuming port 5173. Ctrl+C closes Vite and the desktop process tree.

```powershell
npm run dev -- --web
npm run dev -- --web --port 8080 --no-open
npm run frontend:dev
```

`--web` 不启动桌面；`frontend:dev` 是浏览器开发入口。`--no-open` 禁止自动打开浏览器，`--port 0` 表示动态端口。浏览器没有真实 `window.pywebview.api`，只能验证外观与前端交互；拖拽、缩放、Snap、托盘、安装和重启仍需 Windows 桌面或真实宿主验证。

`--web` skips desktop startup; `frontend:dev` is the browser development entry. `--no-open` suppresses browser launch and `--port 0` requests a dynamic port. Browser preview has no real `window.pywebview.api`: validate appearance and frontend interaction there, and native dragging, resizing, Snap, tray, installation and restart in Windows desktop or the real host.

主页面入口为 [frontend/index.html](../frontend/index.html)，业务装配在 [frontend/src/main.js](../frontend/src/main.js)。旧 [frontend/src/index.html](../frontend/src/index.html) 属于弃用兼容入口，不作为新开发或生产装载入口；旧静态示例/跳转的实际状态见 [npm 验收记录](npm-validation.md)。组件页仍为 [frontend/src/components.html](../frontend/src/components.html)。

The primary page is [frontend/index.html](../frontend/index.html), composed by [frontend/src/main.js](../frontend/src/main.js). The old [frontend/src/index.html](../frontend/src/index.html) is a deprecated compatibility entry, not the new development or production entry. Its static-demo/redirect status is tracked in [npm validation](npm-validation.md). The component page remains [frontend/src/components.html](../frontend/src/components.html).

## 帮助、菜单与直接任务 / Help, menu and direct tasks

在 frontend 内用 `npm run help`、`npm run info`、`npm run menu`；任意任务用 `npm run ewp -- <task> [options]`。全局安装 CLI 后，项目根可直接 `ewp <task>`；未全局安装时使用 `npm --prefix frontend run ewp -- <task>`。根 `.\startup.cmd` 无参数打开菜单，`.\startup.cmd <task>` 直接执行同一任务；全局 `ewp` 无参数只显示帮助，用 `ewp menu` 显式打开菜单。

Inside frontend, use `npm run help`, `npm run info`, and `npm run menu`; invoke any task with `npm run ewp -- <task> [options]`. A globally installed CLI supports `ewp <task>` from the project root. Without it, use `npm --prefix frontend run ewp -- <task>`. Root `.\startup.cmd` opens the menu with no arguments and `.\startup.cmd <task>` runs the same task directly. Global `ewp` without arguments shows help; use `ewp menu` to open the menu.

仓库与新生成项目的 npm scripts / npm scripts in the checkout and new apps: `help`、`ewp`、`menu`、`init`、`dev`、`browser`、`frontend`、`demo`、`wheel`、`exe`、`app`、`installer`、`bundle`、`build`、`build:all`、`full-build`、`test`、`info`、`check`，以及 / plus `frontend:dev`、`frontend:build`、`frontend:preview`、`build:wheel`、`build:exe`、`build:app`。生成模板附带 `tests/npm-runtime.test.mjs`；`npm run check` / `ewp check` / `startup.cmd check` 执行 3 项 Node runtime exports/config 检查（公共 API/CSS、Vite 配置、应用 manifest/HTML 入口） / Generated templates include the test entry; all three commands run three Node runtime exports/config checks (public API/CSS, Vite configuration, application manifest/HTML entry points). `browser` 使用浏览器 HMR，`dev` 使用桌面 HMR，`frontend` 只编译，`frontend:preview` 预览编译结果，`demo` 编译后运行桌面且无 HMR。

`browser` / `frontend:dev` provides browser HMR; `dev` provides desktop HMR. `frontend` / `frontend:build` compiles only, `frontend:preview` previews compiled output, and `demo` builds then launches the desktop without HMR. The optional `--debug` enables developer tools for `demo`. Full root/CLI/npm mappings are in the [development guide](development.md#菜单与命令--menu-and-commands).

## 前端与 Python 构建 / Frontend and Python builds

```powershell
npm run frontend:build
npm run frontend:preview
npm run build
npm run build -- -w
npm run build -- --wheel
npm run build -- -e
npm run app
npm run build -- --mode onedir
npm run installer
npm run build:all
npm run build -- --all
```

| 命令 / Command | 结果 / Result |
| --- | --- |
| `frontend:build` | Vite 编译至 `output/frontend/`，生产 `base: './'` 使用相对资源 URL / Compile into `output/frontend/` with relative production asset URLs |
| `frontend:preview` | 本机预览已编译前端 / Preview the compiled frontend locally |
| `build`、`build -- -e`、`build:exe` | 默认或显式 EXE；先编译前端，再执行 Python 打包 / Default or explicit EXE, frontend build before Python packaging |
| `build -- -w`、`build -- --wheel`、`build:wheel` | 前端编译后构建 Python wheel / Build frontend, then Python wheel |
| `app`、`build:app` | 按项目根 ewp.pack.json 构建应用，进入 output/apps / Build the configured application under output/apps |
| `build -- --mode onedir` | 配置构建，应用目录包含 EXE 和依赖 / Configured app directory containing EXE and dependencies |
| `installer` | 构建应用及 setup，进入 output/installers / Build app and setup under output/installers |
| `bundle` | 委托 Python source bundle 任务 / Delegate source bundle task to Python |
| `build:all`、`full-build`、`build -- --all` | test → wheel → exe → bundle 完整 pipeline / Full pipeline |

**npm 参数必须经过 `--` 分隔符。** `npm run build -w` 中裸 `-w` 是 npm 的 workspace 选项，不是 EWP wheel 选项。直接调用可用 `ewp build -w` / `ewp build --wheel`、`ewp full-build` / `ewp build --all`；wheel、EXE、all 三种目标互斥。

**Pass script arguments after npm's `--` separator.** Bare `-w` in `npm run build -w` belongs to npm workspace selection, not EWP wheel selection. Direct CLI calls support `ewp build -w` / `ewp build --wheel` and `ewp full-build` / `ewp build --all`. Wheel, EXE, and all selectors are mutually exclusive.

新生成项目默认包含 `ewp.pack.json`。`--config`、`--mode onefile|onedir`、`--installer` 将 build/exe 的 EXE 阶段转入配置构建；无这些参数的 legacy build/exe 仍输出 `output/exe/`。`--wheel` 不接受这些打包参数。安装功能、镜像运行库、hooks、GUI/silent 与卸载边界见 [双语打包指南](packaging.md)。

New projects include `ewp.pack.json`. `--config`, `--mode onefile|onedir`, and `--installer` route the EXE stage of build/exe through configured packaging; legacy build/exe without them retains `output/exe/`. Wheel selection rejects these packaging flags. See the [packaging guide](packaging.md) for features, mirrors/runtimes, hooks, GUI/silent and uninstall limits.

EXE 的入口是 `backend/src/demo.py`；生产环境装载 `output/frontend/index.html`，PyInstaller 仅携带编译后的 `output/frontend/` 作为前端资源，不把 Vue/React/TS 源码作为运行页面。前端编译由 Node/Vite 负责，原生 EXE 由 Python/PyInstaller 负责。只有开发模式使用 `EWP_DEV_URL`。

EXEs start at `backend/src/demo.py` and load `output/frontend/index.html` in production. PyInstaller includes the compiled `output/frontend/` as frontend resources, not Vue/React/TS source pages. Node/Vite compiles the frontend; Python/PyInstaller packages the native executable. `EWP_DEV_URL` is for development.

两类 wheel 不可混淆：仓库框架 wheel 的 metadata 仍携带 `easy_windows_pack` 核心及 `share/easy-windows-pack/frontend/` 下的源组件、桥接与契约；生成应用 wheel 按自身 metadata 携带 `output/frontend/index.html` 和编译 assets 到应用的 share 目录。框架 wheel 任务先编译前端并不意味着其 metadata 改为应用 wheel。分别检查实际 wheel 内容。

Distinguish the two wheel contracts. Repository framework wheel metadata includes the `easy_windows_pack` core and source components, bridges and contracts under `share/easy-windows-pack/frontend/`. Generated application wheel metadata includes compiled `output/frontend/index.html` and assets under the application's share directory. A frontend build before the framework wheel does not change its metadata into an application wheel. Inspect each actual wheel separately.

产物分别在 `output/frontend/`、`output/wheels/`、legacy `output/exe/`、配置应用 `output/apps/`、安装包 `output/installers/`、`output/bundles/`、`output/npm/`；任务日志在 `output/logs/`，PyInstaller 暂存/缓存在 `build/`。

Outputs use `output/frontend/`, `output/wheels/`, legacy `output/exe/`, configured `output/apps/`, `output/installers/`, `output/bundles/` and `output/npm/`. Task logs use `output/logs/`; PyInstaller staging and caches use `build/`.

## 前端公共 API 与模板组合 / Frontend public API and template composition

| 导入 / Import | 公共能力 / Public capability |
| --- | --- |
| `easywindowspack` | `mountFrame`；桥接 `getWindowApi`、`setWindowStyle`、`setTitleBarMode`、`call`、`isSupportedResizeDirection` |
| `easywindowspack/frame.css` | 窗口外壳样式 / Window frame styles |
| `easywindowspack/desktop.css` | 桌面组件样式 / Desktop component styles |
| `easywindowspack/desktop-components.js` | `createMatrixProgress`、`createBootCurtain`、`createEntrance` |
| `easywindowspack/desktop-updates.js` | `createDesktopUpdateClient` |
| `easywindowspack/vue` | 命名/默认 `WindowFrame`，Vue >=3.3 可选 peer / Named/default `WindowFrame`, optional Vue >=3.3 peer |
| `easywindowspack/react` | 命名/默认 `WindowFrame`，React >=18 可选 peer / Named/default `WindowFrame`, optional React >=18 peer |

```javascript
import { mountFrame } from 'easywindowspack';
import 'easywindowspack/frame.css';

const handle = mountFrame(document.querySelector('#app'), {
  title: 'My App', windowStyle: 'windows', mode: 'default',
  content: document.createElement('main'),
});
handle.update({ title: 'Ready' });
// 业务卸载时 / When the application unmounts:
handle.dispose();
```

`mountFrame(container, options)` 返回 `frame`、`content`、`update(options)`、幂等 `dispose()` / `remove()`。同容器重新挂载会释放旧实例。`content` 字符串作为文本；业务 DOM 使用节点。使用实例 `update` 修改单个外壳；全局 `setWindowStyle` 影响所有已挂载外壳。切换 native 标题栏仍走桌面桥接/重建窗口流程。

`mountFrame(container, options)` returns `frame`, `content`, `update(options)` and idempotent `dispose()` / `remove()`. Remounting in the same container releases its previous instance. String content is text; use nodes for application DOM. Instance updates affect one frame; global `setWindowStyle` affects all mounted frames. Native title-bar transitions still use the desktop bridge/window recreation flow.

六套模板复用同一个 `mountFrame`。Vue / React 模板各自拥有薄 `Frame` / `wrapFrame` 组合层，通过 Vue Teleport / React portal 将 slot / children 放入外壳内容节点，并同步 props 和清理实例；不把框架渲染的内容序列化成 HTML，因此保留响应式、事件与更新。包的 `./vue` / `./react` 是可选公共入口，模板自有组合层与这些导出要分别核对。Vanilla 消费者无需安装 Vue 或 React；它们不是所有项目的规范。

All six templates reuse `mountFrame`. Vue and React templates own thin `Frame` / `wrapFrame` composition layers, using Vue Teleport / React portals for slot/children content, prop synchronization and cleanup. Framework content is not serialized into HTML, preserving reactivity, events and updates. Package `./vue` / `./react` exports are optional public entries; inspect them separately from template-owned composition. Vanilla consumers need neither framework; Vue and React conventions do not apply to all projects.

## 单源资源与本地打包 / Single-source resources and local packing

[scripts/prepare-npm.mjs](../scripts/prepare-npm.mjs) 从权威源码生成 npm 分发资源：

[scripts/prepare-npm.mjs](../scripts/prepare-npm.mjs) generates npm distribution resources from authoritative sources:

- `frontend/components/` 与 `frontend/frame/ewpframe/` → `frontend/packages/easywindowspack/assets/`，包括由 HTML 生成的 `frame-template.mjs`。运行时不依赖 Vite `?raw`。 / Components and bridges generate runtime assets, including the HTML-derived frame module; runtime does not depend on Vite `?raw`.
- `backend/base/ewpcore/`、`scripts/dev.py`、根 `startup.cmd`、`scripts/startup.cmd`、`LICENSE` → `frontend/packages/create-ewp/templates/common/`；六套模板共同组合 runtime、开发脚本及 common 中的 README。 / Core runtime, development script, launchers and license populate common resources; all six templates compose these with the common README.

Python runtime、脚本及 npm assets 的副本是生成物，不手工维护；修改权威来源后重新 prepare。公共模板 README 的源说明位于 common，不是从根 README 自动复制。脚手架运行时只读取随包模板，不访问原仓库；缺少必需 prepared runtime 会在写目标目录前失败。

Runtime/script copies and npm assets are generated, not separately maintained. Change authoritative sources and rerun preparation. The common template README is template-owned; it is not automatically copied from the root README. The generator selects common `README.md` or `README.en.md` and emits the chosen content as the app's root `README.md`. It reads packaged templates without accessing the original repository and rejects missing required prepared runtime before writing the destination.

common 的 `README.md` / `README.en.md` 按创建语言选择，生成项目根仍使用 `README.md`；不是从根框架 README 自动复制。

```powershell
npm run prepare:npm
npm pack --workspace create-ewp --pack-destination ../output/npm
npm pack --workspace easywindowspack --pack-destination ../output/npm
```

上述 pack 和下述 publish 命令均在 frontend 内执行，打包前确保项目根 `output/npm` 目录存在。检查 tarball 的 `bin`、`lib`、exports、CSS、类型、LICENSE、README、六套模板和 common runtime；`pack` 不等于发布，也不证明干净环境安装或 EXE 启动通过。workspace 的 `prepack` 会执行同一 prepare 来源。验收证据写入 [npm-validation.md](npm-validation.md)。

Run the pack commands above and publish commands below inside frontend; ensure root `output/npm` exists before packing. Inspect binaries, library files, exports, CSS, types, licenses, READMEs, six templates and common runtime in the tarballs. Packing is not publication and does not certify clean-environment installation or native launch. Workspace `prepack` hooks use the same preparation source. Record evidence in [npm-validation.md](npm-validation.md).

0.1.2 的两个包当前待发布；0.1.1 的历史发布证据保留在 [验收记录](npm-validation.md)。发布顺序为 **create-ewp → easywindowspack**：runtime CLI 依赖 `create-ewp/cli`，生成项目依赖 runtime。执行发布按用户授权与当前任务范围决定，已获授权不重复确认。以下命令供发布时参考：

Both 0.1.2 packages are pending publication; historical 0.1.1 evidence remains in the [validation record](npm-validation.md). Publication order is **create-ewp → easywindowspack**: the runtime CLI depends on `create-ewp/cli`, and generated apps depend on the runtime. Execution follows user authorization and current scope, without asking again for existing authorization. The following commands are release references:

```powershell
npm publish -w create-ewp --access public
npm publish -w easywindowspack --access public
```

## Legacy 入口 / Legacy entry points

根 `startup.cmd` → `scripts/startup.cmd` → `scripts/dev.py` 提供按项目语言显示的菜单；`scripts/build.cmd` 为兼容包装，其他构建脚本也在 scripts。`browser` 转 Vite，`frontend` 只编译前端。项目 `build` 默认 EXE；`full-build` / `build --all` / `npm run build:all` 执行 test → wheel → exe → bundle。底层 `python -m easy_windows_pack.cli build` / `scripts/build.ps1` 仍是 test → wheel → bundle，不包含 EXE。详情见 [开发手册](development.md)。

Root `startup.cmd` delegates through `scripts/startup.cmd` to `scripts/dev.py` for the menu in the project language. `scripts/build.cmd` is a compatible wrapper; other build scripts live under scripts too. `browser` delegates to Vite and `frontend` compiles. Project `build` defaults to EXE; `full-build`, `build --all`, and `npm run build:all` run test → wheel → exe → bundle. Low-level `python -m easy_windows_pack.cli build` / `scripts/build.ps1` retain test → wheel → bundle without EXE. See [development](development.md).