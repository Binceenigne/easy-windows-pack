# create-ewp

Create a self-contained Easy Windows Pack app / 创建独立桌面项目。
Node >=22.12.0, Python >=3.10; Windows desktop requires WebView2.

Version `0.1.0`, ESM; interactive prompts use `@clack/prompts`.
版本 0.1.0，基于 @clack/prompts 的 ESM 生成器。

**Publication is unverified.** Availability and ownership of the public names
`create-ewp` and `easywindowspack` must be confirmed by the publisher. The registry
examples below apply **after publication of both packages**; they do not claim
these names are currently installable.
公共名称可用性/所有权及发布状态未确认；以下 registry 命令仅在两包发布后使用。

Run `npm create ewp@latest` without global installation to choose project name,
Vanilla/Vue/React, JavaScript/TypeScript, optional AI tools, npm installation and desktop startup
with arrow-key prompts. Alternatively, install `easywindowspack` globally and run
`ewp create`, which delegates to `create-ewp/cli`.
无需全局安装也可创建；全局 `npm install -g easywindowspack` 后可用 `ewp create`。

Non-interactive example / 非交互示例:

`npm create ewp@latest "My App" -- --template react-ts --no-install --no-start`

Options: `--template`, `--dir`, `--yes`/`-y`, `--no-install`, `--no-start`,
`--install`, `--start`, `--help`/`-h`. All six templates are supported:
`vanilla`, `vanilla-ts`, `vue`, `vue-ts`, `react`, `react-ts`.

Non-interactive/`--yes` defaults: `ewp-app`, Vanilla JavaScript, no AI tools, no install, no start.
AI 默认全不选，可多选 codex / claude / copilot；不安装、不启动是非交互默认值。目录可包含空格，npm 名称会独立规范化。
Selected AI guidance and skills live under `docs/.easy-dev`, `docs/.agents` and, for Claude, `docs/.claude`. Only selected standard entries are generated: `AGENTS.md`, `CLAUDE.md` or `.github/copilot-instructions.md`. Entries explicitly load skills under docs, which are outside default discovery locations; Claude reuses the single main skill.
所选 AI 内容放 docs 下，标准薄入口显式读取；主 Skill 单源，Claude 只保留路由。完整布局见文末仓库指南。
Targets must be empty, including `.git`; files, symlinks and Windows-reserved names are rejected.
非空目录绝不覆盖；取消提示返回 130，不创建项目。

Installation runs `npm install` inside frontend only. Starting runs installation if necessary,
then `npm run init` and `npm run dev`; Python initialization is explicit.
安装选项仅安装 npm 依赖；启动选项额外初始化 Python `.venv`，再启动桌面。

The generated app uses `easywindowspack@^0.1.0` and Vite 7, with Vue 3.5 or React
19 when selected. The repository/runtime Vite range is ^7.3.7; alignment of the
generator range is tracked in the current validation record. Vue/React templates
own Frame composition layers, using Teleport/portals for reactive slots/children,
prop updates and cleanup. All six templates share `mountFrame`; browser preview
does not provide native controls. Runtime optional peers support Vue >=3.3 and
React >=18; these are not mandatory Vanilla dependencies.

## Local use before publication / 未发布时本地使用

From the source checkout root / 从源码仓库根目录运行：

```powershell
npm --prefix frontend install
npm --prefix frontend run prepare:npm
node frontend/packages/create-ewp/bin/create-ewp.mjs "../My App" --template vue-ts --no-install --no-start
```

Generation uses local prepared templates. Installing the generated app still
needs a resolvable `easywindowspack`; before publication use a local packed tarball
or explicit local override. Successful local generation is not registry validation.
本地生成不代表 registry 可用，未发布验收需本地 tarball 或明确本地依赖。

Inside the project's frontend directory with available dependencies; from the project root use `npm --prefix frontend` / 项目依赖可解析后，在 frontend 内执行；从项目根执行时使用 `npm --prefix frontend`：

```powershell
npm install
npm run init
npm run dev
npm run dev -- --web
npm run frontend:dev
npm run frontend:build
npm run build
npm run build -- -w
npm run build -- --wheel
npm run build -- -e
```

`init` creates/reuses Python `.venv` and installs Python development and npm
dependencies. `dev` waits for Vite on a dynamic loopback port and supplies its URL
via `EWP_DEV_URL` to debug pywebview, with frontend HMR. Web mode starts no desktop.
`frontend:build` compiles into `output/frontend/` using relative production URLs.
`build` defaults to Windows EXE; wheel/EXE flags follow npm's `--` separator.
Bare `-w` is npm workspace selection. Root `startup.cmd` delegates through
`scripts/startup.cmd` to `scripts/dev.py`; other build wrappers live under scripts.
`browser` delegates to Vite and `frontend` compiles.
默认 build 为 EXE；参数经 npm 的 -- 分隔，裸 -w 不是 wheel 开关。

## Prepare contract / 公共资源契约

The repository prepare step must copy the authoritative Python runtime from
`backend/base/ewpcore/` into `templates/common/backend/base/ewpcore/`, and
`scripts/dev.py` into `templates/common/scripts/dev.py` before packing.
The same step copies root `startup.cmd`, `scripts/startup.cmd` and runtime `LICENSE` into common, preserving their relative paths.
Every template composes common runtime/scripts and the common template README.
No repository source is read at generation time. Missing prepared resources fail
before the destination is written. Do not hand-maintain a second Python runtime.
主项目 prepare 生成公共资源；脚手架运行时只读取随包模板，缺失资源会提前报错。

The package owns only the `create-ewp` binary. `ewp create` delegation belongs to
the `easywindowspack` CLI integration, avoiding a conflicting global `ewp` binary.
全局 `ewp create` 转调用由运行库 CLI 集成，本包不占用 `ewp` 命令。

The desktop entry resolves `EWP_DEV_URL` for development and
`output/frontend/index.html` for production. The prepare script's EXE task must
include the built `output/frontend` under the same path, rather than uncompiled
Vue/React sources. This resource contract also applies to app wheel assets.
EXE 任务须按相同路径携带编译后的前端资源；不能把源码当作发行页面。
The repository framework wheel is distinct: its metadata retains framework core
and source components/bridges/contracts, while generated app wheel metadata
includes compiled frontend assets under the app's share directory.
框架 wheel 源资源与生成应用 wheel 编译资源采用各自 metadata，分别验收。

## Pack and publish / 打包与发布

From the private workspace under frontend, ensure project-root `output/npm` exists, then pack locally:

```powershell
npm run prepare:npm
npm pack --workspace create-ewp --pack-destination ../output/npm
npm pack --workspace easywindowspack --pack-destination ../output/npm
```

The frontend workspace is private. Inspect tarball contents and clean-directory
installation. After the user verifies names/permissions, the user publishes
`create-ewp` first, then `easywindowspack`; the agent does not execute publish.
Packing does not prove publication or native execution.
由用户确认名称与权限并手动发布，顺序 create-ewp → easywindowspack；agent 不发布。

Repository documentation: [bilingual guide](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-vite.md),
[validation record](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-validation.md).
These are repository docs, not files shipped alongside this package README.