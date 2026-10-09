<div align="center">

# easy-windows-pack

用 Web 技术写界面，用 Python 连接桌面能力，打包成 Windows 应用。

[![CI](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml/badge.svg)](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml)
[![easywindowspack](https://img.shields.io/npm/v/easywindowspack?label=easywindowspack)](https://www.npmjs.com/package/easywindowspack)
[![create-ewp](https://img.shields.io/npm/v/create-ewp?label=create-ewp)](https://www.npmjs.com/package/create-ewp)
[![Node](https://img.shields.io/badge/Node-%3E%3D22.12-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Windows](https://img.shields.io/badge/platform-Windows-0078D4)](https://www.microsoft.com/windows)

**中文** · [English](README.en.md) · [文档导航](docs/README.md) · [npm / Vite 指南](docs/npm-vite.md)

</div>

`easy-windows-pack` 是基于 Python、pywebview 和 ESM 前端的 Windows WebView 框架。它提供可复用的窗口外壳和开发、构建工具，让业务界面与桌面能力分开维护。

- **选择熟悉的前端**：Vanilla、Vue、React，各有 JavaScript / TypeScript 模板。
- **桌面窗口开箱即用**：Windows / macOS 两套外观，原生、默认自绘、紧凑自绘标题栏；支持窗口按钮、拖拽、边缘缩放和 Windows Snap。
- **开发到分发**：Vite 热更新、Python 业务 API 桥接、Windows 单文件 EXE 与 wheel 构建。
- **按需扩展**：托盘、点阵进度、启动遮罩、进入动画及宿主更新适配器。

两个 npm 包均已发布 **0.1.1**，registry 已可用：`create-ewp` 提供 `npm create ewp` 脚手架，`easywindowspack` 提供前端 runtime、CSS 和 `ewp` CLI。下文语言选择、帮助、菜单与完整构建命令属于 0.1.1。Python 分发名为 `easy-windows-pack`，源码版本为 **0.2.1**，由项目 `init` 从本地源码安装。

## 环境要求

| 用途 | 要求 |
| --- | --- |
| 创建项目、浏览器开发、前端编译 | Node.js **>=22.12.0**，npm |
| 桌面开发、Python 测试、原生打包 | Python **>=3.10** |
| Windows 桌面运行 | Windows + [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) |

安装 Python 时建议启用 Windows `py` launcher。macOS 外观是窗口 UI 主题；本项目的 EXE 打包面向 Windows。

## 创建第一个应用

在准备存放项目的目录打开终端，无需全局安装：

```powershell
npm create ewp@latest
```

**版本提示：0.1.1 已可用，`@latest` 创建与 Vue TS 项目安装、检查及前端构建冒烟已通过。** 结果见 [验收记录](docs/npm-validation.md)，本地用法见 [npm / Vite 指南](docs/npm-vite.md#发布状态与创建项目--publication-status-and-project-creation)。

0.1.1 交互的第一步选择**人类语言**：简体中文 `zh-CN` 或 English `en`，随后选择项目名、框架、编程语言 JavaScript / TypeScript、可选 AI 工具，以及是否安装依赖、初始化 Python 并启动桌面。AI 默认不选，安装与启动默认也不执行。

可用以下 **0.1.1 命令**固定版本与配置。生成器参数放在 npm 的 `--` 后，`--lang` 跳过第一步语言选择：

```powershell
npm create ewp@0.1.1 my-app -- --lang zh-CN --template react-ts --ai codex,claude --no-install --no-start --yes
npm create ewp@0.1.1 my-vue-app -- --lang en --template vue-ts --ai claude --no-install --no-start --yes
```

然后进入生成项目的 **frontend** 目录。以下以 `my-app` 为例，Vue 示例改为 `my-vue-app/frontend`：

```powershell
cd my-app/frontend
npm install
npm run init
npm run dev
```

`init` 创建或复用项目根 `.venv`，安装 npm / Python 开发依赖并编译前端；无需手动激活虚拟环境。若生成器已经完成安装或初始化，可跳过对应步骤；若已经启动桌面，无需重复运行 `dev`。

`dev` 启动 Vite 和桌面窗口，支持前端热更新。实际本机 URL 以终端输出为准，端口动态分配；按 Ctrl+C 停止服务和桌面进程。

只开发浏览器界面时，安装 npm 依赖后运行 `npm run frontend:dev`，**不需要 Python**。浏览器预览可检查外观与前端交互；拖拽、缩放、Snap、托盘和 Python 桥接需在真实桌面验证。

目标目录必须为空，包括不能含 `.git`。`--yes` 跳过生成器交互，默认项目名 `ewp-app`、模板 `vanilla`、无 AI、不安装、不启动；语言按下节优先级解析，无设置时为 `zh-CN`。`--install` 仅安装 npm 依赖；`--start` 还会初始化 Python 并启动桌面，不能与 `--no-install` 同用。

也可安装或升级全局 CLI，再创建项目：

```powershell
npm install -g easywindowspack@latest
ewp create
```

如需固定版本，全局 CLI 用 `npm install -g easywindowspack@0.1.1`；已有项目在 frontend 内用 `npm install easywindowspack@^0.1.1` 升级 runtime。升级依赖不会自动补齐旧项目的 scripts、README 或 AI 指引，完整任务映射见 [开发手册](docs/development.md#菜单与命令--menu-and-commands)。

## 项目语言

创建时把所选语言保存到 `frontend/package.json` 的 `ewp.language`。运行命令时的优先级为 **显式 `--lang` → `EWP_LANG` 环境变量 → 项目保存值 → `zh-CN`**。运行已有项目时，`--lang` 只覆盖本次命令，不改保存值：

```powershell
npm run help -- --lang en
npm run ewp -- info --lang zh-CN
ewp menu --lang en
```

生成项目的 README、AI 指引和示例文案使用创建语言；语言选择完成后，自有 CLI 帮助、菜单、提示及任务说明按所选语言单语输出。**npm 的 `Ok to proceed?` 确认及 npm、pip、Vite 等第三方日志保留原生输出**；生成器 `--yes` 不控制 npm 自己的确认。临时切换 CLI 语言不会重写已有 README、AI 文件、示例或业务文案；修改 `ewp.language` 可改变后续命令的默认语言。

## 模板与 AI 指引

| 框架 | JavaScript | TypeScript |
| --- | --- | --- |
| Vanilla | `vanilla` | `vanilla-ts` |
| Vue | `vue` | `vue-ts` |
| React | `react` | `react-ts` |

AI 指引按需生成，可用 `--ai codex,claude,copilot` 多选：

| 选择 | 标准入口 | Skill / 共用指引 |
| --- | --- | --- |
| Codex | 根 `AGENTS.md` | `docs/.agents/skills/easy-dev/SKILL.md` |
| Claude | 根 `CLAUDE.md` | `docs/.claude/skills/easy-dev/SKILL.md` |
| Copilot | `.github/copilot-instructions.md` | 直接读取共用指引与共用 Skill |
| 任一工具 | 仅生成所选工具的入口 | `docs/.easy-dev/agent.md` 与 `docs/.easy-dev/skills/easy-dev/SKILL.md` |

Codex / Claude 的专属 Skill 都转到共用 Skill，再读取 `docs/.easy-dev/agent.md`。仅选 Claude 时不生成 `AGENTS.md` 或 `docs/.agents/`。未选择 AI 时不生成这些入口或资源；docs 下的 Skill 由标准入口显式引导读取。

## 项目结构与业务代码

以下是**生成应用**的主要目录，安装或构建后才会出现依赖、环境和产物：

```text
my-app/
├─ frontend/
│  ├─ src/                  # 业务界面与样式
│  ├─ index.html            # Vite 页面入口
│  ├─ package.json
│  ├─ vite.config.mjs
│  └─ node_modules/         # npm 安装后生成
├─ backend/
│  ├─ src/demo.py           # 桌面入口与业务 API
│  └─ base/                # 共享 Python 窗口 runtime 与安装 metadata
│     ├─ ewpcore/
│     └─ *.egg-info/       # Python 安装/构建后生成，已忽略
├─ scripts/                # 开发与打包工具
├─ startup.cmd             # Windows 项目菜单
├─ pyproject.toml
├─ docs/                   # 选择 AI 时生成的指引
├─ .venv/                  # init 创建的 Python 环境
└─ output/                 # 编译、打包与日志产物
```

前端的 package、Vite / TypeScript 配置、锁文件和 npm 依赖都放在 `frontend/`，npm 命令也在这里执行。从项目根调用可加 `--prefix frontend`，例如 `npm --prefix frontend run dev`。

业务界面从 Vanilla 的 `src/main.js` / `main.ts`、Vue 的 `src/App.vue`、React 的 `src/App.jsx` / `App.tsx` 开始，路径均相对 frontend。Python 业务方法写在 `backend/src/demo.py`；公开导入名仍是 `easy_windows_pack`。窗口核心与工具分别留在 `backend/base/ewpcore/` 和 `scripts/`。

`backend/base/*.egg-info/` 是 setuptools 安装/构建生成的元数据，不属于 docs，不手工维护或提交；`.venv/Lib/site-packages/*.dist-info/` 是已安装包的正常元数据，同样不提交。包映射、忽略规则与旧缓存说明见 [架构](docs/architecture.md#源码路径与公开包名--source-path-and-public-package-name)。

## 常用开发命令

以下命令在 `frontend/` 执行：

| 命令 | 用途 |
| --- | --- |
| `npm run help` | 查看自有 CLI 帮助 |
| `npm run info` | 查看 Node、项目路径、前端配置与 `.venv` 路径 |
| `npm run menu` | 打开项目任务菜单 |
| `npm run ewp -- <task> [options]` | 直接执行任一 CLI 任务 |
| `npm run init` | 初始化或复用 Python 环境，安装依赖 |
| `npm run dev` | Vite + Python 桌面开发 |
| `npm run dev -- --web` | 仅浏览器开发 |
| `npm run browser` / `npm run frontend:dev` | 浏览器开发，无需 Python |
| `npm run frontend` / `npm run frontend:build` | 编译前端到 `output/frontend/`，无需 Python |
| `npm run frontend:preview` | 预览已编译前端，先运行 frontend:build |
| `npm run demo -- --debug` | 编译后运行桌面并开启开发者工具，无 HMR |
| `npm run wheel` / `npm run build:wheel` | 构建 Python wheel |
| `npm run exe` / `npm run build:exe` / `npm run build` | 构建 Windows EXE |
| `npm run bundle` | 构建源码 bundle |
| `npm run build:all` / `npm run full-build` | test → wheel → exe → bundle |
| `npm run typecheck` | TypeScript 模板的类型检查 |
| `npm test` | 运行项目 Python 测试，需先 init |
| `npm run check` | Node runtime exports/config 检查 |

仓库与新生成项目均提供上表通用任务；`typecheck` 仅限 TypeScript 模板。生成模板附带 `tests/npm-runtime.test.mjs`；在 frontend 内执行 `npm run check`，或在项目根执行 `ewp check` / `startup.cmd check`，可运行 3 项 Node runtime exports/config 检查：公共 API/CSS、Vite 配置及应用 manifest/HTML 入口。

全局安装 CLI 后，`ewp` 无参数、`ewp -h` / `ewp --help` 均输出帮助，创建帮助可用 `ewp create -h`，无需已有项目。项目根可运行 `ewp menu` 或 `ewp <task>`；未全局安装时，从根用 `npm --prefix frontend run menu`、`npm --prefix frontend run ewp -- <task>`，或在 frontend 使用上表入口。

根目录的 `startup.cmd` 可双击或运行 `.\startup.cmd` 打开菜单；它委托 `scripts/startup.cmd` 和 `scripts/dev.py`，需要 Python。菜单任务也可直接调用，例如 `.\startup.cmd demo --debug`；`.\startup.cmd help` 查看帮助，`.\startup.cmd info` 检查实际 Python 解释器和产物目录。`ewp menu` 本身无需先初始化 Python。完整映射及故障排查见 [开发手册](docs/development.md)。

## 构建与产物

```powershell
npm run build
npm run build -- -w
npm run build -- --wheel
npm run build -- -e
npm run build:all
```

`npm run build` 默认生成 Windows **EXE**；`-- -e` / `-- --exe` 显式选择 EXE，`-- -w` / `-- --wheel` 选择 Python wheel，也可用 `npm run build:exe` / `npm run build:wheel`。这两类打包均先编译前端，需先完成 `init`。

完整 pipeline 为 **test → wheel → exe → bundle**：使用 `npm run build:all` / `npm run full-build`、`npm run build -- --all`，或 `ewp build:all` / `ewp full-build` / `ewp build --all`；根启动脚本支持 `.\startup.cmd full-build` / `.\startup.cmd build:all`。所有项目入口的 `build` 默认 EXE，EXE 与完整构建仅支持 Windows。

**不要写 `npm run build -w`**：裸 `-w` 是 npm 的 workspace 参数。直接调用 CLI 时可写 `ewp build -w`。

EXE 从 `backend/src/demo.py` 启动，携带并加载 `output/frontend/` 中的编译页面与资源。生成应用 wheel 包含编译前端；源码仓库的框架 wheel 则分发窗口核心及源组件，具体资源约定见 [npm / Vite 指南](docs/npm-vite.md)。

| 目录 | 内容 |
| --- | --- |
| `output/frontend/` | Vite 编译页面与 assets |
| `output/exe/` | Windows EXE |
| `output/wheels/` | Python wheel |
| `output/bundles/` | 源码 bundle |
| `output/npm/` | 仓库 npm 包归档 |
| `output/logs/` | 初始化与构建日志 |

`build/` 用于配置、暂存和缓存。底层兼容命令 `python -m easy_windows_pack.cli build` / `easy-windows-pack build` 保留 **test → wheel → bundle**，不包含 EXE；它与项目工具的 `full-build` 分开，见 [兼容命令](docs/development.md#兼容命令--compatible-commands)。

## 集成到已有应用

已有 Vite 前端可在其 npm 项目内安装 `easywindowspack`，导入公开 API 和 CSS。下面假设页面已有 `#app` 容器：

```javascript
import { mountFrame } from 'easywindowspack';
import 'easywindowspack/frame.css';

const frame = mountFrame('#app', {
  title: 'My App', windowStyle: 'windows',
  content: document.createElement('main'),
});
frame.content.textContent = 'Hello desktop';
frame.update({ title: 'Ready' });
// 应用卸载时调用 frame.dispose()。
```

这会挂载前端外壳；桌面能力还需 Python 宿主。业务 API 放在 [桌面入口](backend/src/demo.py)，通过 `create_window(..., app_api=...)` 暴露；保留开发时读取 `EWP_DEV_URL`、生产时加载编译页面的逻辑。完整前端 API 见 [npm / Vite 指南](docs/npm-vite.md)，组件与更新接口见 [桌面集成](docs/desktop-integrations.md) 和 [类型契约](frontend/contracts/README.md)，主题见 [窗口外观](docs/window-styles.md)，Python 配置与托盘见 [WindowConfig](backend/base/ewpcore/config.py) 和 [托盘源码](backend/base/ewpcore/tray.py)。

## 开发框架源码

```powershell
git clone https://github.com/Binceenigne/easy-windows-pack.git
cd easy-windows-pack
.\startup.cmd init
.\startup.cmd
```

也可在检出仓库后使用 npm 入口：

```powershell
cd frontend
npm ci
npm run init
npm run dev
```

源码仓库的 `frontend/` 是 **private npm workspace**，两个发布包的源码在 `frontend/packages/`；workspace 根本身不发布到 npm。生成应用只消费 runtime，不包含这套包开发目录。实现边界见 [架构](docs/architecture.md)，更多开发流程见 [文档导航](docs/README.md)。

## 许可证

[MIT](LICENSE) · Copyright (c) 2026 Binceenigne
