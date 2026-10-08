# easy-windows-pack 适配

触发：项目 `agent.md` 已启用该框架，或实际代码证实使用它，且任务触及窗口、组件、桥接、更新、Vite/HMR、npm workspace/exports、模板生成或打包。不要因单独使用 Vue、React 或 Vite 就加载本分片，也不要将可选框架规范应用于所有宿主。

以下定位对应本项目迁移后的目录约定；本地源码/契约可能继续更新，修改前核对相关入口，不把路径表当完整 API 清单或测试证据。

## 复用定位

| 能力 | 先查看 |
| --- | --- |
| 标题栏、窗口按钮、拖拽与 resize handle | `frontend/components/titlebar/window-frame.html`、`window-frame.css`；桥接在 `frontend/frame/ewpframe/window-frame.js` |
| 点阵进度、启动遮罩、错峰进入 | `frontend/components/desktop/desktop-components.js`、`desktop-components.css` |
| 更新客户端 | `frontend/frame/ewpframe/desktop-updates.js` |
| Python 窗口状态与系统适配 | `backend/base/ewpcore/controller.py`、`api.py`、`win32.py` |
| 宿主更新/授权协议与示例 | `docs/desktop-integrations.md`、`frontend/src/components.html` |
| 桌面装配与窗口示例 | `backend/src/demo.py`、`frontend/index.html`、`frontend/src/main.js`；旧 src/index.html 弃用 |
| 类型契约 | `frontend/contracts/index.d.ts`、`README.md` |
| npm 公共 runtime / 生命周期 / exports | `packages/easywindowspack/index.mjs`、`index.d.ts`、`package.json`、`README.md` |
| 可选 Vue / React 包装层 | `packages/easywindowspack/vue.mjs`、`react.mjs`；仅对应框架按需读取 |
| 六套 JS/TS 模板与交互 | `packages/create-ewp/lib/create.mjs`、`cli.mjs`、`templates/common` 及命中模板 |
| Vite、生成资源与 Node CLI | 根 `vite.config.mjs`、`scripts/prepare-npm.mjs`、`packages/easywindowspack/bin/ewp.mjs` |
| 开发菜单与分发资源 | 根 `build.cmd`、`scripts/dev.py`、`backend/base/ewpcore/cli.py`、`pyproject.toml` |
| 开发文档与迁移映射 | `docs/README.md`、`docs/npm-vite.md`、`docs/npm-validation.md`、`docs/development.md`、`docs/architecture.md` |

`backend/base/ewpcore` 是物理源码目录，不是新的公开导入名。`pyproject.toml` 通过 `package-dir` 将公开包 `easy_windows_pack` 映射到该目录；继续使用 `from easy_windows_pack import ...`，迁移后重新安装可编辑项目。前端页面消费组件/桥接，后端框架不反向依赖 `backend/src` 示例。旧路径对应关系集中在宿主 `docs/architecture.md`，不要在多个 Skill 中复制另一份迁移表。

## 开发入口

根 npm workspace 为 private，不发布根包。`easywindowspack@0.1.0` 是 ESM runtime 与 bin `ewp`；`create-ewp@0.1.0` 基于 `@clack/prompts`，提供 Vanilla / Vue / React × JS / TS 六模板。Node >=22.12、Python >=3.10，Windows 桌面需 WebView2；Vite 版本按真实 manifests 核对，当前仓库为 ^7.3.7。

首选 `npm run init` 初始化/复用 `.venv` 并安装 Python 开发与 npm 依赖，`npm run dev` 默认 Vite 动态本机端口 + debug pywebview，以 `EWP_DEV_URL` 传递实际 URL，支持 HMR；`npm run dev -- --web` 与 `frontend:dev` 不启动桌面。`frontend:build` 输出 `output/frontend` 并使用生产相对 URL。浏览器没有真实 native bridge。

`npm run build` 默认 EXE，`npm run build -- -w` / `-- --wheel` 选择 wheel，`-- -e` 显式 EXE；裸 `-w` 是 npm workspace 选项。根 `build.cmd` → `scripts/dev.py` 保留 legacy 菜单，`browser` 转 Vite、`frontend` 编译，菜单 `build` 保留 test + wheel + exe + bundle。底层 CLI / `build.ps1` 的 `build` 保留 test + wheel + bundle；`build-demo.ps1` 委托 `exe`。不要混用这些入口的默认语义。

