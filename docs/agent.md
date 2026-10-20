<!-- easy-dev:start -->
# Easy Dev · 框架开发路由

- 项目根目录：本文件所在 docs 目录的上一级；源码路径均相对项目根目录。
- 开发文档维护中心：[README.md](README.md)。
- 应用使用者摘要：[index.md](index.md) / [design.md](design.md)，仅在业务页面或 UI 规则任务中读取与维护。
- 开发手册：[development.md](development.md)；目录边界与迁移：[architecture.md](architecture.md)。
- npm / Vite、六模板、公共 exports 与发布边界：[npm-vite.md](npm-vite.md)；当前验收：[npm-validation.md](npm-validation.md)。
- 应用构建、安装配置与 wheel API：[packaging.md](packaging.md)。
- 框架适配：easy-windows-pack；仅在任务涉及该框架时加载对应分片。
- 主 Skill：[easy-dev](.agents/skills/easy-dev/SKILL.md)。

此路由服务本仓库的框架开发者。开发开始时，按任务读取相关架构、开发、npm、打包或接口专题，并显式读主 Skill、按任务选取分片；修改本路由或开发指引前同样先读取相关 Skill。docs/.agents 与 docs/.claude 不在工具默认 Skill 自动发现目录中，需由根标准入口引导读取。本仓库 Claude 路由复用唯一主 Skill；生成应用采用下述共用布局，不要求 Claude 用户生成 Codex 目录。已在上下文且未变化的不重复读，不预读全部文档或 Skill。

创建组件、样式或服务前查相关源码及最接近的实现；优先复用、保持模块边界与视觉/交互一致。共享网格保持横平竖直、边缘与文字基线对齐，同类控件统一间距尺寸，以层级、留白和克制配色组织内容；交互优雅直觉、顺序自然、反馈及时，键盘焦点可见且顺序合理，返回/取消路径明确，关闭弹窗后恢复焦点。相关实现改变时，同批增量维护对应 docs 专题，新增文档补 docs/README.md 导航。index/design 留给应用使用者填写真实业务入口和 UI 规则；框架内部改动不自动扩写它们，不要求数量盘点。技能示例保持精简，生成器用户模板由 creator 的权威实现维护。

框架源码位于 backend/base/ewpcore，公开 Python 包仍为 easy_windows_pack。前端主入口为 frontend/index.html，frame/ewpframe、components、src、contracts 各司其职；旧 frontend/src/index.html 为弃用兼容入口。frontend 内 npm workspace 为 private，配置和锁文件也在 frontend；frontend/packages/easywindowspack 提供 ESM API 与 ewp CLI，frontend/packages/create-ewp 提供六套 Vanilla/Vue/React JS/TS 模板。React/Vue 规则仅按实际宿主技术栈加载。

在 frontend 内执行 npm run init / dev，或从根目录执行 npm --prefix frontend run init / dev；Vite 动态本机 URL 通过 EWP_DEV_URL 传给 debug pywebview。仓库与新生成项目均提供 help、ewp、menu、init、dev、browser、frontend、demo、wheel、exe、app、installer、bundle、build、build:all、full-build、test、info、check 及 frontend:dev/build/preview、build:wheel/exe/app 别名。npm run build 与 startup.cmd build 均默认 EXE；完整链 test → wheel → exe → bundle 用 full-build / build:all / build --all。wheel 用 npm run build -- -w / -- --wheel，裸 -w 保留给 npm workspace。根 startup.cmd → scripts/startup.cmd → scripts/dev.py 提供 Python 菜单；0.1.3 的 ewp 无参数或仅带 --lang 输出紧凑构筑核品牌 ASCII 欢迎屏及 ewp create/dev/build/menu 四条常用命令，版本动态读取 runtime manifest；ewp -h/help/--help 仍为完整教程，欢迎屏与帮助均无需项目。ewp menu 在项目内打开 Node 菜单。生成模板附带 tests/npm-runtime.test.mjs，npm run check / ewp check / startup.cmd check 执行 3 项 Node runtime exports/config 检查。底层 Python CLI build 保留 test → wheel → bundle，不含 EXE；完整映射见开发手册。

