# npm 与打包历史验收 / Historical validation

[维护导航](README.md) · [历史完整原文与 Git 基线](history.md)

本页分别记录各版本发布验收与迁移前的历史索引；各日期、通过数、发布状态和哈希仅属于对应阶段。build/output 中的证据是本地忽略文件，可能未随 Git 分发。本地 pack 不等同于公开发布。

## 2026-10-26 0.1.5 菜单、帮助与离线文档 / Menu, help and offline documentation

本轮将菜单改为按后端、平台与工具可用性过滤，帮助按任务分组并着色；新增 `ewp docs` / `ews docs`、双语离线手册和 `easywindowspack/docs` 的窗口内阅读入口。六模板直接复用安装包中的按需文档模块，不在生成项目源码或 docs/ 复制全文；页面采用 demo 配色、统一彩色 SVG 和直角界面，支持模块导航、页内目录、搜索、高亮及 reduced-motion。

最终源码 npm 回归 **461 passed / 0 failed / 5 conditional skips**；真实 tarball **8/8 passed**，覆盖六模板构建、三套 TypeScript、Edge 交互、HMR 与每个 demo 的窗口内文档及返回。手册浏览器验证 **7/7 passed**，包括深浅主题、手机布局、页内跳转、原始 Markdown、无 JS 阅读、保持应用状态/焦点及不调用桥接。本轮未重新编译原生宿主。

证据：`output/npm-015-final-tests.log`、`output/npm-015-final-pack.log`、`output/npm-015-final-integration.log`、`output/npm-015-manual-browser.log`；报告 `build/npm-pack-validation/pack validation qxzgrt/report.json` 与 `build/manual-browser-validation/report.json`。

| Archive | SHA-1 | SHA-256 | Registry status |
| --- | --- | --- | --- |
| `create-ewp-0.1.5.tgz` (238,178 bytes) | `521c52b29b2f6b7a470bd227ef7bf334b306d373` | `a68c9aa7183005cf21d78c8ca301903d5ddb6ac65d67a948d49b3f9ccae76afb` | published; latest 0.1.5; registry hashes and bytes verified |
| `easywindowspack-0.1.5.tgz` (245,039 bytes) | `6d9208d140675198b10ac19999e2617e6047c24a` | `6b596c2c10fc85ffc12b922100a60aa5e7588be00f0bf4ee720d95b1806adb95` | published; latest 0.1.5; registry hashes and bytes verified |

用户已授权发布并完成两包各自的 npm CLI 网页认证。两包按 creator → runtime 顺序公开发布，官方 registry 的 version / latest 均为 `0.1.5`；SHA-1、SHA-512 integrity 及重新下载的 tarball 字节均与上述已验证归档一致。此前过期的认证链接及 runtime 发布后短暂的 registry E404 均为已解决的中间状态。

独立目录仅从官方 registry 安装两包并生成 Vue TS / Rust 项目，runtime check **3 passed**、TypeScript 检查和 Vite 前端构建通过。锁文件确认 runtime 及其 creator 依赖均为 registry 的 `0.1.5`；文档 URL、`ews docs --print --lang en`、六种随包文档资源及构建生成的按需面板模块均已核验。生成项目未复制完整手册到 docs/。本机全局两包已更新至正式 registry `0.1.5`，`ewp --version`、`ewp docs --no-open` 和 `ews docs --no-open` 均通过；本轮仍未验证原生宿主编译或 EXE。

发布和安装证据：`output/npm-015-publish-creator-manual-auth.log`、`output/npm-015-publish-runtime-auth-refresh.log`、`output/npm-015-registry-validation.log`、`output/npm-015-global-install.log`、`output/npm-015-global-validation.log`；报告 `build/npm-registry-015-067f2725-4dbe-4d34-a9d3-acbebb30fe01/report.json`。GitHub 身份修复后已成功推送 `main`，`git ls-remote` 核验远程包含已验证功能提交 `c5e223f898afce9bf4ea9bd88e7887f9dcdfe5d7`（含此前的模板 SVG 修复）。

## 2026-10-26 0.1.4 重新准备发布 / Refreshed release preparation

两包版本统一为 `0.1.4`，归档包含初始化失败后重试、缺少工具链的官方下载提示，以及后端优先的创建交互。发布前 Node 回归 **449 passed / 0 failed / 5 conditional skips**；真实归档集成 **8/8 passed**，覆盖六模板安装与构建、三套 TypeScript、Edge 交互和 HMR。两个归档的 `npm publish --dry-run` 均通过；本轮没有编译原生宿主。

证据：`output/npm-release-20261026-tests.log`、`output/npm-release-20261026-pack.log`、`output/npm-release-20261026-integration.log`、`output/npm-release-20261026-dry-run.log`；集成报告为 `build/npm-pack-validation/pack validation 9dew7f/report.json`。本节归档替代下方 10 月 21 日的候选归档。

