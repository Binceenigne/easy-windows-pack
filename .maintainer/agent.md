# 框架维护路由

项目根目录为本目录的上一级。根 AGENTS.md / CLAUDE.md 将框架维护任务路由到这里；按任务读取 [维护导航](README.md) 中相关的架构、开发、npm、打包或接口指南，再定位真实实现。

- Python 框架在 `backend/base/ewpcore/`，公开导入保持 `easy_windows_pack`；应用装配在 `backend/src/`。
- npm workspace、锁文件和 Vite 配置在 `frontend/`；运行 npm 时进入该目录或使用 `npm --prefix frontend`。生成资产的权威来源及构建差异见 [npm 指南](npm-vite.md) 和 [开发手册](development.md)。
- `docs/` 仅保留应用开发指引、index/design、Skill 及图片。维护资料写入本目录；框架修复不触发应用摘要扩写，不将发布状态、历史验收或内部源码清单放进使用者 Skill。
- 修改使用者指引时显式读取 [主 Skill](../docs/.agents/skills/easy-dev/SKILL.md) 和命中的分片。它是给应用开发者使用的资源，不是框架维护的前置检查表。docs 中的 Skill 不依赖默认自动发现。
- 改权威源码，不手工维护 prepare 生成的 runtime/assets 副本。按任务做必要验证，报告实际结果与限制，历史记录不能代替本轮测试。
- 多 agent 协作时重读待改片段，保留已有修改，按用户指定的文件与职责范围工作。用户要求和已有授权优先；本文不要求发布、提交或全仓审计。