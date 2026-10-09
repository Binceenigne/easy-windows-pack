# npm 与 Vite 指南 / npm and Vite guide

[文档导航 / Documentation](README.md) · [开发与兼容入口 / Development](development.md) · [架构 / Architecture](architecture.md) · [本轮验收 / Validation](npm-validation.md)

## 包与环境 / Packages and requirements

`frontend/` 是 `private: true` 的 npm workspace，不作为 npm 包发布；package.json、package-lock.json、vite.config.mjs 和 npm 依赖均放在 frontend，两个包位于 frontend/packages。两个 ESM 工作区包独立版本为 `0.1.0`，与 Python 分发 `easy-windows-pack` 的 `0.2.1` 分开管理。

`frontend/` is the private npm workspace and is not published. Its package.json, package-lock.json, vite.config.mjs and dependencies live there; packages live under frontend/packages. The two ESM packages are versioned independently at `0.1.0`; the Python distribution `easy-windows-pack` remains separately versioned at `0.2.1`.

| 包 / Package | 用途 / Purpose |
| --- | --- |
| `easywindowspack@0.1.0` | 窗口外壳、CSS、桌面组件、可选 Vue/React 包装层，提供 `ewp` 命令 / Window frame, CSS, desktop components, optional Vue/React wrappers and the `ewp` binary |
| `create-ewp@0.1.0` | 基于 `@clack/prompts` 的交互式六模板生成器，提供 `create-ewp` 和 `create-ewp/cli` / Interactive six-template generator using `@clack/prompts`, exposing `create-ewp` and `create-ewp/cli` |

需要 Node.js **>=22.12.0**；当前仓库 Vite 依赖为 **^7.3.7**。Python 初始化、桌面、Python 测试及打包需要 **Python >=3.10**；Windows 桌面还需要 **WebView2**。纯浏览器开发和前端编译不需要 Python。macOS 窗口外观是 UI 主题，不代表已提供 macOS 原生打包。

Require Node.js **>=22.12.0**; the repository uses **Vite ^7.3.7**. Python initialization, desktop execution, Python tests and packaging require **Python >=3.10**. Windows desktop also requires **WebView2**. Browser development and frontend compilation do not require Python. The macOS appearance is a UI theme, not evidence of native macOS packaging support.

## 发布状态与创建项目 / Publication status and project creation

以下 registry 命令是**发布后的用法**。本文不确认包已发布，也未确认 `create-ewp` / `easywindowspack` 公共名称的可用性或所有权。发布者先核实名称与账号权限；发布顺序为 **create-ewp → easywindowspack**，后者依赖 `create-ewp/cli`，生成项目则依赖 `easywindowspack`。两包就绪后才可完整使用 registry 创建、安装与启动流程。

The registry commands below describe **usage after publication**. This document does not certify publication or availability/ownership of either public package name. The publisher must verify names and account permissions first. Publish **create-ewp before easywindowspack**: the latter depends on `create-ewp/cli`, while generated apps depend on `easywindowspack`. Both must be available for the complete registry-based creation, installation and startup flow.

无需全局安装，发布后可以直接运行：

After publication, create a project without a global installation:

```powershell
npm create ewp@latest
npm create ewp@latest "My App" -- --template react-ts --no-install --no-start
```

也可在发布后全局安装 CLI，再从任意目录创建项目：

Alternatively, after publication, install the CLI globally and create a project from any directory:

```powershell
npm install -g easywindowspack
ewp create
ewp create "My App" --template vue-ts --no-install --no-start
```

`ewp create` 转调用依赖包的 `create-ewp/cli`，不需要事先找到项目根目录。`create-ewp` 仅拥有自己的 binary，不注册第二个 `ewp`。其余 `ewp` 开发命令在项目中执行。

`ewp create` delegates to the dependency's `create-ewp/cli` without requiring an existing project root. `create-ewp` owns only its own binary and does not register another `ewp`. Run other development commands inside a project.

未发布时从源码仓库根目录使用本地生成器：

Before publication, use the local generator from the checkout root:

