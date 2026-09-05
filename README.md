# easy-windows-pack

`easy-windows-pack` 是一个面向 Windows + pywebview 的可复用 WebView 桌面窗口框架。它把窗口外壳从业务应用中拆出来，提供：

- 原生系统标题栏、默认自绘标题栏、最小自绘标题栏三种模式
- 最小化、最大化/还原、关闭三个窗口按钮
- 自绘标题栏拖拽移动
- 最大化窗口拖动时自动还原，并保留鼠标相对标题栏的位置
- Windows 原生 Aero Snap / Windows 11 Snap Layouts
- 左、右、上、下和四个角共八个方向的边缘调整大小
- 置顶、隐藏、显示、窗口尺寸设置
- 可选关闭策略：退出进程或隐藏窗口
- 业务 API 委托，窗口 API 与应用 API 可以共用同一个 pywebview `js_api`
- 不依赖前端框架的 HTML/CSS/JavaScript 组件

当前包位于 `easy-windows-pack/`，目标分支为 `easy-windows-pack`。

## 目录结构

```text
easy-windows-pack/
├── easy_windows_pack/
│   ├── __init__.py       # 公共导出
│   ├── api.py            # 暴露给 JavaScript 的 API
│   ├── config.py         # WindowConfig 和标题栏模式
│   ├── controller.py     # 窗口状态、按钮、关闭和拖拽控制
│   ├── create.py         # pywebview 窗口创建器
│   └── win32.py          # Win32 非客户区拖拽、缩放、吸附和置顶
├── frontend/
│   ├── window-frame.html # 可复制的标题栏与缩放句柄标记
│   ├── window-frame.css  # 窗口外壳样式
│   └── window-frame.js   # 事件绑定、状态同步和 API 包装
├── examples/
│   ├── demo.py
│   └── index.html
├── tests/test_window_pack.py
├── pyproject.toml
└── requirements.txt
```

## 安装

在应用自己的虚拟环境中安装：

```powershell
pip install -e .\easy-windows-pack
```

或者只安装运行时依赖：

```powershell
pip install -r .\easy-windows-pack\requirements.txt
```

运行示例：

```powershell
python .\easy-windows-pack\examples\demo.py
```

运行包测试：

```powershell
python -m unittest discover -s .\easy-windows-pack\tests -p "test_*.py" -v
```

## 最小集成

### 1. 创建窗口

```python
from pathlib import Path

import webview

from easy_windows_pack import WindowConfig, create_window

ROOT = Path(__file__).parent

config = WindowConfig(
    title="My WebView App",
    titlebar_mode="default",
    width=1200,
    height=800,
    min_width=720,
    min_height=480,
    background_color="#ffffff",
    close_action="exit",
)

instance = create_window(
    config,
    url=(ROOT / "frontend" / "index.html").as_uri(),
)
webview.start(gui="edgechromium")
```

`create_window` 返回 `WindowInstance`，包含：

- `instance.window`：原始 pywebview 窗口
- `instance.controller`：Python 窗口控制器，可在托盘、更新器或业务代码中调用
- `instance.api`：传给 JavaScript 的 `WindowApi`

### 2. 使用前端组件

将以下三个文件复制到自己的静态资源目录：

- `frontend/window-frame.html`
- `frontend/window-frame.css`
- `frontend/window-frame.js`

在页面中引入 CSS，并把 `window-frame.html` 中的外壳放在业务内容外层：

```html
<link rel="stylesheet" href="window-frame.css">

<div data-ewp-window-frame data-titlebar-mode="default">
    <!-- 将 window-frame.html 的完整内容放在这里，或直接复制其结构 -->
    <main data-ewp-content>
        <h1>业务页面</h1>
    </main>
</div>

<script src="window-frame.js"></script>
```

更实际的做法是直接复制 `window-frame.html` 的完整结构，因为它包含八个 resize handle 和三个按钮。业务页面应放在 `[data-ewp-content]` 内。

### 3. 接收状态

包会自动调用：

```javascript
window.easyWindowsPackApplyState({
    maximized: false,
    visible: true,
    titleBarMode: "default"
});
```

按钮和拖拽事件由 `window-frame.js` 自动绑定。业务代码可以调用：

