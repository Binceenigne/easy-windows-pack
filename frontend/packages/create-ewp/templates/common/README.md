# 桌面应用

需要 Node >=22.12、Python >=3.10，Windows 桌面需要 WebView2。

以下 npm 命令在 `frontend/` 内执行：从项目根先运行 `cd frontend`，或从根使用 `npm --prefix frontend run <命令>`。前端配置、锁文件与依赖位于 frontend；`.venv`、`output/` 和 `build/` 位于项目根。

项目语言保存在 `frontend/package.json` 的 `ewp.language`，可选 `zh-CN` 或 `en`。CLI 语言优先级为显式 `--lang`、`EWP_LANG` 环境变量、项目设置、默认简体中文。交互生成的第一步选择语言；显式 `--lang` 跳过语言提示，交互选择优先于环境默认值。README、示例页面和 AI 指引按生成时选择的语言写入；之后修改设置只影响 CLI 输出。外部 npm、pip、Vite 日志保留原文。

## 开始开发

1. `npm install` 安装前端依赖。
2. `npm run init` 初始化 `.venv`，安装 Python 开发、托盘与 npm 依赖。
3. `npm run dev` 启动 Vite 和桌面窗口。

`npm run help` 查看 CLI 帮助；`npm run ewp -- <任务> [参数]` 直接传递任务和参数，例如 `npm run ewp -- info --lang en`。

## 命令

| 命令 | 用途 |
| --- | --- |
| `npm run init` | 初始化开发环境 |
| `npm run dev` | Vite 与桌面开发；`-- --web` 仅启动浏览器 |
| `npm run browser`、`npm run frontend:dev` | 浏览器开发，无需 Python |
| `npm run frontend`、`npm run frontend:build` | 编译前端至 `output/frontend/` |
| `npm run frontend:preview` | 预览已编译前端 |
| `npm run demo` | 运行桌面示例；`-- --debug` 启用调试 |
| `npm run wheel`、`npm run build:wheel` | 编译前端并构建 Python wheel |
| `npm run exe`、`npm run build:exe` | 编译前端并构建 Windows EXE |
| `npm run bundle` | 构建源码分发包 |
| `npm run build` | 默认构建 EXE；`-- -w` 或 `-- --wheel` 构建 wheel，`-- -e` 显式选择 EXE |
| `npm run build:all`、`npm run full-build` | `ewp full-build` 完整构建：测试、wheel、EXE、源码包 |
| `npm run menu` | 开发菜单 |
| `npm run info` | 项目和环境信息 |
| `npm run help` | `ewp --help` 命令帮助 |
| `npm test` | Python 冒烟测试，不打开窗口 |

TypeScript 模板还提供 `npm run typecheck`。传递构建参数时必须使用 npm 的 `--` 分隔符，例如 `npm run build -- -w`；裸 `-w` 属于 npm workspace 参数。

生产 EXE 仅使用编译后的 `output/frontend/`。wheel、EXE、源码包分别位于 `output/wheels/`、`output/exe/`、`output/bundles/`，临时构建数据位于 `build/`。EXE 打包需要 Windows。

## 项目结构

根唯一启动脚本 `startup.cmd` 经 `scripts/startup.cmd` 调用 `scripts/dev.py`。其他工具脚本位于 `scripts/`；根不放前端配置。

UI 位于 `frontend/src/`，应用桥接入口位于 `backend/src/demo.py`，共享 Python 运行时位于 `backend/base/ewpcore/`。共享标题栏复用 `easywindowspack`，应用维护自己的内容与样式。浏览器可验证前端交互；原生窗口操作需要桌面宿主。

AI 工具默认全不选，支持多选 codex、claude、copilot。共享指引和主 Skill 位于 `docs/.easy-dev/`；选择 Codex 才生成 `docs/.agents/skills/easy-dev/` 路由，选择 Claude 才生成 `docs/.claude/skills/easy-dev/` 路由，两者都读取共享主 Skill。Codex、Claude、Copilot 对应入口分别为 `AGENTS.md`、`CLAUDE.md`、`.github/copilot-instructions.md`。入口显式读取 docs 下的 Skill。未选 AI 时不生成这些指引。