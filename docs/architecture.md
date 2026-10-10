# 架构与目录迁移 / Architecture and directory migration

[文档导航 / Documentation](README.md) · [npm / Vite](npm-vite.md) · [开发手册 / Development](development.md) · [应用与安装包 / Packaging](packaging.md)

## 职责与依赖 / Responsibilities and dependencies

| 路径 / Path | 职责与边界 / Responsibility and boundary |
| --- | --- |
| `backend/base/ewpcore/` | Python 框架：窗口配置、API、controller、Win32、可选托盘和宿主适配器；不依赖演示业务 / Python framework; no demo dependency |
| `backend/base/ewpcore/packaging.py` / `installer.py` | 配置校验、应用/setup 构建；独立标准库 GUI/silent 安装与拥有记录卸载 / Config validation, app/setup builds; standalone standard-library setup and ownership-aware uninstall |
| `backend/base/*.egg-info/` | setuptools 安装/构建 metadata，已忽略，不是文档或源码 / Ignored setuptools installation/build metadata, not documentation or source |
| `backend/src/` | 桌面入口与宿主装配，消费公开 `easy_windows_pack` API / Desktop entry points and host wiring using public APIs |
| `frontend/frame/ewpframe/` | 窗口桥接、状态同步与更新客户端；通过公开宿主接口请求能力 / Window bridge, state synchronization and update client |
| `frontend/components/titlebar/` | 标题栏标记、主题与 resize handle 样式 / Title bar markup, themes and resize styles |
| `frontend/components/desktop/` | 可复用点阵、启动遮罩、错峰进入组件；不依赖示例页 / Reusable matrix, curtain and entrance components |
| `frontend/index.html`、`frontend/src/` | Vite 主页面、业务装配与组件示例；旧 src/index.html 弃用 / Vite main page and demo composition; old src/index.html deprecated |
| `frontend/contracts/` | TypeScript 类型契约及简短接入说明 / Type declarations and local integration notes |
| `frontend/packages/easywindowspack/` | ESM runtime、公共 exports、可选 Vue/React wrappers 与 `ewp` CLI / Public runtime and CLI |
| `frontend/packages/create-ewp/` | `@clack/prompts` 生成器、common 与六套 JS/TS 模板 / Generator, common and six templates |
| `frontend/package.json`、`frontend/package-lock.json`、`frontend/vite.config.mjs` | private workspace、锁文件、Vite ^7.3.7、HMR 与相对生产 URL；依赖安装于 frontend / Workspace, lockfile, frontend dependencies, HMR and relative production URLs |
| `scripts/prepare-npm.mjs` | 从权威前端/后端生成 npm assets 和 common runtime/script 副本 / Generate distribution resources from authoritative sources |
| `scripts/dev.py` | 标准库开发任务编排，不属于运行时公开 API / Standard-library development orchestration |
| `startup.cmd` → `scripts/startup.cmd` → `scripts/dev.py` | 根唯一启动脚本；其他构建脚本收于 scripts / Only root launcher; other build wrappers live under scripts |
| `docs/` | 框架开发专题与 agent 路由、应用使用者的 index/design、.agents/.claude/.easy-dev 资源 / Framework guides/routes, app summaries and AI resources |
| 根 `AGENTS.md`、`CLAUDE.md` | 标准薄入口，显式引导读取 docs 下非默认自动发现的 Skills / Standard thin entries explicitly loading skills under docs |
| `tests/` | Python 与浏览器测试夹具 / Python and browser test fixtures |
| `output/`、`build/` | 产物、日志、配置和缓存，不作为实现来源 / Generated artifacts, logs, specs and caches |

依赖方向：桌面示例 → 公开 Python 包 → pywebview / Win32；前端页面 → 组件 / 桥接 → 宿主公开 API。框架不反向导入示例，不复制业务更新器、授权或重启流程。`WindowController` 仍串行发送 JavaScript；最小化/隐藏时的防死锁策略、原生拖拽和缩放边界不因路径迁移而改变。

