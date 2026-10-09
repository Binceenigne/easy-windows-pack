# 项目索引

easy-windows-pack 是 Python + pywebview + ESM 前端的可复用 Windows WebView 框架，提供 Vite 开发与 Vanilla / Vue / React 可选模板。本文件保留实现定位摘要；详细资料统一在 [文档导航](README.md)。npm / Vite 与公共 API 见 [npm-vite.md](npm-vite.md)，目录边界见 [architecture.md](architecture.md)，兼容入口见 [development.md](development.md)，视觉规则见 [design.md](design.md)。下文源码路径均相对项目根目录。

源码在 `backend/base/ewpcore/`，公开包名仍为 `easy_windows_pack`，通过 `pyproject.toml` 的 `package-dir` 映射。桌面入口为 [backend/src/demo.py](../backend/src/demo.py)，Vite 主页面为 [frontend/index.html](../frontend/index.html)，生产装载 `output/frontend/index.html`。

## 页面与组件

以下登记 2 个示例页面、4 个共享 UI 语义实体；另单列 2 个 npm 包、6 套生成模板、2 个前端桥接/客户端及 4 个开发编排服务入口。统计仅覆盖下表；外观、JS/TS 包装及弃用页面别名不重复计入 UI 数，生成副本、Skill、依赖、测试与产物不计入。全仓其他分类总数未知。

| 实现 | 路径 / 复用入口 | 职责与边界 |
| --- | --- | --- |
| 窗口示例页面 | [frontend/index.html](../frontend/index.html)、[main.js](../frontend/src/main.js)、[demo.css](../frontend/src/demo.css)、[backend/src/demo.py](../backend/src/demo.py) | Vite 风格 welcome；浅深色、中文/英文切换、计数、窗口外观/标题栏控制与资源入口，适配窄窗和低高度；旧 [src/index.html](../frontend/src/index.html) 为弃用兼容入口，不另计页面 |
| 组件示例页面 | [frontend/src/components.html](../frontend/src/components.html)、[演示脚本](../frontend/src/components-demo.js) | 点阵、遮罩和进入动效的离线演示 |
| window-frame | [标记](../frontend/components/titlebar/window-frame.html)、[样式](../frontend/components/titlebar/window-frame.css) | 标题栏、控制按钮、缩放句柄；`data-window-style` / `data-titlebar-mode` |
| 点阵进度 | [desktop-components.js](../frontend/components/desktop/desktop-components.js) 的 `createMatrixProgress` | `value` / `remaining` 语义分离；更新与释放 |
| 启动遮罩 | 同上，`createBootCurtain` | `setReady` / 超时退出 / `dispose`；退出不代表业务成功 |
| 错峰进入 | 同上，`createEntrance` | `prepare` / `reveal` / `dispose`；管理 pending 状态与交互 |

## 桥接与后端入口

| 实现 | 路径 | 职责 / 公开入口 |
| --- | --- | --- |
| 窗口前端桥接 | [window-frame.js](../frontend/frame/ewpframe/window-frame.js) | `bind`、`setWindowStyle`、`setTitleBarMode`、`call`；状态同步 |
| 更新客户端 | [desktop-updates.js](../frontend/frame/ewpframe/desktop-updates.js) | `createDesktopUpdateClient`；轮询、就绪确认和显式更新请求 |
| 公共 Python API | [__init__.py](../backend/base/ewpcore/__init__.py)、[create.py](../backend/base/ewpcore/create.py)、[config.py](../backend/base/ewpcore/config.py) | `WindowConfig`、`create_window` 与公共导出 |
| 窗口状态与平台 | [controller.py](../backend/base/ewpcore/controller.py)、[api.py](../backend/base/ewpcore/api.py)、[win32.py](../backend/base/ewpcore/win32.py) | 生命周期、串行 JS dispatcher、原生窗口能力 |
| 托盘与宿主适配 | [tray.py](../backend/base/ewpcore/tray.py)、[adapters.py](../backend/base/ewpcore/adapters.py) | 可选托盘；白名单 API 适配，授权与更新仍由宿主管理 |
| 类型契约 | [frontend/contracts/README.md](../frontend/contracts/README.md)、[index.d.ts](../frontend/contracts/index.d.ts) | 前端与宿主接口类型；详细说明见 [桌面集成](desktop-integrations.md) |

