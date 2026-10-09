# create-ewp

Create a self-contained Easy Windows Pack app / 创建独立桌面项目。
Node >=22.12.0, Python >=3.10; Windows desktop requires WebView2.

ESM; interactive prompts use `@clack/prompts`. Both npm packages are **published
at 0.1.1 and available from the registry**. On 2026-10-09, `@latest` creation and
Vue TS installation, checks, and frontend build smoke tests passed. See the
validation record linked below.
基于 @clack/prompts 的 ESM 生成器。两包 0.1.1 已发布且 registry 可用；2026-10-09 的 @latest 创建与 Vue TS 项目安装、检查及前端构建冒烟已通过，详见文末验收记录。

Run `npm create ewp@latest` without global installation. In the 0.1.1 flow, the
first prompt selects human language (`zh-CN` / `en`), then project name,
Vanilla/Vue/React, programming language (JavaScript/TypeScript), optional AI tools,
npm installation, and desktop startup. Explicit `--lang` skips the first prompt.
Alternatively, global `easywindowspack` provides `ewp create` via `create-ewp/cli`.
无需全局安装即可创建。0.1.1 第一项为人类语言，JS/TS 是后续编程语言选项；显式 --lang 跳过语言提示。全局 CLI 可用 `npm install -g easywindowspack@latest` 安装或升级。

0.1.1 non-interactive example / 0.1.1 非交互示例：

`npm create ewp@latest "My App" -- --lang en --template react-ts --ai claude --no-install --no-start --yes`

Options: `--lang zh-CN|en`, `--ai codex,claude,copilot|none`, `--template`, `--dir`, `--yes`/`-y`, `--no-install`, `--no-start`,
`--install`, `--start`, `--help`/`-h`. All six templates are supported:
`vanilla`, `vanilla-ts`, `vue`, `vue-ts`, `react`, `react-ts`.

Non-interactive/`--yes` defaults: `ewp-app`, Vanilla JavaScript, no AI tools, no install, no start.
Language follows `--lang` → `EWP_LANG` → saved project language → `zh-CN`.
非交互语言按此优先级解析，无设置时默认简体中文。
AI 默认全不选，可多选 codex / claude / copilot；不安装、不启动是非交互默认值。目录可包含空格，npm 名称会独立规范化。

## Language and AI guidance / 语言与 AI 指引

Creation saves the selected language as `ewp.language` in `frontend/package.json`.
First-party CLI output resolves **explicit `--lang` → `EWP_LANG` → saved project value → `zh-CN`**.
In an existing project, overrides are temporary and do not change the saved value.
Generated README, AI guidance, and demo text use the creation language; CLI
overrides do not rewrite them. Third-party **npm / pip / Vite logs remain native**.
创建语言保存到 frontend/package.json 的 ewp.language。自有帮助、菜单及提示按上述优先级选语言；临时覆盖不改配置、不重写 README/AI/demo。第三方日志原样输出。

After selection, first-party content uses one language. npm's `Ok to proceed?`
is a third-party confirmation and is not translated or controlled by generator `--yes`.
语言选择后自有内容单语输出；npm 自己的确认不翻译，生成器 --yes 不控制该确认。

Shared guidance is `docs/.easy-dev/agent.md`, with a shared skill under
`docs/.easy-dev/skills/easy-dev/SKILL.md`. Only selected tool directories and
standard entries are generated: Codex `AGENTS.md` routes to `docs/.agents/skills/easy-dev/SKILL.md`;
Claude `CLAUDE.md` routes to `docs/.claude/skills/easy-dev/SKILL.md`; Copilot
`.github/copilot-instructions.md` reads shared content directly. Tool skills load
the shared guidance. **Claude alone does not require a Codex directory.** Skills
under docs require explicit entry routing and are outside default discovery.
共用指引与 Skill 放 docs/.easy-dev，各工具读取共用内容；只生成所选工具目录，Claude 可独立选择。AI 未选时不生成这些资源。完整布局见文末仓库指南。

## Destination and initialization / 目标与初始化