```javascript
await window.easyWindowsPack.call('set_always_on_top', true);
await window.easyWindowsPack.setTitleBarMode('minimal');
```

没有 pywebview 时，调用会返回：

```javascript
{ ok: false, error: 'pywebview API is not ready' }
```

## WindowConfig 参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `title` | `WebView Application` | Windows 窗口标题，也用于无 native handle 时查找窗口 |
| `titlebar_mode` | `default` | `native`、`default` 或 `minimal` |
| `width` / `height` | `920` / `680` | 初始客户区尺寸，会被最小/最大值约束 |
| `min_width` / `min_height` | 按模式推导 | 最小窗口尺寸；minimal 默认 `220 x 96`，其他模式默认 `260 x 120` |
| `max_width` / `max_height` | `8192` / `8192` | 最大窗口尺寸 |
| `resizable` | `True` | 是否允许窗口缩放 |
| `shadow` | `True` | pywebview 窗口阴影 |
| `always_on_top` | `False` | 是否创建为置顶窗口 |
| `background_color` | `#ffffff` | WebView/native form 背景色 |
| `close_action` | `exit` | `exit` 退出窗口，`hide` 隐藏窗口并保留进程 |
| `maximize_on_start` | `False` | 创建后是否立即最大化 |

所有数值都会被归一化。无效值回退到默认值，超出范围的值会被裁剪。

## 三种标题栏模式

### `native`

使用 Windows / pywebview 原生标题栏：

```python
WindowConfig(titlebar_mode="native")
```

pywebview 参数为：

```python
frameless=False
easy_drag=True
```

此模式下操作系统负责标题栏、三按钮、边缘缩放和 Snap Layouts，因此 HTML 组件会隐藏自绘标题栏与 resize handle。

### `default`

使用标准高度的自绘标题栏：

```python
WindowConfig(titlebar_mode="default")
```

Python 侧创建窗口时使用 `frameless=True`，HTML 三按钮通过 `window_action` 转发到 Python，拖拽通过 Win32 `HTCAPTION` 转发。

### `minimal`

使用 24px 高的紧凑自绘标题栏：

```python
WindowConfig(titlebar_mode="minimal")
```

它与 `default` 共享全部行为，只改变标题栏高度和按钮尺寸，适合工具型窗口。

`original`、`system` 是 `native` 的兼容别名。前端只使用 `native`、`default`、`minimal` 三个标准值。

## 窗口按钮逻辑

前端按钮分别调用：

```javascript
window.pywebview.api.window_action('minimize');
window.pywebview.api.window_action('maximize');
window.pywebview.api.window_action('close');
```

Python 行为：

- `minimize`：优先发 Win32 `WM_SYSCOMMAND/SC_MINIMIZE`，失败时回退到 `window.minimize()`。
- `maximize`：检测当前是否已经最大化；已最大化则执行还原，否则执行最大化。
- `close`：执行 `on_close` 回调；返回 `"hide"` 时隐藏，返回 `False` 或 `"cancel"` 时取消，其他情况退出窗口。

最大化状态会反向同步到前端，最大化按钮图标会在方框和还原图标之间切换。

## 拖拽、吸附和缩放

### 移动与 Snap

自绘标题栏的普通鼠标按下会调用：

```javascript
window.pywebview.api.native_drag('move');
```

Python 使用 Win32 `WM_NCLBUTTONDOWN + HTCAPTION`，所以窗口移动由 Windows 完成，支持系统自带的：

- 拖到屏幕边缘的 Aero Snap
- Windows 11 标题栏 Snap Layouts
- 系统的显示器边界与 DPI 行为

这也是为什么包不在 JavaScript 中自行计算 pointer move。自己计算会很容易和系统吸附、DPI 缩放、最大化还原产生偏差。

当窗口已经最大化时拖动标题栏，包会：

1. 读取鼠标相对于最大化窗口的横向比例。
2. 使用 `ShowWindow(SW_RESTORE)` 还原窗口。
3. 按这个比例重新定位还原窗口。
4. 再发出 `HTCAPTION`，让用户继续拖动。

### 边缘调整大小

八个句柄映射到 Windows 的非客户区命中测试：

