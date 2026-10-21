# Native backend validation and launcher handoff

Workspace: `D:\.Projects\Dev\easy-windows-pack-repo`. Source edits are confined to `frontend/packages/create-ewp/templates/backends/{cpp,golang,rust}` and new `tests/native-backends-*` files. Build copies, downloaded tools, profiles and reports are under `build/native-backends`. No publishing or elevation was performed. Python, creator selection/CLI, runtime, and launcher scripts were not changed.

## Verified results

All three hosts were compiled and run as Windows amd64 executables. Each passed development URL smoke, production asset smoke, real native-caption startup, and 10 process-level argument/path rejection cases. The final machine-readable summary is `build/native-backends/verification.json`; full per-host output is in `build/native-backends/logs/`.

The development smoke has 31 assertions; production adds four path-confinement assertions. It loads the repository's actual window-frame JavaScript, clicks its maximize button, checks native state synchronization and client size, compares the maximized HWND client to monitor rcWork, exercises topmost/minimize/restore/hide/show/titlebar APIs, rejects malformed RPC arguments, loads ES modules, tests redirects/popups/frames/remote document navigation, and checks that remote scripts never execute. Production uses a directory with spaces and Chinese characters. Real native-caption smoke verifies WS_CAPTION, 840x560 client sizing, and both directions of the restart contract. Rust also passes four bridge/navigation/resource-path unit tests.

Real mouse drag/resize, maximize drag-restore, and Win+Left snap are **not accepted as passed**. In this desktop, SendInput returns 1 while GetAsyncKeyState(VK_LBUTTON) remains up, and no page mousedown is delivered. `tests/native-backends-input.mjs` records `unsupported:true` and exits 2; evidence is in `build/native-backends/input/{cpp,golang,rust}/result.json`. Its actual drag/resize/snap checks can run on an interactive desktop. Multiple monitors, mixed DPI, taskbar auto-hide, clean-machine installation, and actual Win32 system snap remain unverified. Work-area maximization is verified at 1920x1032 client pixels on the current monitor.

## Toolchain absolute paths

| Tool | Absolute executable |
| --- | --- |
| CMake | `D:\DevTools\CMake\bin\cmake.exe` |
| MSVC 14.44.35207 | `D:\DevTools\VSBuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe` |
| VS developer environment | `D:\DevTools\VSBuildTools\VC\Auxiliary\Build\vcvars64.bat` |
| Windows SDK | `C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0` |
| Go 1.27.3 | `D:\.Projects\Dev\easy-windows-pack-repo\build\native-backends\toolchains\go\bin\go.exe` |
| Zig 0.14.1 (CGO C/C++) | `D:\.Projects\Dev\easy-windows-pack-repo\build\native-backends\toolchains\zig-x86_64-windows-0.14.1\zig.exe` |
| Rust 1.99.1 | `D:\.Projects\Dev\easy-windows-pack-repo\build\native-backends\toolchains\rustc-1.99.1-x86_64-pc-windows-msvc\rustc\bin\rustc.exe` |
| Cargo 1.99.1 | `D:\.Projects\Dev\easy-windows-pack-repo\build\native-backends\toolchains\cargo-1.99.1-x86_64-pc-windows-msvc\cargo\bin\cargo.exe` |

Go, Zig, rustc, rust-std and Cargo were obtained only from their official sites and checked against official SHA256 values. LLVM MinGW release downloads were attempted but too slow; no complete LLVM MinGW installation was used. Go was actually built with Zig's `x86_64-windows-gnu` target. Zig's reduced MinGW headers lack EventToken.h, so this isolated build uses the installed Microsoft SDK declaration under `build/native-backends/sdk-headers`. Standard MinGW-w64 is the template's normal CGO toolchain; it was not separately compiled here.

## Reproduce the isolated builds

From the workspace root:

```powershell
node tests/native-backends-build.mjs cpp
node tests/native-backends-build.mjs golang --github-source
node tests/native-backends-build.mjs rust
node tests/native-backends-verify.mjs
```

