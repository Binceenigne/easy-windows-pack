# easywindowspack

Shared browser window frame and Node ESM development CLI for easy-windows-pack.
共享窗口外壳与 Node ESM 开发 CLI。版本 `0.1.0`；Node >=22.12.0。
Python >=3.10 is required for desktop/Python packaging; Windows desktop needs
WebView2. The CLI uses the consuming project's `scripts/dev.py` and
`backend/src/demo.py`. Browser development and frontend compilation need no Python.

## Availability and creation / 发布状态与创建

Publication and ownership/availability of the public names `easywindowspack` and
`create-ewp` are unverified. The following registry commands are **post-publication
usage**, not a claim that installation currently works:

公共名称可用性/所有权与发布状态未确认；以下仅为两包发布后的用法：

```powershell
npm install -g easywindowspack
ewp create
# Global installation is optional / 无需全局也可创建
npm create ewp@latest
```

`ewp create` delegates to dependency `create-ewp/cli` and can run outside a project.
Arrow-key prompts select project name, Vanilla/Vue/React, JS/TS, installation and
desktop startup. Non-interactive defaults skip installation/startup. Other `ewp`
commands run within a project. Publish `create-ewp` before `easywindowspack` after
the user verifies names and artifacts; publishing is a manual user operation.
先确认公共名称，再由用户按 create-ewp → easywindowspack 顺序发布；agent 不发布。

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

The `ewp` executable supports `create`, `init`, `dev`, `build`, `wheel`, `exe`, `bundle`,
`test`, `check`, `frontend:dev`, `frontend:build`, `frontend:preview`, `info` and `help`.
`build` defaults to EXE; `-w`/`--wheel` selects wheel and `-e`/`--exe` selects
EXE. `dev` starts Vite plus the desktop demo with `--debug` and sets
`EWP_DEV_URL` to its actual URL. `dev --web` opens a browser; `--no-open`
suppresses opening it. Use `--port 0` for a dynamic port (the default).
Ctrl+C closes the server and desktop process tree.

When using npm, pass build flags after its separator: `npm run build -- -w`
or `npm run build -- --wheel`; bare `-w` belongs to npm's workspace selection.
Only `init` may use system Python when `.venv` does not exist. Desktop
development and Python tasks require project `.venv`; run `npm run init`
first. Browser development, frontend builds and `check` do not require Python.
`check` runs the repository's Node runtime test entry; it is not a generated-app
smoke test. Use the generated app's own `npm test` / optional `typecheck` commands.

```powershell
npm install
npm run init
npm run dev
npm run dev -- --web
npm run frontend:build
npm run build
npm run build -- -w
npm run build -- -e
```

Initialization creates/reuses `.venv` and installs Python development and npm
dependencies. Vite ^7.3.7 builds to `output/frontend/` with relative production
URLs. Python/PyInstaller builds EXEs using only compiled frontend resources.
Framework wheel metadata retains core/source assets; generated app wheels use
compiled frontend assets according to their own metadata.
初始化同时处理 Python 与 npm 依赖；EXE 使用编译前端，框架 wheel 源资源与应用 wheel
编译资源分开检查。Root `build.cmd` retains its legacy menu, `browser` delegates
to Vite, and `frontend` compiles. Its full `build` differs from npm's default EXE.

## Preparation and packing / 资源生成与打包

Development assets are generated by the repository's `npm run prepare:npm`.
The package contains copied assets and a generated `assets/frame-template.mjs`;
it does not need Vite-specific `?raw` imports at runtime.

Authoritative sources are `frontend/components/` and `frontend/frame/ewpframe/`;
do not hand-edit generated `assets/`. Preparation also copies authoritative
backend runtime and development scripts into the generator's common resources.
资源从权威来源单点生成，不维护副本。

From the private repository workspace, ensure `output/npm` exists and run:

```powershell
npm run prepare:npm
npm pack --workspace create-ewp --pack-destination output/npm
npm pack --workspace easywindowspack --pack-destination output/npm
```

Pack tarballs do not establish publication, registry installation or native launch
success. See the repository [bilingual npm/Vite guide](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-vite.md)
and [current validation record](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-validation.md).
These are repository docs, not assets shipped in the npm package.