<!-- easy-dev:start -->
# Easy Dev 路由

- 项目根目录：本文件所在 docs 目录的上一级；源码路径均相对项目根目录。
- 开发文档维护中心：[README.md](README.md)。
- 项目索引摘要：[index.md](index.md)。
- 设计摘要：[design.md](design.md)。
- 开发手册：[development.md](development.md)；目录边界与迁移：[architecture.md](architecture.md)。
- npm / Vite、六模板、公共 exports 与发布边界：[npm-vite.md](npm-vite.md)；当前验收：[npm-validation.md](npm-validation.md)。
- 框架适配：easy-windows-pack；仅在任务涉及该框架时加载对应分片。
- 主 Skill：[easy-dev](.agents/skills/easy-dev/SKILL.md)。

开发开始时，先读同目录 index/design 摘要与相关条目，再按 docs 导航读取本任务所需的开发文档，并显式读主 Skill、按任务选取分片；修改本路由或开发指引前同样先读取相关 Skill。docs/.agents 与 docs/.claude 不在工具默认 Skill 自动发现目录中，需由根标准入口引导读取。本仓库 Claude 路由复用唯一主 Skill；生成应用采用下述共用布局，不要求 Claude 用户生成 Codex 目录。已在上下文且未变化的不重复读，不预读全部文档或 Skill。

创建组件、样式或服务前查索引及真实实现；优先复用、保持模块边界与视觉/交互一致。相关实现改变时，在同一批修改中增量维护 docs 中的详细文档及 index/design 摘要链接；新增文档补 docs/README.md 导航。无关文档不要重写。

框架源码位于 backend/base/ewpcore，公开 Python 包仍为 easy_windows_pack。前端主入口为 frontend/index.html，frame/ewpframe、components、src、contracts 各司其职；旧 frontend/src/index.html 为弃用兼容入口。frontend 内 npm workspace 为 private，配置和锁文件也在 frontend；frontend/packages/easywindowspack 提供 ESM API 与 ewp CLI，frontend/packages/create-ewp 提供六套 Vanilla/Vue/React JS/TS 模板。React/Vue 规则仅按实际宿主技术栈加载。

在 frontend 内执行 npm run init / dev，或从根目录执行 npm --prefix frontend run init / dev；Vite 动态本机 URL 通过 EWP_DEV_URL 传给 debug pywebview。仓库与新生成项目均提供 help、ewp、menu、init、dev、browser、frontend、demo、wheel、exe、bundle、build、build:all、full-build、test、info、check 及 frontend:dev/build/preview、build:wheel/exe 别名。npm run build 与 startup.cmd build 均默认 EXE；完整链 test → wheel → exe → bundle 用 full-build / build:all / build --all。wheel 用 npm run build -- -w / -- --wheel，裸 -w 保留给 npm workspace。根 startup.cmd → scripts/startup.cmd → scripts/dev.py 提供 Python 菜单；ewp 无参数为帮助，ewp menu 打开 Node 菜单。生成模板附带 tests/npm-runtime.test.mjs，npm run check / ewp check / startup.cmd check 执行 3 项 Node runtime exports/config 检查。底层 Python CLI build 保留 test → wheel → bundle，不含 EXE；完整映射见开发手册。

语言与帮助以 frontend/packages/easywindowspack/language.mjs、bin/ewp.mjs、create-ewp/lib/cli.mjs 和 lib/create.mjs、scripts/dev.py 为准。创建第一问为 zh-CN / en，--lang 跳过此提示；保存为 frontend/package.json 的 ewp.language。输出优先级为 --lang → EWP_LANG → 保存值 → zh-CN。--yes 默认 ewp-app、vanilla、无 AI、不安装、不启动。自有内容使用所选单语；npm 的 Ok to proceed? 及 pip/Vite 等第三方输出不翻译。

生成应用选择任一 AI 时创建 docs/.easy-dev/agent.md 与 docs/.easy-dev/skills/easy-dev/SKILL.md；Codex / Claude 专属 Skill 分别在 docs/.agents / docs/.claude 内，通过共用 Skill 读取该指引。仅选 Claude 不创建 AGENTS.md 或 docs/.agents；Copilot 直接读共用内容。未选 AI 不生成资源，详见 [AI 布局](npm-vite.md#ai-资源布局--ai-resource-layout)。

scripts/prepare-npm.mjs 从 frontend、backend/base/ewpcore 和 scripts 单源生成包 assets 与 common runtime；不手工维护副本。生产 EXE 只携带 output/frontend 编译前端；框架 wheel 源资源和生成应用 wheel 编译资源分开核对 metadata。产物按 output 分类，build 仅作配置、暂存与缓存。backend/base/*.egg-info 是 setuptools 生成元数据，不属于 docs、不提交；.venv 内 dist-info 是正常安装元数据。Python 版本仍为 0.2.1。

两个 npm 包的 0.1.0 已发布，源码 npm manifests 与锁文件已同步为 0.1.1、尚未发布；新增语言/任务在源码可用，不能宣称当前 latest 已支持。发布后再升级 registry 安装；npm publish 由用户手动执行。真实实现及最新专题文档优先于旧 Skill 分片中的版本、构建语义与发布假设；历史验收不作为当前测试通过证据。

本入口不是大型检查表，不要求全仓扫描或多轮自检。用户要求与宿主有效规则优先；详细默认约定由主 Skill 单点维护。
<!-- easy-dev:end -->