The build helper copies only source inputs and never writes compiler outputs into templates. It imports the VS environment silently in-process, sets private Cargo/Go/Zig caches, verifies Go's vendored declarations/licenses, and prints the actual compiler commands. C++ uses CMake Visual Studio 17 2022 / x64 / Release and cached official source trees under `build/native-backends/vendor`. Equivalent core commands are:

```text
cmake -S build/native-backends/cpp/backend -B build/native-backends/cpp/build -G "Visual Studio 17 2022" -A x64
cmake --build build/native-backends/cpp/build --config Release --parallel 4
go build -trimpath -ldflags=-H=windowsgui -o <absolute golang/ewp-host.exe> .
cargo build --manifest-path build/native-backends/rust/backend/Cargo.toml --release -j 4
cargo test --manifest-path build/native-backends/rust/backend/Cargo.toml --release -j 4
```

Go build cwd is `build/native-backends/golang/backend`, with CGO_ENABLED=1, CC=`<absolute zig.exe> cc -target x86_64-windows-gnu`, CXX=`<absolute zig.exe> c++ -target x86_64-windows-gnu`, and CGO_CXXFLAGS including the isolated SDK declaration directory. Go's official module proxy was unreachable. `--github-source` downloads the exact pinned official GitHub commit 6173450d4dd6 and adds a local `replace` **only to the isolated build copy**. The template's go.mod/go.sum remain unchanged. The ordinary proxy-based `go mod download` path therefore remains unverified in this network.

Rust sets RUSTC to the absolute path above, CARGO_HOME=`build/native-backends/cargo-home` and CARGO_TARGET_DIR=`build/native-backends/rust/target-final`. It uses the installed MSVC linker/SDK. The application's Cargo.lock is generated in the isolated copy; downstream applications should keep their generated lockfile.

## Actual binary paths

| Host | Absolute binary |
| --- | --- |
| C++ webview/webview 0.12.0 | `D:\.Projects\Dev\easy-windows-pack-repo\build\native-backends\cpp\build\ewp-host.exe` |
| Go webview_go | `D:\.Projects\Dev\easy-windows-pack-repo\build\native-backends\golang\ewp-host.exe` |
| Rust Wry 0.53.5 + tao 0.34.5 | `D:\.Projects\Dev\easy-windows-pack-repo\build\native-backends\rust\target-final\release\ewp-host.exe` |

dumpbin confirms the C++ host imports Windows system DLLs without a dynamic MSVC runtime. The Zig-built Go host imports Windows/UCRT DLLs; no libstdc++ DLL is required. The Rust MSVC binary imports VCRUNTIME140.dll and VCRUNTIME140_1.dll; its distribution needs the corresponding runtime. Every host needs the installed Edge WebView2 Runtime. No clean-machine runtime distribution was performed.

## Common launcher argument contract

```text
ewp-host.exe [--url <loopback HTTP(S) URL> | --assets <directory>]
             [--title <text>] [--titlebar-mode <default|minimal|native>] [--debug]
```

| Argument | Environment equivalent | Behavior |
| --- | --- | --- |
| `--url` | EWP_DEV_URL | Trust the parsed loopback HTTP(S) origin, never URL prefixes or credentials. |
| `--assets` | EWP_ASSETS | Local frontend directory containing index.html; spaces/Unicode supported; symlinks/junctions rejected. |
| `--title` | EWP_APP_TITLE | Unicode native window title. |
| `--titlebar-mode` | EWP_TITLEBAR_MODE | default/minimal are frameless; native creates actual OS chrome. Default is default. |
| `--debug` | EWP_DEBUG=1 | Enables WebView2 developer tools. |
| `--help` | — | Usage and exit 0. |

