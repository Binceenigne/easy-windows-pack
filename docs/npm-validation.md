# npm / Vite 验收记录 / npm / Vite validation

[文档导航 / Documentation](README.md) · [完整指南 / Guide](npm-vite.md)

## 2026-10-10 安装向导与安全修复阶段 / Installer wizard and safety fixes

以下为各 agent 实际执行后由主任务提供的分组结果；本文档任务未重跑运行时测试。GUI 改为目录 → 可选功能 → 按功能过滤的依赖 → 可选安装后选项 → 确认 → 进度 → 完成；卸载为确认 → 进度 → 完成，沿用原安装/卸载引擎。

These grouped results were supplied by the main task after actual agent runs; this documentation task did not rerun runtime tests. The GUI now follows directory → optional features → feature-filtered prerequisites → optional post-install options → confirmation → progress → completion. Uninstall follows confirmation → progress → completion, using the existing install/uninstall engine.

| 范围 / Scope | 本阶段结果 / Stage result |
| --- | --- |
| [Tk GUI 回归 / Tk GUI regression](../tests/test_installer_gui.py) | **10 passed** |
| [installer 回归 / Installer regression](../tests/test_installer.py) | **57 passed** |
| [CLI 回归 / CLI regression](../tests/test_cli.py) | **33 passed** |
| 完整 Python 回归 / Full Python regression | **245 passed**，日志 `output/final-python-packaging.log` |
| Node creator/runtime 回归 / Node regression | **145 passed，1 optional integration skipped**，日志 `output/final-npm-packaging.log` |
| 最终六模板 npm pack 集成 / Final npm pack integration | **8/8 passed**，两包 0.1.2，报告 `build/npm-pack-validation/pack validation m01nHq/report.json` |
| 最新 wheel 与冻结安装包 / Latest wheel and frozen installers | **passed**；独立安装 wheel 后构建 onefile/onedir、真实逐页 GUI 安装、运行、自卸载和源码 ZIP 解压重建 / Independent wheel, both modes, real wizard, app execution, self-uninstall and source ZIP restoration |

长路径自删除已改为短 `-File` 临时 PowerShell 脚本 + JSON 清单，保留拥有哈希与用户文件保护；源码 ZIP 已保留空目录。上述测试分组不合成为全测总数，也不替代冻结 EXE 实测。Python **0.3.0 wheel 已在本地构建并通过独立冻结验收**，**尚未发布到 PyPI**；npm 两包 **0.1.2 待发布**，`npm login` 返回 **HTTP 401**，等待用户认证。

Long-path self-deletion uses a temporary PowerShell script with a short `-File` invocation and JSON manifest, retaining ownership-hash checks and user-file protection. Source ZIPs preserve empty directories. These groups are not combined into a full-suite total and do not replace frozen EXE checks. The Python **0.3.0 wheel is built locally and passed independent frozen validation**, with **no PyPI publication**. Both npm packages at **0.1.2 remain pending publication**, awaiting user authentication after `npm login` returned **HTTP 401**.

最新冻结报告 `build/packaging-validation/wheel installer ygft7h_d/report.json` 为 `status: passed`：13 条外部命令成功，安装路径长 159–163 字符，40 个空目录恢复并清理；功能勾选、回退镜像、校验拒绝、命令钩子、配置项、开机自启和卸载注册表清理通过。新增或修改的用户文件保留。延迟删除通过 251 字符的 PowerShell `-File` 命令启动，退出后清理脚本和清单。wheel SHA-256：`b295f01ce52bba415ccb7e886cd3124565c219743f1d2e8a26ca47c814a901c3`，Python 模块与源码一致。

The final ygft7h_d report has `status: passed`: all 13 external commands succeeded, with 159–163-character install paths and 40 empty directories. Feature selection, mirror fallback, checksum rejection, hooks, settings, startup and uninstall registry cleanup passed; new or modified user files survived. Deferred cleanup used a 251-character PowerShell `-File` invocation and removed temporary helper files. The wheel hash above identifies the source-matching artifact.

上轮 `_16os8r_` 报告保留为历史证据。本轮网络验收使用本机 HTTP，未验证公网镜像、旧 Windows 或 WebView2 页面渲染兼容性。配置和分步流程见 [打包指南](packaging.md)。

The earlier _16os8r_ report remains historical evidence. Network tests used local HTTP; public mirrors, old Windows versions and WebView2 rendering compatibility were not validated. See the [packaging guide](packaging.md) for configuration and wizard steps.

## 2026-10-10 应用与安装包回归 / Application and installer regression

以下保留同日较早阶段的记录：新增应用 onefile/onedir、安装包配置、独立 GUI/silent 安装器及卸载逻辑。测试结果由主任务提供，本文档任务未重跑运行时测试；历史 welcome、0.1.1 registry 与旧 EXE 验收不作为该阶段证据。

The following retains the earlier stage from the same date: configured onefile/onedir applications, setup packaging, standalone GUI/silent installation and uninstall. The main task supplied these results; this documentation task did not rerun runtime tests. Earlier welcome, 0.1.1 registry and old EXE checks do not certify that stage.

