# 框架维护资料 / Framework maintenance

本目录服务 easy-windows-pack 的维护者。应用开发者使用 [docs 指引](../docs/agent.md) 和按需加载的 Skill；docs 只保存 Skill、引导、精简应用摘要与图片，不承载框架开发手册或验收日志。

| 资料 / Guide | 用途 / Scope |
| --- | --- |
| [维护路由](agent.md) | 开发入口与修改边界 / Contributor entry and scope |
| [多后端与窗口](backends.md) | 后端选择、任务驱动、分发、安装与工作区 / Backend tasks and window behavior |
| [架构](architecture.md) | 源码职责、公开包名、迁移与分发 / Architecture and distribution |
| [开发手册](development.md) | 环境、任务、终端进度和故障定位 / Setup, tasks and troubleshooting |
| [npm / Vite](npm-vite.md) | 模板、AI 布局、公共 exports、prepare 和发布 / Generator and npm workflow |
| [打包与安装](packaging.md) | schema、GUI/silent、运行库、hooks、卸载和 Python API / Packaging contract |
| [桌面集成](desktop-integrations.md) | 宿主适配器、组件、更新协议 / Host integration contracts |
| [窗口外观](window-styles.md) | 样式来源与可选主题 / Styles and optional themes |
| [npm 历史验收](npm-validation.md) | 各版本历史证据、哈希和报告位置 / Dated evidence |
| [目录迁移验收](build-validation.md) | 旧目录和构建阶段证据 / Historical layout checks |
| [集成验收](integration-validation.md) / [集成清单](integration-todo.md) | 原集成任务记录 / Historical integration |
| [迁移与历史恢复](history.md) | 完整旧文档的 Git 基线 / Original document recovery |

本次将原 docs 的 12 篇维护专题压缩迁入本目录，合并重复的双语段落和版本状态，保留可操作的指南及历史索引。完整原文保存在 Git，恢复方法见 [history.md](history.md)。本目录不由 prepare 复制到 npm 或生成应用，也不加入 wheel/EXE 资源。源码 bundle 不包含本目录；其中的维护链接需在完整 Git 仓库阅读。

These condensed guides retain operational contracts and dated evidence. Full bilingual originals remain in Git at the baseline linked above. Maintenance material is excluded from npm, generated apps, wheels, executables and the source bundle. Root READMEs remain the bilingual quick start.