An explicit --url or --assets clears the opposite inherited environment setting. Supplying both flags, both environment modes, invalid options, or missing values fails. Relative asset paths use the caller's cwd. With neither URL/assets, packaged layout is `frontend/index.html` beside the EXE; source fallback is project `output/frontend/index.html` (Rust uses its compile-time source project). A launcher should pass an explicit absolute --assets path. Errors exit nonzero; C++/Go accept EWP_HOST_NO_DIALOG=1 for automation. C++/Go honor WEBVIEW2_USER_DATA_FOLDER; otherwise profiles are writable under LOCALAPPDATA. Rust uses its own per-executable LOCALAPPDATA profile.

All production pages use `https://ewp.local/index.html`; Rust services it with a path-confined Wry protocol and explicit MIME types, C++/Go use WebView2 folder mapping. Only the index document with query/hash is trusted. Top-level foreign navigation, frames, popups and browser permissions are denied. Application fetch is allowed; canceled navigation may still reach a remote HTTP server, but the document must not run or gain the bridge.

## Common bridge/window contract

Both `window.ewpNative.call(method,argsArray)` and a fixed `window.pywebview.api[method](...args)` adapter are available; the latter is required by the repository's existing window frame. The bridge dispatches `pywebviewready` and `ewp-native-ready` and applies native state via easyWindowsPackApplyState.

Methods: get_window_state, get_window_size, get_always_on_top, set_always_on_top(bool), toggle_always_on_top, window_action(minimize/maximize/restore/close), native_drag(move/left/right/top/bottom/top-left/top-right/bottom-left/bottom-right), set_window_size(width,height), hide_window, show_window, set_titlebar_mode(default/minimal/native). Unknown methods/actions and malformed argument counts/types return `{ok:false,error}`. Rust transport failures can reject promises.

Sizes use integer client pixels, width 320..16384 and height 200..16384, and require a restored window. `window_action('maximize')` toggles maximize/restore. State includes ok, maximized, visible, alwaysOnTop, resizable, titleBarMode, activeTitleBarMode and windowSize. A request crossing native/frameless returns the requested titleBarMode, unchanged activeTitleBarMode, and restartRequired:true. The launcher should persist the requested mode, restart with --titlebar-mode, and avoid claiming chrome changed before restart. Non-boundary mode changes report restartRequired:false.

C++/Go retain WS_THICKFRAME/SYSMENU/MINIMIZEBOX/MAXIMIZEBOX, use WM_NCLBUTTONDOWN for Windows movement/resizing, and constrain frameless maximization through monitor rcWork. Rust delegates window movement, resizing, work-area behavior and system snap support to tao. Actual drag/snap acceptance remains limited as described above.

## Main fixes and source/license authority

- Fixed Go's non-compiling use of WEBVIEW_ERROR_OK: pinned webview_go compiles webview 0.11's void-return C ABI, unlike C++'s 0.12 API.
- Added the real frame's pywebview.api adapter, common arguments, native titlebar startup, proper restart responses and native client sizing.
- Removed the unnecessary InitCommonControlsEx prerequisite that prevented C++/Go startup on this machine; SetWindowSubclass is checked directly.
- Added writable profiles and local/reparse-safe asset validation for C++/Go.
- Replaced Rust file-to-file access with a confined HTTPS resource protocol; corrected Wry's ewp://local internal URL, supplied ES module MIME types, and added frame/permission guards before application load.
- Aligned Rust get_window_size, integer/range checks, physical client state, resize restrictions and minimum track size.
- Corrected the old template smoke's navigation security assertion and moved its profile out of the template tree.

Go headers are vendor **declarations**, while implementation is compiled once by the official blank-imported webview_go module. No prepare-generated single-source relationship existed or was added outside the authorized scope. The build verifier compares include/webview.h, include/WebView2.h and both LICENSE files byte-for-byte with the pinned upstream. webview.h is upstream webview commit fb6b17d826041411e6346cd9a785a5ceba7987c4 / 0.11; WebView2 is 1.0.1150.38. webview is MIT, and WebView2 retains its supplied Microsoft SDK license. Future pin changes must update these declaration/license copies together. Each backend README records its build and distribution contract.