```powershell
npm --prefix frontend install
npm --prefix frontend run prepare:npm
node frontend/packages/create-ewp/bin/create-ewp.mjs "../My App" --template vanilla-ts --no-install --no-start
```

本地生成不需要 registry 中的 `create-ewp`；生成项目的 `npm install` 仍需可解析的 `easywindowspack`。未发布验收应使用本地打包的 tarball 或主维护者明确配置的本地依赖，不能把源码生成成功描述为 registry 安装成功。

Local generation does not require a registry copy of `create-ewp`; installing the generated app still requires a resolvable `easywindowspack`. Before publication, validate with locally packed tarballs or explicit local dependency overrides. Successful local generation does not prove registry installation works.

## 交互、模板与选项 / Prompts, templates and options

交互流程选择项目名称、框架、语言、AI 工具、是否安装 npm 依赖、是否初始化 Python 并启动桌面。AI 默认全不选，可多选 codex / claude / copilot，资源布局见下节。框架为 Vanilla / Vue / React，语言为 JavaScript / TypeScript，共六套模板：

Prompts collect project name, framework, language, AI tools, npm installation and Python initialization/desktop startup. AI selection defaults to none; codex / claude / copilot support multiple selection, with resource layout below. Vanilla, Vue and React each support JavaScript and TypeScript:

| 框架 / Framework | JavaScript | TypeScript |
| --- | --- | --- |
| Vanilla | `vanilla` | `vanilla-ts` |
| Vue | `vue` | `vue-ts` |
| React | `react` | `react-ts` |

| 选项 / Option | 行为 / Behavior |
| --- | --- |
| `--template <name>` | 选择上表模板 / Select a template above |
| `--dir <path>` | 指定目标目录，可包含空格 / Set destination, including paths with spaces |
| `--yes`, `-y` | 跳过交互 / Skip prompts |
| `--install`, `--no-install` | 安装或不安装 npm 依赖 / Install or skip npm dependencies |
| `--start`, `--no-start` | 初始化 Python 并启动桌面，或不启动 / Initialize Python and launch desktop, or skip startup |
| `--help`, `-h` | 显示用法 / Show help |

非交互和 `--yes` 的默认值为 `ewp-app`、Vanilla JavaScript、AI 全不选、不安装、不启动；显式选项覆盖默认值。安装选择只在 frontend 内执行 `npm install`；启动在所需 npm 安装后执行 `npm run init`、`npm run dev`。`--start --no-install` 冲突。目标必须为空，包括仅含 `.git` 的目录也会拒绝；目录可含空格，npm 包名另行规范化。取消提示返回 130，不创建项目。

Non-interactive and `--yes` defaults are `ewp-app`, Vanilla JavaScript, no AI tools, no installation and no startup; explicit options override them. Installation alone runs `npm install` inside frontend. Startup performs the required npm installation, then `npm run init` and `npm run dev`. `--start --no-install` conflicts. Targets must be empty, including directories containing only `.git`. Directory names may contain spaces; npm names are normalized separately. Cancelling a prompt returns 130 without creating a project.

## AI 资源布局 / AI resource layout

生成器按选择生成 AI 资源，默认不创建 AI 指引或入口。选择工具时，共用指引位于 `docs/.easy-dev/agent.md`，主 Skill 位于 `docs/.agents/skills/easy-dev/`；Claude 增加 `docs/.claude/skills/easy-dev/` 薄路由，继续复用唯一正文，不复制另一套规则。根仅生成所选工具的标准薄入口：Codex 为 `AGENTS.md`，Claude 为 `CLAUDE.md`，Copilot 为 `.github/copilot-instructions.md`。

The generator emits AI resources only for selected tools; none are selected by default. Shared guidance lives at `docs/.easy-dev/agent.md`, with the main skill at `docs/.agents/skills/easy-dev/`. Claude adds a thin router at `docs/.claude/skills/easy-dev/` that reuses the single source. Only selected tools receive standard thin entries: root `AGENTS.md` for Codex, root `CLAUDE.md` for Claude, and `.github/copilot-instructions.md` for Copilot.

