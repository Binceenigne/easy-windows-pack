# 开发手册 / Development guide

[维护导航](README.md) · [npm / Vite](npm-vite.md) · [打包](packaging.md) · [历史原文](history.md)

环境为 Node >=22.12、Python >=3.10；Windows 桌面需要 WebView2。npm workspace 在 frontend，命令在该目录执行或从根添加 `--prefix frontend`。Python `.venv` 和 output 在根。实际依赖版本看 manifest/锁文件，发布证据单独见 [历史验收](npm-validation.md)。

## 初始化与开发 / Setup and development

从根执行 `npm --prefix frontend install`、`npm --prefix frontend run init`、`npm --prefix frontend run dev`。init 创建/复用有效 `.venv`，安装 npm 依赖、编译 Vite，再 `pip install -e ".[dev,tray]"`，确保生成应用 metadata 能找到编译资源。无效环境报错，不自动删除。纯框架库可 editable 安装；生成应用使用完整初始化流程。

根 startup.cmd → scripts/startup.cmd → scripts/dev.py。启动器优先项目 `.venv`、再 `py -3`、最后 PATH python；桌面、Python 测试、打包按需重入项目解释器。纯前端命令无需 Python。迁移后重新 init，公开导入保持 easy_windows_pack。

`dev` 等待 Vite 就绪后通过 EWP_DEV_URL 启动 debug pywebview，支持 HMR；`dev --web` / `frontend:dev` / `browser` 仅启动浏览器。服务绑定 127.0.0.1，默认动态端口；`--port 0..65535` 可指定，`--no-open` 不自动打开。Ctrl+C 释放服务及桌面进程树。主入口为 [frontend/index.html](../frontend/index.html)，组件页为 `/src/components.html`。frontend 的严格 fs allow 不扩大到仓库根。

## 菜单与命令 / Menu and commands

`ewp` 无参数或仅 --lang 显示欢迎屏，版本来自 runtime manifest；help/-h/--help 是完整帮助，均不要求项目。`ewp menu` 或根 startup.cmd 无参数进入菜单，0 退出。以下任务可由 frontend 内 `npm run <task>`、全局 `ewp <task>` 或根 `startup.cmd <task>` 调用；任意 CLI 参数也可用 `npm run ewp -- <task> ...`。

| 任务 | 行为 |
| --- | --- |
| init / dev / browser | 初始化 / 桌面 HMR / 浏览器 HMR |
| frontend / frontend:build | Vite 编译到 output/frontend |
| frontend:preview / preview | 预览已编译前端 |
| demo [--debug] | 编译后启动桌面，无 HMR；debug 开发者工具 |
| wheel / build:wheel | 构建 Python wheel |
| exe / build:exe / build | 默认 legacy 单文件 EXE，output/exe |
| app / build:app | 按 ewp.pack.json 配置构建，output/apps |
| installer | 构建应用及 setup，output/installers |
| bundle | 源码 ZIP、展开目录和 manifest，output/bundles |
| full-build / build:all / build --all | test → wheel → exe → bundle，失败停止，仅 Windows |
| test / check | Python unittest / Node runtime exports/config 检查 |
| info / help / menu | 环境路径 / 完整帮助 / 任务菜单 |

`build` 默认 EXE，`--wheel` / `-w`、`--exe` / `-e`、`--all` 互斥。npm 参数经 `--`，如 `npm run build -- -w`；裸 -w 属于 npm workspace。`--mode`、`--config`、`--installer` 将 EXE 阶段转入配置构建，wheel 不接受这些参数。TypeScript 模板另有 typecheck。完整 schema 见 [打包指南](packaging.md)。

底层 `python -m easy_windows_pack.cli build` / `easy-windows-pack build` / 无参数 scripts/build.ps1 保持 **test → wheel → bundle**，不含 EXE。底层 app（别名 exe）/installer 使用 `--project-root`，不使用旧 build/bundle 的 --output-dir。scripts/build-demo.ps1 委托 scripts/dev.py exe。底层 clean 删除生成物，使用前看实际范围。

## 语言、进度与日志 / Language, progress and logs

输出语言：`--lang` → `EWP_LANG` → frontend/package.json 的 ewp.language → zh-CN。创建时选择 README/AI/示例语言；临时 CLI 覆盖不改写这些文件。npm/pip/Vite 的第三方输出及 npm 自己的确认不翻译。

创建向导复用 create-ewp/terminal，NO_COLOR 优先关闭颜色；否则 FORCE_COLOR=0 关闭，其他已设置值开启；无设置时仅 TTY 且 TERM 不为 dumb 自动启用。实际创建阶段为 1/2/4 步：创建、可选 npm 安装、可选 Python 初始化、桌面启动，跳过阶段不计步，失败不报告后续成功。

Python init/build 在支持 VT 的 TTY 底部保留两行：阶段说明、蓝色 `━ / ┄` 和一位小数百分比，上方滚动日志。百分比只表示已完成阶段，不估算耗时；resize 重定位，结束/失败/Ctrl+C 恢复区域和控制台模式。管道、重定向、TERM=dumb、无 VT 或终端太小回退逐行文本。NO_COLOR / FORCE_COLOR=0 只关闭颜色；`EWP_PROGRESS=plain` 关闭固定栏。嵌套任务共享外层栏，dev/browser/preview 沿用原输出，日志文件不写固定栏控制码。

初始化与构建打印 output/logs 中的 UTF-8 日志位置；独立 test/browser/demo/info 主要输出到终端。output/frontend、wheels、exe、apps、installers、bundles、npm 按类型放产物；build/spec、pyinstaller、exe-src 放暂存。完整构建失败即停止。

## 验证与故障定位 / Validation and troubleshooting

- 先看 info 的解释器与项目路径；依赖/映射过期重新 init，不改导入名绕过问题。
- EXE 将核心暂存为 build/exe-src/easy_windows_pack，便于 PyInstaller 发现 editable 包；这是生成副本。WinError 32、Access denied 或 runw.exe 缺失时检查实际占用/防护记录，解除占用后 init/exe；不靠关闭防护或提权掩盖问题。
- Node 定向命令和集成入口见 [npm 指南](npm-vite.md)。Python 任务用 startup.cmd test；浏览器单独打开 [tests/frontend.html](../tests/frontend.html)，查看 window.testResults。
- 浏览器不能验证真实 native bridge、拖拽、Snap、托盘、安装或重启。构建成功也不能代替 Windows 原生验证。
- 端口冲突用动态端口或换端口，自动打开失败用实际 URL；停止服务后地址失效。失败时读日志，修复后只重跑相关任务。
- [历史验收](npm-validation.md) 记录旧结果及报告位置，不是此次文档整改的测试证据。完整双语说明保存在 [Git 基线](history.md)。