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

## Welcome 页面与品牌资产

根 [main.js](../frontend/src/main.js) / [demo.css](../frontend/src/demo.css) 实现 Vite 风格 welcome：品牌 hero、计数、编辑提示、文档/GitHub/桌面组件入口，以及中文/英文、浅色/深色、Windows/macOS 外观和标题栏模式控制。页面主题初始读取系统偏好，手动切换使用 `data-demo-theme`；主题和窗口外观独立。窄窗调整控件与页脚排列，低高度收紧间距与 logo 尺寸，焦点可见并支持减弱动画。

六套 [生成模板](index.md#npm-包与模板) 共用 [style.css](../frontend/packages/create-ewp/templates/common/frontend/src/style.css)，提供 welcome、计数、窗口外观选择、对应源码编辑提示和资源链接；文案由创建时 `--lang` 或语言选择决定，主题由 `prefers-color-scheme` 适配。根 demo 的手动语言/主题切换和标题栏模式控制不要求各模板全部具备。

品牌图标来自用户提供的 `ewp-svg-icons.zip`：权威源为 [ewp-color.svg](../frontend/src/assets/ewp-color.svg)、[ewp-dark.svg](../frontend/src/assets/ewp-dark.svg)、[ewp-mono.svg](../frontend/src/assets/ewp-mono.svg)。Hero 使用 color，浅色背景的品牌标记使用 dark，深色背景使用 mono；模板通过 `picture/source` 选择标记，根 demo 随主题更新。它们是品牌资产，标题栏操作图标继续遵循上表的 SVG 与 macOS 圆点规范。

[prepare-npm.mjs](../scripts/prepare-npm.mjs) 检查三份权威 SVG 并复制到 `frontend/packages/create-ewp/templates/common/frontend/src/assets/`，生成器随 common 资源分发给六模板。该目录由 [.gitignore](../.gitignore) 排除；修改权威源后从根执行 `npm --prefix frontend run prepare:npm`，不手工编辑生成副本。本轮仅更新本地源码与文档，线上 0.1.1 尚未包含新 welcome，验收见 [本地记录](npm-validation.md#2026-10-09-welcome-改版本地验收--local-welcome-validation)。

## 交互与验证边界

外观切换是前端状态；`native` 与自绘模式切换仍须重建 pywebview 窗口。标题栏按钮、输入等交互区域不能触发拖拽；最大化状态与 resize handle 由窗口桥接同步，原生移动、Snap 与缩放交给 Windows。

在 frontend 内运行 `npm run frontend:dev`、`npm run dev -- --web`，或在项目根运行 `startup.cmd browser`，使用 Vite 预览外观、焦点和布局，没有真实 native bridge；frontend 内 `npm run dev` 用于 HMR + debug 桌面调试，根 `startup.cmd demo --debug` 使用编译页面。从根运行 npm 时加 `--prefix frontend`。Vite 配置为 frontend/vite.config.mjs，页面根为 frontend，fs allow 仅按资源需要配置，不扩大为整仓库。验收应区分浏览器视觉、键盘/减弱动画与 Windows 原生行为，当前证据单独写入 [npm 验收记录](npm-validation.md)。