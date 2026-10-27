# easywindowspack

Version 0.1.6 · MIT

共享窗口外壳、桌面组件和 `ewp` CLI，连接 Vite 前端与 Python、Go、Rust 或 C++ 桌面宿主，支持 Windows / macOS 窗口外观。
Shared window frames, desktop components and the `ewp` CLI connect Vite frontends with Python, Go, Rust or C++ desktop hosts, with Windows / macOS window themes.

## 环境 / Requirements

- Node.js >=22.12.0（含 npm）；Windows 桌面需 WebView2 与所选后端工具链：Python >=3.10；Go >=1.22 + MinGW-w64 C++；Rust / Cargo + MSVC；或 CMake >=3.24 + C++17。原生后端另需 Windows SDK，安装器需 NSIS 3。
  Node.js >=22.12.0, including npm; Windows desktop needs WebView2 and the selected toolchain: Python >=3.10; Go >=1.22 + MinGW-w64 C++; Rust / Cargo + MSVC; or CMake >=3.24 + C++17. Native backends also need the Windows SDK; native installers need NSIS 3.
- 浏览器开发和前端编译无需 Python；浏览器不提供原生窗口控制。EXE 打包面向 Windows，macOS 外观仅为 UI 主题。
  Browser development and frontend builds need no Python; browsers provide no native window controls. EXE packaging targets Windows; macOS appearance is a UI theme.

## 安装与创建 / Install and create

无需全局安装即可创建，目标目录必须为空；向导先选简体中文 / English，再选项目名、后端、框架、JS / TS、可选 AI、安装与启动。`--backend python|golang|rust|cpp` 可直接指定后端，默认 Python。
Create without a global installation in an empty destination; the wizard asks for language, name, backend, framework, JS / TS, optional AI, installation and startup. Set `--backend python|golang|rust|cpp` to select a backend directly; Python is the default.

```powershell
npm create ewp@latest my-app -- --template react-ts --lang en --no-install --no-start --yes
cd my-app/frontend
npm install
npm run init
npm run dev
```

