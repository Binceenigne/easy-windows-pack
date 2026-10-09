# 项目设计摘要

面向桌面 WebView 应用开发者，窗口控件保持轻量、紧凑与清晰，提供 Windows / macOS 两套外观。详细规则在 [window-styles.md](window-styles.md) 和 [desktop-integrations.md](desktop-integrations.md) 维护；开发文档中心为 [README.md](README.md)，实现入口见 [index.md](index.md)。

## 视觉来源

| 范围 | 当前约定 | 实现来源 |
| --- | --- | --- |
| 标题栏 | Windows 默认 33px、紧凑 24px；macOS 默认 40px、紧凑 28px | [window-frame.css](../frontend/components/titlebar/window-frame.css) |
| 语义 token | `--ewp-surface`、`--ewp-surface-strong`、`--ewp-border`、`--ewp-text`、`--ewp-muted`、`--ewp-accent`、`--ewp-close`；浅深色随 `prefers-color-scheme` | 同上；完整值以 CSS 为准 |
| 图标与控件 | Windows 16×16 SVG、1.25px 描边；macOS 12px 彩色圆点、22px 点击区域，隐藏 SVG | [window-frame.html](../frontend/components/titlebar/window-frame.html) 与标题栏 CSS |
| 组件样式 | 点阵、遮罩与进入动效使用带作用域的规则，支持减弱动画 | [desktop-components.css](../frontend/components/desktop/desktop-components.css) |
| 根 welcome | Vite 风格居中品牌、计数与资源链接；浅深色/中英文切换、窗口控制，窄窗与低高度响应式布局 | [main.js](../frontend/src/main.js)、[demo.css](../frontend/src/demo.css) |
| 六模板 welcome | 品牌、计数、外观选择、编辑提示与资源链接；创建时选定文案语言，浅深色随系统偏好 | [模板入口](index.md#npm-包与模板)、[共用 style.css](../frontend/packages/create-ewp/templates/common/frontend/src/style.css) |
| 品牌图标 | 彩色 hero；浅色背景用 dark 标记、深色背景用 mono 标记，与标题栏操作 SVG 分别维护 | [color](../frontend/src/assets/ewp-color.svg)、[dark](../frontend/src/assets/ewp-dark.svg)、[mono](../frontend/src/assets/ewp-mono.svg) |
| 组件示例 | 进度、遮罩和进入动画 | [组件示例](../frontend/src/components.html) |

框架分发普通 CSS；业务样式推荐模块化 CSS/SCSS，SCSS 需自行编译。已有 Tailwind 项目检查 reset 影响。示例页面的品牌、背景和布局不是宿主应用的强制设计规范；优先组件公开变量与作用域覆盖。

根 demo 以 `data-demo-theme` 与局部 `--demo-*` 变量实现主题，初始读取系统偏好后可手动切换，并映射已有 `--ewp-*` 表面/文字变量；模板使用 `--welcome-*` 与 `prefers-color-scheme`。两者均保留可见焦点和减弱动画支持。三份品牌 SVG 仅在 `frontend/src/assets/` 维护，prepare 复制到忽略的 common 生成目录，详见 [welcome 与资产规则](window-styles.md#welcome-页面与品牌资产)。本轮源码新设计尚未进入线上 0.1.1，验收范围见 [本地记录](npm-validation.md#2026-10-09-welcome-改版本地验收--local-welcome-validation)。

## npm 外壳与框架组合

公开 `easywindowspack/frame.css` / `desktop.css` 由同一套权威 CSS 生成，不维护另一套主题。ESM `mountFrame` 管理外壳，使用实例 `update` 更新标题/外观，卸载时 `dispose`。六套 JS/TS 模板共用窗口语义；Vue 模板以 Teleport、React 模板以 portal 保留业务 slot/children、props 响应式与事件，不把业务内容转成静态 HTML。可选 `./vue` / `./react` 包装层只在对应宿主中使用，不构成全项目 Vue/React 规范。公开 API 和资源生成边界见 [npm / Vite 指南](npm-vite.md)。

Vite HMR 仅改变开发体验；生产前端编译到 `output/frontend/` 并使用相对 URL。浏览器中的外观和交互不能作为 native 标题栏、Snap、托盘或宿主更新已成功的证据。旧 [frontend/src/index.html](../frontend/src/index.html) 为弃用兼容入口，设计验收优先主页面与实际生成模板。

## 共用交互

- `setWindowStyle` 即时切换外观并保留最大化状态。外观与 `titleBarMode` 独立；`native` 使用系统标题栏，与自绘模式切换需要重建窗口。
- macOS 红/黄/绿分别关闭、最小化、最大化或还原；绿色不表示 macOS 原生全屏。悬停和聚焦不显示 SVG，键盘焦点保留轮廓。
- 点阵 `value` 表示填充量、`remaining` 表示剩余告警语义；空间不足回退线性进度。
- 启动遮罩退出和超时不表示业务已就绪；失败状态独立呈现。渐入支持 `prefers-reduced-motion` 与 `data-motion="off"`，每容器单实例，卸载时释放。
- 更新下载、安装、重启由宿主控制权限与确认；动画、轮询或浏览器预览不能作为原生成功证据。

以上为当前实现与维护约定的摘要，不是本次迁移的验收报告。新设计决定同步相关 `docs/` 页面；提议与已实现规则分开记录，不把临时数值提升为公共 token。