语言与帮助以 frontend/packages/easywindowspack/language.mjs、bin/ewp.mjs、create-ewp/lib/cli.mjs 和 lib/create.mjs、scripts/dev.py 为准。创建第一问为 zh-CN / en，--lang 跳过此提示；保存为 frontend/package.json 的 ewp.language。输出优先级为 --lang → EWP_LANG → 保存值 → zh-CN。--yes 默认 ewp-app、vanilla、无 AI、不安装、不启动。自有内容使用所选单语；npm 的 Ok to proceed? 及 pip/Vite 等第三方输出不翻译。

欢迎屏与创建向导共享 create-ewp/terminal；向导标题版本读取 creator manifest。标题、问题、框架/语言/AI 选项、执行阶段与成功/取消/错误反馈有颜色；步骤只计实际执行阶段（仅创建 1 步、含安装 2 步、安装并启动 4 步）。设置 NO_COLOR 优先关闭；否则 FORCE_COLOR=0 关闭，其他已设置值开启；均未设置时仅 TTY 且 TERM 不为 dumb 自动启用，管道默认关闭。细则见 [终端外观](npm-vite.md#终端外观与执行阶段--terminal-appearance-and-execution-stages)。

生成应用选择任一 AI 时创建 docs/.easy-dev/agent.md 与 docs/.easy-dev/skills/easy-dev/SKILL.md；Codex / Claude 专属 Skill 分别在 docs/.agents / docs/.claude 内，通过共用 Skill 读取该指引。仅选 Claude 不创建 AGENTS.md 或 docs/.agents；Copilot 直接读共用内容。未选 AI 不生成资源，详见 [AI 布局](npm-vite.md#ai-资源布局--ai-resource-layout)。

scripts/prepare-npm.mjs 从 frontend、backend/base/ewpcore 和 scripts 单源生成包 assets 与 common runtime；不手工维护副本。生产 EXE 只携带 output/frontend 编译前端；框架 wheel 源资源和生成应用 wheel 编译资源分开核对 metadata。产物按 output 分类，build 仅作配置、暂存与缓存。backend/base/*.egg-info 是 setuptools 生成元数据，不属于 docs、不提交；.venv 内 dist-info 是正常安装元数据。Python 0.3.0 wheel 已在本地构建，独立安装与冻结向导 E2E（ygft7h_d）通过，PyPI 未发布；2026-10-10 历史 Python 全测 245 passed、Node 145 passed / 1 skipped、六模板 pack 8/8 passed（m01nHq），不作为 npm 0.1.3 本轮结果，证据与 wheel 哈希见 [验收记录](npm-validation.md)。新增 packaging/installer 模块和公共构建 API 见打包指南。

app 按项目根 ewp.pack.json 构建 onefile / onedir，installer 构建应用及安装包；--config、--mode、--installer 可用于相应构建任务。npm run build -- --mode onedir 等显式打包参数转到配置构建并输出 output/apps；无打包参数的 legacy build/exe 仍输出 output/exe。新生成项目提供默认 ewp.pack.json，省略配置文件的 Python 构建使用内置默认值，不写文件。安装配置与实际 CLI 参数以 packaging.md 及解析器为准。

截至 2026-10-20，create-ewp 与 easywindowspack 的 0.1.3 已正式公开发布；两包版本与 dist-tags.latest 均为 0.1.3，registry tarball 逐字节匹配最终归档，SHA-1 / SHA-256 已确认。manifests、锁文件及两处 ^0.1.3 依赖已对齐。本轮 Node 145 passed / 5 conditional skips；独立 registry 安装、双语欢迎屏/帮助/创建/Skill、Vanilla 检查和构建、latest 生成 Vue TS 的检查/类型检查/构建均通过；全局 CLI 已升级。详细证据见 [验收记录](npm-validation.md)。发布、推送与提交按用户授权和当前任务范围执行，已获授权不重复确认。npm install -g easywindowspack@latest / npm create ewp@latest 当前使用公开的 0.1.3，也可用 @0.1.3 固定版本。真实实现及最新专题文档优先于旧 Skill 分片中的版本、构建语义与发布假设；历史验收不作为当前测试通过证据。

本入口不是大型检查表，不要求全仓扫描或多轮自检。用户要求与宿主有效规则优先；详细默认约定由主 Skill 单点维护。
<!-- easy-dev:end -->