## npm 包与模板

前端 [package.json](../frontend/package.json) 为 private workspace，不发布 workspace 根包；配置、锁文件与依赖均在 frontend。两个 npm 包的 **0.1.1 已发布且 registry 可用**；2026-10-09 两包 registry 哈希与归档匹配，`@latest` 创建与 Vue TS 项目安装、检查及前端构建冒烟已通过，详见 [验收记录](npm-validation.md)。Python 版本仍为 **0.2.1**。`backend/base/*.egg-info/` 是 setuptools 生成元数据，不属于 docs、不提交；`.venv` 中的 `.dist-info` 是正常安装元数据。

| 实现 | 路径 / 公开入口 | 职责 |
| --- | --- | --- |
| easywindowspack | [包说明](../frontend/packages/easywindowspack/README.md)、[index.mjs](../frontend/packages/easywindowspack/index.mjs)、[类型](../frontend/packages/easywindowspack/index.d.ts) | ESM `mountFrame`、生命周期 update/dispose、CSS、desktop components/updates、可选 Vue/React；bin `ewp` |
| create-ewp | [包说明](../frontend/packages/create-ewp/README.md)、[create.mjs](../frontend/packages/create-ewp/lib/create.mjs) | `@clack/prompts` 生成器；先选人类语言，再选六模板及可选 codex/claude/copilot；AI 默认全不选。可用 `npm create ewp@latest`，或 `npm install -g easywindowspack@latest` 后执行 `ewp create`；`@latest` 创建与 Vue TS registry 冒烟已通过 |
| Vanilla JS / TS（2 套） | [JS 入口](../frontend/packages/create-ewp/templates/vanilla/frontend/src/main.js)、[TS 入口](../frontend/packages/create-ewp/templates/vanilla-ts/frontend/src/main.ts) | 原生 `mountFrame` 与业务 DOM |
| Vue JS / TS（2 套） | [JS Frame](../frontend/packages/create-ewp/templates/vue/frontend/src/Frame.vue)、[TS Frame](../frontend/packages/create-ewp/templates/vue-ts/frontend/src/Frame.vue) | 模板自有组合层以 Teleport 保留 slot 与 props 响应式 |
| React JS / TS（2 套） | [JS Frame](../frontend/packages/create-ewp/templates/react/frontend/src/Frame.jsx)、[TS Frame](../frontend/packages/create-ewp/templates/react-ts/frontend/src/Frame.tsx) | 模板自有组合层以 portal 保留 children、props 和事件 |

共同资源来自 [common README](../frontend/packages/create-ewp/templates/common/README.md) 及 prepare 复制的 backend runtime / scripts；不单独维护复制实现。六模板 welcome 均提供品牌图标、计数、窗口外观选择、源码编辑提示与资源链接，文案使用创建时所选语言，浅深色随系统偏好；根 demo 的语言/主题切换和标题栏模式控制不属于六模板的统一承诺。

