# easywindowspack

Version 0.1.2 · Pending publication / 待发布 · MIT

为 easy-windows-pack 应用提供共享窗口外壳、桌面组件和 `ewp` 开发 CLI，连接 Vite 前端与 Python / pywebview 桌面。
Shared window frames, desktop components and the `ewp` development CLI for easy-windows-pack apps, connecting Vite frontends with Python / pywebview desktops.

## 功能与环境 / Features and requirements

- Windows / macOS 窗口外观、拖拽、缩放与窗口控制。EXE 打包面向 Windows。
  Windows / macOS window themes, dragging, resizing and window controls. EXE packaging targets Windows.
- `mountFrame` 与 CSS、桌面进度和启动动画、可选 Vue / React 组件。
  `mountFrame`, CSS, desktop progress and startup animations, plus optional Vue / React components.
- Vite 热更新、浏览器开发、Windows EXE 与 Python wheel 构建。
  Vite hot updates, browser development, Windows EXE and Python wheel builds.
- Node.js >=22.12；桌面开发与打包需要 Python >=3.10，Windows 桌面需要 WebView2。
  Node.js >=22.12; desktop development and packaging need Python >=3.10, with WebView2 for Windows desktop.

## 创建并启动 / Create and start

无需全局安装；在父目录运行，目标目录须为空。/ No global installation required; run in the parent directory with an empty destination.

```powershell
npm create ewp@latest
```

向导先选择简体中文 / English，再选 Vanilla / Vue / React、JS / TS 等选项；AI 指引支持 Codex / Claude / Copilot，默认不选。
The wizard selects 简体中文 / English first, then Vanilla / Vue / React, JS / TS and other options; optional AI guidance supports Codex / Claude / Copilot, with none selected by default.

手动创建并启动示例：/ Example with manual installation and startup:

```powershell
npm create ewp@latest my-app -- --template react-ts --lang en --no-install --no-start --yes
cd my-app/frontend
npm install
npm run init
npm run dev
```

`init` 创建或复用项目 `.venv`、安装依赖并编译前端，无需手动激活 Python 环境。
`init` creates or reuses the project's `.venv`, installs dependencies and builds the frontend; no manual Python activation is needed.
`dev` 打开桌面窗口并热更新前端；Ctrl+C 停止。/ `dev` opens the desktop window with frontend hot updates; Ctrl+C stops it.

六模板为 `vanilla`、`vanilla-ts`、`vue`、`vue-ts`、`react`、`react-ts`，均带新版 SVG 品牌 welcome、计数、窗口外观选择与系统浅深色。
All six templates (`vanilla`, `vanilla-ts`, `vue`, `vue-ts`, `react`, `react-ts`) include the new SVG-branded welcome, a counter, window theme selection and system light/dark appearance.
本包依赖 `create-ewp@^0.1.2`；生成项目依赖 `easywindowspack@^0.1.2`。
This package depends on `create-ewp@^0.1.2`; generated projects depend on `easywindowspack@^0.1.2`.

## 语言 / Language

`--lang zh-CN` / `--lang en` 选择创建语言，用于 README、welcome 与可选 AI 指引，并保存为 `ewp.language`。
`--lang zh-CN` / `--lang en` selects the generated README, welcome and optional AI guidance language, saved as `ewp.language`.
CLI 输出优先级：`--lang` → `EWP_LANG` → 保存值 → `zh-CN`；临时覆盖不重写项目内容，npm / pip / Vite 日志保持原样。
CLI output priority: `--lang` → `EWP_LANG` → saved value → `zh-CN`; temporary overrides do not rewrite project content, and npm / pip / Vite logs retain their original output.

## 常用命令 / Common commands

在项目的 `frontend/` 内运行；从项目根运行时加 `npm --prefix frontend`。
Run inside the project's `frontend/`; use `npm --prefix frontend` from its root.

| 命令 / Command | 用途 / Purpose |
| --- | --- |
| `npm run help` | CLI 帮助 / CLI help |
| `npm run dev` | 桌面热更新开发 / Desktop development with hot updates |
| `npm run browser` | 浏览器开发，无需 Python / Browser development without Python |
| `npm run build` | Windows EXE → `output/exe/` |
| `npm run build:wheel` | Python wheel → `output/wheels/` |
| `npm run app` | 配置应用 / Configured app → `output/apps/` |
| `npm run installer` | 应用及安装包 / App and setup → `output/installers/` |

打包前完成 `init`；构建自动编译前端。根 `startup.cmd` 可打开任务菜单。
Complete `init` before packaging; builds compile the frontend automatically. Root `startup.cmd` opens the task menu.