Targets must be empty, including `.git`; files, symlinks and Windows-reserved names are rejected.
非空目录绝不覆盖；取消提示返回 130，不创建项目。

Installation runs `npm install` inside frontend only. Starting runs installation if necessary,
then `npm run init` and `npm run dev`; Python initialization is explicit.
安装选项仅安装 npm 依赖；启动选项额外初始化 Python `.venv`，再启动桌面。

The new generated app uses published `easywindowspack@^0.1.1` and Vite ^7.3.7,
with Vue 3.5 or React 19 when selected. Registry installation smoke tests passed
for the Vue TS project. Vue/React templates
own Frame composition layers, using Teleport/portals for reactive slots/children,
prop updates and cleanup. All six templates share `mountFrame`; browser preview
does not provide native controls. Runtime optional peers support Vue >=3.3 and
React >=18; these are not mandatory Vanilla dependencies.

## Local development / 本地开发

From the source checkout root / 从源码仓库根目录运行：

```powershell
npm --prefix frontend install
npm --prefix frontend run prepare:npm
node frontend/packages/create-ewp/bin/create-ewp.mjs "../My App" --lang en --template vue-ts --no-install --no-start
```

Generation uses local prepared templates. Generated apps depend on published
`easywindowspack@^0.1.1`; local checks can also use existing tarballs or explicit
overrides. Local generation is not registry validation.
本地生成使用 prepared 模板，生成应用依赖已发布的 runtime；本地验收也可使用已有 tarball 或明确本地依赖，不能替代 registry 安装验证。

Use `npm create ewp@latest` for new apps;
upgrade the global CLI with `npm install -g easywindowspack@latest`, or the app runtime
with `npm install easywindowspack@^0.1.1` inside frontend. Dependency upgrades do not
rewrite existing scripts, READMEs, AI guidance, or demos.
Replace `@latest` with `@0.1.1` to pin the version.
可用上述命令安装或创建，固定版本时将 @latest 换成 @0.1.1；旧项目任务 scripts 与指引需自行同步。

Inside the project's frontend directory with available dependencies; from the project root use `npm --prefix frontend` / 项目依赖可解析后，在 frontend 内执行；从项目根执行时使用 `npm --prefix frontend`：

```powershell
npm install
npm run help
npm run info
npm run menu
npm run ewp -- demo --debug
npm run init
npm run dev
npm run dev -- --web
npm run frontend:dev
npm run frontend:build
npm run frontend:preview
npm run build
npm run build -- -w
npm run build -- --wheel
npm run build -- -e
npm run build:all
```

`init` creates/reuses Python `.venv` and installs Python development and npm
dependencies. `dev` waits for Vite on a dynamic loopback port and supplies its URL
via `EWP_DEV_URL` to debug pywebview, with frontend HMR. Web mode starts no desktop.
`frontend:build` compiles into `output/frontend/` using relative production URLs.
`build` defaults to Windows EXE; wheel/EXE flags follow npm's `--` separator.
Bare `-w` is npm workspace selection. `npm run build:all`, `npm run build -- --all`,
`ewp full-build`, and `ewp build --all` run **test → wheel → exe → bundle**.
Root `startup.cmd` delegates through
`scripts/startup.cmd` to `scripts/dev.py`; other build wrappers live under scripts.
`browser` delegates to Vite, `frontend` compiles, and `demo --debug` builds then
launches desktop without HMR. `dev` has HMR; `frontend:preview` previews compiled output.
Global `ewp` without arguments or with `-h` shows help without a project. Use `ewp menu`
inside a project; root `startup.cmd` without arguments also opens the menu.
Both the checkout and generated apps provide npm scripts: `help`, `ewp`, `menu`,
`init`, `dev`, `browser`, `frontend`, `demo`, `wheel`, `exe`, `bundle`, `build`,
`build:all`, `full-build`, `test`, `info`, `check`, plus `frontend:dev`,
`frontend:build`, `frontend:preview`, `build:wheel`, and `build:exe`.
Only TypeScript templates provide `typecheck`. Generated templates include
`tests/npm-runtime.test.mjs`; `npm run check`, `ewp check`, and `startup.cmd check`
run three Node runtime exports/config checks: public API/CSS, Vite configuration,
and application manifest/HTML entry points. With global installation,
run `ewp <task>` at the project root; otherwise use `npm --prefix frontend run ewp -- <task>`.
默认 build 为 EXE，包含 startup.cmd build；完整链用 full-build / build:all / build --all，npm 对应 npm run full-build / npm run build:all，根脚本对应 startup.cmd full-build / startup.cmd build:all。EXE 和完整构建仅支持 Windows。生成模板附带 tests/npm-runtime.test.mjs，check 执行 3 项 Node runtime exports/config 检查。底层 Python CLI build 仍为 test → wheel → bundle，不包含 EXE。