品牌 SVG 权威来源为 [ewp-color.svg](../frontend/src/assets/ewp-color.svg)、[ewp-dark.svg](../frontend/src/assets/ewp-dark.svg)、[ewp-mono.svg](../frontend/src/assets/ewp-mono.svg)。[prepare-npm.mjs](../scripts/prepare-npm.mjs) 将三者复制到 `frontend/packages/create-ewp/templates/common/frontend/src/assets/`；该生成目录由 [.gitignore](../.gitignore) 排除，不手工维护。新 welcome 属于本地源码改动，线上 **0.1.1 未包含本轮更新**，本轮不发布新版；本地证据见 [验收记录](npm-validation.md#2026-10-09-welcome-改版本地验收--local-welcome-validation)。包的 [Vue 入口](../frontend/packages/easywindowspack/vue.mjs) / [React 入口](../frontend/packages/easywindowspack/react.mjs) 是可选公开适配，不作为额外 UI 实体计数，也不是所有宿主的规范。

## 开发与分发

[language.mjs](../frontend/packages/easywindowspack/language.mjs) 维护 runtime 语言优先级与帮助；创建保存 `frontend/package.json` 的 `ewp.language`。命令采用 `--lang` → `EWP_LANG` → 保存值 → `zh-CN`，临时覆盖不重写文件；`--yes` 无设置时默认中文。npm 的 `Ok to proceed?` 及 pip/Vite 等第三方输出不翻译。

生成 AI 布局与仓库路由分开：Codex / Claude 专属 Skill 均转到 `docs/.easy-dev/skills/easy-dev/SKILL.md`，再读共用 `docs/.easy-dev/agent.md`；Copilot 直接读共用内容。仅选 Claude 不生成 Codex 目录，未选 AI 不生成资源。仓库自身仍由 [agent.md](agent.md) 显式路由；详细路径见 [AI 布局](npm-vite.md#ai-资源布局--ai-resource-layout)。

下表登记 4 个编排服务入口；不把其中每个子命令另计为服务。

| 入口 | 职责 |
| --- | --- |
| [ewp.mjs](../frontend/packages/easywindowspack/bin/ewp.mjs) | Node CLI；create 委托、Vite 开发、实际 `EWP_DEV_URL` 与 Python 任务；默认 build 为 EXE |
| [生成器 cli.mjs](../frontend/packages/create-ewp/lib/cli.mjs) | 人类语言 → 项目名/框架/JS 或 TS/AI 多选/安装/启动；`--lang` 跳过语言选择 |
| [prepare-npm.mjs](../scripts/prepare-npm.mjs) | 从 frontend/frame/components 与 backend/scripts 单源生成包资源 |
| [scripts/dev.py](../scripts/dev.py) | Python 环境、legacy 菜单、frontend 编译与原生打包编排 |

- [startup.cmd](../startup.cmd) → [scripts/startup.cmd](../scripts/startup.cmd) → Python 菜单；与 npm / ewp 的 `build` 一致，默认 EXE。`full-build` / `build:all` / `build --all` 为 test → wheel → exe → bundle。仓库和新生成项目 scripts 包含 help、ewp、menu、init、dev、browser、frontend、demo、wheel、exe、bundle、build、build:all、full-build、test、info、check；另有 frontend:dev/build/preview 和 build:wheel/exe 别名。完整映射见 [开发手册](development.md#菜单与命令--menu-and-commands)；生成模板附带 `tests/npm-runtime.test.mjs`，`npm run check` / `ewp check` / `startup.cmd check` 执行 3 项 Node runtime exports/config 检查。
- [cli.py](../backend/base/ewpcore/cli.py)、[pyproject.toml](../pyproject.toml)：底层 CLI 与公开包/资源分发；[scripts/build.cmd](../scripts/build.cmd) 和 [scripts/build.ps1](../scripts/build.ps1) 保留兼容入口，[scripts/build-demo.ps1](../scripts/build-demo.ps1) 委托菜单的 `exe` 任务。npm 命令在 frontend 内执行，或从根目录使用 `npm --prefix frontend`。
- `output/frontend/`、`output/wheels/`、`output/exe/`、`output/bundles/`、`output/npm/`、`output/logs/` 为分类产物；`build/` 为配置、暂存与缓存。EXE 使用编译前端，框架 wheel 与应用 wheel 按各自 metadata 分发资源。
- 当前验证记录见 [npm-validation.md](npm-validation.md)；历史迁移计数不作为 npm/Vite、浏览器或原生验收通过证据。