| 范围 / Scope | 本轮结果 / Current result |
| --- | --- |
| [installer 新测试 / New installer tests](../tests/test_installer.py) | **37 passed** |
| [packaging 新测试 / New packaging tests](../tests/test_packaging.py) | **28 passed** |
| CLI / 根目录相关 Python 回归 / CLI and project-root Python regression | **113 passed**，按主任务提供的范围记录 / Recorded with the scope supplied by the main task |
| Node creator/runtime 回归 / Node creator/runtime regression | **146 total，145 passed，1 skipped** |

上述测试组按各自报告范围列出，不据此推导额外总数或跨组覆盖。Python 源码版本为 **0.3.0**，npm 两包为 **0.1.2 待发布**；已有 registry 证据只覆盖 0.1.1，**PyPI 发布未验证**。

These groups retain their reported scopes; no additional combined count or coverage is inferred. Python sources are **0.3.0** and both npm packages are **0.1.2, pending publication**. Registry evidence covers 0.1.1 only; **PyPI publication is unverified**.

该阶段记录时，真实应用/setup/uninstaller EXE、GUI 与运行库下载验收尚待补充；后续历史实测和当前待重建状态见上节，旧系统兼容仍未验证。配置与使用说明见 [打包指南](packaging.md)。

At the time of that record, real app/setup/uninstaller EXE, GUI and runtime-download checks were still pending. Later historical execution evidence and the current rebuild status appear above; old OS compatibility remains unverified. See the [packaging guide](packaging.md) for configuration and use.

## 2026-10-09 welcome 改版本地验收 / Local welcome validation

