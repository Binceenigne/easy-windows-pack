# Desktop app

Requires Node >=22.12 and Python >=3.10. Windows desktop requires WebView2.

Run npm commands inside `frontend/`: first run `cd frontend` from the project root, or use `npm --prefix frontend run <command>` from the root. Frontend configuration, lockfiles and dependencies live in frontend; `.venv`, `output/` and `build/` live at the project root.

The project language is stored in `frontend/package.json` as `ewp.language`, either `zh-CN` or `en`. CLI language priority is explicit `--lang`, the `EWP_LANG` environment variable, project settings, then Simplified Chinese. The first interactive generator prompt selects the language; explicit `--lang` skips it, and an interactive selection overrides the environment default. The README, demo page and AI guidance use the language selected during generation; later configuration changes affect CLI output only. External npm, pip and Vite logs retain their original language.

## Start developing

1. `npm install` installs frontend dependencies.
2. `npm run init` initializes `.venv` and installs Python development, tray and npm dependencies.
3. `npm run dev` starts Vite and the desktop window.

Use `npm run help` for CLI help. Use `npm run ewp -- <task> [options]` to pass tasks and options directly, for example `npm run ewp -- info --lang en`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run init` | Initialize the development environment |
| `npm run dev` | Vite and desktop development; `-- --web` starts browser development only |
| `npm run browser`, `npm run frontend:dev` | Browser development without Python |
| `npm run frontend`, `npm run frontend:build` | Compile frontend into `output/frontend/` |
| `npm run frontend:preview` | Preview the compiled frontend |
| `npm run demo` | Run the desktop demo; `-- --debug` enables debugging |
| `npm run wheel`, `npm run build:wheel` | Compile frontend and build a Python wheel |
| `npm run exe`, `npm run build:exe` | Compile frontend and build a Windows EXE |
| `npm run bundle` | Build a source distribution bundle |
| `npm run build` | Build an EXE by default; `-- -w` or `-- --wheel` builds a wheel, `-- -e` explicitly selects EXE |
| `npm run build:all`, `npm run full-build` | `ewp full-build`: tests, wheel, EXE and source bundle |
| `npm run menu` | Open the development menu |
| `npm run info` | Show project and environment information |
| `npm run help` | Show `ewp --help` |
| `npm test` | Run Python smoke tests without opening a window |

TypeScript templates also provide `npm run typecheck`. Pass build arguments after npm's `--` separator, for example `npm run build -- -w`; bare `-w` belongs to npm workspace options.

Production EXEs use only the compiled `output/frontend/`. Wheels, EXEs and source bundles go into `output/wheels/`, `output/exe/` and `output/bundles/`; temporary build data goes into `build/`. EXE packaging requires Windows.

## Project structure

The only root launcher is `startup.cmd`, delegating through `scripts/startup.cmd` to `scripts/dev.py`. Other tools live under `scripts/`; frontend configuration stays under frontend.

UI code lives in `frontend/src/`, the application bridge entry is `backend/src/demo.py`, and the shared Python runtime lives in `backend/base/ewpcore/`. The shared title bar comes from `easywindowspack`; the application owns its content and styles. Browser previews verify frontend interaction; native window actions require the desktop host.

AI tools are optional, with none selected by default; codex, claude and copilot support multiple selection. Shared guidance and the main skill live under `docs/.easy-dev/`. Selecting Codex generates a router under `docs/.agents/skills/easy-dev/`; selecting Claude generates its own router under `docs/.claude/skills/easy-dev/`. Both read the shared main skill. Standard entries are `AGENTS.md` for Codex, `CLAUDE.md` for Claude and `.github/copilot-instructions.md` for Copilot. Entries explicitly read skills under docs. No guidance is generated when no AI tools are selected.