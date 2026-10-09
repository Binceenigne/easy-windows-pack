# npm / Vite 验收记录 / npm / Vite validation

[文档导航 / Documentation](README.md) · [完整指南 / Guide](npm-vite.md)

## 2026-10-09 0.1.1 文档与最终包复验 / Final local package checks

源码 workspace、两个 npm 包的 manifests 与锁文件已同步为 **0.1.1，尚未发布**；线上两个包仍为 **0.1.0**，Python 版本仍为 **0.2.1**。本轮新增语言、任务和模板行为使用本地 tarball 验证。

Source workspace/package manifests and the lockfile are aligned at **0.1.1, unpublished**. Both registry packages remain at **0.1.0**; Python remains **0.2.1**. New behavior was verified with local tarballs.

| 范围 / Scope | 结果 / Result |
| --- | --- |
| 本轮此前单测 / Earlier checks in this revision | Creator **122 passed**、runtime **19 passed**、Python **116 passed**；文档收尾沿用此前结果，未冗余重跑全测 / Retained earlier results; not rerun for documentation-only changes |
| egg-info / Python metadata | 此前真实 editable 安装与 wheel 构建通过；`backend/base/*.egg-info` 为 setuptools 安装元数据，不属于 docs / Real editable installation and wheel build passed earlier; egg-info is generated installation metadata |
| 最终 npm pack / Final npm pack | `npm --prefix frontend run pack:npm` 通过，生成 `create-ewp-0.1.1.tgz` 与 `easywindowspack-0.1.1.tgz` / Both local tarballs built |
| 最终六模板集成 / Final six-template integration | **8/8 passed**；独立安装、公共 exports、六模板 Vite 构建、三套 TS 类型检查、Chrome 交互及 Vue HMR / Independent installation, exports, builds, types, Chrome and HMR passed |
| 全新首次初始化 / Fresh initialization | **passed**；从无 `.venv`、无预编译前端的目录开始，先 npm/Vite 后 pip editable，解释器和 runtime 来源均在生成项目内 / Clean initialization order and project-local Python provenance verified |
| wheel / 默认 EXE / 归档 | **全部通过 / All passed**；wheel 与 EXE 的前端资源与 Vite 输出逐字节一致，不包含未编译 Vue/TS/JSX 源文件 / Compiled bytes match; uncompiled frontend sources absent |
| 生成应用 check / Generated app checks | `npm run check`、`ewp check`、`startup.cmd check` 各 **3/3 passed**；公共 API/CSS、Vite 配置、应用 manifest/HTML 入口 / Three checks passed through each entry |
| 全局 CLI / Global CLI | 从最终本地 tarball 全局安装 0.1.1，在用户目录执行 `ewp --version`、`ewp -h --lang en`、无参数 `ewp` 均成功；nvm 路径下版本及双语帮助正常 / Installed final local tarballs globally; version and both help languages work outside a project through nvm |
| 根 README / Root README | 中英文标题层级、表格列布局、代码围栏及图片/HTML 结构共 **77 个标记一致** / All 77 structural markers match between Chinese and English |

最终 pack 报告：`build/npm-pack-validation/pack validation 2uIz4b/report.json`。最终 first-run 报告：`build/npm-first-run/first run wfvGYT/report.json`。这些报告和构建日志保存在忽略的 build 目录；两份报告记录最终 tarball SHA-256。

Final pack and first-run reports above retain tarball SHA-256 and build logs under ignored build directories. Earlier pack report `pack validation MUi0DK` and first-init report `first run 3gVZ6p` describe the previous tarballs. Documentation changes altered package hashes, so final validation used a fresh directory rather than overwriting those reports or resuming against changed packs.

最终 first-run 显式依次执行 `--stage=first`、`wheel`、`exe`、`audit`，后续阶段复用新建的 `--root`；未执行默认 `all` 或 `startup`，未启动原生窗口。本次未发布、推送或提交，也未修改产品代码。

Final first-run used explicit `first`, `wheel`, `exe`, and `audit` stages with the new root. Native startup was not run; these results do not certify native window interaction. No publication, push, commit, or product-code change was made during this final documentation/validation pass.

## 2026-10-09 目录精简复验 / Layout migration checks