`wheel`、`exe`、`bundle` 产物进入分类 `output/`，npm tarball 使用 `output/npm`，日志在 `output/logs`，PyInstaller 暂存、spec 与工作缓存在 `build/`。进度按完成阶段显示，不模拟耗时百分比。详情在宿主 `docs/npm-vite.md` 和 `docs/development.md` 维护。

## 公共 API 与生成资源

先查 `easywindowspack` exports 和类型，再使用 `mountFrame(container, options)`；用句柄 `update` 更新、`dispose` / `remove` 幂等释放，同容器重挂载释放旧实例。CSS 显式导入 `./frame.css` 或 `./desktop.css`；桌面工厂在 `./desktop-components.js`、更新客户端在 `./desktop-updates.js`。不从包内部 assets 路径绕过公开 exports。

`./vue` 与 `./react` 导出可选 `WindowFrame`；Vue >=3.3、React >=18 为 optional peers。六模板复用 `mountFrame`；模板自有 Frame / wrapFrame 层通过 Vue Teleport / React portal 保留 props、slot/children 的响应式与事件，不把业务 DOM 转静态 HTML。公共包装层与模板组合层分别核对；Vanilla 无需框架依赖。

`scripts/prepare-npm.mjs` 从 frontend components/frame 权威来源生成 runtime assets 与 `frame-template.mjs`，从 backend core / scripts 复制 common runtime、开发入口及 LICENSE；六模板组合 common 与自身资源，包含 common README。只改权威实现再 prepare，不手工维护 runtime/scripts/assets 副本，不假定模板 README 来自根 README。脚手架运行只读随包模板，不回读仓库；打包前检查 common 资源是否齐全。

## 保留平台边界

沿用窗口 API、现有 dispatcher 与原生拖拽/缩放路径；不要在业务页面重写窗口状态机，或随意并发调用 `evaluate_js`。修改生命周期/原生交互时做对应的 Windows 验证；无该环境就明确标未验证。

前端通过已公开桥接接口请求能力；授权、安装、重启等保留在宿主安全边界。不得把 UI 可见或动画完成当作权限通过、更新成功或前端真正就绪。

## 样式与生命周期

框架发布普通 CSS，推荐业务样式模块化 CSS/SCSS；不预设已有 Sass 构建。优先 `--ewp-*` 公开变量与受作用域约束的覆盖，不修改供应组件或全局标签样式来达到局部效果。已有 Tailwind 项目可以沿用，但留意 reset 对控件的影响。

原生组件每容器单实例；按真实 API 更新数据，在卸载时释放。实际使用的 Vue/React 包装层仅组合内容、桥接 props/events 与创建/更新/销毁，不重写底层算法；仅加载对应 Skill 分片。

点阵的 `value` 与 `remaining` 是不同语义，先核对调用契约；启动遮罩超时解除不代表初始化成功。更新客户端按实际支持的宿主能力调用，不假定取消、安装令牌或普通重启行为一致。

## 文档与分发

根 `docs/` 是开发文档维护中心：接口、窗口外观、开发手册和架构在对应页面增量维护，新文档补 `docs/README.md` 导航。将真实存在的组件/桥接入口登记到根 `index.md` 摘要；窗口主题与业务品牌分层记录到根 `design.md` 并链接 docs，不能把演示页主题变成所有宿主的强制配色，也无需移动根摘要文件。

仅将 Markdown 放进仓库不等于它会进入 source bundle 或 wheel。修改打包时核查显式资源列表、分层前端资源和 manifest 的新入口，分别检查产物内容；不要把 `.claude` 整个目录、私有配置、缓存或凭据打包。资源进入 wheel 也不等于 agent 会自动发现，消费项目仍需放置入口。历史验收记录保留日期与范围，不作为迁移后的测试成功证据。

生产 EXE 由 Python/PyInstaller 打包，前端只携带 `output/frontend` 的编译页面/assets，不装载未编译 Vue/React/TS 页面。框架 wheel metadata 仍分发核心与源组件/桥接；生成应用 wheel metadata 分发编译 assets，不因构建前执行 Vite 就混为一类。

`npm pack --workspace <name> --pack-destination output/npm` 是本地打包，不等于发布或 registry 安装通过。公共名称可用性/所有权先由用户确认；`npm create ewp@latest`、全局 `npm install -g easywindowspack` → `ewp create` 都只描述发布后用法。发布顺序 create-ewp → easywindowspack；本宿主发布由用户手动执行，agent 不运行 publish。当前 npm/Vite 证据写入 `docs/npm-validation.md`，旧 `docs/build-validation.md` 仅为历史 migration checks。
