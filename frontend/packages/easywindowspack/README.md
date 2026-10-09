# easywindowspack

Shared browser window frame and Node ESM development CLI for easy-windows-pack.
共享窗口外壳与 Node ESM 开发 CLI；Node >=22.12.0。
Python >=3.10 is required for desktop/Python packaging; Windows desktop needs
WebView2. The CLI uses the consuming project's `scripts/dev.py` and
`backend/src/demo.py`. Browser development and frontend compilation need no Python.

## Availability and creation / 发布状态与创建

Both npm packages are **published at 0.1.1 and available from the registry**.
On 2026-10-09, `@latest` creation and Vue TS installation, checks, and frontend
build smoke tests passed. See the validation record linked below.

两包 0.1.1 已发布且 registry 可用；2026-10-09 的 @latest 创建与 Vue TS 项目安装、检查及前端构建冒烟已通过，详见文末验收记录。

Upgrade the global CLI with `npm install -g easywindowspack@latest`
or the app runtime with `npm install easywindowspack@^0.1.1` inside frontend.
Use `npm create ewp@latest` for new apps; replace `@latest` with `@0.1.1` to pin
the version. Dependency upgrades do not rewrite
existing scripts, READMEs, AI guidance, or demos.
可用上述命令安装或创建，固定版本时将 @latest 换成 @0.1.1；旧项目 scripts 与指引需自行同步。

```powershell
npm install -g easywindowspack@latest
ewp create
# Global installation is optional / 无需全局也可创建
npm create ewp@latest
```

`ewp create` delegates to dependency `create-ewp/cli` and can run outside a project.
In 0.1.1, the first prompt selects human language (`zh-CN` / `en`), then project
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
lockfile are aligned at 0.1.1. This README update changes Git source only;
published tarballs cannot be overwritten and are not repacked or republished.
0.1.1 第一项为人类语言，JS/TS 是后续选项；AI 仅生成所选工具目录，各工具读取共用指引。源码 npm manifests 与锁文件已同步为 0.1.1；此次 README 仅更新 Git 源码，已发 tarball 不可覆盖，不重新 pack 或发布。

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
`init`, `dev`, `browser`, `frontend`, `demo`, `wheel`, `exe`, `bundle`, `build`,
`build:all`, `full-build`, `test`, `info`, `check`, plus `frontend:dev`,
`frontend:build`, `frontend:preview`, `build:wheel`, and `build:exe`.
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