- Python unittest：93 passed；包含启动脚本跨工作目录调用、退出码传递、源码包路径，以及生成器八种 AI 组合的归档链接检查。
- npm runtime / creator：34 passed，1 个可选旧集成入口跳过；AI 八种组合的目录存在性和 Markdown 相对链接全部通过。
- frontend 内 `npm ci`、Vite 生产构建、两个 npm 包打包通过，根目录不再需要 npm 配置或依赖。
- 真实 tarball 六模板集成：8/8 passed；三套 TypeScript 类型检查、Chrome 交互、Vue HMR 通过。报告保存在忽略的 `build/npm-pack-validation/pack validation BtIUfU/report.json`。
- 全新带空格目录：安装 → 首次初始化 → wheel → 默认 EXE → 归档检查通过。wheel / EXE 编译前端资源与 Vite 输出逐字节一致。报告保存在忽略的 `build/npm-first-run/first run GNj7St/report.json`。
- 文档迁移：36 份 Markdown 的 297 个本地链接、19 个安装状态路径及两张 SVG XML 已检查。
- 本轮未执行 npm 发布，也未重新验收原生窗口交互；浏览器验收不代替原生行为。
- 交付补验发现并修复源码包遗漏 `docs/.easy-dev/agent.md`：先复现归档缺文件失败，再加入公开资源白名单，继续排除本地 AI 状态。更新后的真实 tarball 已在八种 AI 组合下验证生成布局、源码 ZIP 的所有 AI 链接，以及项目外调用 `startup.cmd --help`。报告：忽略的 `build/ai-layout-validation/packed apps 5xdxiV/report.json`。

## 2026-10-08 历史记录 / Previous validation

2026-10-08，Windows 11、Node 22.22.2、npm 10.9.7、Python 3.12.10、Vite 7.3.7。本记录属于 npm/Vite 迁入，旧目录迁移记录不作为本次运行证据。

以下结果属于上述日期，早于 frontend 配置/依赖与 docs/AI 资源迁移，不证明迁移后的脚手架 AI 多选或构建已通过。复验命令已按新目录调整，结果须重新记录。

Results below predate the frontend configuration/dependency and docs/AI resource migration. They do not certify migrated AI selection or builds. Reproduction commands reflect the new layout; reruns need new evidence.

## 实际结果 / Executed checks

| 范围 / Scope | 结果 / Result |
| --- | --- |
| Python unittest | 89 passed，包含首次初始化顺序、失败停止、JS dispatcher 异常恢复 / Includes clean initialization and dispatcher recovery |
| npm runtime / creator | 31 passed；测试套件中的可选旧集成入口跳过一次，独立 pack 集成完整执行 / Optional legacy integration skipped; dedicated pack integration executed |
| `npm run test:pack` | 8/8 passed：实际安装两份 tarball，六模板独立安装、Vite 构建、Chrome 交互与生命周期 / Both real tarballs installed; all six templates built and exercised |
| TypeScript | Vanilla TS、Vue TS、React TS 类型检查通过 / All three TS templates passed |
| HMR | Vue JS/TS 文案更新和恢复，无整页刷新，计数状态保留 / Updates and restore without reload or state loss |
| `npm run dev -- --no-open` | Vite 动态 URL 传入 pywebview，ready/loaded 触发；退出后端口关闭 / Dynamic URL and bridge ready confirmed, port closed on exit |
| 首次创建与初始化 / First run | 新 tarball 创建空项目，无 output/frontend；npm install → Vite build → pip editable install 成功 / Fresh app initialized without pre-existing assets |
| wheel | 根框架及独立 Vue 应用构建通过；应用 wheel 的编译资源与 Vite 输出逐字节相同 / Framework/app wheels built; app assets inspected |
| 默认 EXE / Default EXE | 根项目及独立生成项目 `npm run build` 通过；归档只携带 output/frontend 编译资源 / Both builds passed; compiled assets verified |
| 原生窗口 / Native window | 首装生成 Vue EXE 窗口可见、响应正常，964×641；渲染交互由 Chrome 集成单独验证 / Responsive native window; rendered interactions tested separately in Chrome |
| 锁文件 / Lockfile | 干净 npm ci 通过；包含 Windows/Linux 的 esbuild、Rollup optional 包 / Clean npm ci and both platform entries checked |
| Registry | 未执行 npm publish；包名所有权与 registry 安装由发布者确认 / No publication; publisher verifies names and registry installation |

## 可重复命令 / Reproduction

```powershell
npm --prefix frontend ci
npm --prefix frontend run test:npm
npm --prefix frontend run test
npm --prefix frontend run pack:npm
npm --prefix frontend run test:pack
node tests/npm-first-run.integration.mjs
npm --prefix frontend run build -- -w
npm --prefix frontend run build
```

pack 验收脚本从 `output/npm` 的 tarball 安装，不借用仓库源码。报告与日志写入忽略目录 `build/npm-pack-validation` 和 `build/npm-first-run`；前者覆盖六模板，后者覆盖无预编译资源的首次 init、wheel、EXE、归档比对和原生启动。运行验收需要本机 Chrome 与 Playwright；脚本支持环境变量选择工具路径，具体见脚本头部。

Pack checks install tarballs rather than importing repository runtime sources. Reports live under ignored build directories. The six-template suite and first-run suite are separate; the latter verifies clean initialization, both artifacts and native startup. Chrome and Playwright are needed for browser validation.

发包顺序与命令见 [npm / Vite 指南](npm-vite.md)。Vite 只编译前端；Python 可执行文件仍由 PyInstaller 生成，Vite 构建速度不代表完整 EXE 编译速度。

See the [guide](npm-vite.md) for publication order. Vite compiles frontend assets; PyInstaller still packages the executable. Frontend build time is not the total EXE build time.