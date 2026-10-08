# 项目设计摘要

面向桌面 WebView 应用开发者，窗口控件保持轻量、紧凑与清晰，提供 Windows / macOS 两套外观。详细规则在 [docs/window-styles.md](docs/window-styles.md) 和 [docs/desktop-integrations.md](docs/desktop-integrations.md) 维护；开发文档中心为 [docs/README.md](docs/README.md)，实现入口见 [index.md](index.md)。

## 视觉来源

| 范围 | 当前约定 | 实现来源 |
| --- | --- | --- |
| 标题栏 | Windows 默认 33px、紧凑 24px；macOS 默认 40px、紧凑 28px | [window-frame.css](frontend/components/titlebar/window-frame.css) |
| 语义 token | `--ewp-surface`、`--ewp-surface-strong`、`--ewp-border`、`--ewp-text`、`--ewp-muted`、`--ewp-accent`、`--ewp-close`；浅深色随 `prefers-color-scheme` | 同上；完整值以 CSS 为准 |
| 图标与控件 | Windows 16×16 SVG、1.25px 描边；macOS 12px 彩色圆点、22px 点击区域，隐藏 SVG | [window-frame.html](frontend/components/titlebar/window-frame.html) 与标题栏 CSS |
| 组件样式 | 点阵、遮罩与进入动效使用带作用域的规则，支持减弱动画 | [desktop-components.css](frontend/components/desktop/desktop-components.css) |
| 示例 | 窗口页展示外观切换，组件页展示进度、遮罩和进入动画 | [Vite 窗口示例](frontend/index.html)、[组件示例](frontend/src/components.html) |

框架分发普通 CSS；业务样式推荐模块化 CSS/SCSS，SCSS 需自行编译。已有 Tailwind 项目检查 reset 影响。示例页面的品牌、背景和布局不是宿主应用的强制设计规范；优先组件公开变量与作用域覆盖。

## npm 外壳与框架组合

公开 `easywindowspack/frame.css` / `desktop.css` 由同一套权威 CSS 生成，不维护另一套主题。ESM `mountFrame` 管理外壳，使用实例 `update` 更新标题/外观，卸载时 `dispose`。六套 JS/TS 模板共用窗口语义；Vue 模板以 Teleport、React 模板以 portal 保留业务 slot/children、props 响应式与事件，不把业务内容转成静态 HTML。可选 `./vue` / `./react` 包装层只在对应宿主中使用，不构成全项目 Vue/React 规范。公开 API 和资源生成边界见 [npm / Vite 指南](docs/npm-vite.md)。

Vite HMR 仅改变开发体验；生产前端编译到 `output/frontend/` 并使用相对 URL。浏览器中的外观和交互不能作为 native 标题栏、Snap、托盘或宿主更新已成功的证据。旧 [frontend/src/index.html](frontend/src/index.html) 为弃用兼容入口，设计验收优先主页面与实际生成模板。

## 共用交互

- `setWindowStyle` 即时切换外观并保留最大化状态。外观与 `titleBarMode` 独立；`native` 使用系统标题栏，与自绘模式切换需要重建窗口。
- macOS 红/黄/绿分别关闭、最小化、最大化或还原；绿色不表示 macOS 原生全屏。悬停和聚焦不显示 SVG，键盘焦点保留轮廓。
- 点阵 `value` 表示填充量、`remaining` 表示剩余告警语义；空间不足回退线性进度。
- 启动遮罩退出和超时不表示业务已就绪；失败状态独立呈现。渐入支持 `prefers-reduced-motion` 与 `data-motion="off"`，每容器单实例，卸载时释放。
- 更新下载、安装、重启由宿主控制权限与确认；动画、轮询或浏览器预览不能作为原生成功证据。

以上为当前实现与维护约定的摘要，不是本次迁移的验收报告。新设计决定同步相关 `docs/` 页面；提议与已实现规则分开记录，不把临时数值提升为公共 token。
