# 使用 easy-windows-pack

仅在应用实际使用该框架且任务涉及窗口、桥接或构建时读取。本分片服务应用开发者，不要求修改框架源码、运行 prepare 或理解 npm 发布过程。

## 应用入口

- 界面位于 frontend/src；以实际 JS/TS、Vue 或 React 入口为准，不额外安装未使用的框架。
- 后端由 frontend/package.json 的 ewp.backend 指定，默认 Python。Python 入口为 backend/src/demo.py，Rust 为 backend/src/main.rs，C++ 为 backend/src/main.cpp，Go 为 backend/main_windows.go。Python 使用公开导入 easy_windows_pack；自有 API 留在应用宿主，不修改供应的框架核心。
- npm 命令在 frontend 运行。先 npm install、npm run init，再 npm run dev；浏览器用 npm run browser，不具备原生窗口能力。具体支持命令以 npm run help 和项目配置为准。
- npm run frontend:build 编译页面；npm run app 按 ewp.pack.json 构建应用，npm run installer 构建安装包。不要把浏览器预览成功当作桌面或打包成功。
- 原生后端使用自己的工具链，不需要 Python。npm run backend:build 只编译宿主；分发保留 EXE 旁的 frontend 目录，安装器需要 NSIS 3。wheel 仅 Python 支持，后端限制以命令帮助为准。

## 公开组件与生命周期

先核对已安装 easywindowspack 的公开 exports 和类型。窗口用 mountFrame(container, options)，通过返回句柄 update 更新，卸载时 dispose；Vue/React 只读取对应技术栈规则，保留响应式与事件，不把内容转成静态 HTML。

显式导入 easywindowspack/frame.css 或所需桌面组件样式。优先公开 --ewp-* 变量和局部样式，不从包内部 assets 路径绕过公开入口。

窗口操作通过已有桥接；不要在业务页面重写原生状态机。授权、更新、安装和重启由可信宿主执行，不把动画完成当作业务成功。仅验证本次涉及的原生路径，无环境时明确未验证。

## 文档

index/design 留给本应用的真实业务入口与已确认规则，保持最小。不要往应用 docs 填入框架版本、发布流程、内部清单或验收日志；示例品牌和布局均可替换。