| Archive | SHA-1 | SHA-256 | Registry status |
| --- | --- | --- | --- |
| `create-ewp-0.1.4.tgz` (237,925 bytes) | `ec4fd1e20095c099190d97c1bb3578964216b0a6` | `4457efca94d46c699a20d87b2fb8fbf70ab8bbac7f40a7e3cee4327bfffbd985` | published; latest 0.1.4; registry hashes verified |
| `easywindowspack-0.1.4.tgz` (30,852 bytes) | `d2d9c491b6a3d70a078e108b3d71da89b4599770` | `81c2c3a0717c369711603bd268ab2c25c5ea5b7bc56a0b5733073784baf7c0a6` | published; latest 0.1.4; registry hashes verified |

用户已授权发布并完成 npm CLI 登录及两次安全密钥认证。两包按 creator → runtime 顺序发布，官方 registry 的 version / latest 均为 `0.1.4`；SHA-1、SHA-512 integrity 及重新下载的 tarball 字节均与上述已验证归档一致。独立 registry 安装、Vue TS / Rust 项目生成、runtime check **3 passed**、TypeScript 检查和 Vite 前端构建通过；锁文件确认 runtime 与其 creator 依赖均来自官方 registry 的 `0.1.4`。本机全局两包也已切换为正式 registry 版本；计算器移除了临时 file 依赖及 creator override，更新锁文件后 check **3 passed** 与前端构建通过。本轮未验证原生宿主编译或 EXE。

发布和安装证据：`output/npm-release-20261026-publish-creator-web.log`、`output/npm-release-20261026-publish-runtime-retry.log`、`output/npm-release-20261026-registry-validation.log`；`build/npm-registry-014-d358ea4c-6956-44f0-81d6-b81628250542/report.json`。本轮先前的 E401、EOTP 和过期链接均为已解决的中间状态。

## 2026-10-21 0.1.4 发布准备 / Release preparation

`0.1.4` 已修复归档中五套模板缺失的 TypeScript / Vue / React SVG：资源从受 CC0 1.0 许可的 `create-vite@7.1.2` 模板复制，归档保留上游 `LICENSE.vite`（MIT / CC0 许可）。`prepare-npm` 从跟踪的权威资源复制全部模板 SVG，生成矩阵测试会验证每个源文件引用都有随项目生成的对应资源。

当前归档完成 Node 回归 **442 passed / 0 failed / 5 conditional skips**；真实 tarball 集成 **8/8 passed**，包括独立 consumer 安装、六个 Vite 构建、三套 TypeScript 检查、Edge 交互、生命周期与 HMR。最终归档还生成并核对了 Go / Rust / C++ 三种原生项目布局及其资源；本轮没有重新编译原生宿主。

证据：`output/npm-0.1.4-release-tests.log`、`output/npm-0.1.4-release-pack.log`、`output/npm-0.1.4-release-integration.log`、`output/npm-0.1.4-release-publish.log`；归档安装与原生生成报告分别为 `build/npm-pack-validation/pack validation ahiOg6/report.json` 和同目录下的 `native-generation-report.json`。

| Archive | SHA-1 | SHA-256 | Registry status |
| --- | --- | --- | --- |
| `create-ewp-0.1.4.tgz` (235,087 bytes) | `1fd08dbb72a9f26ec7faf82c531d51c71ccbb4c0` | `961c5ff60e6022ce4fb843fa39ed1e0b2d587691e61c7582271bfff588e7fa30` | not published |
| `easywindowspack-0.1.4.tgz` (30,377 bytes) | `da2351ae01a2c5b19773636c5bdec420a6447f98` | `a9a91ab97f8854fb7a15470797ac68064f5b469fd1ba97a89081257d0b1706a6` | not published |

Official npm authentication is currently unavailable: `npm whoami` returns `E401` and publishing the validated creator archive returns `E404` on PUT. Registry queries confirm neither `create-ewp@0.1.4` nor `easywindowspack@0.1.4` exists; `latest` remains 0.1.3. No publication occurred. After the account completes npm CLI authorization, publish the two listed archives in order `create-ewp` then `easywindowspack`, then verify registry hashes and fresh installation.

## 2026-10-20 0.1.4 底部固定进度栏 / Pinned terminal progress

历史记录：进度测试 17 passed、开发任务 55 passed、Node 145 passed / 5 conditional skips。源码和生成脚本逐字节相同，生成应用 Vite 编译通过。ConPTY/xterm 5/5 屏幕状态涵盖日志滚动、resize、ANSI 跨块、未换行日志、阶段切换与退出恢复。npm 发布/官方 registry 安装仍标待验证。

证据：`output/terminal-progress-tests.log`、`output/terminal-progress-dev-tests.log`、`output/npm-0.1.4-tests.log`；`build/terminal-progress-validation/report.json`、`generated-report.json`、`releases/tarball-o4mHnF/report.json`；`output/designs/terminal-progress-evidence.html`。归档安装报告覆盖 CLI/creator、runtime check 3 passed 和真实 Vite 编译。

