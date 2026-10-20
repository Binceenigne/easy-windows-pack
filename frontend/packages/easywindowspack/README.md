# easywindowspack

Version 0.1.4 · MIT

共享窗口外壳、桌面组件和 `ewp` CLI，连接 Vite 前端与 Python / pywebview 桌面，支持 Windows / macOS 窗口外观。
Shared window frames, desktop components and the `ewp` CLI connect Vite frontends with Python / pywebview desktops, with Windows / macOS window themes.

## 环境 / Requirements

- Node.js >=22.12.0（含 npm）；桌面与打包需 Python >=3.10，Windows 桌面另需 WebView2。
  Node.js >=22.12.0, including npm; desktop and packaging need Python >=3.10, with WebView2 for Windows desktop.
- 浏览器开发和前端编译无需 Python；浏览器不提供原生窗口控制。EXE 打包面向 Windows，macOS 外观仅为 UI 主题。
  Browser development and frontend builds need no Python; browsers provide no native window controls. EXE packaging targets Windows; macOS appearance is a UI theme.

## 安装与创建 / Install and create

无需全局安装即可创建，目标目录必须为空；向导先选简体中文 / English，再选项目名、框架、JS / TS、可选 AI、安装与启动。
Create without a global installation in an empty destination; the wizard asks for language, name, framework, JS / TS, optional AI, installation and startup.

```powershell
npm create ewp@latest my-app -- --template react-ts --lang en --no-install --no-start --yes
cd my-app/frontend
npm install
npm run init
npm run dev
```

`init` 创建或复用根 `.venv`、安装依赖并编译前端，无需手动激活；`dev` 提供桌面 HMR，Ctrl+C 停止。
`init` creates or reuses root `.venv`, installs dependencies and builds the frontend without manual activation; `dev` provides desktop HMR, stopped with Ctrl+C.
0.1.4 新建应用随 creator 获得新版 `scripts/dev.py`：Python init/build 在 VT TTY 底部固定两行蓝色阶段进度，上方日志滚动（[恢复、plain 回退与开关](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/development.md)）；已有应用在 `frontend/` 用 `npm install easywindowspack@latest` 升级不会改写该脚本、README、AI 指引或 demo。
New apps created with 0.1.4 receive the updated `scripts/dev.py` from the creator: Python init/build pins blue stage progress to two bottom rows in a VT TTY, with logs scrolling above (see [restoration, plain fallbacks and controls](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/development.md)); upgrading with `npm install easywindowspack@latest` inside an existing app's `frontend/` does not rewrite this script, README, AI guidance or demos.

公开版本以 `npm view easywindowspack version`、`npm view create-ewp version` 与[验收记录](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-validation.md)为准。
Confirm published versions with these npm queries and the linked validation record.

## 六模板、语言与 AI / Templates, language and AI

| 框架 / Framework | JavaScript | TypeScript |
| --- | --- | --- |
| Vanilla | `vanilla` | `vanilla-ts` |
| Vue | `vue` | `vue-ts` |
| React | `react` | `react-ts` |

模板含 SVG welcome、计数器、窗口外观选择和系统浅深色。生成应用 **0.1.0** 与本轮框架 npm **0.1.4** 独立，应用依赖目标为 `easywindowspack@^0.1.4`。
Templates include an SVG welcome, counter, window themes and system light/dark appearance. Generated app version **0.1.0** is independent of framework npm **0.1.4**; the app dependency target is `easywindowspack@^0.1.4`.

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
| `npm run build:all` / `full-build` | test → wheel → exe → bundle |

打包先完成 `init`，构建自动编译前端；npm 参数须放在 `--` 后，裸 `-w` 属于 npm workspace。
Run `init` before packaging; builds compile the frontend automatically. Pass npm script arguments after `--`; bare `-w` selects an npm workspace.
根 `ewp.pack.json` 配置 onefile / onedir 与安装选项，例如 `npm run build -- --mode onedir`。EXE 仅携带编译前端；Python **0.3.0** wheel 已本地构建，PyPI 未发布。
Root `ewp.pack.json` configures onefile / onedir and installation, e.g. `npm run build -- --mode onedir`. EXEs include only compiled frontend assets; Python **0.3.0** wheel is built locally and is not published to PyPI.

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

runtime 的依赖目标为 `create-ewp@^0.1.4`，`ewp create` 转调用 `create-ewp/cli`；欢迎与向导共享 `create-ewp/terminal`。向导标题读取 creator manifest，标题、问题、选项、执行与结果反馈着色，仅计实际阶段：创建 1 步、含安装 2 步、安装并启动 4 步。
The runtime dependency target is `create-ewp@^0.1.4`; `ewp create` delegates to `create-ewp/cli`, and welcome and wizard share `create-ewp/terminal`. The wizard title reads the creator manifest; titles, questions, choices, execution and results use color, counting actual stages only: create 1, with installation 2, with installation and startup 4.
颜色优先级：设置 `NO_COLOR`（含空值）最高，关闭；否则 `FORCE_COLOR=0` 关闭，其他已设置值（含空值）开启；默认仅 TTY 且 `TERM` 非 `dumb` 开启，管道为纯文案，仅影响自有输出。
Color priority: set `NO_COLOR` (even empty) disables first; otherwise `FORCE_COLOR=0` disables and any other set value (even empty) enables. By default, only a TTY with `TERM` other than `dumb` enables color; pipes use plain text. First-party output only.

## 深入文档 / Further reading

[npm / Vite 与完整 API / Guide and API](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-vite.md) · [开发任务 / Development](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/development.md) · [配置打包与安装 / Packaging](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/packaging.md) · [窗口外观 / Window styles](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/window-styles.md)