Dependencies flow from desktop demo to public Python package to pywebview / Win32, and from frontend pages to components / bridges to host APIs. The framework does not import demo code or copy host authorization, updater or restart logic. `WindowController` retains serialized JavaScript dispatch, minimize/hide deadlock avoidance and native drag/resize boundaries.

frontend 内 npm workspace 为 private；npm 命令在 frontend 内执行，或从项目根使用 `npm --prefix frontend`。两包当前为 **0.1.2 待发布**；0.1.1 发布与 registry 冒烟的历史证据见 [验收记录](npm-validation.md)。runtime 通过依赖 `create-ewp/cli` 实现 `ewp create`；新生成项目消费 `easywindowspack@^0.1.2`，不依赖原仓库。Vue >=3.3 / React >=18 是 runtime 的可选 peers；仅在实际使用对应入口或模板时加载。模板自有 Frame 包装层通过 Teleport / portal 组合业务 slot/children，不复制窗口状态机。

The npm workspace under frontend is private. Run npm commands there, or use `npm --prefix frontend` from the project root. Both packages are now **0.1.2, pending publication**; historical 0.1.1 publication and registry smoke evidence remain in the [validation record](npm-validation.md). Runtime delegates `ewp create` to dependency `create-ewp/cli`. New apps consume `easywindowspack@^0.1.2` without depending on the original checkout. Vue >=3.3 / React >=18 are optional runtime peers, loaded only for the corresponding entry or template. Template-owned Frame layers compose slots/children through Teleport/portals without duplicating window state logic.

0.1.2 创建时首先选择人类语言 `zh-CN` / `en`，保存到 frontend manifest 的 `ewp.language`，用于生成 README、AI 指引和 demo。自有 CLI 输出按 `--lang` → `EWP_LANG` → 保存值 → `zh-CN` 解析；临时覆盖不重写项目文件，第三方 npm/pip/Vite 日志原样输出。AI 布局只生成所选工具目录，各工具 Skill 读取 docs 共用内容，Claude 可独立选择；详见 [npm 指南](npm-vite.md)。

In 0.1.2, human language `zh-CN` / `en` is the first creation choice, saved as `ewp.language` in the frontend manifest and used for README, AI guidance, and demo generation. First-party CLI output resolves `--lang` → `EWP_LANG` → saved value → `zh-CN`. Temporary overrides do not rewrite project files; npm/pip/Vite logs pass through unchanged. AI layout includes only selected tool directories; tool skills read shared docs content and Claude can be selected independently. See the [npm guide](npm-vite.md).

## 源码路径与公开包名 / Source path and public package name

`backend/base/ewpcore/` 是源码存放位置，公开包名始终是 `easy_windows_pack`。`pyproject.toml` 使用 `package-dir = { "" = "backend/base", easy_windows_pack = "backend/base/ewpcore" }`：空根映射定位 setuptools 安装 metadata，包名映射定位公开包源码，可编辑安装和 wheel 均须保持该约定。不要把目录名 `ewpcore` 当作新的公开包名，也不要为恢复旧路径复制一份实现。

`backend/base/ewpcore/` is the source location; the public package remains `easy_windows_pack`. `pyproject.toml` uses `package-dir = { "" = "backend/base", easy_windows_pack = "backend/base/ewpcore" }`: the empty-root mapping locates setuptools installation metadata, while the package-name mapping locates public package source. Editable installs and wheels must preserve this contract. Do not publish `ewpcore` as a replacement import or copy implementation files back to the old location.

旧根 `easy_windows_pack.egg-info/` 迁移到 `backend/base/easy_windows_pack.egg-info/`；生成应用则使用自身分发名。它记录 PKG-INFO、依赖、入口与文件清单，是安装/构建生成物，不属于 docs。仓库 `*.egg-info/` 规则在任意目录忽略它，source bundle 也排除；不要手工编辑或提交。旧根缓存不是新约定的源码位置，metadata 的实际迁移/重建由安装与主维护流程完成。

