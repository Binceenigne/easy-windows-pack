# npm 与 Vite / npm and Vite

[维护导航](README.md) · [开发手册](development.md) · [打包](packaging.md) · [历史验收](npm-validation.md)

frontend 是 private workspace；easywindowspack 提供 ESM runtime 和 ewp CLI，create-ewp 提供六模板生成器、create-ewp/cli、create-ewp/terminal，仅拥有自己的 binary。Node >=22.12，桌面/打包另需 Python >=3.10 和 Windows WebView2。Vue >=3.3、React >=18 是可选 peers，Vanilla 不要求安装它们。版本以当前 manifest 和 registry 为准，不从旧文档推断已发布。

## 创建与选项 / Creation and options

用户入口为 `npm create ewp@latest`；全局 `npm install -g easywindowspack@latest` 后可用 `ewp create`。例如 `npm create ewp@latest "My App" -- --lang en --template react-ts --no-install --no-start`。已有应用在 frontend 升级 easywindowspack 依赖不会自动覆盖其 scripts/dev.py、README、AI 指引或示例。

交互顺序为人类语言 zh-CN/en、项目名、Vanilla/Vue/React、JS/TS、AI、安装、启动。模板为 vanilla/vue/react 与对应 -ts。显式 --lang 跳过首问，语言保存为 frontend/package.json 的 ewp.language；输出优先级与第三方日志规则见 [开发手册](development.md)。

`--dir` 可指定含空格目录；`--ai codex,claude,copilot|none` 多选且默认 none；`--yes` 默认 ewp-app、vanilla、不安装、不启动。`--install/--no-install`、`--start/--no-start` 控制后续步骤；start 与 no-install 冲突。目标必须为空，只有 .git 也拒绝；目录链接/junction、非法 Windows 名称、模板路径越界和符号链接均拒绝。取消返回 130，不创建项目。此类路径安全与 opt-in 约定不由文档模板更改。

## 终端外观与执行阶段 / Terminal appearance and execution stages

runtime 欢迎屏和 creator 使用共享 terminal 工具，各自从 manifest 读取版本。NO_COLOR → FORCE_COLOR → TTY/TERM 决定颜色；创建阶段只计实际执行的 1/2/4 步。Python 固定底栏、plain 回退及日志边界见 [开发手册](development.md)。这些行为的过去验收在 [记录](npm-validation.md)，不是新版本已发布的依据。

## AI 资源布局 / AI resource layout

任一 AI 被选择才生成 docs/.easy-dev/agent.md 与 docs/.easy-dev/skills/easy-dev/SKILL.md。Codex 根 AGENTS.md 指向 docs/.agents/skills/easy-dev/SKILL.md；Claude 根 CLAUDE.md 指向 docs/.claude/skills/easy-dev/SKILL.md；两者路由到共用 Skill。Copilot 的 .github/copilot-instructions.md 直接读共用内容。仅选 Claude 不生成 Codex 目录，未选 AI 不生成这些资源；docs 内 Skill 需显式读取。

生成 index 最多 7 个非空行，design 最多 4 个非空行：实际业务待用户填写，链接真实前端入口、宿主入口与样式。不得将框架示例配色、紧凑布局、welcome 或计数器写为业务设计，也不预装发布、全仓盘点或验收流程。AI 指引保留网格/基线对齐、间距尺寸、层级留白、克制配色、直觉交互和焦点规则；不自动扩充摘要、不生成维护日志。

本仓库的根维护入口指向 [.maintainer/agent.md](agent.md)；[docs/agent.md](../docs/agent.md) 与 [主 Skill](../docs/.agents/skills/easy-dev/SKILL.md) 面向应用开发者。主 Skill 的 Vue/React/架构分片按实际技术栈使用。Skill 示例与生成器字符串各自保持精简，不复制维护路由。

## 公共 API 与组合 / Public APIs and composition

| 导入 | 能力 |
| --- | --- |
| easywindowspack | mountFrame、getWindowApi、setWindowStyle、setTitleBarMode、call、isSupportedResizeDirection |
| easywindowspack/frame.css | 窗口外壳样式 |
| easywindowspack/desktop.css | 桌面组件样式 |
| easywindowspack/desktop-components.js | createMatrixProgress、createBootCurtain、createEntrance |
| easywindowspack/desktop-updates.js | createDesktopUpdateClient |
| easywindowspack/vue、easywindowspack/react | 可选 WindowFrame 包装层 |

mountFrame(container, options) 返回 frame、content、update、幂等 dispose/remove；同容器重挂载释放旧实例。content 字符串按文本处理，业务 DOM 用节点。实例 update 影响该外壳，全局 setWindowStyle 影响已挂载外壳。原生标题栏切换通过桥接重建窗口。

Vue Teleport / React portal 保留 slot/children 的事件与响应式；模板自己的 Frame/wrapFrame 与包的可选 wrappers 分别核对，不把组件树序列化为 HTML。浏览器只验证前端，宿主更新/窗口行为见 [桌面集成](desktop-integrations.md)。

## 单源 prepare、检查与发布 / Preparation and release

[prepare-npm.mjs](../scripts/prepare-npm.mjs) 从 frontend components/frame 生成 runtime assets 与 frame-template.mjs；从 backend/base/ewpcore、scripts/dev.py、startup.cmd、scripts/startup.cmd、LICENSE 生成 creator common runtime。品牌 SVG 从 frontend/src/assets 复制。common README 是模板自有来源，按语言输出为生成项目的 README.md，不复制框架根 README。维护目录不在复制清单中；生成器只读随包资源，缺必需资源时写入前失败。

从根 `npm --prefix frontend run prepare:npm` 准备；在 frontend 内 `npm pack --workspace create-ewp --pack-destination ../output/npm` 及对应 easywindowspack 命令生成归档。prepack 使用相同 prepare。不要手工改生成副本。本地生成入口为 `node frontend/packages/create-ewp/bin/create-ewp.mjs`，未发布版本验收应使用匹配本地 tarball。

检查可按任务选择 `node --test tests/create-ewp.test.mjs`、`node --test tests/npm-runtime.test.mjs`、`node tests/npm-pack.integration.mjs`、`node tests/npm-first-run.integration.mjs`。集成验证实际归档、六模板 Vite 编译/三套 TS、Chrome/HMR、首次 init 和资源边界，按各入口要求配置环境；不要用旧通过数代替本轮结果。

发布前对齐两包 manifests、锁文件、runtime → creator 和生成应用 → runtime 的依赖版本；顺序 create-ewp → easywindowspack。pack 不等于 publish，更不等于 registry 安装或 EXE 已运行。发布由具体用户授权决定；需要时校验 registry 版本、dist-tags、归档字节/哈希及干净安装。历史归档与完整发布过程见 [验收记录](npm-validation.md) 和 [Git 基线](history.md)。