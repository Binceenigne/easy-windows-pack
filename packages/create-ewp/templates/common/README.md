# Desktop app / 桌面应用

Requires Node >=22.12, Python >=3.10. Windows desktop requires WebView2.
需要 Node >=22.12、Python >=3.10，Windows 桌面需要 WebView2。

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