docs 下的 Skills 不再属于工具默认自动发现目录，标准入口必须显式引导读取指引和 Skill，再按任务读取分片。当前源码仓库使用 `docs/agent.md` 路由与 docs 内 index/design 摘要，`docs/.easy-dev/install-state.json` 保留安装追踪；生成项目的共用指引布局与仓库摘要布局分别维护。此节为生成器约定，当前生成验收以 [npm-validation.md](npm-validation.md) 的实际记录为准。

Skills under docs are outside default tool discovery locations. Standard entries must explicitly load the guidance and skill, then task-specific references. This checkout uses `docs/agent.md` plus index/design summaries in docs and retains installation tracking in `docs/.easy-dev/install-state.json`. Generated guidance and repository summaries have separate roles. This section defines the generator contract; actual generation validation is recorded in [npm-validation.md](npm-validation.md).

## 初始化与开发 / Initialization and development

在仓库或生成项目的 frontend 目录执行以下开发/构建命令（先从项目根 `cd frontend`）；从项目根执行时加 `--prefix frontend`，例如 `npm --prefix frontend run dev`。Python 环境和产物仍位于项目根下的 `.venv` / `output`：

Run the following development/build commands inside frontend in the checkout or generated project (first `cd frontend` from the root). From the root use `--prefix frontend`, for example `npm --prefix frontend run dev`. Python environments and outputs remain under the project root's `.venv` / `output`:

```powershell
npm install
npm run init
npm run dev
```

`npm run init` 创建或复用 `.venv`，验证 Python >=3.10，安装 Python 开发/托盘依赖及 npm 依赖。无效的既有 `.venv` 会报错，不会自动删除。只有初始化在缺少 `.venv` 时可查找系统 Python；桌面开发、Python 测试及打包使用项目解释器，不必手动激活。

`npm run init` creates or reuses `.venv`, validates Python >=3.10, and installs Python development/tray dependencies plus npm dependencies. An invalid existing `.venv` reports an error and is not automatically deleted. Only initialization may use system Python when `.venv` is absent. Desktop development, Python tests and packaging use the project interpreter without manual activation.

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

## 前端与 Python 构建 / Frontend and Python builds

```powershell
npm run frontend:build
npm run frontend:preview
npm run build
npm run build -- -w
npm run build -- --wheel
npm run build -- -e
```

| 命令 / Command | 结果 / Result |
| --- | --- |
| `frontend:build` | Vite 编译至 `output/frontend/`，生产 `base: './'` 使用相对资源 URL / Compile into `output/frontend/` with relative production asset URLs |
| `frontend:preview` | 本机预览已编译前端 / Preview the compiled frontend locally |
| `build`、`build -- -e`、`build:exe` | 默认或显式 EXE；先编译前端，再执行 Python 打包 / Default or explicit EXE, frontend build before Python packaging |
| `build -- -w`、`build -- --wheel`、`build:wheel` | 前端编译后构建 Python wheel / Build frontend, then Python wheel |
| `bundle`（仓库 / checkout） | 委托 Python source bundle 任务 / Delegate source bundle task to Python |

**npm 参数必须经过 `--` 分隔符。** `npm run build -w` 中裸 `-w` 是 npm 的 workspace 选项，不是 EWP wheel 选项。直接调用可用 `ewp build -w` / `ewp build --wheel`；`-w` 与 `-e` 不可同时选择。

**Pass script arguments after npm's `--` separator.** Bare `-w` in `npm run build -w` belongs to npm workspace selection, not EWP wheel selection. Direct CLI calls support `ewp build -w` / `ewp build --wheel`; do not combine wheel and EXE selectors.

EXE 的入口是 `backend/src/demo.py`；生产环境装载 `output/frontend/index.html`，PyInstaller 仅携带编译后的 `output/frontend/` 作为前端资源，不把 Vue/React/TS 源码作为运行页面。前端编译由 Node/Vite 负责，原生 EXE 由 Python/PyInstaller 负责。只有开发模式使用 `EWP_DEV_URL`。

