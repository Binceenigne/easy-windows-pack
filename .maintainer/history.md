# 维护文档迁移与历史恢复

2026-10-20 将 docs 中的维护专题压缩整理到 `.maintainer/`，避免将框架维护工作流分发给应用开发者。重复英文/中文正文、过期“当前状态”和长验收叙述不再全文复制；指南保留命令差异、API 契约、安全约束、历史哈希和本地证据位置。

迁移前完整 Git 基线：`1967fef033fd77dd61a6bbc77b84d526f4cf2d56`。本次不创建提交；该基线不包含其他 agent 尚未提交的修改。

以下旧路径仅用于 Git 历史查询，并非当前文件链接：

| Git 基线中的路径 | 当前资料 |
| --- | --- |
| `docs/README.md` | [维护导航](README.md) |
| `docs/architecture.md` | [架构](architecture.md) |
| `docs/development.md` | [开发手册](development.md) |
| `docs/npm-vite.md` | [npm / Vite](npm-vite.md) |
| `docs/packaging.md` | [打包与安装](packaging.md) |
| `docs/desktop-integrations.md` | [桌面集成](desktop-integrations.md) |
| `docs/window-styles.md` | [窗口外观](window-styles.md) |
| `docs/npm-validation.md` | [npm 历史验收](npm-validation.md) |
| `docs/build-validation.md` | [目录迁移验收](build-validation.md) |
| `docs/integration-validation.md` | [集成验收](integration-validation.md) |
| `docs/integration-todo.md` | [集成清单](integration-todo.md) |
| `docs/agent.md`（原维护路由） | [维护路由](agent.md)；当前 docs/agent.md 面向应用开发 |

在仓库根用 `git show 1967fef033fd77dd61a6bbc77b84d526f4cf2d56:docs/packaging.md` 查看完整旧文档，替换冒号后的路径可读取上表任一原文。后续历史可用 `git log --all -- docs .maintainer` 定位。忽略目录 `build/`、`output/` 中的报告不保证随 Git 存在，不能把路径记载当作报告已重新执行。

`docs/.easy-dev/install-state.json` 中的原始安装哈希继续作为安装基线保留，不将此次本地修订伪装成原安装内容。