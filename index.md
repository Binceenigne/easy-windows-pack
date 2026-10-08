# 项目索引

easy-windows-pack 是 Python + pywebview + ESM 前端的可复用 Windows WebView 框架，提供 Vite 开发与 Vanilla / Vue / React 可选模板。本文件保留实现定位摘要；详细资料统一在 [docs/README.md](docs/README.md)。npm / Vite 与公共 API 见 [docs/npm-vite.md](docs/npm-vite.md)，目录边界见 [docs/architecture.md](docs/architecture.md)，兼容入口见 [docs/development.md](docs/development.md)，视觉规则见 [design.md](design.md)。

源码在 `backend/base/ewpcore/`，公开包名仍为 `easy_windows_pack`，通过 `pyproject.toml` 的 `package-dir` 映射。桌面入口为 [backend/src/demo.py](backend/src/demo.py)，Vite 主页面为 [frontend/index.html](frontend/index.html)，生产装载 `output/frontend/index.html`。

## 页面与组件

以下登记 2 个示例页面、4 个共享 UI 语义实体；另单列 2 个 npm 包、6 套生成模板、2 个前端桥接/客户端及 4 个开发编排服务入口。统计仅覆盖下表；外观、JS/TS 包装及弃用页面别名不重复计入 UI 数，生成副本、Skill、依赖、测试与产物不计入。全仓其他分类总数未知。

| 实现 | 路径 / 复用入口 | 职责与边界 |
| --- | --- | --- |
| 窗口示例页面 | [frontend/index.html](frontend/index.html)、[main.js](frontend/src/main.js)、[backend/src/demo.py](backend/src/demo.py) | Vite 装配与宿主入口；旧 [src/index.html](frontend/src/index.html) 为弃用兼容入口，不另计页面 |
| 组件示例页面 | [frontend/src/components.html](frontend/src/components.html)、[演示脚本](frontend/src/components-demo.js) | 点阵、遮罩和进入动效的离线演示 |
| window-frame | [标记](frontend/components/titlebar/window-frame.html)、[样式](frontend/components/titlebar/window-frame.css) | 标题栏、控制按钮、缩放句柄；`data-window-style` / `data-titlebar-mode` |
| 点阵进度 | [desktop-components.js](frontend/components/desktop/desktop-components.js) 的 `createMatrixProgress` | `value` / `remaining` 语义分离；更新与释放 |
| 启动遮罩 | 同上，`createBootCurtain` | `setReady` / 超时退出 / `dispose`；退出不代表业务成功 |
| 错峰进入 | 同上，`createEntrance` | `prepare` / `reveal` / `dispose`；管理 pending 状态与交互 |

## 桥接与后端入口

| 实现 | 路径 | 职责 / 公开入口 |
| --- | --- | --- |
| 窗口前端桥接 | [window-frame.js](frontend/frame/ewpframe/window-frame.js) | `bind`、`setWindowStyle`、`setTitleBarMode`、`call`；状态同步 |
| 更新客户端 | [desktop-updates.js](frontend/frame/ewpframe/desktop-updates.js) | `createDesktopUpdateClient`；轮询、就绪确认和显式更新请求 |
| 公共 Python API | [__init__.py](backend/base/ewpcore/__init__.py)、[create.py](backend/base/ewpcore/create.py)、[config.py](backend/base/ewpcore/config.py) | `WindowConfig`、`create_window` 与公共导出 |
| 窗口状态与平台 | [controller.py](backend/base/ewpcore/controller.py)、[api.py](backend/base/ewpcore/api.py)、[win32.py](backend/base/ewpcore/win32.py) | 生命周期、串行 JS dispatcher、原生窗口能力 |
| 托盘与宿主适配 | [tray.py](backend/base/ewpcore/tray.py)、[adapters.py](backend/base/ewpcore/adapters.py) | 可选托盘；白名单 API 适配，授权与更新仍由宿主管理 |
| 类型契约 | [frontend/contracts/README.md](frontend/contracts/README.md)、[index.d.ts](frontend/contracts/index.d.ts) | 前端与宿主接口类型；详细说明见 [桌面集成](docs/desktop-integrations.md) |

