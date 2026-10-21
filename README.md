<div align="center">

<img src="frontend/src/assets/ewp-color.svg" width="127" alt="Easy Windows Pack" />

# easy-windows-pack

用 Web 技术写界面，选择 Python、Go、Rust 或 C++ 连接桌面能力。

[![CI](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml/badge.svg)](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml)
[![easywindowspack](https://img.shields.io/npm/v/easywindowspack?label=easywindowspack)](https://www.npmjs.com/package/easywindowspack)
[![create-ewp](https://img.shields.io/npm/v/create-ewp?label=create-ewp)](https://www.npmjs.com/package/create-ewp)

**中文** · [English](README.en.md) · [应用指引](docs/agent.md)

</div>

`easy-windows-pack` 基于 Vite、Python 和 pywebview，让熟悉 Web 开发的你快速构建 Windows 桌面应用。

- **熟悉的前端**：Vanilla、Vue、React，均支持 JavaScript / TypeScript。
- **可选后端**：Python / pywebview、Go / webview_go、Rust / Wry、C++ / webview。
- **桌面能力**：窗口控件、系统拖拽与缩放、工作区最大化；Python 另提供托盘适配器。
- **开发到打包**：Vite 热更新、Windows EXE 和 Python wheel。

## 环境要求

- [Node.js](https://nodejs.org/) **>=22.12**，附带 npm。
- 所选后端的工具链：Python **>=3.10**；Go **>=1.22** 与 CGO C++ 编译器；Rust / Cargo 与 MSVC；或 CMake **>=3.24** 与 C++17 编译器。
- Windows 与 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

窗口支持 Windows / macOS 外观主题；EXE 打包面向 Windows。

## 快速开始

在准备存放项目的目录打开终端，运行：

```powershell
npm create ewp@latest
```

向导选择语言、项目名、前端框架、JS / TS、后端及是否安装和启动。新增的四后端选择与 Aurora 欢迎页已在本地 0.1.4 实现，尚未发布；公开的 `@latest` 仍为 0.1.3。

向导还可为 Codex、Claude、Copilot 生成 [AI 开发指引](docs/agent.md)，默认不选。新项目 docs 只含最小的 index/design；选择 AI 后才增加对应 Skill 和引导，不复制框架维护资料。

也可用下面的完整示例创建 **Vue + TypeScript** 项目，跳过向导，再手动安装与启动（目标目录需为空）：

```powershell
npm create ewp@latest my-app -- --template vue-ts --lang zh-CN --no-install --no-start --yes
cd my-app/frontend
npm install
npm run init
npm run dev
```

后续 npm 命令均在 `frontend/` 执行。`init` 初始化所选后端并编译前端；Python 使用项目 `.venv`，原生后端使用各自编译器。

`dev` 打开桌面窗口，修改前端即可热更新；按 Ctrl+C 停止。

源码已实现 Python init/build 的底部固定两行蓝色阶段进度，拟随 npm **0.1.4** 提供给新建项目（尚未发布）；终端支持、回退与开关见 [开发手册](.maintainer/development.md)。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 桌面开发，支持热更新 |
| `npm run browser` | 浏览器开发，无需 Python |
| `npm run build` | 构建 Windows EXE，输出到 `output/exe/` |
| `npm run build:wheel` | 构建 Python wheel，输出到 `output/wheels/` |
| `npm run app` | 按项目配置构建应用，输出到 `output/apps/` |
| `npm run build -- --mode onedir` | 构建包含 EXE 与依赖的应用目录 |
| `npm run installer` | 构建应用及安装包，setup 输出到 `output/installers/` |

打包前先完成 `init`；构建会自动编译前端。浏览器适合调试界面，原生窗口、托盘和 Python 桥接需在桌面验证。

两个 npm 包 **0.1.3 已正式公开可用**，`@latest` 均指向 0.1.3，registry 安装与构建验收通过。Python **0.3.0** 尚未发布到 PyPI。配置与安装说明见 [打包指南](.maintainer/packaging.md)，历史结果见 [验收记录](.maintainer/npm-validation.md)。

也可双击项目根的 `startup.cmd` 打开任务菜单。Go、Rust、C++ 的启动与构建不需要 Python；原生后端以目录分发，安装器额外需要 NSIS 3。wheel 和现有高级 Python 安装配置仅适用于 Python。

## 项目结构

生成应用的主要目录：

```text
my-app/
├─ frontend/      # Web 界面，业务代码在 src/
├─ backend/       # 所选后端的宿主与业务 API
├─ scripts/       # 开发与打包工具
├─ startup.cmd    # Windows 任务菜单
└─ output/        # 构建后生成的资源、安装包与日志
```

安装或构建生成的 `node_modules`、`.venv`、`*.egg-info` / `*.dist-info` 是依赖与安装元数据，不需手工维护或提交。

<details>
<summary>可选：全局 CLI</summary>

用 `npm install -g easywindowspack@latest` 安装全局 CLI，再用 `ewp create` 创建项目。
项目的 `npm run` 脚本封装 `ewp` CLI，使用项目依赖的版本，无需全局安装。
0.1.3 中，`ewp` 无参数（或仅带 `--lang en`）显示紧凑构筑核品牌 ASCII 欢迎屏及 `ewp create` / `dev` / `build` / `menu` 四条常用命令；`ewp -h` / `help` / `--help` 查看完整教程。欢迎屏和帮助均无需已有项目。

</details>

## 深入了解

- [应用开发指引](docs/agent.md)：面向框架使用者的 Skill 与精简摘要。
- [框架维护资料](.maintainer/README.md)：源码开发、架构、API、打包与历史验收，仅保留在框架仓库。

## 许可证

[MIT](LICENSE) · Copyright (c) 2026 Binceenigne
