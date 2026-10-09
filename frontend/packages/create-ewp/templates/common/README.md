# Desktop app / 桌面应用

Requires Node >=22.12, Python >=3.10. Windows desktop requires WebView2.
需要 Node >=22.12、Python >=3.10，Windows 桌面需要 WebView2。

Run the npm commands below inside frontend (`cd frontend` from the project root), or use `npm --prefix frontend` from the root. Configuration, lockfile and dependencies live under frontend; `.venv` and `output/` remain at the project root.
以下 npm 命令在 frontend 内执行，或从项目根加 `--prefix frontend`。前端配置、锁文件与依赖收于 frontend；Python 环境和产物在项目根。

The only root launcher is `startup.cmd`, delegating through `scripts/startup.cmd` to `scripts/dev.py`. Other build scripts live under scripts.
根唯一启动脚本 startup.cmd 经 scripts/startup.cmd 调用 scripts/dev.py，其他构建脚本位于 scripts。

AI tools are opt-in (codex / claude / copilot, multiple selection; none by default). If selected, standard thin entries explicitly load guidance under docs/.easy-dev and the single skill under docs/.agents; Claude adds a docs/.claude router. Skills under docs are outside default discovery locations.
AI 默认全不选，按选择生成 docs 下资源和所选工具的标准薄入口；入口显式读取 Skill，Claude 路由复用主正文。未选 AI 时不生成这些指引。

1. `npm install` installs frontend dependencies only / 仅安装前端依赖。
2. `npm run init` creates `.venv` and installs Python dev/tray dependencies / 初始化 Python 开发环境。
3. `npm run dev` starts Vite and desktop / 启动 Vite 和桌面窗口。

`npm run frontend:dev` previews in a browser without Python. Native window actions require the desktop host.
浏览器预览无需 Python；原生窗口操作需要桌面宿主。

`npm run build` and `npm run build:exe` build the frontend before the Windows EXE.
`npm run build:wheel` builds the frontend and Python wheel. Output is under `output/`.
构建前先编译前端，产物在 `output/`；EXE 仅支持 Windows。

`npm test` runs Python smoke tests without opening a window. TypeScript templates also support `npm run typecheck`.
测试不打开窗口；TypeScript 模板提供类型检查命令。

The shared title bar comes from `easywindowspack`; the app owns only its content and styles.
共享标题栏复用 `easywindowspack`，应用仅维护内容与业务样式。