Python `*.egg-info/` is ignored installation/build metadata under `backend/base/`,
not documentation. The empty-root `package-dir` mapping `"" = "backend/base"`
locates it; `easy_windows_pack` maps separately to `backend/base/ewpcore`.
Python 安装 metadata 位于 backend/base，按 *.egg-info/ 忽略，不手工维护或提交。
`.venv/Lib/site-packages/*.dist-info/` is normal installed-package metadata,
including editable installs; do not move it to docs or commit it.
虚拟环境内的 dist-info 属于正常安装元数据，不应迁入 docs 或提交。

## Prepare contract / 公共资源契约

The repository prepare step must copy the authoritative Python runtime from
`backend/base/ewpcore/` into `templates/common/backend/base/ewpcore/`, and
`scripts/dev.py` into `templates/common/scripts/dev.py` before packing.
The same step copies root `startup.cmd`, `scripts/startup.cmd` and runtime `LICENSE` into common, preserving their relative paths.
Every template composes common runtime/scripts and selects common `README.md` or
`README.en.md` by creation language, emitting the chosen text as app `README.md`.
No repository source is read at generation time. Missing prepared resources fail
before the destination is written. Do not hand-maintain a second Python runtime.
主项目 prepare 生成公共资源；脚手架运行时只读取随包模板，缺失资源会提前报错。

The package owns only the `create-ewp` binary. `ewp create` delegation belongs to
the `easywindowspack` CLI integration, avoiding a conflicting global `ewp` binary.
全局 `ewp create` 转调用由运行库 CLI 集成，本包不占用 `ewp` 命令。

The desktop entry resolves `EWP_DEV_URL` for development and
`output/frontend/index.html` for production. The prepare script's EXE task must
include the built `output/frontend` under the same path, rather than uncompiled
Vue/React sources. This resource contract also applies to app wheel assets.
EXE 任务须按相同路径携带编译后的前端资源；不能把源码当作发行页面。
The repository framework wheel is distinct: its metadata retains framework core
and source components/bridges/contracts, while generated app wheel metadata
includes compiled frontend assets under the app's share directory.
框架 wheel 源资源与生成应用 wheel 编译资源采用各自 metadata，分别验收。

## Pack and publish / 打包与发布

From the private workspace under frontend, ensure project-root `output/npm` exists, then pack locally:

```powershell
npm run prepare:npm
npm pack --workspace create-ewp --pack-destination ../output/npm
npm pack --workspace easywindowspack --pack-destination ../output/npm
```

The frontend workspace is private. Source npm manifests and the lockfile are
aligned at 0.1.1, and both packages have been published by the user. Historical
local pack checks and passed Vue TS registry smoke tests are recorded in the
validation record. This README update changes Git source only. Published tarballs
cannot be overwritten and are not repacked or republished for this update.
For future versions, publish `create-ewp` before `easywindowspack`.
Packing does not prove registry installation or native execution.
两包 0.1.1 已由用户发布且 registry 可用；历史本地 pack 检查与已通过的 Vue TS registry 冒烟见验收记录。此次 README 仅更新 Git 源码，已发 tarball 不可覆盖，不重新 pack 或发布。后续新版本发布顺序为 create-ewp → easywindowspack。

Repository documentation: [bilingual guide](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-vite.md),
[validation record](https://github.com/Binceenigne/easy-windows-pack/blob/main/docs/npm-validation.md).
These are repository docs, not files shipped alongside this package README.