## npm 包与模板

根 [package.json](package.json) 为 private workspace，不发布根包。两个 npm 包均为 0.1.0；公开名称所有权与发布状态未确认。

| 实现 | 路径 / 公开入口 | 职责 |
| --- | --- | --- |
| easywindowspack | [包说明](packages/easywindowspack/README.md)、[index.mjs](packages/easywindowspack/index.mjs)、[类型](packages/easywindowspack/index.d.ts) | ESM `mountFrame`、生命周期 update/dispose、CSS、desktop components/updates、可选 Vue/React；bin `ewp` |
| create-ewp | [包说明](packages/create-ewp/README.md)、[create.mjs](packages/create-ewp/lib/create.mjs) | `@clack/prompts` 交互生成器；发布后 `npm create ewp@latest`，或全局 runtime 的 `ewp create` |
| Vanilla JS / TS（2 套） | [JS 入口](packages/create-ewp/templates/vanilla/frontend/src/main.js)、[TS 入口](packages/create-ewp/templates/vanilla-ts/frontend/src/main.ts) | 原生 `mountFrame` 与业务 DOM |
| Vue JS / TS（2 套） | [JS Frame](packages/create-ewp/templates/vue/frontend/src/Frame.vue)、[TS Frame](packages/create-ewp/templates/vue-ts/frontend/src/Frame.vue) | 模板自有组合层以 Teleport 保留 slot 与 props 响应式 |
| React JS / TS（2 套） | [JS Frame](packages/create-ewp/templates/react/frontend/src/Frame.jsx)、[TS Frame](packages/create-ewp/templates/react-ts/frontend/src/Frame.tsx) | 模板自有组合层以 portal 保留 children、props 和事件 |

共同资源来自 [common README](packages/create-ewp/templates/common/README.md) 及 prepare 复制的 backend runtime / scripts；不单独维护复制实现。包的 [Vue 入口](packages/easywindowspack/vue.mjs) / [React 入口](packages/easywindowspack/react.mjs) 是可选公开适配，不作为额外 UI 实体计数，也不是所有宿主的规范。

## 开发与分发

下表登记 4 个编排服务入口；不把其中每个子命令另计为服务。

| 入口 | 职责 |
| --- | --- |
| [ewp.mjs](packages/easywindowspack/bin/ewp.mjs) | Node CLI；create 委托、Vite 开发、实际 `EWP_DEV_URL` 与 Python 任务；默认 build 为 EXE |
| [生成器 cli.mjs](packages/create-ewp/lib/cli.mjs) | 项目名/框架/语言/安装/启动交互与生成流程 |
| [prepare-npm.mjs](scripts/prepare-npm.mjs) | 从 frontend/frame/components 与 backend/scripts 单源生成包资源 |
| [scripts/dev.py](scripts/dev.py) | Python 环境、legacy 菜单、frontend 编译与原生打包编排 |

- [build.cmd](build.cmd) → Python 菜单：`init`、`browser`（Vite）、`frontend`、`demo`、`wheel`、`exe`、`bundle`、`build`、`test`、`info`；菜单 build 保留完整阶段，与 npm 默认 EXE 分开。
- [cli.py](backend/base/ewpcore/cli.py)、[pyproject.toml](pyproject.toml)：底层 CLI 与公开包/资源分发；[build.ps1](build.ps1) 保留兼容入口，[build-demo.ps1](build-demo.ps1) 委托菜单的 `exe` 任务。
- `output/frontend/`、`output/wheels/`、`output/exe/`、`output/bundles/`、`output/npm/`、`output/logs/` 为分类产物；`build/` 为配置、暂存与缓存。EXE 使用编译前端，框架 wheel 与应用 wheel 按各自 metadata 分发资源。
- 当前验证记录见 [docs/npm-validation.md](docs/npm-validation.md)；历史迁移计数不作为 npm/Vite、浏览器或原生验收通过证据。