The old root `easy_windows_pack.egg-info/` moves to `backend/base/easy_windows_pack.egg-info/`; generated apps use their own distribution names. It contains PKG-INFO, dependency, entry-point, and file-list metadata produced by installation/builds, not docs. The repository's `*.egg-info/` rule ignores it at any depth and source bundles exclude it. Do not hand-edit or commit it. Old root cache is not the new source location; installation and the main maintenance workflow handle metadata relocation/regeneration.

`.venv/Lib/site-packages/*.dist-info/` 是 pip 安装 wheel（包括现代 editable 安装）后正常生成的分发元数据，可与源码树中的 egg-info 共存。它不表示旧路径迁移失败，不应搬到 docs 或提交；`.venv/` 整体属于本地环境。

`.venv/Lib/site-packages/*.dist-info/` is normal distribution metadata created by pip wheel installations, including modern editable installs. It can coexist with source-tree egg-info and does not indicate a failed migration. Do not move it into docs or commit it; the entire `.venv/` is a local environment.

```python
from easy_windows_pack import WindowConfig, create_window
```

CLI 入口仍为 `python -m easy_windows_pack.cli` / `easy-windows-pack`。导入包名、分发名 `easy-windows-pack` 与物理目录是三个不同概念；迁移后重新安装可编辑项目，检查 wheel 内包路径与分层前端资源。

CLI entry points remain `python -m easy_windows_pack.cli` and `easy-windows-pack`. Import name, distribution name and physical source directory are distinct. Reinstall the editable project after migration and inspect package paths plus nested frontend resources inside the wheel.

Python 源码版本 **0.3.0** 的公共包增加 packaging/installer 模块；顶层导出配置加载/校验、应用/安装包/组合构建与 PE 校验函数。CLI 增加 `app` / `installer`，按 `--project-root` 定位调用方应用。wheel 分发能力与 PyPI 发布状态分别核对，目前 PyPI 未验证。最小示例与 schema 见 [打包指南](packaging.md)。

Python sources **0.3.0** add packaging/installer modules and top-level config loading/validation, app/setup/package building and PE validation functions. CLI adds app/installer tasks using the caller's `--project-root`. Wheel contents and PyPI publication are separate checks; PyPI publication is currently unverified. See the [packaging guide](packaging.md) for the minimal API example and schema.

## 路径迁移表 / Path migration map

此表左列仅用于迁移定位，不是当前可用路径。Python 文件内容仍通过原公开包导入。

The left column is historical migration information, not an active path. Python files retain the original public import namespace.

| 旧路径 / Previous path | 新路径 / Current path |
| --- | --- |
| `easy_windows_pack/*.py` | `backend/base/ewpcore/*.py` |
| `examples/demo.py` | `backend/src/demo.py` |
| `examples/index.html` | `frontend/index.html` 为主入口；`frontend/src/index.html` 为弃用兼容入口 / Main entry and deprecated compatibility entry |
| `examples/components.html` | `frontend/src/components.html` |
| `examples/components-demo.js` | `frontend/src/components-demo.js` |
| `frontend/window-frame.html` | `frontend/components/titlebar/window-frame.html` |
| `frontend/window-frame.css` | `frontend/components/titlebar/window-frame.css` |
| `frontend/window-frame.js` | `frontend/frame/ewpframe/window-frame.js` |
| `frontend/desktop-updates.js` | `frontend/frame/ewpframe/desktop-updates.js` |
| `frontend/desktop-components.js` | `frontend/components/desktop/desktop-components.js` |
| `frontend/desktop-components.css` | `frontend/components/desktop/desktop-components.css` |
| `ui-contracts/` | `frontend/contracts/` |
| 默认产物 `dist/` / Default artifacts | `output/wheels/`、legacy `output/exe/`、配置 `output/apps/`、`output/installers/`、`output/bundles/` |
| 原独立 demo 打包 / Standalone demo packaging | `scripts/build-demo.ps1` → `scripts/dev.py exe` |
| `packages/` | `frontend/packages/` |
| 根 `package.json`、`package-lock.json`、`vite.config.mjs` | `frontend/` 内对应文件 / Corresponding files under frontend |
| 根 `build.cmd`、`build.ps1`、`build-demo.ps1` | `scripts/` 内对应文件；根启动使用 `startup.cmd` / Wrappers under scripts; root launcher is startup.cmd |
| 根 `.agents/`、`.claude/`、`.easy-dev/` | `docs/.agents/`、`docs/.claude/`、`docs/.easy-dev/` |
| 根 `agent.md`、`index.md`、`design.md` | `docs/agent.md`、`docs/index.md`、`docs/design.md` |
| 根 `easy_windows_pack.egg-info/` | `backend/base/easy_windows_pack.egg-info/`，Python 安装 metadata，忽略 / Ignored Python installation metadata |