| 历史归档 | SHA-1 | SHA-256 |
| --- | --- | --- |
| create-ewp-0.1.4.tgz，92,030 bytes | d0f48aac300aa7be7be2c355de44f778fb14c4e3 | b360c93e92f2d48aa76af07e941e4b40397a8d9e8af77aa0584f930ac1a980ff |
| easywindowspack-0.1.4.tgz，28,855 bytes | 885255f92f6c8b6a9181e8c03aa1dfb33511ef57 | 22a50792d4148eb1f4480c4bc2b3a7da1f828feaa97c193911471182d03786f7 |

## 2026-10-20 0.1.3 欢迎屏与创建配色 / Branded welcome and creation colors

历史 Node 145 passed / 5 conditional skips，原生打包未重跑。两包按 creator → runtime 发布成功，当时 registry versions/latest=0.1.3，下载的 tarball 与本地逐字节相同。独立 registry 安装、双语 CLI、AI 生成、Vanilla check/build、latest 创建 Vue TS check/typecheck/build、全局 CLI 均有通过记录。

证据：`output/npm-0.1.3-tests.log`；`build/npm-0.1.3-validation/tarball-orVksi/report.json`、`final-archive-rh1TlE/report.json`、`registry-HLTGwM/report.json`；`build/npm-registry-013-8a50b3462a7f4873bcd485deb635f677`。README 重打包后核对其余 46/16 文件，考虑 npm shebang 换行规范化。

| 历史归档 | SHA-1 | SHA-256 |
| --- | --- | --- |
| create-ewp-0.1.3.tgz，88,823 bytes | 444e29072af6f079ee5d7bd3f2d4f3cb60516ed4 | 60a884ade6bf949fb5fcc57767ea8c8a2e2cd27e22196bce803318bbfef155d7 |
| easywindowspack-0.1.3.tgz，28,591 bytes | 3b0b81011442940f4be66ffa585ceae15af9d223 | 552bf8fd1880b705666b34194689a84bf2821a57c7abff9dfa4d7747ebb6fcb1 |

## 2026-10-12 0.1.2 发布与 registry

两包当时已发布、latest=0.1.2。creator SHA-1 `7a7bc7560fb4ad754dc0e0e7d3e8386ffb210113`，runtime `70766e3325fe9924ebdce55819a55b58fd6d9366`。官方安装、help、check 3 passed、typecheck、frontend:build 和依赖链通过。Python 0.3.0 wheel 本地验证，PyPI 未发布。

## 2026-10-10 安装向导与安全修复阶段 / Installer wizard and safety fixes

历史 Tk 10、installer 57、CLI 33、完整 Python 245 passed；Node 145 passed / 1 skipped；六模板 pack 8/8（`build/npm-pack-validation/pack validation m01nHq/report.json`）。日志 `output/final-python-packaging.log`、`output/final-npm-packaging.log`。

独立 wheel/冻结 GUI 报告 `build/packaging-validation/wheel installer ygft7h_d/report.json`：13 条命令、onefile/onedir、159–163 字符路径、40 空目录、功能、镜像回退、校验拒绝、hooks、配置、HKCU 和用户文件保留通过；延迟清理使用 251 字符 PowerShell -File 调用。wheel SHA-256 `b295f01ce52bba415ccb7e886cd3124565c219743f1d2e8a26ca47c814a901c3`。更早同日 packaging 28/installer 37 等结果保留在 Git 原文，不能和最终计数相加。

## 2026-10-09 welcome 改版本地验收 / Local welcome validation

历史 npm 141 passed、最终六模板 pack 8/8，Chrome 交互/生命周期与 Vue HMR 通过；SVG 与用户源 ZIP 对照、390px 无横向溢出。报告 `output/design-validation/report.json` 及其 test-npm-initial.log/npm-pack-integration.log；最终 pack 为 `build/npm-pack-validation/pack validation R6s4Md/report.json`。

## 2026-10-09 0.1.1 与目录精简

0.1.1 registry 记录：creator SHA-1 `1fb3954bcb47840b6c22dab8ddbe3a35ce7abdac`，runtime `98f88a0887dc8977c43b8f1451d907a3fd589c81`；安装、help、check 3、typecheck/build 通过。最终本地报告：`build/npm-pack-validation/pack validation 2uIz4b/report.json`、`build/npm-first-run/first run wfvGYT/report.json`，包含归档哈希和首次初始化/编译资源检查。

目录精简证据：`pack validation BtIUfU/report.json`、`first run GNj7St/report.json` 位于上述对应根；八种 AI 组合与源码 ZIP 路由检查为 `build/ai-layout-validation/packed apps 5xdxiV/report.json`。更早 MUi0DK/3gVZ6p 报告属于不同归档。

## 更早阶段

2026-10-08 npm/Vite 历史：Python 89、npm 31、pack 8/8，三套 TS、HMR、首次 init、wheel/EXE 编译资源、本机窗口和干净 npm ci 记录。旧目录构建证据见 [build-validation.md](build-validation.md)，2026-09-18 受控宿主集成见 [integration-validation.md](integration-validation.md)。完整命令、阶段限制和英文原文可从 [Git 基线](history.md) 恢复。