EXEs start at `backend/src/demo.py` and load `output/frontend/index.html` in production. PyInstaller includes the compiled `output/frontend/` as frontend resources, not Vue/React/TS source pages. Node/Vite compiles the frontend; Python/PyInstaller packages the native executable. `EWP_DEV_URL` is for development.

两类 wheel 不可混淆：仓库框架 wheel 的 metadata 仍携带 `easy_windows_pack` 核心及 `share/easy-windows-pack/frontend/` 下的源组件、桥接与契约；生成应用 wheel 按自身 metadata 携带 `output/frontend/index.html` 和编译 assets 到应用的 share 目录。框架 wheel 任务先编译前端并不意味着其 metadata 改为应用 wheel。分别检查实际 wheel 内容。

Distinguish the two wheel contracts. Repository framework wheel metadata includes the `easy_windows_pack` core and source components, bridges and contracts under `share/easy-windows-pack/frontend/`. Generated application wheel metadata includes compiled `output/frontend/index.html` and assets under the application's share directory. A frontend build before the framework wheel does not change its metadata into an application wheel. Inspect each actual wheel separately.

产物分别在 `output/frontend/`、`output/wheels/`、`output/exe/`、`output/bundles/`、`output/npm/`；任务日志在 `output/logs/`，PyInstaller 暂存/缓存在 `build/`。

Outputs are categorized under `output/frontend/`, `output/wheels/`, `output/exe/`, `output/bundles/` and `output/npm/`. Task logs use `output/logs/`; PyInstaller staging and caches use `build/`.

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

Runtime/script copies and npm assets are generated, not separately maintained. Change authoritative sources and rerun preparation. The common template README is template-owned; it is not automatically copied from the root README. The generator reads packaged templates without accessing the original repository and rejects missing required prepared runtime before writing the destination.

```powershell
npm run prepare:npm
npm pack --workspace create-ewp --pack-destination ../output/npm
npm pack --workspace easywindowspack --pack-destination ../output/npm
```

上述 pack 和下述 publish 命令均在 frontend 内执行，打包前确保项目根 `output/npm` 目录存在。检查 tarball 的 `bin`、`lib`、exports、CSS、类型、LICENSE、README、六套模板和 common runtime；`pack` 不等于发布，也不证明干净环境安装或 EXE 启动通过。workspace 的 `prepack` 会执行同一 prepare 来源。验收证据写入 [npm-validation.md](npm-validation.md)。

Run the pack commands above and publish commands below inside frontend; ensure root `output/npm` exists before packing. Inspect binaries, library files, exports, CSS, types, licenses, READMEs, six templates and common runtime in the tarballs. Packing is not publication and does not certify clean-environment installation or native launch. Workspace `prepack` hooks use the same preparation source. Record evidence in [npm-validation.md](npm-validation.md).

仅由用户核实名称、权限及产物后手动发布，以下命令仅供操作说明；agent 不执行 publish：

Only the user publishes, after verifying names, permissions and artifacts. These are manual instructions; the agent does not execute publication:

```powershell
npm publish -w create-ewp --access public
npm publish -w easywindowspack --access public
```

## Legacy 入口 / Legacy entry points

根 `startup.cmd` → `scripts/startup.cmd` → `scripts/dev.py` 保留双语菜单；`scripts/build.cmd` 为兼容包装，其他构建脚本也在 scripts。`browser` 转 Vite，`frontend` 任务只编译前端。`startup.cmd build` 仍是 test → wheel → exe → bundle；`npm run build` 默认只选择 EXE。底层 `python -m easy_windows_pack.cli build` / `scripts/build.ps1` 仍是 test → wheel → bundle，不包含 EXE。详情见 [开发手册](development.md)。

Root `startup.cmd` delegates through `scripts/startup.cmd` to `scripts/dev.py` for the bilingual menu. `scripts/build.cmd` is a compatible wrapper; all other build scripts also live under scripts. `browser` delegates to Vite and `frontend` compiles the frontend. `startup.cmd build` remains test → wheel → exe → bundle, whereas `npm run build` selects EXE by default. Low-level `python -m easy_windows_pack.cli build` / `scripts/build.ps1` remain test → wheel → bundle without EXE. See [development](development.md).