# 架构与目录迁移 / Architecture and directory migration

[文档导航 / Documentation](README.md) · [npm / Vite](npm-vite.md) · [开发手册 / Development](development.md) · [实现摘要 / Implementation summary](../index.md)

## 职责与依赖 / Responsibilities and dependencies

| 路径 / Path | 职责与边界 / Responsibility and boundary |
| --- | --- |
| `backend/base/ewpcore/` | Python 框架：窗口配置、API、controller、Win32、可选托盘和宿主适配器；不依赖演示业务 / Python framework; no demo dependency |
| `backend/src/` | 桌面入口与宿主装配，消费公开 `easy_windows_pack` API / Desktop entry points and host wiring using public APIs |
| `frontend/frame/ewpframe/` | 窗口桥接、状态同步与更新客户端；通过公开宿主接口请求能力 / Window bridge, state synchronization and update client |
| `frontend/components/titlebar/` | 标题栏标记、主题与 resize handle 样式 / Title bar markup, themes and resize styles |
| `frontend/components/desktop/` | 可复用点阵、启动遮罩、错峰进入组件；不依赖示例页 / Reusable matrix, curtain and entrance components |
| `frontend/index.html`、`frontend/src/` | Vite 主页面、业务装配与组件示例；旧 src/index.html 弃用 / Vite main page and demo composition; old src/index.html deprecated |
| `frontend/contracts/` | TypeScript 类型契约及简短接入说明 / Type declarations and local integration notes |
| `packages/easywindowspack/` | ESM runtime、公共 exports、可选 Vue/React wrappers 与 `ewp` CLI / Public runtime and CLI |
| `packages/create-ewp/` | `@clack/prompts` 生成器、common 与六套 JS/TS 模板 / Generator, common and six templates |
| 根 `package.json`、`vite.config.mjs` | private workspace、Vite ^7.3.7、HMR 与相对生产 URL / Private workspace, HMR and relative production URLs |
| `scripts/prepare-npm.mjs` | 从权威前端/后端生成 npm assets 和 common runtime/script 副本 / Generate distribution resources from authoritative sources |
| `scripts/dev.py` | 标准库开发任务编排，不属于运行时公开 API / Standard-library development orchestration |
| `docs/` | 开发文档唯一维护中心；根 index/design 为摘要 / Detailed developer documentation center |
| `tests/` | Python 与浏览器测试夹具 / Python and browser test fixtures |
| `output/`、`build/` | 产物、日志、配置和缓存，不作为实现来源 / Generated artifacts, logs, specs and caches |

依赖方向：桌面示例 → 公开 Python 包 → pywebview / Win32；前端页面 → 组件 / 桥接 → 宿主公开 API。框架不反向导入示例，不复制业务更新器、授权或重启流程。`WindowController` 仍串行发送 JavaScript；最小化/隐藏时的防死锁策略、原生拖拽和缩放边界不因路径迁移而改变。

Dependencies flow from desktop demo to public Python package to pywebview / Win32, and from frontend pages to components / bridges to host APIs. The framework does not import demo code or copy host authorization, updater or restart logic. `WindowController` retains serialized JavaScript dispatch, minimize/hide deadlock avoidance and native drag/resize boundaries.

npm 根 workspace 为 private；`easywindowspack@0.1.0` 依赖 `create-ewp@^0.1.0`，通过 `create-ewp/cli` 实现 `ewp create`。生成应用消费 `easywindowspack`，不是依赖原仓库。Vue >=3.3 / React >=18 是 runtime 的可选 peers；仅在实际使用对应入口或模板时加载。模板自有 Frame 包装层通过 Teleport / portal 组合业务 slot/children，不复制窗口状态机。

The npm root is private. `easywindowspack@0.1.0` depends on `create-ewp@^0.1.0` and delegates `ewp create` to `create-ewp/cli`. Generated apps consume `easywindowspack`, not the original checkout. Vue >=3.3 / React >=18 are optional runtime peers, loaded only for the corresponding entry or template. Template-owned Frame layers compose slots/children through Teleport/portals without duplicating window state logic.

## 源码路径与公开包名 / Source path and public package name

`backend/base/ewpcore/` 是源码存放位置，公开包名始终是 `easy_windows_pack`。`pyproject.toml` 使用 `package-dir` 将 `easy_windows_pack` 映射到 `backend/base/ewpcore`，可编辑安装和 wheel 均须保持该约定。不要把目录名 `ewpcore` 当作新的公开包名，也不要为恢复旧路径复制一份实现。

`backend/base/ewpcore/` is the source location; the public package remains `easy_windows_pack`. The `package-dir` mapping in `pyproject.toml` maps that name to the new source directory. Editable installs and wheels must preserve this contract. Do not publish `ewpcore` as a replacement import or copy implementation files back to the old location.

```python
from easy_windows_pack import WindowConfig, create_window
```

CLI 入口仍为 `python -m easy_windows_pack.cli` / `easy-windows-pack`。导入包名、分发名 `easy-windows-pack` 与物理目录是三个不同概念；迁移后重新安装可编辑项目，检查 wheel 内包路径与分层前端资源。

