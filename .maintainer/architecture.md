# 架构与目录边界 / Architecture

[维护导航](README.md) · [开发手册](development.md) · [npm / Vite](npm-vite.md) · [完整旧文档](history.md)

| 路径 | 职责 |
| --- | --- |
| `backend/base/ewpcore/` | Python 框架、窗口 API/控制器、Win32、托盘和宿主适配器；不依赖示例业务 |
| `backend/base/ewpcore/packaging.py`、`installer.py` | 配置构建与独立标准库安装/卸载引擎 |
| `backend/src/` | 使用公开 Python API 的桌面入口与宿主装配 |
| `frontend/frame/ewpframe/` | 桥接、状态同步和更新客户端 |
| `frontend/components/titlebar/`、`desktop/` | 标题栏与独立桌面组件 |
| `frontend/index.html`、`frontend/src/` | Vite 主入口和应用/示例；旧 src/index.html 是兼容入口 |
| `frontend/contracts/` | [类型契约](../frontend/contracts/README.md)，不是第二套维护手册 |
| `frontend/packages/easywindowspack/` | ESM runtime、公共 exports、可选 Vue/React wrappers、ewp CLI |
| `frontend/packages/create-ewp/` | 六套 JS/TS 生成模板与 creator |
| `frontend/package.json`、锁文件、Vite 配置 | private workspace、依赖和前端构建边界 |
| `scripts/`、根 `startup.cmd` | 开发编排、资源准备与兼容入口 |
| `docs/` | 应用开发指引、最小 index/design、Skill 和图片 |
| `.maintainer/` | 框架开发、发布与历史资料；根 AGENTS/CLAUDE 指向这里 |
| `tests/` | Python、Node、浏览器验证 |
| `output/`、`build/` | 产物/日志与暂存/缓存，不作为权威来源 |

依赖方向为应用装配 → 公开 Python 包 → pywebview/Win32，以及前端页面 → 组件/桥接 → 宿主 API。框架不反向导入示例，不接管宿主授权、更新或重启业务。既有串行 JS dispatcher、最小化/隐藏防死锁、原生拖拽/缩放约定属于运行时边界，文档迁移不改变它们。

## 包名与资源

公开包仍是 `easy_windows_pack`，分发名是 `easy-windows-pack`，物理源码在 `backend/base/ewpcore/`。[pyproject.toml](../pyproject.toml) 的 `package-dir` 同时映射空根到 backend/base、公开包到 ewpcore；迁移后重新 editable 安装，不用 `import ewpcore` 绕过映射。`backend/base/*.egg-info` 与 `.venv/Lib/site-packages/*.dist-info` 都是正常生成元数据，不移入 docs，不手工编辑或提交。

Vite 以 frontend 为页面根，`base: './'` 编译到 output/frontend。开发使用真实动态 URL 的 `EWP_DEV_URL`；不要为修复链接将静态服务范围扩大到整个仓库。

| 分发 | 资源契约 |
| --- | --- |
| npm runtime | prepare 从 titlebar/components/frame 单源生成 assets、模板模块、CSS 和类型 |
| npm creator / 生成应用 | common runtime、开发脚本、启动入口、LICENSE 与所选模板；只读随包资源；AI 明确 opt-in |
| 框架 wheel | 公开 Python 包与 share/easy-windows-pack/frontend 下的源组件、桥接、契约 |
| 应用 wheel | 自身 metadata 声明的编译页面/assets，不等同框架 wheel |
| EXE | backend/src/demo.py 入口，前端仅 output/frontend 编译资源 |
| source bundle | 显式源码/文档/配置清单及安全配置引用；排除环境、缓存和旧产物 |

`.maintainer/` 不加入上述默认分发；source bundle 的维护导航需在完整 Git 仓库阅读。确切清单以 CLI、metadata、prepare 与打包代码为准，文档存在不代表已经被打包。图片仍保留在 [docs/images](../docs/images/)：它们是说明资源，不是生成项目的设计规范。

## 历史路径定位

旧 `easy_windows_pack/` → backend/base/ewpcore；examples/demo.py → backend/src/demo.py；examples 页面 → frontend 主入口及 src 组件示例。旧 frontend 平铺的窗口 HTML/CSS → components/titlebar，JS 桥接/更新 → frame/ewpframe；桌面组件 → components/desktop；ui-contracts → frontend/contracts。旧根 packages、npm 配置 → frontend；构建包装脚本 → scripts，根启动入口为 startup.cmd。根 AI 资源及摘要曾迁到 docs；此次仅维护资料移至 `.maintainer`。完整逐文件迁移表见 [Git 恢复入口](history.md)。