# 当前与历史验收 / Current and historical validation

当前 npm/Vite 工作流见 [npm 验收记录 / npm validation](npm-validation.md)，只记录实际执行的证据；尚未实测的条目标为待验收。[目录迁移与构建验证 / Layout migration](build-validation.md) 为历史 migration checks，其通过数与旧 EXE 不证明新的 npm/Vite 工作流通过。

2026-10-10 当前验收：Python 全测 **245 passed**；Node **145 passed，1 skipped**；0.1.2 六模板 pack 集成 **8/8 passed**（`m01nHq`）。Python **0.3.0 wheel 已在本地构建并验证**，独立安装后的 onefile/onedir 与冻结安装向导 E2E **passed**（`ygft7h_d`），涵盖 159–163 字符安装路径、40 个空目录及用户文件保留；报告与 wheel SHA-256 见 [本轮记录](npm-validation.md#2026-10-10-安装向导与安全修复阶段--installer-wizard-and-safety-fixes)。/ Current validation: Python **245 passed**, Node **145 passed, 1 skipped**, and six-template 0.1.2 pack integration **8/8 passed** (`m01nHq`). The local Python **0.3.0 wheel is built and validated**; independent installation, both packaging modes and the frozen wizard E2E **passed** (`ygft7h_d`), covering 159–163-character paths, 40 empty directories and user-file preservation. See the current record for reports and the wheel SHA-256.

npm 两包 **0.1.2 待发布**：`npm login` 返回 **HTTP 401**，等待用户认证；Python **0.3.0 未发布到 PyPI**。本地构建与验收已完成，发布状态单独记录。/ Both npm packages at **0.1.2 remain pending publication**, awaiting user authentication after `npm login` returned **HTTP 401**. Python **0.3.0 has not been published to PyPI**; local build and validation are complete.

此前 [welcome 本地验收 / Local welcome checks](npm-validation.md#2026-10-09-welcome-改版本地验收--local-welcome-validation) 记录 npm 单测 **141 passed**、最终六模板 pack **8/8 passed**。当前两包已升级为 **0.1.2 待发布**，包含六模板新版 SVG welcome；这些本地记录与 0.1.1 的 CLI / registry 历史验收不代表 0.1.2 已发布或通过发布验证。Both packages are now **0.1.2, pending publication**, including the new SVG welcome across all six templates. Earlier local checks and historical 0.1.1 registry evidence do not establish 0.1.2 publication or release validation.

# 开发文档 / Developer documentation

根 `docs/` 是本项目文档与 AI 资源的维护中心。框架环境、命令、架构、迁移、打包与验收在专题维护；[index.md](index.md) 和 [design.md](design.md) 为应用使用者保留少量业务入口和待填 UI 规则。[agent.md](agent.md) 声明框架开发者的项目根目录与按需路由，内部开发不自动扩写业务摘要。

Root `docs/` is the documentation and AI resource center. Framework setup, commands, architecture, migration, packaging and validation belong in their guides. [index.md](index.md) and [design.md](design.md) contain a few application entry points and UI rules for app authors to fill in. [agent.md](agent.md) routes framework development without automatically expanding those application summaries.

| 文档 / Document | 用途 / Purpose |
| --- | --- |
| [npm / Vite 双语指南 / Bilingual guide](npm-vite.md) | workspace、发布状态、六模板、CLI、HMR、公共 API、编译资源与发布流程 / Workspaces, publication status, templates, CLI, HMR, API, assets and publication |
| [npm / Vite 验收 / Validation](npm-validation.md) | 本轮独立证据、待验收项与源码同步事项 / Separate current evidence, pending checks and source alignment |
| [历史目录迁移 / Historical layout validation](build-validation.md) | legacy 目录迁移、开发菜单与旧产物证据 / Legacy migration, menu and artifact evidence |
| [开发手册 / Development](development.md) | 初始化、双语菜单、浏览器预览、桌面调试、构建、日志和故障定位 / Setup, menu, preview, debugging, builds and troubleshooting |
| [应用与安装包 / Packaging](packaging.md) | onefile/onedir、配置、功能/运行库、GUI/silent、hooks、卸载及 wheel API / Build modes, config, features/runtimes, GUI/silent, hooks, uninstall and wheel API |
| [架构与迁移 / Architecture and migration](architecture.md) | 目录职责、依赖边界、公开包映射和旧路径迁移 / Ownership, dependencies, public package mapping and path migration |
| [窗口外观 / Window styles](window-styles.md) | Windows/macOS 外观、token、welcome 范围与品牌资产单源生成 / Appearance, tokens, welcome scope and authoritative brand assets |
| [桌面集成 / Desktop integrations](desktop-integrations.md) | 可选宿主适配器、组件与更新接口契约 / Host adapters, components and update contracts |
| [历史集成验收 / Historical integration validation](integration-validation.md) | 2026-09-18 的检查记录与当前复验入口 / Dated evidence and current reproduction entry points |
| [历史集成清单 / Historical integration checklist](integration-todo.md) | 原集成任务范围和当时的未完成项 / Original task scope and historical outstanding work |
| [应用入口 / Application entry points](index.md) | 起始示例与待补充的业务页面、组件或服务 / Starter examples and application entries to fill in |
| [应用 UI 规则 / Application UI rules](design.md) | 用户填写真实产品的主题与交互约定 / App authors' actual product theme and interaction rules |

类型文件与紧邻资源的简短说明保留在 [frontend/contracts/](../frontend/contracts/README.md)，不要复制出另一份开发手册。[中文 README](../README.md) / [English README](../README.en.md) 保留快速入门；完整前端 API 在 [npm 指南](npm-vite.md)，宿主集成在 [桌面集成](desktop-integrations.md)，Python 托盘接口见 [源码](../backend/base/ewpcore/tray.py)。

Type declarations and short asset-local notes remain in [frontend/contracts/](../frontend/contracts/README.md). Root READMEs provide quick starts; see the [npm guide](npm-vite.md) for the frontend API, [desktop integrations](desktop-integrations.md) for host integration, and [tray source](../backend/base/ewpcore/tray.py) for Python tray APIs.

相关代码或目录变动时，同批更新对应专题；业务入口或 UI 规则改变才维护 index/design，无需数量盘点。新增详细文档时补本导航。记录验证的日期、范围、结果和限制，历史通过记录不能作为当前改动的测试成功证据。开发规则入口见 [agent.md](agent.md)，只按任务加载所需 Skill 分片。

Update affected guides with implementation changes; update index/design only when application entries or UI rules change, without inventory counts. Add new guides to this navigation. Record validation date, scope, result and limitations; historical passes do not certify a later change. Start with [agent.md](agent.md) and load only task-relevant skill references.

本仓库 AI 资源在 `docs/.agents`、`docs/.claude`、`docs/.easy-dev`；根 AGENTS.md / CLAUDE.md 为标准薄入口。修改开发指引前也须显式读取相关 Skill；docs 下的 Skills 不属于默认自动发现目录。本仓库 [Claude 路由](.claude/skills/easy-dev/SKILL.md) 复用 [主 Skill](.agents/skills/easy-dev/SKILL.md)。生成应用另用 `docs/.easy-dev/agent.md` 与共用 Skill：Codex / Claude 专属 Skill 均转到共用内容，仅选 Claude 不创建 Codex 目录。AI 默认全不选，详见 [npm 指南](npm-vite.md#ai-资源布局--ai-resource-layout)。

This checkout keeps AI resources under docs and thin standard entries at the root. Read relevant skills before editing guidance too. The checkout's Claude router reuses its main skill. Generated apps instead share `docs/.easy-dev/agent.md` and a common skill; both tool-specific skills route to shared content, and Claude alone creates no Codex directory. AI resources are opt-in; see the [npm guide](npm-vite.md#ai-资源布局--ai-resource-layout).