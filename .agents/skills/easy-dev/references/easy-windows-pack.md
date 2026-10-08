# easy-windows-pack 适配

触发：项目 `agent.md` 已启用该框架，或实际代码证实使用它，并且任务触及窗口、原生组件、桥接、更新或打包。不要因使用 Vue 就加载，也不要强制框架改用 Vue。

以下定位基于 2026-10-08 阅读的公开 main；本地源码/契约可能更新，修改前核对相关入口，不把这份快照当完整 API 清单。

## 复用定位

| 能力 | 先查看 |
| --- | --- |
| 标题栏、窗口按钮、拖拽与 resize handle | `frontend/window-frame.html`、`.css`、`.js` |
| 点阵进度、启动遮罩、错峰进入 | `frontend/desktop-components.js`、`.css` |
| 更新客户端 | `frontend/desktop-updates.js` |
| Python 窗口状态与系统适配 | `easy_windows_pack/controller.py`、`api.py`、`win32.py` |
| 宿主更新/授权协议与示例 | `docs/desktop-integrations.md`、`examples/components.html` |
| 分发资源 | `easy_windows_pack/cli.py`、`pyproject.toml` |

## 保留平台边界

沿用窗口 API、现有 dispatcher 与原生拖拽/缩放路径；不要在业务页面重写窗口状态机，或随意并发调用 `evaluate_js`。修改生命周期/原生交互时做对应的 Windows 验证；无该环境就明确标未验证。

前端通过已公开桥接接口请求能力；授权、安装、重启等保留在宿主安全边界。不得把 UI 可见或动画完成当作权限通过、更新成功或前端真正就绪。

## 样式与生命周期

框架发布普通 CSS，推荐业务样式模块化 CSS/SCSS；不预设已有 Sass 构建。优先 `--ewp-*` 公开变量与受作用域约束的覆盖，不修改供应组件或全局标签样式来达到局部效果。已有 Tailwind 项目可以沿用，但留意 reset 对控件的影响。

原生组件每容器单实例；按真实 API 更新数据，在卸载时释放。Vue 包装层仅桥接 props/events 与创建/更新/销毁，不重写底层算法。

点阵的 `value` 与 `remaining` 是不同语义，先核对调用契约；启动遮罩超时解除不代表初始化成功。更新客户端按实际支持的宿主能力调用，不假定取消、安装令牌或普通重启行为一致。

## 文档与分发

将真实存在的组件/桥接入口登记到项目 `index.md`；窗口主题与业务品牌分层记录到 `design.md`，不能把演示页主题变成所有宿主的强制配色。

仅将 Markdown 放进仓库不等于它会进入 source bundle 或 wheel。修改打包时核查显式资源列表，分别检查产物内容；不要把 `.claude` 整个目录、私有配置、缓存或凭据打包。资源进入 wheel 也不等于 agent 会自动发现，消费项目仍需放置入口。
