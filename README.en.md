<div align="center">

# easy-windows-pack

Build your UI with web technologies, connect desktop features with Python, and package a Windows app.

[![CI](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml/badge.svg)](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml)
[![easywindowspack](https://img.shields.io/npm/v/easywindowspack?label=easywindowspack)](https://www.npmjs.com/package/easywindowspack)
[![create-ewp](https://img.shields.io/npm/v/create-ewp?label=create-ewp)](https://www.npmjs.com/package/create-ewp)
[![Node](https://img.shields.io/badge/Node-%3E%3D22.12-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Windows](https://img.shields.io/badge/platform-Windows-0078D4)](https://www.microsoft.com/windows)

[中文](README.md) · **English** · [Documentation](docs/README.md) · [npm / Vite guide](docs/npm-vite.md)

</div>

`easy-windows-pack` is a Windows WebView framework built with Python, pywebview, and an ESM frontend. It supplies a reusable window frame and development/build tools so you can maintain application UI and desktop capabilities separately.

- **Use a familiar frontend**: Vanilla, Vue, or React, each with JavaScript and TypeScript templates.
- **Start with desktop controls**: Windows/macOS appearances, native/default/compact title bars, window buttons, dragging, edge resizing, and Windows Snap.
- **Develop and distribute**: Vite hot updates, a Python application API bridge, Windows single-file EXEs, and wheel builds.
- **Add features as needed**: System tray, matrix progress, boot curtain, entrance animation, and host update adapters.

Both npm packages are published at **0.1.1** and available from the registry: `create-ewp` provides the `npm create ewp` scaffolder; `easywindowspack` provides the frontend runtime, CSS, and `ewp` CLI. Language selection, help, menu, and full-build commands below belong to 0.1.1. The Python distribution is named `easy-windows-pack`, with source version **0.2.1**, installed from local source by the project's `init` command.

## Requirements

| Task | Requirements |
| --- | --- |
| Project creation, browser development, frontend compilation | Node.js **>=22.12.0**, npm |
| Desktop development, Python tests, native packaging | Python **>=3.10** |
| Windows desktop execution | Windows + [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) |

Enable the Windows `py` launcher when installing Python. The macOS appearance is a window UI theme; EXE packaging targets Windows.

## Create your first app

Open a terminal in the directory where you want to create a project. No global installation is required:

```powershell
npm create ewp@latest
```

**Version note: 0.1.1 is available; `@latest` creation and Vue TS installation, checks, and frontend build smoke tests passed.** See the [validation record](docs/npm-validation.md) for results and the [npm / Vite guide](docs/npm-vite.md#发布状态与创建项目--publication-status-and-project-creation) for local use.

In 0.1.1, the first prompt selects the **human language**: Simplified Chinese `zh-CN` or English `en`. Then choose a project name, framework, programming language (JavaScript / TypeScript), optional AI tools, and whether to install dependencies, initialize Python, and launch the desktop. AI tools default to none; installation and startup also default to off.

Use these **0.1.1 commands** for a fixed version and configuration. Pass generator options after npm's `--` separator; `--lang` skips the first language prompt:

```powershell
npm create ewp@0.1.1 my-app -- --lang zh-CN --template react-ts --ai codex,claude --no-install --no-start --yes
npm create ewp@0.1.1 my-vue-app -- --lang en --template vue-ts --ai claude --no-install --no-start --yes
```

Then enter the generated project's **frontend** directory. The example uses `my-app`; for the Vue example, use `my-vue-app/frontend`:

```powershell
cd my-app/frontend
npm install
npm run init
npm run dev
```

`init` creates or reuses the root `.venv`, installs npm/Python development dependencies, and builds the frontend. Manual environment activation is unnecessary. Skip installation or initialization steps already completed by the generator; if it already launched the desktop, there is no need to run `dev` again.

`dev` starts Vite and the desktop window with frontend hot updates. Use the local URL printed in the terminal; the port is assigned dynamically. Ctrl+C stops the service and desktop process.

For browser UI work, install npm dependencies and run `npm run frontend:dev`; **Python is unnecessary**. Browser previews cover appearance and frontend interaction. Verify native dragging, resizing, Snap, tray, and the Python bridge in the desktop app.

The destination must be empty, including no `.git`. `--yes` skips generator prompts and defaults to project name `ewp-app`, template `vanilla`, no AI tools, no installation, and no startup. Language follows the priority below, falling back to `zh-CN`. `--install` installs npm dependencies only; `--start` also initializes Python and launches the desktop, and cannot be combined with `--no-install`.

You can also install or upgrade the CLI globally, then create a project:

```powershell
npm install -g easywindowspack@latest
ewp create
```

To pin the global CLI version, use `npm install -g easywindowspack@0.1.1`; upgrade existing projects with `npm install easywindowspack@^0.1.1` inside frontend. Updating dependencies does not add missing scripts or rewrite old READMEs or AI guidance. See the [development guide](docs/development.md#菜单与命令--menu-and-commands) for the complete task mapping.

## Project language

Creation saves the selected language as `ewp.language` in `frontend/package.json`. Commands resolve language in this order: **explicit `--lang` → `EWP_LANG` environment variable → saved project value → `zh-CN`**. In an existing project, `--lang` overrides only that invocation and leaves the saved value intact:

```powershell
npm run help -- --lang en
npm run ewp -- info --lang zh-CN
ewp menu --lang en
```

Generated READMEs, AI guidance, and demo text use the creation language. After language selection, first-party CLI help, menus, prompts, and task messages use one selected language. **npm's `Ok to proceed?` prompt and third-party npm, pip, and Vite logs retain their original output.** The generator's `--yes` does not control npm's own confirmation. A temporary CLI override does not rewrite existing READMEs, AI files, demos, or application text. Edit `ewp.language` to change the default for future commands.

## Templates and AI guidance

| Framework | JavaScript | TypeScript |
| --- | --- | --- |
| Vanilla | `vanilla` | `vanilla-ts` |
| Vue | `vue` | `vue-ts` |
| React | `react` | `react-ts` |

AI guidance is opt-in; select multiple tools with `--ai codex,claude,copilot`:

| Selection | Standard entry | Skill / shared guidance |
| --- | --- | --- |
| Codex | Root `AGENTS.md` | `docs/.agents/skills/easy-dev/SKILL.md` |
| Claude | Root `CLAUDE.md` | `docs/.claude/skills/easy-dev/SKILL.md` |
| Copilot | `.github/copilot-instructions.md` | Reads shared guidance and skill directly |
| Any tool | Entries for selected tools only | `docs/.easy-dev/agent.md` and `docs/.easy-dev/skills/easy-dev/SKILL.md` |

Both Codex and Claude skills route to the shared skill, which reads `docs/.easy-dev/agent.md`. Selecting only Claude creates neither `AGENTS.md` nor `docs/.agents/`. No AI entries or resources are created when none are selected. Standard entries explicitly direct tools to read skills under docs.

## Project layout and application code

These are the main directories of a **generated app**. Dependencies, environments, and outputs appear after installation or building:

```text
my-app/
├─ frontend/
│  ├─ src/                  # Application UI and styles
│  ├─ index.html            # Vite page entry
│  ├─ package.json
│  ├─ vite.config.mjs
│  └─ node_modules/         # Created by npm installation
├─ backend/
│  ├─ src/demo.py           # Desktop entry and application API
│  └─ base/                # Shared Python runtime and installation metadata
│     ├─ ewpcore/
│     └─ *.egg-info/       # Generated by Python installation/build; ignored
├─ scripts/                # Development and packaging tools
├─ startup.cmd             # Windows project menu
├─ pyproject.toml
├─ docs/                   # Guidance created when AI is selected
├─ .venv/                  # Python environment created by init
└─ output/                 # Compiled assets, packages, and logs
```

The frontend package, Vite/TypeScript configuration, lockfile, and npm dependencies belong in `frontend/`. Run npm commands there. From the project root, use `--prefix frontend`, for example `npm --prefix frontend run dev`.

Start your UI in Vanilla's `src/main.js` / `main.ts`, Vue's `src/App.vue`, or React's `src/App.jsx` / `App.tsx`, all relative to frontend. Add Python application methods in `backend/src/demo.py`; the public import name remains `easy_windows_pack`. Keep window internals in `backend/base/ewpcore/` and tools in `scripts/`.

`backend/base/*.egg-info/` is setuptools installation/build metadata, outside docs; do not maintain or commit it. `.venv/Lib/site-packages/*.dist-info/` is normal installed-package metadata and should not be committed either. See [Architecture](docs/architecture.md#源码路径与公开包名--source-path-and-public-package-name) for package mapping, ignore rules, and old caches.

## Everyday development commands

Run these commands inside `frontend/`:

| Command | Purpose |
| --- | --- |
| `npm run help` | Show first-party CLI help |
| `npm run info` | Show Node, project paths, frontend configuration, and the `.venv` path |
| `npm run menu` | Open the project task menu |
| `npm run ewp -- <task> [options]` | Invoke any CLI task directly |
| `npm run init` | Initialize/reuse the Python environment and install dependencies |
| `npm run dev` | Vite + Python desktop development |
| `npm run dev -- --web` | Browser development only |
| `npm run browser` / `npm run frontend:dev` | Browser development without Python |
| `npm run frontend` / `npm run frontend:build` | Compile into `output/frontend/` without Python |
| `npm run frontend:preview` | Preview compiled assets; run frontend:build first |
| `npm run demo -- --debug` | Build and launch desktop with developer tools, without HMR |
| `npm run wheel` / `npm run build:wheel` | Build a Python wheel |
| `npm run exe` / `npm run build:exe` / `npm run build` | Build a Windows EXE |
| `npm run bundle` | Build a source bundle |
| `npm run build:all` / `npm run full-build` | test → wheel → exe → bundle |
| `npm run typecheck` | Type checking in TypeScript templates |
| `npm test` | Run project Python tests after init |
| `npm run check` | Node runtime exports/config checks |

The checkout and newly generated apps expose all general tasks above; `typecheck` is specific to TypeScript templates. Generated templates include `tests/npm-runtime.test.mjs`. Run `npm run check` inside frontend, or `ewp check` / `startup.cmd check` at the project root, for three Node runtime exports/config checks: public API/CSS, Vite configuration, and application manifest/HTML entry points.

With the CLI installed globally, `ewp` with no arguments and `ewp -h` / `ewp --help` show help; `ewp create -h` shows creation help without an existing project. Run `ewp menu` or `ewp <task>` from the project root. Without a global installation, use `npm --prefix frontend run menu` or `npm --prefix frontend run ewp -- <task>` from the root, or the commands above inside frontend.

Double-click the root `startup.cmd` or run `.\startup.cmd` for the menu. It delegates to `scripts/startup.cmd` and `scripts/dev.py` and needs Python. Menu tasks also run directly, for example `.\startup.cmd demo --debug`. Use `.\startup.cmd help` for help and `.\startup.cmd info` for the actual Python interpreter and output directories. Opening `ewp menu` itself requires no prior Python initialization. See [Development](docs/development.md) for the full mapping and troubleshooting.

## Builds and outputs

```powershell
npm run build
npm run build -- -w
npm run build -- --wheel
npm run build -- -e
npm run build:all
```

`npm run build` creates a Windows **EXE** by default. `-- -e` / `-- --exe` explicitly selects EXE; `-- -w` / `-- --wheel` selects a Python wheel. You can also use `npm run build:exe` / `npm run build:wheel`. Both packaging targets compile the frontend first and require completed initialization.

The full pipeline is **test → wheel → exe → bundle**. Use `npm run build:all` / `npm run full-build`, `npm run build -- --all`, or `ewp build:all` / `ewp full-build` / `ewp build --all`. The root launcher supports `.\startup.cmd full-build` / `.\startup.cmd build:all`. All project entries default `build` to EXE; EXE and full builds require Windows.

**Do not use `npm run build -w`**: bare `-w` is npm's workspace option. Direct CLI invocation supports `ewp build -w`.

The EXE starts at `backend/src/demo.py` and includes/loads compiled pages and assets from `output/frontend/`. Generated app wheels contain compiled frontend assets; the repository's framework wheel distributes the window core and source components. See the [npm / Vite guide](docs/npm-vite.md) for resource contracts.

| Directory | Contents |
| --- | --- |
| `output/frontend/` | Vite pages and assets |
| `output/exe/` | Windows EXEs |
| `output/wheels/` | Python wheels |
| `output/bundles/` | Source bundles |
| `output/npm/` | Repository npm package archives |
| `output/logs/` | Initialization and build logs |

`build/` holds configuration, staging, and caches. The compatible low-level `python -m easy_windows_pack.cli build` / `easy-windows-pack build` retains **test → wheel → bundle**, without EXE. It is separate from the project tools' `full-build`; see [Compatible commands](docs/development.md#兼容命令--compatible-commands).

## Integrate with an existing app

For an existing Vite frontend, install `easywindowspack` in its npm project and import the public API and CSS. This example assumes an existing `#app` container:

```javascript
import { mountFrame } from 'easywindowspack';
import 'easywindowspack/frame.css';

const frame = mountFrame('#app', {
  title: 'My App', windowStyle: 'windows',
  content: document.createElement('main'),
});
frame.content.textContent = 'Hello desktop';
frame.update({ title: 'Ready' });
// Call frame.dispose() when the application unmounts.
```

This mounts the frontend frame; desktop capabilities also need a Python host. Define application APIs in the [desktop entry](backend/src/demo.py) and expose them through `create_window(..., app_api=...)`. Keep `EWP_DEV_URL` for development and compiled pages for production. See the [npm / Vite guide](docs/npm-vite.md) for the complete frontend API, [Desktop integrations](docs/desktop-integrations.md) and [Type contracts](frontend/contracts/README.md) for components and updates, [Window styles](docs/window-styles.md) for themes, and the [WindowConfig](backend/base/ewpcore/config.py) and [Tray source](backend/base/ewpcore/tray.py) for Python APIs.

## Develop the framework source

```powershell
git clone https://github.com/Binceenigne/easy-windows-pack.git
cd easy-windows-pack
.\startup.cmd init
.\startup.cmd
```

Alternatively, use npm after checking out the repository:

```powershell
cd frontend
npm ci
npm run init
npm run dev
```

The repository's `frontend/` is a **private npm workspace**, with both published package sources under `frontend/packages/`; the workspace root is not published to npm. Generated apps consume the runtime and do not include these package development directories. See [Architecture](docs/architecture.md) for ownership boundaries and [Documentation](docs/README.md) for further development workflows.

## License

[MIT](LICENSE) · Copyright (c) 2026 Binceenigne
