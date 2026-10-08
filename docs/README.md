# 当前与历史验收 / Current and historical validation

当前 npm/Vite 工作流见 [npm 验收记录 / npm validation](npm-validation.md)，只记录实际执行的证据；尚未实测的条目标为待验收。[目录迁移与构建验证 / Layout migration](build-validation.md) 为历史 migration checks，其通过数与旧 EXE 不证明新的 npm/Vite 工作流通过。

# 开发文档 / Developer documentation

根 `docs/` 是本项目开发文档的维护中心。环境、命令、架构、迁移、设计细则与验收记录在这里维护；根 [index.md](../index.md) 和 [design.md](../design.md) 保留摘要与链接，无需迁移它们。

Root `docs/` is the development documentation center. Keep detailed setup, commands, architecture, migration, design rules and validation records here. Root [index.md](../index.md) and [design.md](../design.md) remain short summaries and links.

| 文档 / Document | 用途 / Purpose |
| --- | --- |
| [npm / Vite 双语指南 / Bilingual guide](npm-vite.md) | workspace、发布状态、六模板、CLI、HMR、公共 API、编译资源与手动发布 / Workspaces, publication status, templates, CLI, HMR, API, assets and manual publishing |
| [npm / Vite 验收 / Validation](npm-validation.md) | 本轮独立证据、待验收项与源码同步事项 / Separate current evidence, pending checks and source alignment |
| [历史目录迁移 / Historical layout validation](build-validation.md) | legacy 目录迁移、开发菜单与旧产物证据 / Legacy migration, menu and artifact evidence |
| [开发手册 / Development](development.md) | 初始化、双语菜单、浏览器预览、桌面调试、构建、日志和故障定位 / Setup, menu, preview, debugging, builds and troubleshooting |
| [架构与迁移 / Architecture and migration](architecture.md) | 目录职责、依赖边界、公开包映射和旧路径迁移 / Ownership, dependencies, public package mapping and path migration |
| [窗口外观 / Window styles](window-styles.md) | Windows/macOS 外观、token 来源及公共交互 / Appearance, token sources and shared interaction |
| [桌面集成 / Desktop integrations](desktop-integrations.md) | 可选宿主适配器、组件与更新接口契约 / Host adapters, components and update contracts |
| [历史集成验收 / Historical integration validation](integration-validation.md) | 2026-09-18 的检查记录与当前复验入口 / Dated evidence and current reproduction entry points |
| [历史集成清单 / Historical integration checklist](integration-todo.md) | 原集成任务范围和当时的未完成项 / Original task scope and historical outstanding work |
| [项目索引摘要 / Implementation summary](../index.md) | 当前实现定位与复用入口 / Current implementation and reuse entry points |
| [设计摘要 / Design summary](../design.md) | 设计约定及详细文档入口 / Design conventions and detailed references |

类型文件与紧邻资源的简短说明保留在 [frontend/contracts/](../frontend/contracts/README.md)，接口说明由本导航关联；不要复制出另一份开发手册。面向使用者的 API 和托盘示例继续保留在 [中文 README](../README.md) / [English README](../README.en.md)。

Type declarations and short asset-local notes remain in [frontend/contracts/](../frontend/contracts/README.md). Link to them rather than duplicating the development guide. Public API and tray examples remain in the bilingual root READMEs.

相关代码或目录变动时，同批更新对应的 `docs/` 页面及根摘要链接；新增详细文档时补本导航。记录验证的日期、范围、结果和限制，历史通过记录不能作为当前改动的测试成功证据。开发规则入口见 [agent.md](../agent.md)，只按任务加载所需 Skill 分片。

Update the affected page and summary links with the implementation change. Add new detailed documents to this navigation. Record validation date, scope, result and limitations; historical passes do not certify a later change. Start with [agent.md](../agent.md) and load only task-relevant skill references.