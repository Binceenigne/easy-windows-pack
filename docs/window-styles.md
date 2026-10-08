# 窗口外观

自定义标题栏支持 Windows 和 macOS 两套外观，使用相同的窗口控制 API。

- 默认保持 Windows 外观。给窗口根元素添加 `data-window-style="macos"` 可启用 macOS 外观。
- 调用 `window.easyWindowsPack.setWindowStyle('macos')` 或 `window.easyWindowsPack.setWindowStyle('windows')` 可即时切换，保留当前最大化状态。
- 手动绑定新窗口元素时，可使用 `window.easyWindowsPack.bind(frame, { windowStyle: 'macos' })`。
- `examples/index.html` 默认展示 macOS 外观，并提供外观选择器。

macOS 外观采用左侧红黄绿按钮、居中标题和浅深色渐变标题栏。红色关闭、黄色最小化、绿色最大化或还原；绿色按钮不代表 macOS 原生全屏。按钮始终仅显示彩色圆点，悬停和键盘聚焦时不显示 SVG 操作图标；键盘聚焦保留焦点轮廓。

外观与 `titleBarMode` 独立：`default` 显示完整标题栏，`minimal` 显示紧凑控制条，`native` 由操作系统绘制标题栏，不受此主题影响。主题仅改变 WebView 内容样式，不改变 Windows 原生窗口边界。