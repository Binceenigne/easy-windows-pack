<div align="center">

# easy-windows-pack

可选桌面集成现支持 `ApiToolsAdapter` 后台管理、设置与更新接口，以及
`TurtleClawAdapter` 令牌安装、前端就绪确认和宿主提供的普通重启回调。
两者均不硬依赖源项目，保留宿主权限检查与更新流程。

前端组件库新增响应式点阵进度条、开屏遮罩、错峰渐入及可释放的更新轮询客户端。
现有窗口单线程 JS dispatcher 和最小化防死锁逻辑保持不变。
参见[双语接口契约](docs/desktop-integrations.md)和[离线组件示例](frontend/src/components.html)。

### 可复用的 Windows WebView 桌面窗口框架

[![CI](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml/badge.svg)](https://github.com/Binceenigne/easy-windows-pack/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![pywebview](https://img.shields.io/badge/pywebview-5.4%2B-0f766e)](https://pywebview.flowrl.com/)
[![Version](https://img.shields.io/badge/version-0.2.1-2563eb)](https://github.com/Binceenigne/easy-windows-pack/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows11&logoColor=white)](https://www.microsoft.com/windows)

[中文](README.md) · [English](README.en.md) · [npm / Vite 指南](docs/npm-vite.md) · [开发文档](docs/README.md) · [构建工具](#构建工具) · [架构](#架构)

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
- 私有 npm workspace、ESM `easywindowspack@0.1.0` / `ewp` CLI、Vite HMR 与六套 Vanilla / Vue / React 的 JS / TS 项目模板
- 双语开发菜单、兼容 CLI / PowerShell 入口、wheel、单文件 EXE 和 source bundle 输出

## 架构

![easy-windows-pack 架构图](docs/images/architecture.svg)

前端组件通过 pywebview API 发送窗口命令，`WindowController` 管理生命周期与状态，`win32.py` 将非客户区拖拽、缩放、吸附和置顶交给 Windows。

开发文档统一在根 [docs/](docs/README.md) 维护：[开发手册](docs/development.md)介绍环境、预览与构建，[架构与迁移指南](docs/architecture.md)说明目录边界；根 [index.md](index.md) 和 [design.md](design.md) 保留实现与设计摘要。

## 目录结构

```text
easy-windows-pack/
├── backend/
│   ├── base/ewpcore/     # 框架源码；公开 Python 包仍为 easy_windows_pack
│   └── src/demo.py       # 桌面演示与宿主装配
├── frontend/
│   ├── frame/ewpframe/   # window-frame.js、desktop-updates.js 桥接逻辑
│   ├── components/
│   │   ├── titlebar/     # window-frame.html / .css
│   │   └── desktop/      # desktop-components.js / .css
│   ├── index.html       # Vite 主页面入口
│   ├── src/             # main.js、组件示例；旧 index.html 为弃用兼容入口
│   └── contracts/       # TypeScript 类型契约与接入说明
├── packages/
│   ├── easywindowspack/  # ESM runtime、CSS、框架包装与 ewp CLI
│   └── create-ewp/       # 交互生成器、common 与六套模板
├── docs/                # 开发文档维护中心，含导航、架构、手册与图片
├── scripts/dev.py       # 标准库开发菜单与任务编排
├── scripts/prepare-npm.mjs # 单源 npm 资源生成
├── tests/               # Python 与浏览器测试
├── .github/workflows/    # 跨平台测试和 Windows 构建
├── output/              # frontend/、wheels/、exe/、bundles/、npm/、logs/
├── build/               # spec/、pyinstaller/ 等构建缓存
├── build.cmd            # Windows 开发菜单入口
├── build.ps1            # 底层 CLI 兼容入口
├── build-demo.ps1       # 委托开发入口的 exe 任务
├── agent.md             # 开发规则入口
├── index.md             # 实现索引摘要
├── design.md            # 设计摘要
├── LICENSE
├── package.json         # private npm workspace，不发布根包
├── vite.config.mjs      # Vite ^7.3.7；生产相对 URL
├── pyproject.toml
└── requirements.txt
```

源码目录名 `ewpcore` 不改变公开导入：仍使用 `from easy_windows_pack import ...`，由 `pyproject.toml` 的 `package-dir` 映射到 `backend/base/ewpcore`。迁移后应重新执行可编辑安装，不要改成公开导入 `ewpcore`。

## npm 快速开始

环境：Node.js **>=22.12.0**，桌面初始化与打包需要 Python **>=3.10**，Windows 桌面需要 WebView2。根 npm 包为 private workspace；两个 npm 包为 `0.1.0`，与 Python `easy-windows-pack@0.2.1` 独立版本。

**发布状态未确认。** `create-ewp` / `easywindowspack` 公共名称的可用性和所有权需发布者核实。以下 registry 命令仅在两包发布后使用；无需全局安装即可创建项目：

```powershell
npm create ewp@latest
npm create ewp@latest "My App" -- --template react-ts --no-install --no-start
```

交互选择项目名、Vanilla / Vue / React、JavaScript / TypeScript、是否安装、是否启动，共六模板。也可在发布后运行 `npm install -g easywindowspack`，再用 `ewp create`；后者转调用依赖 `create-ewp/cli`。未发布时的本地生成、tarball 验收与手动发布顺序见[双语指南](docs/npm-vite.md)。

在源码仓库或已可安装依赖的生成项目中：

```powershell
npm install
npm run init
npm run dev
# 只运行浏览器，不启动桌面
npm run dev -- --web
npm run frontend:dev
```

`init` 创建/复用 Python `.venv` 并安装 Python 开发及 npm 依赖。`dev` 默认启动本机动态端口的 Vite/HMR，将实际 URL 经 `EWP_DEV_URL` 传给启用 debug 的 pywebview。浏览器模式无需 Python，也没有真实原生窗口能力。主页面为 [frontend/index.html](frontend/index.html)，旧 [frontend/src/index.html](frontend/src/index.html) 为弃用兼容入口。

```powershell
npm run frontend:build
npm run build
npm run build -- -w
npm run build -- --wheel
npm run build -- -e
```

前端编译至 `output/frontend/`，生产资源 URL 相对化；`build` 默认构建 Windows EXE，`-w` / `--wheel` 选择 wheel，`-e` 显式选择 EXE。**npm 参数放在 `--` 之后，裸 `-w` 属于 npm workspace 选项。** EXE 由 Python/PyInstaller 打包，只装载编译后的前端。框架 wheel 保留核心与源组件/桥接资源；生成应用 wheel 使用编译 assets，详见[构建边界](docs/npm-vite.md#前端与-python-构建--frontend-and-python-builds)。

前端通过 `easywindowspack` 的 `mountFrame` / `update` / `dispose` 管理外壳，样式显式导入 `easywindowspack/frame.css`；桌面组件、更新客户端与可选 `./vue` / `./react` 导出见[公共 API](docs/npm-vite.md#前端公共-api-与模板组合--frontend-public-api-and-template-composition)。Vue >=3.3、React >=18 为可选 peers，Vanilla 不依赖它们。六模板复用单源 runtime，Vue Teleport / React portal 保留业务内容的响应式与事件。

## Python 安装与兼容接入

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

仓库开发建议先初始化项目环境，再运行桌面示例：

```powershell
.\build.cmd init
.\build.cmd demo --debug
```

初始化创建或复用 `.venv`，在其中执行 `pip install -e ".[dev,tray]"`，有 npm 项目时同时安装 npm 依赖。安装后可用该环境的 Python 运行 `backend/src/demo.py`；直接运行前需编译前端，或由开发命令提供 `EWP_DEV_URL`。`build.cmd browser` 现转 Vite，不提供真实原生桥接。

运行包测试：

```powershell
python -m unittest discover -s .\tests -p "test_*.py" -v
```

## 构建工具

根 `build.cmd` 调用标准库入口 `scripts/dev.py`；无参数时显示双语菜单，也可直接指定任务。菜单保留 legacy 兼容语义；当前前端开发和编译需要 Node.js/Vite，Python 构建依赖由 `init` 安装到项目 `.venv`。完整用法见[开发手册](docs/development.md)与[npm / Vite 指南](docs/npm-vite.md)。

```powershell
.\build.cmd
.\build.cmd init
.\build.cmd browser
.\build.cmd frontend
.\build.cmd demo --debug
# 完整构建：测试 + wheel + 单文件 EXE + source bundle
.\build.cmd build
```

![easy-windows-pack 构建流程](docs/images/build-flow.svg)

默认按类别输出，日志保留在 `output/logs/`，PyInstaller 配置及缓存位于 `build/`：

```text
output/
├── frontend/            # Vite 编译页面与 assets
├── wheels/              # *.whl
├── exe/                 # easy-windows-pack-demo.exe（单文件）
├── bundles/             # *-bundle.zip、对应展开目录和 manifest
├── npm/                 # npm pack tarball
└── logs/                # 初始化与构建日志
build/
├── spec/                # PyInstaller spec
└── pyinstaller/         # PyInstaller 工作缓存
```

| 命令 | 用途 |
| --- | --- |
| `init` | 创建/复用 `.venv`，安装 `.[dev,tray]` 及 npm 依赖 |
| `browser` | 转 Vite 浏览器开发，在 `127.0.0.1` 动态端口打开主页面 |
| `frontend` | 编译前端到 `output/frontend/` |
| `demo --debug` | 编译前端后运行桌面演示并启用开发者工具；HMR 用 `npm run dev` |
| `wheel` | 构建 wheel 到 `output/wheels/` |
| `exe` | PyInstaller 单文件桌面演示到 `output/exe/`，仅 Windows |
| `bundle` | Python、前端、示例、开发文档等源码包到 `output/bundles/` |
| `build` | 按顺序运行 test → wheel → exe → bundle，仅 Windows |
| `test` | 运行 Python `unittest`；浏览器与原生交互另行验收 |
| `info` | 显示解释器、项目环境与各输出目录 |

预览可用 `build.cmd browser --port 8080 --no-open` 指定端口且不自动打开浏览器，按 Ctrl+C 停止服务。浏览器可检查外观和纯前端交互，但没有真实 native bridge；窗口拖拽、托盘与原生更新须在桌面宿主中验证。`build.cmd build` 的 test → wheel → exe → bundle 与 `npm run build` 默认 EXE 是不同入口语义。历史 SVG 展示 legacy 构建流程，当前 npm 路径以双语指南为准。进度显示已完成阶段数，不按时间伪造完成百分比；失败或中断不会标记后续阶段成功。

### 兼容入口

原有 CLI 与 `build.ps1` 保留。底层 `build` 仍为测试 + wheel + source bundle，不包含 EXE；默认输出也使用 `output/` 分类目录。`clean` 属于底层 CLI，不是开发菜单任务。显式 `--output-dir` 仍可覆盖默认产物位置。

```powershell
python -m easy_windows_pack.cli build
easy-windows-pack build
python -m easy_windows_pack.cli build --output-dir .\artifacts
python -m easy_windows_pack.cli build --skip-tests
python -m easy_windows_pack.cli build --skip-tests --skip-bundle
python -m easy_windows_pack.cli bundle --output-dir .\artifacts
.\build.ps1 -Python .\.venv\Scripts\python.exe
.\build-demo.ps1 -Python .\.venv\Scripts\python.exe
```

`build.ps1` 依次查找 `-Python` 参数、项目内 `.venv`、PATH 中的 `python.exe` 和 `py.exe`。`build-demo.ps1` 委托 `scripts/dev.py exe`，复用相同环境、日志与产物目录。

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
    url=(ROOT / "output" / "frontend" / "index.html").as_uri(),
)
webview.start(gui="edgechromium")
```

该 Vite 应用示例先执行 `npm run frontend:build`；开发时由 `ewp dev` 提供 `EWP_DEV_URL`。下节手动复制静态组件的兼容宿主可使用自己的 HTML 路径。

`create_window` 返回 `WindowInstance`，包含：

- `instance.window`：原始 pywebview 窗口
- `instance.controller`：Python 窗口控制器，可在托盘、更新器或业务代码中调用
- `instance.api`：传给 JavaScript 的 `WindowApi`

### 2. 使用前端组件

将以下三个文件复制到自己的静态资源目录：

- [frontend/components/titlebar/window-frame.html](frontend/components/titlebar/window-frame.html)
- [frontend/components/titlebar/window-frame.css](frontend/components/titlebar/window-frame.css)
- [frontend/frame/ewpframe/window-frame.js](frontend/frame/ewpframe/window-frame.js)

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
[组件样式](frontend/components/desktop/desktop-components.css)和[组件脚本](frontend/components/desktop/desktop-components.js)，
在 DOM 创建后初始化。需要更新功能时再引入[更新客户端](frontend/frame/ewpframe/desktop-updates.js)。

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
可运行的视觉示例见[组件演示](frontend/src/components.html)。

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

## 系统托盘菜单与窗口置顶

托盘面向 Windows，使用可选的 `pystray` 和 Pillow 依赖；基础安装不会加载托盘库：

```powershell
pip install "easy-windows-pack[tray]"
# 从本地仓库安装：
pip install -e ".[tray]"
```

以下示例使用仓库自带窗口页面。实际应用可将生成的图标替换为 PNG/ICO 路径或 Pillow 图像：

```python
from pathlib import Path
from threading import Event

import webview
from PIL import Image
from easy_windows_pack import (
    TRAY_SEPARATOR, TrayController, TrayMenuItem, WindowConfig, create_window,
)

exiting = Event()
instance = create_window(
    WindowConfig(title="Tray example"),
    url=Path("frontend/src/index.html").resolve().as_uri(),
    on_close=lambda controller: "hide" if tray.running and not exiting.is_set() else "exit",
)

def exit_app():
    exiting.set()
    instance.controller.window_action("close")

image = Image.new("RGBA", (64, 64), "#0f766e")
tray = TrayController(instance.controller, icon=image, title="Tray example", on_exit=exit_app)
tray.set_menu([
    *tray.window_menu(),
    TRAY_SEPARATOR,
    TrayMenuItem("Print state", lambda: print(instance.controller.get_state()),
                 enabled=lambda: instance.controller.visible),
])

def start_tray():
    try:
        tray.start()
    except Exception as error:
        print(f"Tray unavailable: {error}")

try:
    webview.start(start_tray, gui="edgechromium")
finally:
    tray.stop()
    image.close()
```

默认菜单包含显示窗口（同时是左键默认动作）、隐藏窗口、置顶，以及提供 `on_exit` 时的退出项。
传入 `menu=[]` 可创建空菜单；`set_menu(items)` 可在运行中替换菜单。
`TrayMenuItem(text, callback, enabled=True, checked=None, default=False)` 接受无参数 Python 回调；
`enabled` 和 `checked` 支持布尔值或无参数状态函数，`checked=None` 不显示勾选标记。
用 `TRAY_SEPARATOR` 添加分隔符，一个菜单最多设置一个默认项。
菜单回调之外的业务状态变更后调用 `refresh_menu()`；窗口显示、隐藏和置顶状态会自动同步。

`start(timeout=5.0)` 启动后台托盘线程并等待就绪，运行中重复调用无副作用；缺少依赖、启动失败或超时会抛出异常。
`stop()` 请求移除图标并解除状态监听，不关闭窗口、不等待托盘线程退出；原生循环退出时释放图像副本。
窗口未关闭时可以重新启动托盘。关闭窗口会停止托盘，隐藏窗口则保留托盘。
`request_exit()` 先停止托盘，再调用宿主必需的 `on_exit`，每次启动后只执行一次。
菜单回调和状态刷新异常会记录日志，并保存在 `last_error`。
回调和状态函数在后台或原生线程执行，应保持简短；其他 GUI 操作需按宿主框架要求切换线程。

`WindowController` 与 `WindowApi` 都提供已有的 `set_always_on_top(enabled)`，
以及新增的 `toggle_always_on_top()` / `get_always_on_top()`：

```javascript
// 在 pywebviewready 之后调用：
const state = await window.pywebview.api.toggle_always_on_top();
if (state.ok) console.log(state.alwaysOnTop);
await window.pywebview.api.set_always_on_top(false);
const current = await window.pywebview.api.get_always_on_top();
```

返回值为 `{ok, alwaysOnTop}`，原生设置失败时保留之前的状态。
实现复用 Win32 置顶逻辑与串行 JS dispatcher，窗口隐藏或最小化时不会执行 JS。
`get_state()` 与状态通知包含 `closed`、`alwaysOnTop`；可通过
`add_state_listener()` / `remove_state_listener()` 增删额外监听器，不替换 `on_state_change`。
监听器异常会被记录，不会阻断窗口操作。

托盘配置仅供 Python 宿主使用，不能把 `TrayController` 作为 `app_api` 传入。
浏览器接口不提供托盘命令字符串、Shell 执行或任意 Python/JS 执行能力。
退出策略和业务回调仍由宿主管理；示例在托盘启动失败时允许正常关闭窗口，避免应用只能隐藏却无法从托盘恢复。

## 从现有应用迁移

现有 pywebview 应用通常可以按以下顺序迁移：

1. 把业务窗口的 `window_action`、`native_drag`、`window_frame_options`、`window_min_size` 替换为 `WindowController` 和 `WindowConfig`。
2. 把业务 `WebApi` 作为 `app_api` 传给 `create_window`，删除原窗口方法的重复转发。
3. 复制 `frontend/components/titlebar/window-frame.html` 的外壳，将业务内容放入 `[data-ewp-content]`。
4. 引入 `window-frame.css` 和 `window-frame.js`，移除业务侧重复的 resize handle、标题栏按钮和拖拽监听。
5. 把原来的 `titleBarMode` / `activeTitleBarMode` 映射到 `WindowConfig.titlebar_mode`。
6. 如果应用需要“关闭到托盘”，设置 `close_action="hide"` 或通过 `on_close` 动态返回 `"hide"`。
7. 如果应用需要保存窗口尺寸，在 `on_state_change` 中读取 `state["windowSize"]` 并写入自己的存储。

完整宿主装配见 [backend/src/demo.py](backend/src/demo.py)。仓库目录迁移映射见[架构与迁移指南](docs/architecture.md)；宿主自己的窗口创建参数对应 `WindowConfig`，业务 API 对应 `app_api`，原窗口控制职责对应 `WindowController`。

## 限制与注意事项

- 运行目标是 Windows；Win32 拖拽、缩放、Snap 和原生置顶只在 Windows 上生效。非 Windows 上置顶接口保留原有的状态模拟行为，不代表操作系统实际置顶。
- 必须使用 pywebview 的 `edgechromium` GUI。`window.native` 和 Win32 handle 在 WebView2 创建后才可用。
- 自绘标题栏必须保证按钮或输入控件不触发标题栏拖拽。组件已排除 `button`、`input`、`select`、`textarea` 和 `a`。
- 不要把业务内容放在 resize handle 上方，否则边缘点击会被句柄截获。
- `native` 模式下不要依赖自绘标题栏 DOM 来显示应用状态；系统标题栏由 Windows 管理。
- 托盘是可选功能，宿主需提供图标、菜单回调和退出策略；单实例、窗口位置持久化和应用更新仍属于宿主应用生命周期。