Python 的 `init` 创建或复用根 `.venv`、安装依赖并编译前端，无需手动激活；原生后端的 `init` 每次安装/校验项目依赖、检查工具链，再编译前端与调试宿主，无需 Python。`dev` 提供所选后端的桌面 HMR，Ctrl+C 停止。
Python `init` creates or reuses root `.venv`, installs dependencies and builds the frontend without manual activation; native `init` installs/reconciles local dependencies, checks the toolchain, then builds the frontend and debug host on every run without Python. `dev` provides desktop HMR for the selected backend, stopped with Ctrl+C.
0.1.6 新建应用随 creator 获得新版 `scripts/dev.py`：Python init/build 在 VT TTY 底部固定两行蓝色阶段进度，上方日志滚动（[恢复、plain 回退与开关](https://github.com/Binceenigne/easy-windows-pack/blob/main/.maintainer/development.md)）；已有应用在 `frontend/` 用 `npm install easywindowspack@latest` 升级不会改写该脚本、README、AI 指引或 demo。
New apps created with 0.1.6 receive the updated `scripts/dev.py` from the creator: Python init/build pins blue stage progress to two bottom rows in a VT TTY, with logs scrolling above (see [restoration, plain fallbacks and controls](https://github.com/Binceenigne/easy-windows-pack/blob/main/.maintainer/development.md)); upgrading with `npm install easywindowspack@latest` inside an existing app's `frontend/` does not rewrite this script, README, AI guidance or demos.

公开版本以 `npm view easywindowspack version`、`npm view create-ewp version` 与[验收记录](https://github.com/Binceenigne/easy-windows-pack/blob/main/.maintainer/npm-validation.md)为准。
Confirm published versions with these npm queries and the linked validation record.

缺少 Python、Cargo 等工具时显示官方下载链接，不自动下载安装系统工具；修复后重新打开终端并重试 `init`。每次初始化重跑所有阶段，复用有效环境与缓存，保留项目文件；损坏的 Python `.venv` 不会被静默删除。已有项目的 `scripts/backend.mjs` 不随 npm 升级覆盖，需同步对应初始化修复。
Missing tools such as Python or Cargo are reported with official download links; system toolchains are not installed automatically. Reopen the terminal after installing them and retry `init`. Every run retries all stages, preserves project files and reuses valid environments and caches; invalid Python environments are not silently deleted. Existing `scripts/backend.mjs` files are not overwritten by npm upgrades and need the matching initialization fix.

## 帮助与离线文档 / Help and offline documentation

`ewp help` 按开始、开发、构建和检查分组，终端支持颜色时使用共享配色。项目菜单按后端、平台和已安装工具过滤，隐藏项显示原因；原生后端不提供 wheel 或单文件应用，缺少 NSIS 时隐藏安装包入口并给出下载链接。初始化与文档入口始终保留，任务结束后重新检测。
`ewp help` groups setup, development, builds and checks using the shared terminal palette. Project menus filter tasks by backend, platform and installed tools and explain hidden entries. Native backends offer neither wheels nor onefile applications; missing NSIS hides installer entries with a download link. Recovery and documentation remain accessible; availability refreshes after tasks.

```powershell
ewp docs
ews docs
ewp docs --no-open
ewp docs --print --lang en
```

内置手册无需项目或网络，支持中文/英文、明暗主题、搜索、模块内目录、代码高亮与 Markdown / JSON 原始格式。样式与品牌来自 demo，界面使用直角，深浅主题统一彩色 SVG。`--print` 输出完整 Markdown，便于 AI 读取。
The bundled manual works offline and outside projects, with Chinese/English, light/dark themes, search, per-module contents, syntax highlighting and Markdown/JSON source formats. It uses the demo palette, square corners and the same color SVG in both themes. `--print` emits complete Markdown for AI readers.

六模板 demo 的“查看文档”使用 `easywindowspack/docs` 导出的 `openDocs({ language })`，在当前窗口的隔离面板中展示同一手册；返回时保留应用状态和焦点，不导航页面、不调用宿主桥接。文档从项目实际安装的包取得，按需加载并随前端构建生成离线资源；不依赖机器的全局安装路径，不向生成项目的源码或 `docs/` 复制完整手册。只需要终端手册的业务应用可移除这个可选 demo 导入。
The six demo templates call `openDocs({ language })` from `easywindowspack/docs` to show the same manual in an isolated in-window panel. Returning preserves application state and focus without page navigation or bridge calls. It reads the actual installed dependency, loads on demand and bundles offline assets with the frontend. No machine-specific global path or manual copy in project source/`docs/` is required. Business applications may remove this optional demo import.

## 六模板、语言与 AI / Templates, language and AI

| 框架 / Framework | JavaScript | TypeScript |
| --- | --- | --- |
| Vanilla | `vanilla` | `vanilla-ts` |
| Vue | `vue` | `vue-ts` |
| React | `react` | `react-ts` |

模板含 SVG welcome、窗口外观与浅深色切换；前端模板与后端可独立选择。生成应用 **0.1.0** 与本轮框架 npm **0.1.6** 独立，应用依赖目标为 `easywindowspack@^0.1.6`。
Templates include an SVG welcome, window themes and light/dark switching; frontend templates and backends can be selected independently. Generated app version **0.1.0** is independent of framework npm **0.1.6**; the app dependency target is `easywindowspack@^0.1.6`.

`--lang zh-CN` / `--lang en` 跳过语言提示并保存到 `frontend/package.json` 的 `ewp.language`；CLI 优先级：`--lang` → `EWP_LANG` → 保存值 → `zh-CN`。
`--lang zh-CN` / `--lang en` skips the language prompt and saves `ewp.language` in `frontend/package.json`; CLI priority: `--lang` → `EWP_LANG` → saved value → `zh-CN`.
README、welcome 与 AI 指引使用创建语言，临时覆盖不重写内容；npm / pip / Vite 输出和 npm 确认保持原样，生成器 `--yes` 不控制 npm 确认。
README, welcome and AI guidance use the creation language; temporary overrides do not rewrite them. npm / pip / Vite output and npm confirmation remain native; generator `--yes` does not control npm confirmation.

`--yes` / 非交互默认 `ewp-app`、`vanilla`、无 AI、不安装、不启动；AI 可用 `--ai codex,claude,copilot` 多选或 `--ai none` 跳过。
`--yes` / non-interactive defaults: `ewp-app`, `vanilla`, no AI, no installation or startup; select multiple AI tools with `--ai codex,claude,copilot`, or skip with `--ai none`.
只生成所选工具入口与目录，共用指引 / Skill 在 `docs/.easy-dev/agent.md` / `docs/.easy-dev/skills/easy-dev/SKILL.md`；Codex / Claude 路由在 `docs/.agents` / `docs/.claude`，Copilot 直接读共用内容。单选 Claude 无需 Codex 目录，docs 下的 Skill 需显式读取。
Only selected tool entries and directories are generated, sharing guidance / skill at `docs/.easy-dev/agent.md` / `docs/.easy-dev/skills/easy-dev/SKILL.md`; Codex / Claude route through `docs/.agents` / `docs/.claude`, while Copilot reads shared content directly. Claude alone needs no Codex directory; skills under docs require explicit loading.
共用 Skill 要求共享网格、横平竖直、边缘与基线对齐、统一间距尺寸、层级留白与克制配色；交互优雅直觉、顺序自然、反馈及时，键盘焦点可见且顺序合理，返回 / 取消明确，关弹窗恢复焦点，避免突兀布局跳动和无助理解的动效。
The shared skill requires a shared grid, horizontal rows and vertical columns, aligned edges and baselines, consistent spacing and sizes, hierarchy, whitespace and restrained color; interactions should be graceful and intuitive, with natural order, timely feedback, visible and logical keyboard focus, clear back / cancel paths and restored focus after dialogs, avoiding abrupt layout shifts and unhelpful motion.

## 公共导入 / Public imports

```javascript
import { mountFrame } from 'easywindowspack';
import 'easywindowspack/frame.css';

const handle = mountFrame(document.querySelector('#app'), {
  title: 'My App', windowStyle: 'windows', content: document.createElement('main'),
});
handle.update({ title: 'Ready' });
// 应用卸载时 / When the app unmounts:
handle.dispose();
```

句柄提供 `frame`、`content`、`update`、幂等 `dispose` / `remove`；同容器重挂载释放旧实例。字符串 `content` 是文本，渲染应用内容请传 DOM 节点。
Handles expose `frame`, `content`, `update` and idempotent `dispose` / `remove`; remounting releases the previous instance. String `content` is text; pass a DOM node for application markup.

| 导入 / Import | 能力 / Capability |
| --- | --- |
| `easywindowspack` | `mountFrame`, `getWindowApi`, `setWindowStyle`, `setTitleBarMode`, `call`, `isSupportedResizeDirection` |
| `easywindowspack/frame.css` | 窗口外壳样式，需显式导入 / Explicitly imported frame styles |
| `easywindowspack/desktop.css` | 桌面组件样式 / Desktop component styles |
| `easywindowspack/desktop-components.js` | `createMatrixProgress`, `createBootCurtain`, `createEntrance` |
| `easywindowspack/desktop-updates.js` | `createDesktopUpdateClient` |
| `easywindowspack/vue` / `easywindowspack/react` | 命名及默认 `WindowFrame` / Named and default `WindowFrame` |

Vue >=3.3、React / React DOM >=18 是可选 peers；仅安装所用框架，Vanilla 无需它们。模板复用 `mountFrame`，用 Teleport / portals 保留响应式和事件，卸载时清理实例。
Vue >=3.3 and React / React DOM >=18 are optional peers; install only the framework used, with neither needed for Vanilla. Templates reuse `mountFrame`, preserving reactivity and events through Teleport / portals and disposing instances on unmount.

## 常用任务与配置打包 / Tasks and configured packaging

在 `frontend/` 内运行；项目根使用 `npm --prefix frontend run <task>` 或全局 `ewp <task>`；根 `startup.cmd` 打开菜单。
Run inside `frontend/`; from the project root use `npm --prefix frontend run <task>` or global `ewp <task>`; root `startup.cmd` opens the menu.

| 命令 / Command | 用途 / Purpose |
| --- | --- |
| `npm run help` / `info` / `menu` | 帮助、环境信息、菜单 / Help, environment info, menu |
| `npm run dev` / `browser` | 桌面 / 浏览器 HMR / Desktop / browser HMR |
| `npm run frontend:build` / `frontend:preview` | 编译至 `output/frontend/` / 预览编译结果 / Build / preview compiled output |
| `npm run check` | 3 项 Node runtime exports/config 检查，无需 Python / Three Node runtime exports/config checks, no Python |
| `npm test` / `npm run typecheck` | 应用测试 / TS 模板类型检查 / App tests / TS-template type checks |
| `npm run build` | 默认 Windows EXE → `output/exe/` / Default Windows EXE |
| `npm run build -- --wheel` | Python wheel → `output/wheels/` |
| `npm run app` / `installer` | 配置应用 / 安装包 → `output/apps/` / `output/installers/` / Configured app / setup |
| `npm run backend:build` | 原生宿主编译 / Native host build |
| `npm run build:all` / `full-build` | Python: test → wheel → exe → bundle；原生 / native: test → frontend → host → app → bundle |

打包先完成 `init`，构建自动编译前端；npm 参数须放在 `--` 后，裸 `-w` 属于 npm workspace。
Run `init` before packaging; builds compile the frontend automatically. Pass npm script arguments after `--`; bare `-w` selects an npm workspace.
根 `ewp.pack.json` 配置 onefile / onedir 与安装选项；原生后端仅支持 onedir、不支持 onefile，例如 `npm run build -- --mode onedir`。EXE 仅携带编译前端；Python **0.3.0** wheel 已本地构建，PyPI 未发布。
Root `ewp.pack.json` configures onefile / onedir and installation; native backends support onedir only and reject onefile, e.g. `npm run build -- --mode onedir`. EXEs include only compiled frontend assets; the Python **0.3.0** wheel is built locally and is not published to PyPI.

## 全局 CLI 与颜色 / Global CLI and color

```powershell
npm install -g easywindowspack@latest
ewp create
ewp -h
```

`ewp` 无参数或仅带 `--lang en` / `--lang zh-CN` 显示紧凑构筑核品牌 ASCII welcome，列出 `ewp create`、`ewp dev`、`ewp build`、`ewp menu`，版本读取本包 manifest。
`ewp` without arguments or with only `--lang en` / `--lang zh-CN` shows the compact ASCII welcome with the brand's core symbol, `ewp create`, `ewp dev`, `ewp build` and `ewp menu`; version comes from this package's manifest.
`ewp -h` / `ewp help` / `ewp --help` 提供完整教程，`ewp create -h` 显示创建帮助；欢迎、帮助和创建无需已有项目，其余任务在项目内运行。
`ewp -h` / `ewp help` / `ewp --help` provides the full guide; `ewp create -h` shows creation help. Welcome, help and creation need no existing project; other tasks run inside one.

runtime 的依赖目标为 `create-ewp@^0.1.6`，`ewp create` 转调用 `create-ewp/cli`；欢迎与向导共享 `create-ewp/terminal`。向导标题读取 creator manifest，标题、问题、选项、执行与结果反馈着色，仅计实际阶段：创建 1 步、含安装 2 步、安装并启动 4 步。
The runtime dependency target is `create-ewp@^0.1.6`; `ewp create` delegates to `create-ewp/cli`, and welcome and wizard share `create-ewp/terminal`. The wizard title reads the creator manifest; titles, questions, choices, execution and results use color, counting actual stages only: create 1, with installation 2, with installation and startup 4.
颜色优先级：设置 `NO_COLOR`（含空值）最高，关闭；否则 `FORCE_COLOR=0` 关闭，其他已设置值（含空值）开启；默认仅 TTY 且 `TERM` 非 `dumb` 开启，管道为纯文案，仅影响自有输出。
Color priority: set `NO_COLOR` (even empty) disables first; otherwise `FORCE_COLOR=0` disables and any other set value (even empty) enables. By default, only a TTY with `TERM` other than `dumb` enables color; pipes use plain text. First-party output only.

## 深入文档 / Further reading

[npm / Vite 与完整 API / Guide and API](https://github.com/Binceenigne/easy-windows-pack/blob/main/.maintainer/npm-vite.md) · [开发任务 / Development](https://github.com/Binceenigne/easy-windows-pack/blob/main/.maintainer/development.md) · [配置打包与安装 / Packaging](https://github.com/Binceenigne/easy-windows-pack/blob/main/.maintainer/packaging.md) · [窗口外观 / Window styles](https://github.com/Binceenigne/easy-windows-pack/blob/main/.maintainer/window-styles.md)