`app` / `installer` 使用项目根 `ewp.pack.json`，支持 onefile / onedir；Tk 分步骤安装与卸载、wheel API 和安全边界见 [打包指南 / Packaging](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/packaging.md)。配套 Python **0.3.0 wheel 已在本地构建并通过独立冻结向导 E2E**（`ygft7h_d`），**PyPI 未发布**；报告与 wheel 哈希见 [验收记录 / Validation](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-validation.md#2026-10-10-安装向导与安全修复阶段--installer-wizard-and-safety-fixes)。
`app` / `installer` use root `ewp.pack.json` with onefile / onedir support. See the packaging guide for the Tk wizard, uninstall, wheel API and safety boundaries. The Python **0.3.0 wheel is built locally and passed independent frozen wizard E2E validation** (`ygft7h_d`); **it has not been published to PyPI**. See the validation record for reports and the wheel hash.

## 全局 CLI / Global CLI

```powershell
npm install -g easywindowspack@latest
ewp create
ewp -h
ewp create -h
```

`ewp` 无参数也显示帮助；在项目根用 `ewp menu` 打开菜单，或用 `ewp dev` / `ewp build` 执行任务。
`ewp` with no arguments also shows help; at the project root, use `ewp menu` for the menu or `ewp dev` / `ewp build` to run tasks.
0.1.2 发布后，已有项目可在 `frontend/` 内用 `npm install easywindowspack@^0.1.2` 更新依赖；项目文件需自行维护。
After 0.1.2 is published, upgrade an existing project's dependency with `npm install easywindowspack@^0.1.2` inside `frontend/`; maintain its project files separately.

## 文档 / Documentation

[中文入门](https://github.com/Binceenigne/easy-windows-pack/blob/main/README.md) · [English quick start](https://github.com/Binceenigne/easy-windows-pack/blob/main/README.en.md) · [npm / Vite 与 API / Guide and API](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-vite.md) · [开发手册 / Development](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/development.md) · [窗口外观 / Window styles](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/window-styles.md)

## API 与开发细节 / API and development details

Shared browser window frame and Node ESM development CLI for easy-windows-pack.
共享窗口外壳与 Node ESM 开发 CLI；Node >=22.12.0。
Python >=3.10 is required for desktop/Python packaging; Windows desktop needs
WebView2. The CLI uses the consuming project's `scripts/dev.py` and
`backend/src/demo.py`. Browser development and frontend compilation need no Python.

## Availability and creation / 发布状态与创建

Both local npm packages are **0.1.2, pending publication**, awaiting user
authentication after `npm login` returned **HTTP 401**; `@latest` follows
published registry versions. The historical 0.1.1 release passed `@latest`
creation and Vue TS installation, checks and frontend-build smoke tests on
2026-10-09. See the validation record linked below.

两包本地版本为 0.1.2 待发布，npm login 返回 HTTP 401，等待用户认证；@latest 跟随已发布版本。0.1.1 的发布与 2026-10-09 registry 冒烟保留为历史证据，详见文末验收记录。

Upgrade the global CLI with `npm install -g easywindowspack@latest`.
After 0.1.2 is published, update the app runtime with
`npm install easywindowspack@^0.1.2` inside frontend.
Use `npm create ewp@latest` for new apps; `@0.1.1` pins the historical published
version. Dependency upgrades do not rewrite
existing scripts, READMEs, AI guidance, or demos.
全局安装和创建跟随 registry；0.1.2 发布后再使用 ^0.1.2，@0.1.1 可固定历史版本；旧项目 scripts 与指引需自行同步。

```powershell
npm install -g easywindowspack@latest
ewp create
# Global installation is optional / 无需全局也可创建
npm create ewp@latest
```

`ewp create` delegates to dependency `create-ewp/cli` and can run outside a project.
In source 0.1.2, the first prompt selects human language (`zh-CN` / `en`), then project
name, Vanilla/Vue/React, programming language (JS/TS), AI tools, installation, and
desktop startup. Explicit `--lang` skips the language prompt. AI selection defaults
to none. Only selected tool directories and entries are generated; tool skills
read shared docs guidance, and Claude alone does not require Codex directories.
Skills under docs require explicit entry routing. Both Codex and Claude skills
route through `docs/.easy-dev/skills/easy-dev/SKILL.md` to shared guidance at
`docs/.easy-dev/agent.md`; Claude-only creates no `docs/.agents/`.
Non-interactive/`--yes` defaults: `ewp-app`, `vanilla`, no AI, no installation,
no startup. Language follows the priority below, falling back to `zh-CN`.
Other development tasks run within a project. Source npm manifests and the
lockfile are aligned at 0.1.2, pending publication. This documentation task
does not pack or publish; published 0.1.1 tarballs remain historical artifacts.
0.1.2 源码第一项为人类语言，JS/TS 是后续选项；AI 仅生成所选工具目录，各工具读取共用指引。源码 npm manifests 与锁文件已同步为 0.1.2 待发布；本文档任务不打包或发布，已发 0.1.1 tarball 保留历史状态。

## Project language / 项目语言

Creation saves `zh-CN` or `en` as `ewp.language` in `frontend/package.json`.
First-party CLI help, menus, prompts, and task messages resolve **explicit `--lang`
→ `EWP_LANG` → saved value → `zh-CN`**. In existing projects, overrides apply only
to the invocation, without changing the saved value. Generated README, AI guidance,
and demo text use the creation language and are not rewritten by runtime flags.
**Third-party npm, pip, and Vite logs retain their original output.**
创建语言保存到 frontend/package.json；自有输出按上述优先级，临时覆盖不改保存值或重写 README/AI/demo，第三方日志不翻译。

After selection, first-party content uses one language. npm's `Ok to proceed?`
is a third-party confirmation and is not translated or controlled by generator `--yes`.
语言选择后自有内容单语输出；npm 自己的确认不翻译，生成器 --yes 不控制该确认。

## Public API / 公共 API

Exports: `easywindowspack`, `easywindowspack/frame.css`, `easywindowspack/desktop.css`,
`easywindowspack/desktop-components.js`, `easywindowspack/desktop-updates.js`,
`easywindowspack/vue`, `easywindowspack/react`.

Import `mountFrame` from `easywindowspack` and explicitly import
`easywindowspack/frame.css`. Call `mountFrame(container, options)` with `title`,
`icon`, `windowStyle` (`windows` or `macos`), `mode` (`default`, `minimal` or
`native`), `resizable`, `content`, and `onError`. The returned handle exposes
`frame`, `content`, `update(options)`, and idempotent `dispose()` / `remove()`.
Mounting again in the same container releases the previous instance. Strings
in `content` are text; pass a DOM node to render application markup. Native
title bar transitions still require the existing desktop bridge/restart flow.

The root also exports `getWindowApi`, `setWindowStyle`, `setTitleBarMode`,
`call`, and `isSupportedResizeDirection`. `setWindowStyle` applies to all
mounted frames; use the instance's `update` for a single frame.

`easywindowspack/desktop-components.js` exports `createMatrixProgress`,
`createBootCurtain` and `createEntrance`; import `easywindowspack/desktop.css`
for their styles. `easywindowspack/desktop-updates.js` exports
`createDesktopUpdateClient`. These entries execute the shared legacy scripts
and retain their browser globals. They require a browser DOM.

Optional `easywindowspack/vue` and `easywindowspack/react` entries export
`WindowFrame` (named and default). Vue uses a default slot and emits `error`;
React accepts `children` and `onError`. Install your selected framework in the
application; the plain runtime does not install either framework. Both wrappers
delegate frame creation and cleanup to `mountFrame`.

Optional peers are React >=18 and Vue >=3.3. Framework-specific entries require
the selected framework; Vanilla does not. Generated Vue/React templates own their
Frame composition layers and use Teleport/portals for reactive slots/children,
prop updates and cleanup. They share the core runtime without duplicating it.
Vue/React 是可选 peers；模板自有组合层保留 props、slot/children 响应式与事件。

## Project commands / 项目命令

Run npm commands inside frontend; from the project root use `npm --prefix frontend`. Configuration, lockfile and npm dependencies live under frontend; `.venv` and `output/` remain at the project root.
在 frontend 内运行 npm；从项目根运行时加 `--prefix frontend`。配置、锁文件与依赖收于 frontend，Python 环境和产物仍在项目根。

Global `ewp` without arguments, `ewp -h`, or `ewp --help` shows help without an
existing project; `ewp create -h` shows generator help. Inside frontend, use
`npm run help`, `npm run info`, `npm run menu`, or `npm run ewp -- <task> [options]`.
At the project root, global installation supports `ewp <task>`; without it, use
`npm --prefix frontend run ewp -- <task>`. Root `startup.cmd` without arguments
opens the menu, as does `ewp menu`.
全局 ewp 无参数/-h 显示帮助；项目菜单用 ewp menu 或根 startup.cmd，未全局安装从根加 npm --prefix frontend。

Both the checkout and generated apps provide npm scripts: `help`, `ewp`, `menu`,
`init`, `dev`, `browser`, `frontend`, `demo`, `wheel`, `exe`, `app`, `installer`, `bundle`, `build`,
`build:all`, `full-build`, `test`, `info`, `check`, plus `frontend:dev`,
`frontend:build`, `frontend:preview`, `build:wheel`, `build:exe`, and `build:app`.
All menu tasks are directly callable; `demo` accepts `--debug`. CLI also supports
`create`, `preview` (alias for `frontend:preview`), and `--version` / `-v` / `-V`.
Only TypeScript templates provide `typecheck`.
`build` defaults to EXE; `-w`/`--wheel` selects wheel and `-e`/`--exe` selects
EXE. `full-build` or `build --all` runs **test → wheel → exe → bundle**; npm exposes
`npm run build:all` or `npm run build -- --all`. `dev` starts Vite plus the desktop demo with `--debug` and sets
`EWP_DEV_URL` to its actual URL. `dev --web` opens a browser; `--no-open`
suppresses opening it. Use `--port 0` for a dynamic port (the default).
Ctrl+C closes the server and desktop process tree.

`browser` / `frontend:dev` provides browser HMR; `frontend` / `frontend:build`
compiles into `output/frontend/`. `frontend:preview` previews compiled output
after a build. `demo` compiles then launches desktop without HMR; `demo --debug`
enables developer tools.
所有菜单任务均可直接 CLI 调用。dev 用 HMR，demo 编译后运行无 HMR，frontend:preview 预览已编译前端。

When using npm, pass build flags after its separator: `npm run build -- -w`
or `npm run build -- --wheel`; bare `-w` belongs to npm's workspace selection.
Initialization may use system Python when `.venv` does not exist. Desktop
development, tests, and packaging require project `.venv`; run `npm run init`
first. Browser development, frontend builds and `check` do not require Python.
Generated templates include `tests/npm-runtime.test.mjs`. `npm run check`,
`ewp check`, and `startup.cmd check` run three Node runtime exports/config checks:
public API/CSS, Vite configuration, and application manifest/HTML entry points.
Use the generated app's own `npm test` / optional `typecheck` commands.

```powershell
npm install
npm run help
npm run info
npm run menu
npm run ewp -- info --lang en
npm run init
npm run dev
npm run dev -- --web
npm run frontend:build
npm run frontend:preview
npm run build
npm run build -- -w
npm run build -- -e
npm run build:all
```

Initialization creates/reuses `.venv` and installs Python development and npm
dependencies. Vite ^7.3.7 builds to `output/frontend/` with relative production
URLs. Python/PyInstaller builds EXEs using only compiled frontend resources.
Framework wheel metadata retains core/source assets; generated app wheels use
compiled frontend assets according to their own metadata.
初始化同时处理 Python 与 npm 依赖；EXE 使用编译前端，框架 wheel 源资源与应用 wheel
编译资源分开检查。Root `startup.cmd` delegates through `scripts/startup.cmd` to
`scripts/dev.py`; other build wrappers live under scripts. Project `build` defaults
to EXE, including `startup.cmd build`. Use `full-build` / `build:all` / `build --all`
for the complete pipeline; npm supports `npm run full-build` / `npm run build:all`,
and the launcher supports `startup.cmd full-build` / `startup.cmd build:all`.
EXE and full builds require Windows. Low-level
`python -m easy_windows_pack.cli build` remains tests + wheel + bundle, without EXE.
项目工具默认 build 与完整链明确区分；底层 Python CLI build 保持兼容语义。

Setuptools generates Python `*.egg-info/` under `backend/base/` using the empty-root
`package-dir` mapping `"" = "backend/base"`; `easy_windows_pack` maps separately
to `backend/base/ewpcore`. This is ignored installation/build metadata, not docs.
Python 安装 metadata 放 backend/base 并按 *.egg-info/ 忽略，不手工维护或提交。
`.venv/Lib/site-packages/*.dist-info/` is normal installed-package metadata,
including editable installs; do not move it to docs or commit it.
虚拟环境内的 dist-info 属于正常安装元数据，不应迁入 docs 或提交。

## Preparation and packing / 资源生成与打包

Development assets are generated by the repository's `npm run prepare:npm`.
The package contains copied assets and a generated `assets/frame-template.mjs`;
it does not need Vite-specific `?raw` imports at runtime.

Authoritative sources are `frontend/components/` and `frontend/frame/ewpframe/`;
do not hand-edit generated `assets/`. Preparation also copies authoritative
backend runtime and development scripts into the generator's common resources.
资源从权威来源单点生成，不维护副本。

From the private repository workspace under frontend, ensure project-root `output/npm` exists and run:

```powershell
npm run prepare:npm
npm pack --workspace create-ewp --pack-destination ../output/npm
npm pack --workspace easywindowspack --pack-destination ../output/npm
```

Pack tarballs do not establish publication, registry installation or native launch
success. See the repository [bilingual npm/Vite guide](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-vite.md)
and [current validation record](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-validation.md).
These are repository docs, not assets shipped in the npm package.