## 静态资源与打包 / Static resources and packaging

Vite 以 `frontend/index.html` 为主入口，编译到 `output/frontend/`，生产 `base: './'` 支持离线相对资源加载；仓库还编译组件示例页。开发由 Vite 提供 HMR，并以实际动态 URL 设置 `EWP_DEV_URL`。旧静态组件仍可由兼容宿主直接消费，但不能把未编译框架模板当生产页面。

Vite starts from `frontend/index.html` and builds into `output/frontend/` with `base: './'` for offline relative assets; the checkout also builds the component demo. Development uses HMR and sets `EWP_DEV_URL` to the actual dynamic URL. Compatible hosts may still consume static components directly, but uncompiled framework templates are not production pages.

框架 wheel metadata 分发核心与 `share/easy-windows-pack/frontend/` 下的源组件/桥接/契约；生成应用 wheel metadata 分发编译的页面/assets，二者分别验证。EXE 以 `backend/src/demo.py` 为入口，只携带 `output/frontend/` 作为前端，支持 PyInstaller 解包资源位置。source bundle 应保留 `backend/`、`frontend/`（含 packages 与配置）、`scripts/`、`docs/`、配置与相关入口。确切资源清单由 metadata、打包配置及 CLI 维护，文档存在不等于资源已进入产物。

Framework wheel metadata distributes core and source components/bridges/contracts under `share/easy-windows-pack/frontend/`; generated app wheel metadata distributes compiled pages/assets. Validate both independently. EXEs start from `backend/src/demo.py`, include only compiled `output/frontend/` as frontend resources, and resolve PyInstaller-extracted paths. Source bundles retain backend, frontend (including packages and configuration), scripts, docs and relevant entries. Inspect actual artifacts against their metadata and packaging lists.

`scripts/prepare-npm.mjs` 将 titlebar/components/frame 的权威资源生成到 `frontend/packages/easywindowspack/assets`，把 backend core、`scripts/dev.py`、根 `startup.cmd`、`scripts/startup.cmd`、LICENSE 复制到 `frontend/packages/create-ewp/templates/common`。六模板组合 prepared 资源，并按语言把 common README.md / README.en.md 输出为项目 README.md；运行生成器不回读原仓库。复制的 runtime/script/assets 不手工维护；包根和 common 的说明文档按自身职责维护。npm 两包当前为 0.1.2 待发布，发布按用户授权与当前范围执行，见 [npm 指南](npm-vite.md)。

Preparation generates runtime assets from authoritative titlebar/components/frame sources and copies backend core, development script, menu and license into generator common resources. All six templates compose them with common README.md / README.en.md, emitting the selected language as project README.md without reading the original checkout at generation time. Generated runtime/script/assets copies are not hand-maintained; package and common documentation retain their own ownership. Both npm packages are 0.1.2, pending publication; publication follows user authorization and current scope. See the [npm guide](npm-vite.md).

项目 `build` 默认 EXE，通过 `--wheel` / `-w` 选择 wheel；npm 传参需 `--`，裸 `-w` 是 npm workspace 选项。完整链用 `full-build` / `build --all` / `npm run build:all` 执行测试 + wheel + EXE + bundle；底层 Python CLI `build` 保持测试 + wheel + bundle，不含 EXE。全局 `ewp` 无参数显示帮助，`ewp menu` / 根 startup.cmd 无参数打开菜单；未全局安装从根用 `npm --prefix frontend run ewp -- <task>`。产物进入 `output/` 分类目录，PyInstaller spec / 工作缓存进入 `build/`。详见[开发手册](development.md)。

