# create-ewp

Version 0.1.2 · Pending publication / 待发布 · MIT

创建基于 Vite、Python 和 pywebview 的 Windows 桌面应用，支持 Vanilla / Vue / React 与 JavaScript / TypeScript。
Create a Windows desktop app with Vite, Python and pywebview, using Vanilla / Vue / React with JavaScript / TypeScript.

## 环境 / Requirements

- Node.js >=22.12（含 npm）/ Node.js >=22.12, including npm.
- 桌面开发与打包：Python >=3.10；Windows 桌面需要 WebView2。
  Desktop development and packaging: Python >=3.10; Windows desktop needs WebView2.
- 纯浏览器开发无需 Python。/ Browser-only development needs no Python.

## 创建项目 / Create a project

在项目的父目录运行，目标目录须为空。无需全局安装。
Run in the parent directory of your new project; the destination must be empty. Global installation is optional.

```powershell
npm create ewp@latest
```

向导先选简体中文 / English，再选项目名、框架、JS / TS、AI 工具、安装依赖和启动桌面。
The wizard asks for 简体中文 / English first, then project name, framework, JS / TS, AI tools, installation and desktop startup.

也可指定选项后手动启动：/ Or specify options and start manually:

```powershell
npm create ewp@latest my-app -- --template vue-ts --lang en --no-install --no-start --yes
cd my-app/frontend
npm install
npm run init
npm run dev
```

`init` 创建或复用项目 `.venv`、安装依赖并编译前端，无需手动激活 Python 环境。
`init` creates or reuses the project's `.venv`, installs dependencies and builds the frontend; no manual Python activation is needed.
`dev` 打开桌面窗口并热更新前端；Ctrl+C 停止。/ `dev` opens the desktop window with frontend hot updates; Ctrl+C stops it.

## 模板与语言 / Templates and language

| 框架 / Framework | JavaScript | TypeScript |
| --- | --- | --- |
| Vanilla | `vanilla` | `vanilla-ts` |
| Vue | `vue` | `vue-ts` |
| React | `react` | `react-ts` |

六模板均提供新版 SVG 品牌 welcome、计数示例、Windows / macOS 窗口外观选择、编辑提示和资源链接，支持系统浅深色。
All six templates include the new SVG-branded welcome, a counter, Windows / macOS window themes, editing hints and resource links, with system light/dark appearance.
生成项目依赖 `easywindowspack@^0.1.2`。/ Generated projects depend on `easywindowspack@^0.1.2`.

`--lang zh-CN` / `--lang en` 跳过语言提示；创建语言用于 README、welcome 与可选 AI 指引。
`--lang zh-CN` / `--lang en` skips the language prompt and selects the generated README, welcome and optional AI guidance language.
CLI 输出优先级：`--lang` → `EWP_LANG` → 保存的 `ewp.language` → `zh-CN`；npm / pip / Vite 日志保持原样。
CLI output priority: `--lang` → `EWP_LANG` → saved `ewp.language` → `zh-CN`; npm / pip / Vite logs retain their original output.

AI 工具支持 Codex / Claude / Copilot，默认不选；可用 `--ai codex,claude,copilot` 多选。
AI guidance supports Codex / Claude / Copilot, with none selected by default; use `--ai codex,claude,copilot` to select multiple tools.

## 常用命令 / Common commands

以下命令在生成项目的 `frontend/` 内运行；从项目根运行时加 `npm --prefix frontend`。
Run these commands inside the generated project's `frontend/`; use `npm --prefix frontend` from its root.

| 命令 / Command | 用途 / Purpose |
| --- | --- |
| `npm run help` | CLI 帮助 / CLI help |
| `npm run dev` | 桌面热更新开发 / Desktop development with hot updates |
| `npm run browser` | 浏览器开发 / Browser development |
| `npm run build` | Windows EXE → `output/exe/` |
| `npm run build:wheel` | Python wheel → `output/wheels/` |
| `npm run app` | 配置应用 / Configured app → `output/apps/` |
| `npm run installer` | 应用及安装包 / App and setup → `output/installers/` |

打包前完成 `init`；构建自动编译前端。根 `startup.cmd` 可打开任务菜单。
Complete `init` before packaging; builds compile the frontend automatically. Root `startup.cmd` opens the task menu.

