# 窗口外观

[文档导航](README.md) · [设计摘要](design.md) · [开发手册](development.md)

自定义标题栏支持 Windows 和 macOS 两套外观，使用相同的窗口控制 API。

- 默认保持 Windows 外观。给窗口根元素添加 `data-window-style="macos"` 可启用 macOS 外观。
- 调用 `window.easyWindowsPack.setWindowStyle('macos')` 或 `window.easyWindowsPack.setWindowStyle('windows')` 可即时切换，保留当前最大化状态。
- 手动绑定新窗口元素时，可使用 `window.easyWindowsPack.bind(frame, { windowStyle: 'macos' })`。
- [frontend/index.html](../frontend/index.html) 是 Vite 主页面，[main.js](../frontend/src/main.js) 默认展示 macOS 外观并提供选择器；旧 frontend/src/index.html 为弃用兼容入口。

macOS 外观采用左侧红黄绿按钮、居中标题和浅深色渐变标题栏。红色关闭、黄色最小化、绿色最大化或还原；绿色按钮不代表 macOS 原生全屏。按钮始终仅显示彩色圆点，悬停和键盘聚焦时不显示 SVG 操作图标；键盘聚焦保留焦点轮廓。

外观与 `titleBarMode` 独立：`default` 显示完整标题栏，`minimal` 显示紧凑控制条，`native` 由操作系统绘制标题栏，不受此主题影响。主题仅改变 WebView 内容样式，不改变 Windows 原生窗口边界。

## 实现与样式来源

- 标记与图标：[window-frame.html](../frontend/components/titlebar/window-frame.html)。
- 主题、尺寸、焦点及浅深色：[window-frame.css](../frontend/components/titlebar/window-frame.css)。
- 绑定、状态同步与外观切换：[window-frame.js](../frontend/frame/ewpframe/window-frame.js)。
- 独立桌面组件：[desktop-components.css](../frontend/components/desktop/desktop-components.css) 与 [desktop-components.js](../frontend/components/desktop/desktop-components.js)；生命周期与动效规则见[桌面集成](desktop-integrations.md)。

npm 消费者显式导入 `easywindowspack/frame.css`，通过 `mountFrame` / 实例 `update` 切换外观，卸载时 `dispose`；桌面组件样式为 `easywindowspack/desktop.css`。这些 assets 由同一套权威源码生成，不另维护主题副本。Vue/React 组合层仅在相应宿主中使用，详见 [npm / Vite 指南](npm-vite.md)。

| 项目 | 当前约定 |
| --- | --- |
| Windows 标题栏 | 默认 33px，紧凑 24px；标题字体 `600 12px/1.2 system-ui, sans-serif` |
| macOS 标题栏 | 默认 40px，紧凑 28px；标题居中，12px 彩色圆点与 22px 点击区域 |
| Windows 图标 | 16×16 SVG，1.25px 描边，继承文字色 |
| 表面与文字 | `--ewp-surface`、`--ewp-surface-strong`、`--ewp-text`、`--ewp-muted` |
| 边界与强调 | `--ewp-border`、`--ewp-accent`、`--ewp-close` |
| 主题 | `prefers-color-scheme` 适配浅深色；macOS 外观使用作用域样式 |

CSS 是数值定义来源；不要复制一份完整调色板到页面，也不要将 demo 的业务背景或布局规定为宿主品牌。框架分发普通 CSS，业务可使用模块化 CSS/SCSS；SCSS 自行编译，WebView 只加载 CSS。复用公开变量和带作用域的覆盖，避免全局重写按钮与标签。

## 交互与验证边界

外观切换是前端状态；`native` 与自绘模式切换仍须重建 pywebview 窗口。标题栏按钮、输入等交互区域不能触发拖拽；最大化状态与 resize handle 由窗口桥接同步，原生移动、Snap 与缩放交给 Windows。

在 frontend 内运行 `npm run frontend:dev`、`npm run dev -- --web`，或在项目根运行 `startup.cmd browser`，使用 Vite 预览外观、焦点和布局，没有真实 native bridge；frontend 内 `npm run dev` 用于 HMR + debug 桌面调试，根 `startup.cmd demo --debug` 使用编译页面。从根运行 npm 时加 `--prefix frontend`。Vite 配置为 frontend/vite.config.mjs，页面根为 frontend，fs allow 仅按资源需要配置，不扩大为整仓库。验收应区分浏览器视觉、键盘/减弱动画与 Windows 原生行为，当前证据单独写入 [npm 验收记录](npm-validation.md)。