CLI entry points remain `python -m easy_windows_pack.cli` and `easy-windows-pack`. Import name, distribution name and physical source directory are distinct. Reinstall the editable project after migration and inspect package paths plus nested frontend resources inside the wheel.

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
| 默认产物 `dist/` / Default artifacts | `output/wheels/`、`output/exe/`、`output/bundles/` |
| 原独立 demo 打包 / Standalone demo packaging | `build-demo.ps1` → `scripts/dev.py exe` |

## 静态资源与打包 / Static resources and packaging

Vite 以 `frontend/index.html` 为主入口，编译到 `output/frontend/`，生产 `base: './'` 支持离线相对资源加载；仓库还编译组件示例页。开发由 Vite 提供 HMR，并以实际动态 URL 设置 `EWP_DEV_URL`。旧静态组件仍可由兼容宿主直接消费，但不能把未编译框架模板当生产页面。

Vite starts from `frontend/index.html` and builds into `output/frontend/` with `base: './'` for offline relative assets; the checkout also builds the component demo. Development uses HMR and sets `EWP_DEV_URL` to the actual dynamic URL. Compatible hosts may still consume static components directly, but uncompiled framework templates are not production pages.

框架 wheel metadata 分发核心与 `share/easy-windows-pack/frontend/` 下的源组件/桥接/契约；生成应用 wheel metadata 分发编译的页面/assets，二者分别验证。EXE 以 `backend/src/demo.py` 为入口，只携带 `output/frontend/` 作为前端，支持 PyInstaller 解包资源位置。source bundle 应保留 `backend/`、`frontend/`、`packages/`、`scripts/`、`docs/`、配置与相关入口。确切资源清单由 metadata、打包配置及 CLI 维护，文档存在不等于资源已进入产物。

Framework wheel metadata distributes core and source components/bridges/contracts under `share/easy-windows-pack/frontend/`; generated app wheel metadata distributes compiled pages/assets. Validate both independently. EXEs start from `backend/src/demo.py`, include only compiled `output/frontend/` as frontend resources, and resolve PyInstaller-extracted paths. Source bundles retain backend, frontend, packages, scripts, docs and relevant configurations/entries. Inspect actual artifacts against their metadata and packaging lists.

`prepare-npm.mjs` 将 titlebar/components/frame 的权威资源生成到 `easywindowspack/assets`，把 backend core、`scripts/dev.py`、`build.cmd`、LICENSE 复制到 `create-ewp/templates/common`。六模板组合这些 prepared 资源与 common README；运行生成器不回读原仓库。复制的 runtime/script/assets 不手工维护；包根和 common 的说明文档按自身职责维护。公开 npm 名称与发布状态未确认；顺序和用户手动发布边界见 [npm 指南](npm-vite.md)。

Preparation generates runtime assets from authoritative titlebar/components/frame sources and copies backend core, development script, menu and license into generator common resources. All six templates compose these with the common README without reading the original checkout at generation time. Generated runtime/script/assets copies are not hand-maintained; package and common documentation retain their own ownership. Public npm names/publication are unverified; see the [npm guide](npm-vite.md) for ordering and user-operated publishing.

`npm run build` 默认 EXE，通过 `-- -w` / `-- --wheel` 选择 wheel；裸 `-w` 是 npm workspace 选项。开发菜单 `build` 保留测试 + wheel + EXE + bundle，底层 CLI `build` 保持测试 + wheel + bundle。产物进入 `output/` 分类目录，PyInstaller spec / 工作缓存进入 `build/`。详见[开发手册](development.md)。

`npm run build` defaults to EXE; `-- -w` / `-- --wheel` selects wheel, while bare `-w` belongs to npm workspace options. Menu `build` retains tests + wheel + EXE + bundle; low-level CLI `build` remains tests + wheel + bundle. Artifacts use categorized `output/` directories; PyInstaller specs/caches use `build/`. See [development](development.md).

## 迁移核对与文档维护 / Migration verification and documentation

迁移时核对安装配置、公开导入/exports、CLI 根目录与资源清单、Vite 相对生产 URL、EXE 冻结资源定位、测试路径及 CI 产物匹配。Vite 根与 fs allow 不得扩大为整仓库来修补断链。原生行为、构建与浏览器断言分别记录；[历史记录](integration-validation.md)和[目录迁移记录](build-validation.md)不证明本次 npm/Vite 通过，当前证据写入 [npm-validation.md](npm-validation.md)。

Check install mapping, public imports/exports, CLI resources, relative Vite production URLs, frozen resources and test/CI paths. Do not expand Vite serving to the whole checkout to fix paths. Record native behavior, builds and browser assertions separately; historical integration/layout records do not certify npm/Vite. Current evidence belongs in [npm-validation.md](npm-validation.md).

详细开发说明集中在 `docs/`，新增页面补 [docs/README.md](README.md) 导航；根 [index.md](../index.md) 记录复用入口，根 [design.md](../design.md) 记录视觉/交互摘要。接口变动同步 [桌面集成契约](desktop-integrations.md) 与 [类型契约](../frontend/contracts/README.md)；不要预读或复制整套 Skill 文档。

Maintain detailed development material under `docs/` and update its navigation. Keep reuse entry points in root `index.md` and visual/interaction summaries in root `design.md`. Synchronize interface changes with the integration and type contracts. Load only relevant skill references rather than duplicating or pre-reading the whole skill library.