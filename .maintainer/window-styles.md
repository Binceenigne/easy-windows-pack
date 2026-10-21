# 窗口外观 / Window styles

[维护导航](README.md) · [公共 API](npm-vite.md) · [桌面组件](desktop-integrations.md)

Windows/macOS 是可选 WebView 外观，共用窗口 API，不代表 macOS 原生运行或打包支持。通过 mountFrame 的 windowStyle、实例 update 或全局 setWindowStyle 切换；旧直接绑定可用 data-window-style 与 window.easyWindowsPack.bind。mode/titleBarMode 的 default、minimal、native 独立于外观：native 由系统绘制，切换自绘/原生需桌面桥接重建。

权威来源为 [window-frame.html](../frontend/components/titlebar/window-frame.html)、[window-frame.css](../frontend/components/titlebar/window-frame.css)、[window-frame.js](../frontend/frame/ewpframe/window-frame.js)。npm 使用 easywindowspack/frame.css 和公开 API，卸载 dispose；不维护 assets 副本。

历史样式基准：Windows 标题栏 33px/紧凑 24px，macOS 40px/28px；Windows 图标 16×16、1.25px 描边，macOS 12px 彩色圆点/22px 点击区。macOS 左侧红关闭、黄最小化、绿最大化/还原，绿不代表原生全屏；hover/focus 不显示操作 SVG，保留焦点轮廓。尺寸现值以 CSS 为准。

公开变量包括 --ewp-surface、--ewp-surface-strong、--ewp-text、--ewp-muted、--ewp-border、--ewp-accent、--ewp-close。优先公开变量与作用域覆盖，不复制完整 palette 或全局重写标签；业务可自行编译 CSS/SCSS。系统浅深色与示例手动主题不是应用品牌约束。

品牌 SVG 权威文件位于 frontend/src/assets 的 ewp-color.svg、ewp-dark.svg、ewp-mono.svg；[prepare](../scripts/prepare-npm.mjs) 复制到 common/frontend/src/assets。旧 welcome 的配色、计数器、布局及根示例控制仅属于示例，业务设计由应用使用者确定。历史 SVG 来源与 welcome 验收见 [记录](npm-validation.md)，完整原文见 [历史恢复](history.md)。

浏览器验收外观、焦点、窄屏与减弱动画，原生拖拽/Snap/resize/标题栏模式另在 Windows 验证。

无边框窗口在 before_show 安装 HWND subclass，WM_GETMINMAXINFO 每次读取当前显示器 rcWork，并使用相对 rcMonitor 的位置与物理尺寸。最大化保留任务栏，系统标题栏沿用系统默认；还原边界和最小跟踪尺寸不改。启动最大化在 shown 后执行，避免尚无 GUI 时等待。窗口销毁自动解除 subclass，控制器保留回调引用直至销毁。

定向回归见 [test_work_area.py](../tests/test_work_area.py)；真实 Windows/WebView2 检查见 [windows-maximize.integration.py](../tests/windows-maximize.integration.py)，含桥接、系统命令、还原及 --startup 模式。实测主屏 1920×1080，窗口最大化为工作区 1920×1032，任务栏 48px 保留；四侧任务栏与负坐标副屏由模拟坐标回归覆盖，未宣称多物理显示器实测。