| data-ewp-resize | Win32 命中测试 |
| --- | --- |
| `left` | `HTLEFT` |
| `right` | `HTRIGHT` |
| `top` | `HTTOP` |
| `bottom` | `HTBOTTOM` |
| `top-left` | `HTTOPLEFT` |
| `top-right` | `HTTOPRIGHT` |
| `bottom-left` | `HTBOTTOMLEFT` |
| `bottom-right` | `HTBOTTOMRIGHT` |

缩放开始时前端只发送一次命令，后续尺寸变化由 Windows 原生窗口管理完成。窗口最大化时句柄会自动隐藏。

## 动态切换模式

自绘模式之间可以即时切换：

```javascript
await window.easyWindowsPack.setTitleBarMode('minimal');
await window.easyWindowsPack.setTitleBarMode('default');
```

`native` 与自绘模式之间必须重建 pywebview 窗口，因为 `frameless` 和 `easy_drag` 是创建参数，不是可靠的运行时属性。包会返回：

```javascript
{
    ok: true,
    titleBarMode: 'native',
    activeTitleBarMode: 'default',
    restartRequired: true
}
```

应用可保存请求模式，然后销毁并用新的 `WindowConfig` 重新调用 `create_window`。

## 业务 API 委托

如果应用已经有业务 API，可以通过 `app_api` 传入：

```python
class AppApi:
    def get_profile(self):
        return {"name": "demo"}

app_api = AppApi()
instance = create_window(
    WindowConfig(title="My App"),
    url=page_url,
    app_api=app_api,
)
```

前端仍然可以调用：

```javascript
await window.pywebview.api.get_profile();
await window.pywebview.api.window_action('minimize');
```

窗口方法优先于业务对象同名方法，以避免业务 API 覆盖窗口安全边界。

也可以用回调接入托盘或应用生命周期：

```python
def on_close(controller):
    if should_keep_running_in_tray():
        return "hide"
    return "exit"

instance = create_window(
    WindowConfig(close_action="hide"),
    url=page_url,
    on_close=on_close,
)
```

`on_state_change(state)` 会在最大化、还原、最小化、显示、隐藏和尺寸变化时收到状态字典，适合保存窗口尺寸或更新托盘状态。

## 从现有应用迁移

现有 pywebview 应用通常可以按以下顺序迁移：

1. 把业务窗口的 `window_action`、`native_drag`、`window_frame_options`、`window_min_size` 替换为 `WindowController` 和 `WindowConfig`。
2. 把业务 `WebApi` 作为 `app_api` 传给 `create_window`，删除原窗口方法的重复转发。
3. 从业务 HTML 复制 `frontend/window-frame.html` 的外壳，将业务内容放入 `[data-ewp-content]`。
4. 引入 `window-frame.css` 和 `window-frame.js`，移除业务侧重复的 resize handle、标题栏按钮和拖拽监听。
5. 把原来的 `titleBarMode` / `activeTitleBarMode` 映射到 `WindowConfig.titlebar_mode`。
6. 如果应用需要“关闭到托盘”，设置 `close_action="hide"` 或通过 `on_close` 动态返回 `"hide"`。
7. 如果应用需要保存窗口尺寸，在 `on_state_change` 中读取 `state["windowSize"]` 并写入自己的存储。

本仓库的 `backend/runtime.py` 中原窗口创建代码可以作为迁移前后对照：创建参数对应 `WindowConfig`，`RemoteWebApi` 对应 `app_api`，而原来的 `WindowCommandsMixin` / `WorkersWindowMixin` 中的窗口部分对应 `WindowController`。

## 限制与注意事项

- 运行目标是 Windows；Win32 拖拽、缩放、Snap 和置顶在非 Windows 上会返回 `ok: false`。
- 必须使用 pywebview 的 `edgechromium` GUI。`window.native` 和 Win32 handle 在 WebView2 创建后才可用。
- 自绘标题栏必须保证按钮或输入控件不触发标题栏拖拽。组件已排除 `button`、`input`、`select`、`textarea` 和 `a`。
- 不要把业务内容放在 resize handle 上方，否则边缘点击会被句柄截获。
- `native` 模式下不要依赖自绘标题栏 DOM 来显示应用状态；系统标题栏由 Windows 管理。
- 包不负责托盘图标、单实例、窗口位置持久化和应用更新，这些属于宿主应用生命周期。
