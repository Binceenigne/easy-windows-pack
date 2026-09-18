<div align="center">

# easy-windows-pack

可选桌面集成现支持 `ApiToolsAdapter` 后台管理、设置与更新接口，以及
`TurtleClawAdapter` 令牌安装、前端就绪确认和宿主提供的普通重启回调。
两者均不硬依赖源项目，保留宿主权限检查与更新流程。

前端组件库新增响应式点阵进度条、开屏遮罩、错峰渐入及可释放的更新轮询客户端。
现有窗口单线程 JS dispatcher 和最小化防死锁逻辑保持不变。
参见[双语接口契约](docs/desktop-integrations.md)和[离线组件示例](examples/components.html)。

### 可复用的 Windows WebView 桌面窗口框架

[![CI](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml/badge.svg)](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![pywebview](https://img.shields.io/badge/pywebview-5.4%2B-0f766e)](https://pywebview.flowrl.com/)
[![Version](https://img.shields.io/badge/version-0.2.1-2563eb)](https://github.com/Binceenigne/easy-windows-pack/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows11&logoColor=white)](https://www.microsoft.com/windows)

[中文](README.md) · [English](README.en.md) · [构建工具](#构建工具) · [架构](#架构)

</div>

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
- 内置 CLI、PowerShell 构建脚本、wheel 和 source bundle 输出

## 架构

![easy-windows-pack 架构图](docs/images/architecture.svg)

前端组件通过 pywebview API 发送窗口命令，`WindowController` 管理生命周期与状态，`win32.py` 将非客户区拖拽、缩放、吸附和置顶交给 Windows。

## 目录结构

```text
easy-windows-pack/
├── easy_windows_pack/
│   ├── __init__.py       # 公共导出
│   ├── api.py            # 暴露给 JavaScript 的 API
│   ├── cli.py            # CLI：build/test/bundle/clean/info
│   ├── config.py         # WindowConfig 和标题栏模式
│   ├── controller.py     # 窗口状态、按钮、关闭和拖拽控制
│   ├── create.py         # pywebview 窗口创建器
│   └── win32.py          # Win32 非客户区拖拽、缩放、吸附和置顶
├── .github/workflows/    # 跨平台测试和 Windows 构建
├── docs/images/          # README 架构图和构建流程图
├── frontend/
│   ├── window-frame.html # 可复制的标题栏与缩放句柄标记
│   ├── window-frame.css  # 窗口外壳样式
│   └── window-frame.js   # 事件绑定、状态同步和 API 包装
├── examples/
│   ├── demo.py
│   └── index.html
├── tests/test_window_pack.py
├── build.ps1
├── LICENSE
├── pyproject.toml
└── requirements.txt
```

## 安装

从 PyPI 安装：

```powershell
pip install easy-windows-pack
```

从源码安装：

```powershell
pip install -e .
```

或者只安装运行时依赖：

```powershell
pip install -r .\requirements.txt
```

运行示例：

```powershell
python .\examples\demo.py
```

运行包测试：

```powershell
python -m unittest discover -s .\tests -p "test_*.py" -v
```

## 构建工具

从 `0.2.0` 开始，项目提供可安装的 CLI 和 Windows PowerShell 构建脚本，不依赖 Node.js 构建链。

```powershell
# 完整构建：测试 + wheel + source bundle
python -m easy_windows_pack.cli build

# 安装项目后也可直接使用命令
easy-windows-pack build

# Windows 快捷入口
.\build.ps1
```

![easy-windows-pack 构建流程](docs/images/build-flow.svg)

默认产物位于 `dist/`：

```text
dist/
├── easy_windows_pack-0.2.1-py3-none-any.whl
├── easy-windows-pack-0.2.1-bundle.zip
└── easy-windows-pack-0.2.1-bundle/
    ├── easy_windows_pack/
    ├── frontend/
    ├── examples/
    ├── docs/
    └── easy-windows-pack.manifest.json
```

| 命令 | 用途 |
| --- | --- |
| `build` | 运行测试并构建 wheel 与 source bundle |
| `test` | 运行 `unittest` 测试 |
| `bundle` | 只构建包含 Python、前端、示例和文档的 zip bundle |
| `clean` | 删除 `build/`、`dist/`、`*.egg-info/` 和 `__pycache__/` |
| `info` | 输出版本、Python 路径和产物元数据 |

常用参数：

```powershell
python -m easy_windows_pack.cli build --output-dir .\artifacts
python -m easy_windows_pack.cli build --skip-tests
python -m easy_windows_pack.cli build --skip-tests --skip-bundle
python -m easy_windows_pack.cli bundle --output-dir .\artifacts
.\build.ps1 -Python .\.venv\Scripts\python.exe
```

`build.ps1` 依次查找 `-Python` 参数、项目内 `.venv`、PATH 中的 `python.exe` 和 `py.exe`。

### WebView2 并发安全

`WindowController` 通过单一后台 dispatcher 串行执行 JavaScript。重复的窗口状态事件会合并，不会并发调用 `evaluate_js`。最小化或隐藏窗口时，待发送的 JavaScript 会被取消，原生窗口消息会立即发出；窗口切换期间不会在 pywebview 的原生事件回调中同步等待 WebView2。

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

## 新增桌面组件

组件使用原生 JavaScript，不要求 Vue、React 或 CSS 框架。复制并引入
[组件样式](frontend/desktop-components.css)和[组件脚本](frontend/desktop-components.js)，
在 DOM 创建后初始化。需要更新功能时再引入[更新客户端](frontend/desktop-updates.js)。

### 点阵进度条

```html
<link rel="stylesheet" href="desktop-components.css">
<div id="quotaProgress"></div>
<script src="desktop-components.js"></script>
<script>
const progress = EasyWindowsPackComponents.createMatrixProgress(
    document.getElementById('quotaProgress'),
    { value: 70, remaining: 30, size: 4, label: '已用额度' }
);
progress.update({ value: 75, remaining: 25 });
// 页面或组件卸载时调用，释放 ResizeObserver 和生成的 DOM。
// progress.dispose();
</script>
```

`value` 是填充百分比，`remaining` 是决定告警颜色的剩余百分比，两者独立；
显示剩余额度时应传相同值，显示已用额度时可传 `value: 70, remaining: 30`，并相应修改 `label`。
`size` 支持 `2`、`3`、`4`，表示每个点阵块的行列数，默认 `4`。
`unlimited: true` 显示满格无限额度，可用 `unlimitedLabel` 设置辅助文本。
容器需要可测量的宽度；组件自动监听尺寸变化，空间不足时回退为线性进度条。

### 开屏遮罩与组件渐入

在页面显示前创建渐入控制器，给需要依次出现的元素添加 `data-ewp-enter`。
遮罩退出后再触发渐入，避免两段动画同时播放：

```html
<div id="boot" hidden>正在启动</div>
<main id="workspace">
    <header data-ewp-enter>工作台</header>
    <section data-ewp-enter>业务内容</section>
</main>
<script>
const components = EasyWindowsPackComponents;
const entrance = components.createEntrance(document.getElementById('workspace'));
const curtain = components.createBootCurtain(document.getElementById('boot'), {
    timeout: 12000,
    onComplete: ({ reason }) => {
        entrance.reveal();
        if (reason === 'timeout') console.warn('启动遮罩已超时，请检查初始化状态');
    }
});
// 完成宿主 API 连接、首屏数据加载和必要渲染后调用：
// curtain.setReady();
// 卸载时：curtain.dispose(); entrance.dispose();
</script>
```

`createEntrance()` 会立即隐藏并暂时禁用内容交互，`reveal()` 触发错峰进入；
需要再次播放时先调用 `prepare()`。`createBootCurtain()` 默认提供 12 秒超时兜底，
超时只代表移除遮罩，不代表业务初始化成功，页面应另行呈现失败或重试状态。
组件支持系统 `prefers-reduced-motion`，也可设置 `document.documentElement.dataset.motion = 'off'` 关闭动效。

### 更新客户端

在宿主通过 `ApiToolsAdapter` 或 `TurtleClawAdapter` 暴露对应接口后使用：

```javascript
const updates = createDesktopUpdateClient({
    host: 'turtleclaw', // API_TOOLS 使用 'api-tools'
    onState: state => console.log('Update state:', state),
    onError: error => console.error(error)
});
// 仅在首屏真正可用后确认就绪；启动检查不会自动下载或安装。
await updates.markFrontendReady({ checkOnStartup: true });
// 用户明确操作时调用：await updates.check(); await updates.download();
// TurtleClaw 安装必须传入宿主提供的有效令牌：await updates.install(token);
// API_TOOLS 使用 await updates.install() 请求重启应用更新。
// 卸载时调用 updates.dispose()，停止轮询并移除监听器。
```

`cancel()` 需要宿主支持 `cancel_update_download`，不可假定两种宿主都支持。
`restart()` 需要宿主提供 `restart_app`；TurtleClaw 普通重启必须显式注入回调。
完整 Python 接入、白名单与返回值契约见[桌面集成说明](docs/desktop-integrations.md)，
可运行的视觉示例见[组件演示](examples/components.html)。

### 使用建议

- **建议使用 SCSS，不建议使用 Tailwind CSS** 作为本框架项目的主要样式组织方式。窗口外壳、点阵、遮罩和渐入包含联动状态与动画规则，SCSS 分模块维护更容易追踪这些关系，也能减少 HTML 中大量工具类和动态类名的维护成本。这是项目维护建议，不是兼容性限制。
- SCSS 需在开发或构建阶段编译成 CSS，WebView 只加载编译后的 CSS。框架目前分发的是普通 CSS，并不内置 SCSS 源文件或 Sass 构建流程；直接使用组件无需安装 Sass。
- 将业务样式放在独立 SCSS 模块中，编译后的业务 CSS 在组件 CSS 之后加载；优先使用组件已有的 CSS 自定义属性和带作用域的选择器，不要直接修改供应组件或全局覆盖 `span`、`i` 等标签。
- 已有 Tailwind CSS 项目可以继续集成，但应检查 Preflight 对按钮、边框等默认样式的影响，避免在组件内部同时用工具类控制其动画、尺寸或可见性。
- 一个 DOM 容器只创建一个组件实例，数据变化调用 `update()`，卸载时调用 `dispose()`。遮罩只用于必要的首屏初始化，不应等待非关键网络任务；高频数据刷新不要反复触发整页渐入。
- 在窄窗口、DPI 缩放、键盘操作及减弱动画模式下验证界面。下载、安装、重启仍由宿主管理权限和确认，不要将动画完成视为更新成功。

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
