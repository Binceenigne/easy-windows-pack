# 可选桌面集成 / Optional desktop integrations

[维护导航](README.md) · [类型契约](../frontend/contracts/README.md) · [完整历史原文](history.md)

公开导入为 easy_windows_pack，宿主在 [backend/src/demo.py](../backend/src/demo.py) 装配。`create_window(config, url=page_url, app_api=ApiToolsAdapter(host_api))` 或 TurtleClawAdapter(bridge) 接入已有宿主；TurtleClaw 的 bridge._window 由宿主绑定到 instance.window。框架不导入或打包两个外部源项目。

每窗口选择一个适配器；DesktopApi(*adapters) 只组合不重名能力，重复方法抛 ValueError。两个更新宿主的 check_for_updates 参数不同，不直接组合。缺失方法从 get_adapter_capabilities() 省略，不伪造成功。保留原参数、返回、异常、权限检查，桥接只供可信本地前端，不是 HTTP 管理端点。

| 宿主 | 方法契约 |
| --- | --- |
| API_TOOLS 管理 | get_state(); add_key(name, value); delete_key(key_id); refresh_now(trace_id=None) |
| API_TOOLS 设置 | update_thresholds(thresholds); update_rate_limit_progress_mode(mode); update_refresh_intervals(foreground, background); update_app_preferences(update_frequency, close_action, startup_enabled, title_bar_mode=None, background_ui_mode=None) |
| API_TOOLS 资源 | initialize_assets(retry=False); get_asset_status(); complete_initialization()（宿主支持时） |
| API_TOOLS 更新 | check_for_updates(); download_update(); defer_update_restart(); restart_update(); dismiss_update_prompt(); ignore_update_version(version); restart_app() |
| TurtleClaw 更新 | get_update_state(); check_for_updates(include_prereleases=False); download_update(); cancel_update_download(); install_update(token); confirm_update_ready() |
| TurtleClaw 重启 | 仅显式 TurtleClawAdapter(bridge, restart=callback) 暴露 restart_app() |

API_TOOLS 的 get_state().update 为快照，进度 percent，命令通常返回 {ok, update}。TurtleClaw 直接返回含 progress/install_token/can_install 的快照，助手就绪后安装返回 {accepted: true}；宿主负责所有权、活跃任务、一次性 token、退出/校验/回滚/重启。真正前端和设置加载后才 confirm_update_ready。普通重启不能用 reset_all_data 替代；显式回调负责停工、关闭与正确独立环境启动。

## 前端组件与更新

npm 导入 easywindowspack/desktop.css、desktop-components.js 和可选 desktop-updates.js。源码浏览器示例为 [components.html](../frontend/src/components.html)；旧静态宿主可使用 EasyWindowsPackComponents。组件无 Vue/网络/图标依赖，源码由 prepare 生成 npm assets；框架 wheel 的分层资源依 metadata，应用 wheel 使用编译资源。

createMatrixProgress(element, {value, remaining, size})：value 与 remaining 不同，支持 2/3/4 阶、稳定局部填充、阈值、无限额、ResizeObserver，小空间回退线性；label/unlimitedLabel 提供可访问名称。update 更新，卸载 dispose。

createEntrance(workspace) 与 createBootCurtain(curtain, {onComplete}) 组合。初始 HTML 使用 data-ewp-entry="pending"，子区域 data-ewp-enter，避免首屏闪现；组件管理 pending/arriving 的 inert/ARIA 并恢复原值，不永久隐藏根。真实服务 ready 后才 setReady；12 秒 watchdog 只撤装饰并回调 reason=timeout，不证明服务成功，宿主另保留加载/错误保护。

历史默认动效为渐入 1100ms、错峰 160ms、遮罩至少 850ms、收起 700ms；具体值以 CSS/实现为准，不写入业务 design。prefers-reduced-motion 或 html[data-motion="off"] 可关动画。所有观察器、事件和计时器均在 dispose 释放。

createDesktopUpdateClient({host: 'turtleclaw' 或 'api-tools', onState, onError}) 在真实就绪后 markFrontendReady({checkOnStartup, includePrereleases})；启动检查默认关。命令为 check/download/cancel/install(token)/restart；缺能力拒绝，API_TOOLS 无 cancel_update_download。安装由用户明确操作触发，不在轮询中调用。空闲轮询 4 秒、忙碌 500ms，只读取状态，不自动下载/安装/重启；保留宿主字段形状，卸载 dispose。

## 来源与验证限制

原集成参考外部 API_TOOLS WebApi/RPC allowlist/settings/updates/matrix，以及 TurtleClaw DesktopSettingsBridge/updater/process launcher/入口 UI；不是当前仓库路径。未移植宿主窗口控制器，保留框架串行 dispatcher 和最小化/隐藏边界。受控桥测试不验证线上下载、EXE 替换、数据库或真实重启；旧记录见 [集成验收](integration-validation.md)。