生成器创建项目根 `ewp.pack.json`；onefile / onedir、Tk 分步骤安装与卸载说明见 [打包指南 / Packaging](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/packaging.md)。配套 Python **0.3.0 wheel 已在本地构建并通过独立冻结向导 E2E**（`ygft7h_d`），**PyPI 未发布**；报告与 wheel 哈希见 [验收记录 / Validation](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-validation.md#2026-10-10-安装向导与安全修复阶段--installer-wizard-and-safety-fixes)。
The generator creates root `ewp.pack.json`; see the packaging guide for onefile / onedir and the Tk installation/uninstall wizard. The Python **0.3.0 wheel is built locally and passed independent frozen wizard E2E validation** (`ygft7h_d`); **it has not been published to PyPI**. See the validation record for reports and the wheel hash.

## 全局 CLI 与文档 / Global CLI and docs

可选全局安装：/ Optional global installation:

```powershell
npm install -g easywindowspack@latest
ewp create
ewp -h
ewp create -h
```

`ewp` 无参数也显示帮助；在项目根用 `ewp menu` 打开菜单。
`ewp` with no arguments also shows help; use `ewp menu` at the project root for the task menu.

[中文入门](https://github.com/Binceenigne/easy-windows-pack/blob/main/README.md) · [English quick start](https://github.com/Binceenigne/easy-windows-pack/blob/main/README.en.md) · [npm / Vite 指南 / Guide](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-vite.md) · [开发手册 / Development](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/development.md)

## 创建选项与开发细节 / Creation options and development details

Create a self-contained Easy Windows Pack app / 创建独立桌面项目。
Node >=22.12.0, Python >=3.10; Windows desktop requires WebView2.

ESM; interactive prompts use `@clack/prompts`. Both local npm packages are
**0.1.2, pending publication**, awaiting user authentication after `npm login`
returned **HTTP 401**; `@latest` follows published registry versions.
The historical 0.1.1 release passed `@latest` creation and Vue TS installation,
checks and frontend-build smoke tests on 2026-10-09. See the validation record below.
基于 @clack/prompts 的 ESM 生成器。两包本地版本为 0.1.2 待发布，npm login 返回 HTTP 401，等待用户认证；@latest 跟随已发布版本。0.1.1 的发布与 2026-10-09 registry 冒烟保留为历史证据，详见文末验收记录。

Run `npm create ewp@latest` without global installation. In the source 0.1.2 flow, the
first prompt selects human language (`zh-CN` / `en`), then project name,
Vanilla/Vue/React, programming language (JavaScript/TypeScript), optional AI tools,
npm installation, and desktop startup. Explicit `--lang` skips the first prompt.
Alternatively, global `easywindowspack` provides `ewp create` via `create-ewp/cli`.
无需全局安装即可创建。0.1.2 源码第一项为人类语言，JS/TS 是后续编程语言选项；显式 --lang 跳过语言提示。全局 CLI 可用 `npm install -g easywindowspack@latest` 安装或升级。

Registry non-interactive example / registry 非交互示例：

`npm create ewp@latest "My App" -- --lang en --template react-ts --ai claude --no-install --no-start --yes`

Options: `--lang zh-CN|en`, `--ai codex,claude,copilot|none`, `--template`, `--dir`, `--yes`/`-y`, `--no-install`, `--no-start`,
`--install`, `--start`, `--help`/`-h`. All six templates are supported:
`vanilla`, `vanilla-ts`, `vue`, `vue-ts`, `react`, `react-ts`.

Non-interactive/`--yes` defaults: `ewp-app`, Vanilla JavaScript, no AI tools, no install, no start.
Language follows `--lang` → `EWP_LANG` → saved project language → `zh-CN`.
非交互语言按此优先级解析，无设置时默认简体中文。
AI 默认全不选，可多选 codex / claude / copilot；不安装、不启动是非交互默认值。目录可包含空格，npm 名称会独立规范化。

## Language and AI guidance / 语言与 AI 指引

Creation saves the selected language as `ewp.language` in `frontend/package.json`.
First-party CLI output resolves **explicit `--lang` → `EWP_LANG` → saved project value → `zh-CN`**.
In an existing project, overrides are temporary and do not change the saved value.
Generated README, AI guidance, and demo text use the creation language; CLI
overrides do not rewrite them. Third-party **npm / pip / Vite logs remain native**.
创建语言保存到 frontend/package.json 的 ewp.language。自有帮助、菜单及提示按上述优先级选语言；临时覆盖不改配置、不重写 README/AI/demo。第三方日志原样输出。

After selection, first-party content uses one language. npm's `Ok to proceed?`
is a third-party confirmation and is not translated or controlled by generator `--yes`.
语言选择后自有内容单语输出；npm 自己的确认不翻译，生成器 --yes 不控制该确认。

Shared guidance is `docs/.easy-dev/agent.md`, with a shared skill under
`docs/.easy-dev/skills/easy-dev/SKILL.md`. Only selected tool directories and
standard entries are generated: Codex `AGENTS.md` routes to `docs/.agents/skills/easy-dev/SKILL.md`;
Claude `CLAUDE.md` routes to `docs/.claude/skills/easy-dev/SKILL.md`; Copilot
`.github/copilot-instructions.md` reads shared content directly. Tool skills load
the shared guidance. **Claude alone does not require a Codex directory.** Skills
under docs require explicit entry routing and are outside default discovery.
共用指引与 Skill 放 docs/.easy-dev，各工具读取共用内容；只生成所选工具目录，Claude 可独立选择。AI 未选时不生成这些资源。完整布局见文末仓库指南。

## Destination and initialization / 目标与初始化

Targets must be empty, including `.git`; files, symlinks and Windows-reserved names are rejected.
非空目录绝不覆盖；取消提示返回 130，不创建项目。

Installation runs `npm install` inside frontend only. Starting runs installation if necessary,
then `npm run init` and `npm run dev`; Python initialization is explicit.
安装选项仅安装 npm 依赖；启动选项额外初始化 Python `.venv`，再启动桌面。

Source-generated apps use `easywindowspack@^0.1.2` (pending publication) and
Vite ^7.3.7, with Vue 3.5 or React 19 when selected. Historical registry smoke
tests cover the 0.1.1 Vue TS project. Vue/React templates
own Frame composition layers, using Teleport/portals for reactive slots/children,
prop updates and cleanup. All six templates share `mountFrame`; browser preview
does not provide native controls. Runtime optional peers support Vue >=3.3 and
React >=18; these are not mandatory Vanilla dependencies.

## Local development / 本地开发

From the source checkout root / 从源码仓库根目录运行：

```powershell
npm --prefix frontend install
npm --prefix frontend run prepare:npm
node frontend/packages/create-ewp/bin/create-ewp.mjs "../My App" --lang en --template vue-ts --no-install --no-start
```

Generation uses local prepared templates. Generated apps depend on
`easywindowspack@^0.1.2`, pending publication; use matching local tarballs or
explicit overrides for local checks. Local generation is not registry validation.
本地生成使用 prepared 模板，生成应用依赖待发布的 runtime ^0.1.2；本地验收使用匹配的 tarball 或明确本地依赖，不能替代 registry 安装验证。

Use `npm create ewp@latest` for new apps;
upgrade the global CLI with `npm install -g easywindowspack@latest`, or the app runtime
with `npm install easywindowspack@^0.1.2` inside frontend after 0.1.2 is published. Dependency upgrades do not
rewrite existing scripts, READMEs, AI guidance, or demos.
Use `@0.1.1` to pin the historical published version.
全局安装和创建跟随 registry；0.1.2 发布后再使用 ^0.1.2，@0.1.1 可固定历史版本；旧项目任务 scripts 与指引需自行同步。

Inside the project's frontend directory with available dependencies; from the project root use `npm --prefix frontend` / 项目依赖可解析后，在 frontend 内执行；从项目根执行时使用 `npm --prefix frontend`：

```powershell
npm install
npm run help
npm run info
npm run menu
npm run ewp -- demo --debug
npm run init
npm run dev
npm run dev -- --web
npm run frontend:dev
npm run frontend:build
npm run frontend:preview
npm run build
npm run build -- -w
npm run build -- --wheel
npm run build -- -e
npm run build:all
```

`init` creates/reuses Python `.venv` and installs Python development and npm
dependencies. `dev` waits for Vite on a dynamic loopback port and supplies its URL
via `EWP_DEV_URL` to debug pywebview, with frontend HMR. Web mode starts no desktop.
`frontend:build` compiles into `output/frontend/` using relative production URLs.
`build` defaults to Windows EXE; wheel/EXE flags follow npm's `--` separator.
Bare `-w` is npm workspace selection. `npm run build:all`, `npm run build -- --all`,
`ewp full-build`, and `ewp build --all` run **test → wheel → exe → bundle**.
Root `startup.cmd` delegates through
`scripts/startup.cmd` to `scripts/dev.py`; other build wrappers live under scripts.
`browser` delegates to Vite, `frontend` compiles, and `demo --debug` builds then
launches desktop without HMR. `dev` has HMR; `frontend:preview` previews compiled output.
Global `ewp` without arguments or with `-h` shows help without a project. Use `ewp menu`
inside a project; root `startup.cmd` without arguments also opens the menu.
Both the checkout and generated apps provide npm scripts: `help`, `ewp`, `menu`,
`init`, `dev`, `browser`, `frontend`, `demo`, `wheel`, `exe`, `app`, `installer`, `bundle`, `build`,
`build:all`, `full-build`, `test`, `info`, `check`, plus `frontend:dev`,
`frontend:build`, `frontend:preview`, `build:wheel`, `build:exe`, and `build:app`.
Only TypeScript templates provide `typecheck`. Generated templates include
`tests/npm-runtime.test.mjs`; `npm run check`, `ewp check`, and `startup.cmd check`
run three Node runtime exports/config checks: public API/CSS, Vite configuration,
and application manifest/HTML entry points. With global installation,
run `ewp <task>` at the project root; otherwise use `npm --prefix frontend run ewp -- <task>`.
默认 build 为 EXE，包含 startup.cmd build；完整链用 full-build / build:all / build --all，npm 对应 npm run full-build / npm run build:all，根脚本对应 startup.cmd full-build / startup.cmd build:all。EXE 和完整构建仅支持 Windows。生成模板附带 tests/npm-runtime.test.mjs，check 执行 3 项 Node runtime exports/config 检查。底层 Python CLI build 仍为 test → wheel → bundle，不包含 EXE。

Python `*.egg-info/` is ignored installation/build metadata under `backend/base/`,
not documentation. The empty-root `package-dir` mapping `"" = "backend/base"`
locates it; `easy_windows_pack` maps separately to `backend/base/ewpcore`.
Python 安装 metadata 位于 backend/base，按 *.egg-info/ 忽略，不手工维护或提交。
`.venv/Lib/site-packages/*.dist-info/` is normal installed-package metadata,
including editable installs; do not move it to docs or commit it.
虚拟环境内的 dist-info 属于正常安装元数据，不应迁入 docs 或提交。

## Prepare contract / 公共资源契约

The repository prepare step must copy the authoritative Python runtime from
`backend/base/ewpcore/` into `templates/common/backend/base/ewpcore/`, and
`scripts/dev.py` into `templates/common/scripts/dev.py` before packing.
The same step copies root `startup.cmd`, `scripts/startup.cmd` and runtime `LICENSE` into common, preserving their relative paths.
Every template composes common runtime/scripts and selects common `README.md` or
`README.en.md` by creation language, emitting the chosen text as app `README.md`.
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

The frontend workspace is private. Source npm manifests and the lockfile are
aligned at 0.1.2, pending publication. Historical 0.1.1 local pack checks and Vue TS
registry smoke tests are recorded in the validation record. This documentation
task does not pack or publish; the main task handles the new release separately.
Publish `create-ewp` before `easywindowspack`.
Packing does not prove registry installation or native execution.
两包本地版本为 0.1.2 待发布；0.1.1 历史本地 pack 与 Vue TS registry 冒烟见验收记录。本文档任务不打包或发布，由主任务另行处理新版；发布顺序为 create-ewp → easywindowspack。

Repository documentation: [bilingual guide](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-vite.md),
[validation record](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-validation.md).
These are repository docs, not files shipped alongside this package README.