Project `build` defaults to EXE; `--wheel` / `-w` selects wheel. npm arguments follow `--`; bare `-w` belongs to npm workspace selection. `full-build`, `build --all`, and `npm run build:all` run tests + wheel + EXE + bundle. Low-level Python CLI `build` retains tests + wheel + bundle without EXE. Global `ewp` without arguments shows help; `ewp menu` or root startup.cmd without arguments opens the menu. Without global installation, use `npm --prefix frontend run ewp -- <task>` from the root. Artifacts use categorized `output/` directories; PyInstaller specs/caches use `build/`. See [development](development.md).

`app` / `installer` 使用项目根 `ewp.pack.json` 与实际 schema，应用产物进入 `output/apps`，setup 进入 `output/installers`。`build --mode onedir` 或显式 config/installer 参数转入同一路径；无打包参数的 legacy build/exe 保留 output/exe。安装器是独立标准库模块，使用当前用户文件/注册表拥有记录，保留新增或修改文件；升级要求先卸载，外部命令副作用不能事务回滚。

app/installer use root ewp.pack.json and its validated schema, writing apps under output/apps and setup under output/installers. Explicit mode/config/installer flags route build/exe through the same path; legacy build/exe without them retains output/exe. The standalone standard-library installer tracks current-user files/registry ownership and preserves added or changed files. Upgrades require uninstall first; external command side effects cannot be rolled back transactionally.

## 迁移核对与文档维护 / Migration verification and documentation

迁移时核对安装配置、公开导入/exports、CLI 根目录与资源清单、Vite 相对生产 URL、EXE 冻结资源定位、测试路径及 CI 产物匹配。Vite 根与 fs allow 不得扩大为整仓库来修补断链。原生行为、构建与浏览器断言分别记录；[历史记录](integration-validation.md)和[目录迁移记录](build-validation.md)不证明本次 npm/Vite 通过，当前证据写入 [npm-validation.md](npm-validation.md)。

Check install mapping, public imports/exports, CLI resources, relative Vite production URLs, frozen resources and test/CI paths. Do not expand Vite serving to the whole checkout to fix paths. Record native behavior, builds and browser assertions separately; historical integration/layout records do not certify npm/Vite. Current evidence belongs in [npm-validation.md](npm-validation.md).

详细框架说明集中在 `docs/`，新增页面补 [docs/README.md](README.md) 导航。[index.md](index.md) / [design.md](design.md) 留给应用使用者记录少量业务入口和 UI 规则，框架内部开发不自动扩写、不要求数量盘点。[agent.md](agent.md) 的项目根为 docs 上一级；Skills 在 docs 下，根标准入口显式引导读取。接口变动同步 [桌面集成契约](desktop-integrations.md) 与 [类型契约](../frontend/contracts/README.md)；不要预读或复制整套 Skill 文档。

Maintain framework guides under docs and update their navigation. index/design serve application authors' brief business entries and UI rules, without automatic expansion or inventory counts for internal work. The project root declared by docs/agent.md is its parent directory; standard entries explicitly load skills under docs. Synchronize interface changes with integration and type contracts. Load only relevant skill references.

2026-10-09 文档/AI 资源迁移检查：六项根资源迁入 docs 前逐级检查，未发现 junction/symlink，搬迁时 20 个文件 SHA-256 一致；随后同步文档文本。36 份 Markdown 的 297 个本地文件链接、安装状态的 19 个路径及两张 SVG 的 XML 检查通过。安装状态仅调整路径与 memory_dir，保留原安装哈希作为基线，不把本地修订伪装为原安装内容。本次不执行应用构建或运行时测试，脚手架生成与产物仍需各自验收。

2026-10-09 documentation/AI migration checks: no junctions/symlinks were found in the six source entries; all 20 moved files retained their SHA-256 before text updates. Checks passed for 297 local file links across 36 Markdown files, 19 installation-state paths and both SVG XML documents. State paths and memory_dir changed while original installation hashes remain as the baseline. No application build or runtime tests were run for this documentation task; generator and artifact validation remain separate.