<div align="center">

<img src="frontend/src/assets/ewp-color.svg" width="127" alt="Easy Windows Pack" />

# easy-windows-pack

用 Web 技术写界面，用 Python 连接桌面能力，打包成 Windows 应用。

[![CI](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml/badge.svg)](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml)
[![easywindowspack](https://img.shields.io/npm/v/easywindowspack?label=easywindowspack)](https://www.npmjs.com/package/easywindowspack)
[![create-ewp](https://img.shields.io/npm/v/create-ewp?label=create-ewp)](https://www.npmjs.com/package/create-ewp)

**中文** · [English](README.en.md) · [文档](docs/README.md)

</div>

`easy-windows-pack` 基于 Vite、Python 和 pywebview，让熟悉 Web 开发的你快速构建 Windows 桌面应用。

- **熟悉的前端**：Vanilla、Vue、React，均支持 JavaScript / TypeScript。
- **桌面能力**：窗口控件、拖拽、缩放、托盘和 Python API 桥接。
- **开发到打包**：Vite 热更新、Windows EXE 和 Python wheel。

## 环境要求

- [Node.js](https://nodejs.org/) **>=22.12**，附带 npm。
- Python **>=3.10**，用于桌面开发与打包；安装时建议启用 `py` launcher。
- Windows 与 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

窗口支持 Windows / macOS 外观主题；EXE 打包面向 Windows。

## 快速开始

在准备存放项目的目录打开终端，运行：

```powershell
npm create ewp@latest
```

向导第一步选择**简体中文 / English**，然后选择项目名、Vanilla / Vue / React、JavaScript / TypeScript，以及是否安装依赖和启动桌面。

向导还可为 Codex、Claude、Copilot 生成 [AI 开发指引](docs/npm-vite.md#ai-资源布局--ai-resource-layout)，默认不选。

也可用下面的完整示例创建 **Vue + TypeScript** 项目，跳过向导，再手动安装与启动（目标目录需为空）：

```powershell
npm create ewp@latest my-app -- --template vue-ts --lang zh-CN --no-install --no-start --yes
cd my-app/frontend
npm install
npm run init
npm run dev
```

后续 npm 命令均在 `frontend/` 执行。`init` 创建或复用项目的 `.venv`，安装依赖并编译前端，无需手动激活 Python 环境。

`dev` 打开桌面窗口，修改前端即可热更新；按 Ctrl+C 停止。

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

新增构建命令对应 Python **0.3.0** / npm **0.1.2**。**0.3.0 wheel 已在本地构建并通过独立冻结安装向导 E2E，PyPI 未发布**；npm **0.1.2 待发布**（`npm login` 返回 HTTP 401，等待用户认证），`@latest` 跟随已发布版本。配置与分步骤安装/卸载说明见 [打包指南](docs/packaging.md)，当前通过结果、报告与 wheel 哈希见 [验收记录](docs/npm-validation.md)。

也可双击项目根的 `startup.cmd` 打开任务菜单（需要 Python）。

## 项目结构

生成应用的主要目录：

```text
my-app/
├─ frontend/      # Web 界面，业务代码在 src/
├─ backend/       # Python 宿主，业务 API 在 src/demo.py
├─ scripts/       # 开发与打包工具
├─ startup.cmd    # Windows 任务菜单
└─ output/        # 构建后生成的资源、安装包与日志
```

安装或构建生成的 `node_modules`、`.venv`、`*.egg-info` / `*.dist-info` 是依赖与安装元数据，不需手工维护或提交。

<details>
<summary>可选：全局 CLI</summary>

用 `npm install -g easywindowspack@latest` 安装全局 CLI，再用 `ewp create` 创建项目。
项目的 `npm run` 脚本封装 `ewp` CLI，使用项目依赖的版本，无需全局安装。
运行 `ewp -h` 查看完整帮助。

</details>

## 深入了解

- [文档导航](docs/README.md)：所有专题的入口。
- [npm / Vite 指南](docs/npm-vite.md)：模板、CLI、公共 API、已有应用集成与发布流程。
- [开发手册](docs/development.md)：源码开发、测试、构建与故障排查；贡献前从这里开始。
- [架构](docs/architecture.md) · [窗口外观](docs/window-styles.md) · [桌面扩展 API](docs/desktop-integrations.md)。

## 许可证

[MIT](LICENSE) · Copyright (c) 2026 Binceenigne
