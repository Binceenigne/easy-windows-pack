# npm 与打包历史验收 / Historical validation

[维护导航](README.md) · [历史完整原文与 Git 基线](history.md)

本页分别记录当前发布准备与迁移前的历史索引；各日期、通过数、发布状态和哈希仅属于对应阶段。build/output 中的证据是本地忽略文件，可能未随 Git 分发。本地 pack 不等同于公开发布。

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