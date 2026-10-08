<!-- easy-dev:start -->
# Easy Dev 路由

- 项目根目录：本文件所在目录。
- 项目索引：[index.md](index.md)。
- 设计记录：[design.md](design.md)。
- 框架适配：easy-windows-pack；仅在任务涉及该框架时加载对应分片。
- 主 Skill：[easy-dev](.agents/skills/easy-dev/SKILL.md)。

开发开始时，先读两份项目文档的摘要与相关条目，再读主 Skill，按当前任务选取分片；已在上下文且未变化的不重复读。

创建组件、样式或服务前查索引及真实实现；优先复用、保持模块边界与视觉/交互一致。相关实现改变时，在同一批修改中增量维护 index.md 和 design.md；无关文档不要重写。

本入口不是大型检查表，不要求全仓扫描或多轮自检。用户要求与宿主有效规则优先；详细默认约定由主 Skill 单点维护。
<!-- easy-dev:end -->
