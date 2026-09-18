# Optional desktop integrations / 可选桌面集成

## Python

```python
from easy_windows_pack import ApiToolsAdapter, TurtleClawAdapter, create_window

# Existing API_TOOLS WebApi / UiWebApi instance, supplied by the host:
instance = create_window(config, url=page_url, app_api=ApiToolsAdapter(host_api))
# Or the existing TurtleClaw DesktopSettingsBridge instance:
instance = create_window(config, url=page_url, app_api=TurtleClawAdapter(bridge))
bridge._window = instance.window  # TurtleClaw host wiring, not framework-owned
```

Use one host adapter per window. `DesktopApi(*adapters)` supports non-overlapping
capabilities; duplicate method names raise `ValueError`. Both update hosts have
`check_for_updates` with different arguments and must not be combined directly.
No source project is imported or bundled. Missing host methods are omitted from
`get_adapter_capabilities()`. Methods retain the original signatures, results,
exceptions and host-side checks. No HTTP endpoint or authentication bypass is
introduced. Expose these privileged methods only to a trusted local frontend.

每个窗口选择一个宿主适配器。`DesktopApi` 只组合不重名的能力；重复方法报错。
适配器不导入、不打包两个源项目，不暴露其他公开或私有方法。缺失方法不会伪造成功，
可通过 `get_adapter_capabilities()` 查询。所有参数、返回对象、异常和权限检查均由宿主保持。
这些是可信本地桌面桥接口，不是匿名 HTTP 管理接口。

| Adapter | Methods and contract / 方法与契约 |
| --- | --- |
| API_TOOLS management | `get_state()`; `add_key(name, value)`; `delete_key(key_id)`; `refresh_now(trace_id=None)` |
| API_TOOLS settings | `update_thresholds(thresholds)`; `update_rate_limit_progress_mode(mode)`; `update_refresh_intervals(foreground, background)`; `update_app_preferences(update_frequency, close_action, startup_enabled, title_bar_mode=None, background_ui_mode=None)` |
| API_TOOLS assets | `initialize_assets(retry=False)`; `get_asset_status()`; `complete_initialization()` when supported by the supplied bridge |
| API_TOOLS updates | `check_for_updates()`; `download_update()`; `defer_update_restart()`; `restart_update()`; `dismiss_update_prompt()`; `ignore_update_version(version)`; `restart_app()` |
| TurtleClaw updates | `get_update_state()`; `check_for_updates(include_prereleases=False)`; `download_update()`; `cancel_update_download()`; `install_update(token)`; `confirm_update_ready()` |
| TurtleClaw restart | `TurtleClawAdapter(bridge, restart=callback)` optionally exposes `restart_app()`; absent unless explicitly supplied |

API_TOOLS `get_state().update` is the update snapshot (`percent`); update commands
usually return `{ok, update}`. TurtleClaw returns its snapshot directly (`progress`,
`install_token`, `can_install`); installation returns `{accepted: true}` after helper
readiness. Its real bridge enforces backend ownership, active-task checks and token
validation. Automatic checking never implies automatic downloading/installing.
Only call `confirm_update_ready()` after the real frontend and settings load.

API_TOOLS 的进度字段为 `percent`，TurtleClaw 为 `progress`。TurtleClaw 安装必须显式
传入宿主签发的一次性令牌；宿主保留助手就绪、退出、校验、回滚与重启流程。
当前 TurtleClaw 没有普通重启公开方法，所以框架仅接收显式重启回调，绝不调用
`reset_all_data` 代替重启。回调负责停工、关闭和使用正确的独立进程环境启动。

## Frontend

Load `desktop-components.css`, `desktop-components.js` and, optionally,
`desktop-updates.js`. They have no Vue, Node, network or icon dependencies.
The source bundle includes all frontend resources; wheels install them under
`share/easy-windows-pack/frontend` in the Python environment.

```javascript
const {createMatrixProgress, createEntrance, createBootCurtain} = EasyWindowsPackComponents;
const progress = createMatrixProgress(progressElement, {value: 42, remaining: 58, size: 4});
progress.update({value: 70, remaining: 30});
const entrance = createEntrance(workspaceElement);
const curtain = createBootCurtain(curtainElement, {
  onComplete: () => entrance.reveal()
});
// Resolve real initialization first. Render errors outside the pending workspace.
curtain.setReady();
// During unmount: progress.dispose(); curtain.dispose(); entrance.dispose();
```

Put `data-ewp-entry="pending"` on the workspace in the initial HTML, before first
paint, and `data-ewp-enter` on its entrance sections. The controller manages inert
and ARIA while pending/arriving and restores the original attributes. Do not set
permanent inert/aria-hidden on the root unless it should remain inaccessible.
The curtain does not mark your services ready: its 12-second watchdog only removes
the decoration and invokes `onComplete({reason: 'timeout'})`. The host must keep
unready workspace content guarded and display a loading/error state separately.

首屏 HTML 就应包含 `data-ewp-entry="pending"`，避免先显示完整工作台再开始动画。
组件使用 1100ms 渐入、160ms 错峰，遮罩至少展示 850ms、700ms 收起。
通过 `prefers-reduced-motion` 或 `html[data-motion="off"]` 关闭动画。
点阵支持 2/3/4 阶、稳定伪随机局部填充、颜色阈值、无限额和 ResizeObserver；
空间不足自动回退线性进度。提供 `label` / `unlimitedLabel` 本地化可访问名称。
销毁时务必调用 `dispose()` 释放观察器、事件和计时器。

```javascript
const updates = createDesktopUpdateClient({
  host: 'turtleclaw', // or 'api-tools'
  onState: state => renderUpdateState(state),
  onError: error => renderUpdateError(error)
});
await updates.markFrontendReady({checkOnStartup: true, includePrereleases: false});
// User commands: check(), download(), cancel(), install(token), restart().
// Missing capabilities reject; API_TOOLS has no cancel_update_download.
// install(token) must follow explicit user confirmation, never a polling callback.
// Call updates.dispose() when the owning frontend unmounts.
```

启动检查默认关闭，前端真正就绪后才 ACK 和按选项检查；空闲轮询 4 秒、忙碌 500ms。
客户端保留各宿主状态形状，不统一改写业务字段。管理接口通过原桥调用。
轮询只读取状态，不会自动下载、安装或重启；错误通过回调或 Promise 拒绝报告。

## Provenance and boundary / 来源与边界

Reviewed source: API_TOOLS `backend/web_api.py`, `runtime.py`,
`controller_mixins/settings.py`, `updates.py`, `platform.py` RPC allowlist;
`frontend/scripts/modules/10-dashboard-rendering.js` stableProgressSequence and
renderProgressBar; `_quota-dashboard.scss`. TurtleClaw `backend/updates.py`,
`reset_runtime.py` DesktopSettingsBridge, `runtime_process.py`, `desktop_app.py`,
`src/composables/useAppUpdates.js`, `App.vue`, `BrandCurtain.vue`, release-r15/r16 CSS.
The framework preserves its existing single JS dispatcher and minimize/hide
deadlock avoidance. No host window/controller implementation was transplanted.

窗口 `controller.py`、`create.py`、`api.py` 和 `window-frame.*` 未改动。
本任务不验证真实线上更新、EXE 替换或原生重启；测试使用受控桥，不会关闭用户程序。