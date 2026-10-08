<!-- easy-dev:start -->
# Easy Dev 路由

- 项目根目录：本文件所在目录。
- 开发文档维护中心：[docs/README.md](docs/README.md)。
- 项目索引摘要：[index.md](index.md)。
- 设计摘要：[design.md](design.md)。
- 开发手册：[docs/development.md](docs/development.md)；目录边界与迁移：[docs/architecture.md](docs/architecture.md)。
- npm / Vite、六模板、公共 exports 与发布边界：[docs/npm-vite.md](docs/npm-vite.md)；当前验收：[docs/npm-validation.md](docs/npm-validation.md)。
- 框架适配：easy-windows-pack；仅在任务涉及该框架时加载对应分片。
- 主 Skill：[easy-dev](.agents/skills/easy-dev/SKILL.md)。

开发开始时，先读根 index/design 摘要与相关条目，再按 docs 导航读取本任务所需的开发文档，并读主 Skill、按任务选取分片；已在上下文且未变化的不重复读，不预读全部文档或 Skill。

创建组件、样式或服务前查索引及真实实现；优先复用、保持模块边界与视觉/交互一致。相关实现改变时，在同一批修改中增量维护 docs 中的详细文档及根 index/design 摘要链接；新增文档补 docs/README.md 导航。根 index/design 不必移动，无关文档不要重写。

框架源码位于 backend/base/ewpcore，公开 Python 包仍为 easy_windows_pack。前端主入口为 frontend/index.html，frame/ewpframe、components、src、contracts 各司其职；旧 frontend/src/index.html 为弃用兼容入口。根 npm workspace 为 private；packages/easywindowspack 提供 ESM API 与 ewp CLI，packages/create-ewp 提供六套 Vanilla/Vue/React JS/TS 模板。React/Vue 规则仅按实际宿主技术栈加载。

开发首选 npm run init / dev；Vite 动态本机 URL 通过 EWP_DEV_URL 传给 debug pywebview。npm run build 默认 EXE，wheel 用 npm run build -- -w / -- --wheel，裸 -w 保留给 npm workspace。根 build.cmd → scripts/dev.py 保留 legacy 菜单，browser 转 Vite、frontend 编译；其 build 与底层 CLI 保持各自兼容语义。

scripts/prepare-npm.mjs 从 frontend 及 backend/scripts 单源生成包 assets 与 common runtime；不手工维护副本。生产 EXE 只携带 output/frontend 编译前端；框架 wheel 源资源和生成应用 wheel 编译资源分开核对 metadata。产物按 output 分类，build 仅作配置、暂存与缓存。包名所有权与发布未确认，registry 命令仅描述发布后用法，npm publish 由用户手动执行。具体边界以 docs 与真实实现为准，历史验收不作为当前测试通过证据。

本入口不是大型检查表，不要求全仓扫描或多轮自检。用户要求与宿主有效规则优先；详细默认约定由主 Skill 单点维护。
<!-- easy-dev:end -->