本轮为参考 Vite / Tauri 的简洁双语根 README 与 Vite 风格 demo 收尾：根 demo 包含主题/语言切换、计数、窗口外观与标题栏控制、资源入口及响应式布局；六模板包含新 welcome、三份品牌图标与系统浅深色适配，使用创建时选定的文案语言。根 demo 的全部控制项不作为模板统一能力。实现定位与资产维护见 [窗口外观](window-styles.md#welcome-页面与品牌资产)。

This revision finishes concise bilingual root READMEs inspired by Vite / Tauri and a Vite-style demo. The root demo includes theme/language toggles, a counter, window appearance/title-bar controls, resource links and responsive layouts. All six templates include the new welcome, three brand SVGs and system light/dark adaptation, with copy in the creation language. The root demo's full control set is not a template-wide contract; see the [design and asset rules](window-styles.md#welcome-页面与品牌资产).

**这是发布后的本地源码验收，不是此前 CLI / 0.1.1 发布验收。线上两包仍为原 0.1.1，未包含本轮 welcome；本轮不发布新版。** 验收临时使用仍标记 0.1.1 的本地 tarball，仅作测试输入；报告确认原 `output/npm` 归档已恢复，测试包另存 `output/design-validation/npm/`。

**These are local source checks after publication, separate from the earlier CLI / 0.1.1 release checks. Both registry packages remain at the original 0.1.1 and do not include this welcome revision; no new release is published.** Temporary local test tarballs still carry 0.1.1. The report confirms that the original `output/npm` archives were restored; test packs remain under `output/design-validation/npm/`.

| 范围 / Scope | 实际结果 / Executed result |
| --- | --- |
| npm 单测 / Unit tests | `npm --prefix frontend run test:npm`：**141 passed，0 failed，0 skipped**；依据本轮日志，不复用发布前计数 / From this revision's log, not earlier release counts |
| 本地 pack / Local packs | pack 命令成功；creator 包中的三份 SVG 与权威源码比对通过；原归档恢复且无恢复错误 / Pack succeeded, creator SVGs match authoritative sources, original archives restored without errors |
| 最终六模板 / Final six-template integration | `node tests/npm-pack.integration.mjs`：**8/8 passed**；真实 tarball 独立安装、公共 exports、六模板 Vite 构建、三套 TS 类型检查及项目外 `ewp create` / Real tarball installs, exports, builds, types and creation outside a project |
| Chrome / HMR | 六模板 welcome 文案、浅深色 SVG 加载、生产交互及各 3 次卸载/重挂载通过；Vue JS/TS 文案更新与恢复零整页刷新 / Welcome copy, light/dark SVG loading, production interaction, three lifecycle cycles per template, Vue JS/TS HMR without full reloads |
| 原始图标 / Original icons | 文档收尾实际读取 `C:\Users\Binceengine\Downloads\ewp-svg-icons.zip`，三份 SVG 与 `frontend/src/assets/` 对应源文件逐字节一致，SHA-256 同时匹配 / All three ZIP entries match source bytes and SHA-256 |
| 根 demo / Root demo | 集成浏览器实测计数、切换英文后保留计数、主题切换、Windows + minimal 外观应用、SVG 加载通过；390px 窄屏无横向溢出；根 Vite 生产构建通过 / Counter survives language changes, theme and frame controls work, SVGs load, no horizontal overflow at 390px, production build succeeds |

主报告：`output/design-validation/report.json`；单测与集成日志为同目录的 `test-npm-initial.log` 和 `npm-pack-integration.log`。最终六模板报告：`build/npm-pack-validation/pack validation R6s4Md/report.json`。这些为忽略目录中的本地证据，不随 Git 分发。

The report and logs above are local evidence under ignored directories and are not distributed through Git.

根 demo 的收尾浏览器检查另列于表中。本轮未重跑 Python、wheel、EXE 或原生窗口操作；此前 CLI、registry 和原生构建证据保留在下文，不能替代本轮验收。

Root-demo browser checks are listed separately above. Python, wheel, EXE and native window actions were not rerun for this revision. Earlier CLI, registry and native-build evidence below does not certify this revision.

## 2026-10-09 0.1.1 发布与 registry 验收 / Publication and registry validation

用户实际执行 `create-ewp@0.1.1` 与 `easywindowspack@0.1.1` 的 `npm publish`，两份均返回 `+` 成功。随后实际 registry 验证确认 **0.1.1 已发布且可用**：两包版本与哈希查询成功，哈希与归档匹配；`npm create ewp@latest` 创建及 Vue TS 项目安装、检查与前端构建冒烟全部通过。以下记录依据用户提供的实际执行结果。

The user ran `npm publish` for `create-ewp@0.1.1` and `easywindowspack@0.1.1`; both returned `+` success responses. Subsequent registry checks confirmed **0.1.1 is published and available**: both version/hash queries succeeded and matched the archived tarballs; `npm create ewp@latest` creation and Vue TS installation, checks, and frontend build smoke tests all passed. The following records the actual execution results supplied by the user.

Registry：`https://registry.npmjs.org/`。`npm view <package>@0.1.1 version dist.shasum --prefer-online --registry=https://registry.npmjs.org/` 两次查询均成功 / Both queries succeeded：

| 包 / Package | 版本 / Version | `dist.shasum`（SHA-1） | 归档比对 / Archive comparison |
| --- | --- | --- | --- |
| `create-ewp` | `0.1.1` | `1fb3954bcb47840b6c22dab8ddbe3a35ce7abdac` | 匹配 / Match |
| `easywindowspack` | `0.1.1` | `98f88a0887dc8977c43b8f1451d907a3fd589c81` | 匹配 / Match |

创建命令成功：`npm create ewp@latest build/npm-registry-011 -- --lang en --template vue-ts --ai codex,claude --no-install --no-start --yes`。实际执行时，npm 层另带 `--yes --prefer-online --registry=https://registry.npmjs.org/`；生成器参数不变。项目使用英文、Vue TS 与 Codex/Claude 指引，随后在 `build/npm-registry-011/frontend` 执行以下步骤。

Creation succeeded with the command above, using English, Vue TS, and Codex/Claude guidance. The actual invocation also supplied npm-level `--yes --prefer-online --registry=https://registry.npmjs.org/`, with the same generator arguments. The following steps then ran inside `build/npm-registry-011/frontend`.

| 步骤 / Step | 结果 / Result |
| --- | --- |
| `npm install --prefer-online --registry=https://registry.npmjs.org/ --no-audit --no-fund` | 成功 / Passed |
| `npm run help` | 成功 / Passed |
| `npm run check` | **3 passed** |
| `npm run typecheck` | 成功 / Passed |
| `npm run frontend:build` | 成功 / Passed |

本次 registry 冒烟覆盖上述 Vue TS 项目链路；全局 CLI、其他模板、Python 初始化及原生构建/启动不在本次范围内，其历史验收见下文。

This registry smoke test covers the Vue TS project workflow above. Global CLI, other templates, Python initialization, and native build/startup are outside this run; their historical checks remain below.

本次发布后文档更新仅同步 Git 源码（含两个包 README）；已发 tarball 不可覆盖，不重新 pack 或发布。未修改代码、版本或锁文件，未提交或推送。下列历史验收保留原日期与范围，不作为本次 registry 冒烟证据。

This post-publication update changes Git documentation sources only, including both package READMEs. Published tarballs cannot be overwritten and are not repacked or republished. No code, versions, or lockfiles were changed; no commit or push was made. Historical checks below retain their original dates and scope and do not establish registry smoke-test success.

## 2026-10-09 0.1.1 文档与最终包复验 / Final local package checks

以下为同日发布前的本地验收记录：当时源码 workspace、两个 npm 包的 manifests 与锁文件已同步为 **0.1.1，尚未发布**；线上两个包仍为 **0.1.0**，Python 版本仍为 **0.2.1**。该轮新增语言、任务和模板行为使用本地 tarball 验证。

The following local checks preceded publication on the same day. At that time, source workspace/package manifests and the lockfile were aligned at **0.1.1, unpublished**; both registry packages remained at **0.1.0**, and Python remained **0.2.1**. New behavior was verified with local tarballs.

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

最终 first-run 显式依次执行 `--stage=first`、`wheel`、`exe`、`audit`，后续阶段复用新建的 `--root`；未执行默认 `all` 或 `startup`，未启动原生窗口。该发布前验收阶段未发布、推送或提交，也未修改产品代码。

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