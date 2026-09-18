<div align="center">

# easy-windows-pack

### Reusable Windows WebView desktop window framework

[![CI](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml/badge.svg)](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![pywebview](https://img.shields.io/badge/pywebview-5.4%2B-0f766e)](https://pywebview.flowrl.com/)
[![Version](https://img.shields.io/badge/version-0.2.1-2563eb)](https://github.com/Binceenigne/easy-windows-pack/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows11&logoColor=white)](https://www.microsoft.com/windows)

[中文](README.md) · [English](README.en.md) · [Build tool](#build-tool) · [Architecture](#architecture)

</div>

`easy-windows-pack` is a reusable Windows + pywebview window frame. It extracts title bars, window buttons, native dragging, Aero Snap, Snap Layouts, and eight-way resizing from the business application.

## Architecture

![easy-windows-pack architecture](docs/images/architecture.svg)

The browser frame sends commands through the pywebview API. `WindowController` owns lifecycle and state, while `win32.py` delegates non-client dragging, resizing, Snap behavior, and topmost state to Windows.

## Features

- Native, default custom, and minimal custom title bars
- Minimize, maximize/restore, and close controls
- Native Windows dragging through `HTCAPTION`
- Restore-while-dragging behavior for maximized windows
- Aero Snap and Windows 11 Snap Layouts
- Eight-way native edge and corner resizing
- Always-on-top, hide/show, and window-size helpers
- Optional close-to-hide lifecycle
- Business API delegation through one pywebview `js_api`
- Framework-free HTML/CSS/JavaScript frontend assets
- CLI, PowerShell build script, wheel, source bundle, and GitHub Actions CI

## Install

From PyPI:

```powershell
pip install easy-windows-pack
```

From a local checkout:

```powershell
pip install -e .
```

## Quick start

```python
from pathlib import Path

import webview

from easy_windows_pack import WindowConfig, create_window

instance = create_window(
    WindowConfig(
        title="My WebView App",
        titlebar_mode="default",
        width=1200,
        height=800,
        min_width=720,
        min_height=480,
        close_action="exit",
    ),
    url=(Path("frontend") / "index.html").resolve().as_uri(),
)

webview.start(gui="edgechromium")
```

Copy `frontend/window-frame.html`, `frontend/window-frame.css`, and `frontend/window-frame.js` into the application frontend. Put the application content inside `[data-ewp-content]`.

## Build tool

Version `0.2.0` includes an installable CLI and a PowerShell wrapper. Version `0.2.1` also serializes WebView2 state updates and suppresses JavaScript evaluation during native minimize transitions. No Node.js build chain is required.

```powershell
# Tests + wheel + source bundle
python -m easy_windows_pack.cli build

# Available after installing the project
easy-windows-pack build

# Windows wrapper
.\build.ps1
```

![easy-windows-pack build flow](docs/images/build-flow.svg)

Artifacts are written to `dist/` by default:

```text
dist/
├── easy_windows_pack-0.2.1-py3-none-any.whl
├── easy-windows-pack-0.2.1-bundle.zip
└── easy-windows-pack-0.2.1-bundle/
    ├── easy_windows_pack/
    ├── frontend/
    ├── examples/
    ├── docs/
    └── easy-windows-pack.manifest.json
```

| Command | Purpose |
| --- | --- |
| `build` | Run tests and build the wheel plus source bundle |
| `test` | Run the unittest suite |
| `bundle` | Build only the source bundle zip |
| `clean` | Remove `build/`, `dist/`, `*.egg-info/`, and `__pycache__/` |
| `info` | Print version, Python executable, and artifact metadata |

Common options:

```powershell
python -m easy_windows_pack.cli build --output-dir .\artifacts
python -m easy_windows_pack.cli build --skip-tests
python -m easy_windows_pack.cli build --skip-tests --skip-bundle
python -m easy_windows_pack.cli bundle --output-dir .\artifacts
.\build.ps1 -Python .\.venv\Scripts\python.exe
```

`build.ps1` resolves Python in this order: the `-Python` argument, project-local `.venv`, `python.exe` on PATH, then `py.exe` on PATH.

### WebView2 synchronization

`WindowController` sends JavaScript through one background dispatcher. State updates are coalesced, so repeated native window events do not start concurrent `evaluate_js` calls. During a minimize or hide transition, queued JavaScript is discarded and the native message is sent immediately. This avoids blocking the WinForms/WebView2 dispatch thread while the window is changing state.

## Title bar modes

### `native`

```python
WindowConfig(titlebar_mode="native")
```

Windows and pywebview own the system title bar, controls, resizing, and Snap Layouts.

### `default`

```python
WindowConfig(titlebar_mode="default")
```

Uses the standard custom HTML title bar. Buttons call `window_action`; dragging uses Win32 `HTCAPTION`.

### `minimal`

```python
WindowConfig(titlebar_mode="minimal")
```

Uses the same behavior as `default` with a compact 24px title bar.

`original` and `system` are compatibility aliases for `native`. Custom modes can switch at runtime. Switching between `native` and a custom mode requires recreating the pywebview window because `frameless` and `easy_drag` are creation-time settings.

## Configuration

| Parameter | Default | Description |
| --- | --- | --- |
| `title` | `WebView Application` | Windows window title |
| `titlebar_mode` | `default` | `native`, `default`, or `minimal` |
| `width` / `height` | `920` / `680` | Initial client size |
| `min_width` / `min_height` | Mode-specific | Minimum dimensions |
| `max_width` / `max_height` | `8192` / `8192` | Maximum dimensions |
| `resizable` | `True` | Enable resizing |
| `shadow` | `True` | Enable the pywebview shadow |
| `always_on_top` | `False` | Create a topmost window |
| `background_color` | `#ffffff` | WebView/native form background |
| `close_action` | `exit` | `exit` or `hide` |
| `maximize_on_start` | `False` | Maximize after creation |

## API delegation

### Optional desktop integrations

`ApiToolsAdapter` exposes API_TOOLS management/settings/update methods through an
explicit allowlist. `TurtleClawAdapter` preserves the desktop updater's install
token and frontend-ready acknowledgement, with an optional host-owned restart
callback. Neither imports or requires either application.

The frontend library now includes responsive dot-matrix progress, a boot curtain,
staggered entrance animations and an optional update polling client. Existing
window frame assets and the single JavaScript dispatcher remain unchanged.

See [integration contracts and examples](docs/desktop-integrations.md) and open
[the offline component demo](examples/components.html). The source bundle includes
the demo; the wheel also ships frontend assets under `share/easy-windows-pack/frontend`.

```python
class AppApi:
    def get_profile(self):
        return {"name": "demo"}

create_window(
    WindowConfig(title="My App"),
    url=page_url,
    app_api=AppApi(),
)
```

Both `window_action` and `get_profile` are available through `window.pywebview.api`.

## New Desktop Components

The components use plain JavaScript and require no Vue, React or CSS framework.
Load [component CSS](frontend/desktop-components.css) and
[component JavaScript](frontend/desktop-components.js), then initialize after the DOM exists.
Load [the update client](frontend/desktop-updates.js) only when needed.

### Dot-Matrix Progress

```html
<link rel="stylesheet" href="desktop-components.css">
<div id="quotaProgress"></div>
<script src="desktop-components.js"></script>
<script>
const progress = EasyWindowsPackComponents.createMatrixProgress(
    document.getElementById('quotaProgress'),
    { value: 70, remaining: 30, size: 4, label: 'Used quota' }
);
progress.update({ value: 75, remaining: 25 });
// On unmount: progress.dispose();
</script>
```

`value` controls the filled percentage; `remaining` independently controls warning
colors. To display remaining quota, pass the same percentage to both and adjust
`label`. `size` is the number of rows and columns per block: `2`, `3`, or `4`
(default). `unlimited: true` displays full unlimited quota; use `unlimitedLabel`
for its accessible text. Give the container a measurable width. A ResizeObserver
handles resizing, with automatic linear fallback when space is insufficient.
`dispose()` releases the observer and generated DOM.

### Boot Curtain and Staggered Entrance

Initialize the entrance controller before showing the page and mark the items
with `data-ewp-enter`. Reveal them after the curtain finishes:

```html
<div id="boot" hidden>Starting</div>
<main id="workspace">
    <header data-ewp-enter>Workspace</header>
    <section data-ewp-enter>Application content</section>
</main>
<script>
const components = EasyWindowsPackComponents;
const entrance = components.createEntrance(document.getElementById('workspace'));
const curtain = components.createBootCurtain(document.getElementById('boot'), {
    timeout: 12000,
    onComplete: ({ reason }) => {
        entrance.reveal();
        if (reason === 'timeout') console.warn('Boot curtain timed out; check initialization');
    }
});
// After the bridge, initial data and essential rendering are ready:
// curtain.setReady();
// On unmount: curtain.dispose(); entrance.dispose();
</script>
```

`createEntrance()` immediately hides the content and temporarily disables its
interaction. Call `reveal()` to enter, or `prepare()` before playing again.
The curtain has a default 12-second watchdog. A timeout removes the curtain but
does not mean initialization succeeded; present a separate error or retry state.
Components respect `prefers-reduced-motion`. Set
`document.documentElement.dataset.motion = 'off'` to disable motion explicitly.

### Update Client

First expose the matching host APIs through `ApiToolsAdapter` or `TurtleClawAdapter`:

```javascript
const updates = createDesktopUpdateClient({
    host: 'turtleclaw', // Use 'api-tools' for API_TOOLS.
    onState: state => console.log('Update state:', state),
    onError: error => console.error(error)
});
// Acknowledge only when the frontend is usable. Checking does not download/install.
await updates.markFrontendReady({ checkOnStartup: true });
// On explicit user action: await updates.check(); await updates.download();
// TurtleClaw requires a valid host-issued token: await updates.install(token);
// API_TOOLS uses await updates.install() to request restart and apply the update.
// On unmount: updates.dispose();
```

`cancel()` requires host support for `cancel_update_download`; do not assume both
hosts support it. `restart()` requires `restart_app`; ordinary TurtleClaw restart
needs an explicitly injected callback. See [integration contracts](docs/desktop-integrations.md)
for Python wiring, allowlists and response contracts, and the
[component demo](examples/components.html) for a runnable visual example.

### Usage Recommendations

- **Use SCSS; Tailwind CSS is not recommended** as the primary styling approach for projects built on this framework. Window chrome, matrix progress, curtains and entrance animations have related state and animation rules. SCSS modules keep these relationships easier to follow and reduce utility-class and dynamic-class maintenance in HTML. This is a maintainability recommendation, not a compatibility restriction.
- Compile SCSS to CSS during development or builds; WebView loads the generated CSS only. The framework currently ships plain CSS, not SCSS sources or a Sass build pipeline. Using the shipped components does not require Sass.
- Keep application styles in separate SCSS modules and load their compiled CSS after component CSS. Prefer existing component custom properties and scoped selectors; avoid editing vendor components or globally overriding tags such as `span` and `i`.
- Existing Tailwind CSS projects can still integrate these components. Check Preflight effects on defaults such as buttons and borders, and avoid using utility classes to compete with internal animation, sizing or visibility rules.
- Create one instance per container, use `update()` for data changes and `dispose()` on unmount. Reserve the curtain for essential initial loading, not optional network requests; do not replay page-wide entrance animations on frequent refreshes.
- Validate narrow windows, DPI scaling, keyboard access and reduced-motion mode. The host remains responsible for download, installation and restart authorization and confirmation; animation completion is not proof of update success.

## Development

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
python -m easy_windows_pack.cli info
python -m easy_windows_pack.cli build
```

GitHub Actions tests Python 3.10 and 3.12 on Ubuntu and Windows. A Windows runner builds and uploads the wheel and source bundle.

## Limitations

- Native dragging, resizing, Snap, and topmost behavior target Windows. Imports and unit tests can still run on other platforms.
- The recommended pywebview GUI is `edgechromium`.
- Switching between native and custom title bars requires recreating the pywebview window.
- Tray icons, single-instance enforcement, window-position persistence, and application updates remain host application responsibilities.

<div align="center">

[中文](README.md) · [English](README.en.md) · [Build tool](#build-tool) · [Architecture](#architecture)

</div>
