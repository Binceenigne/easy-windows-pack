# 项目索引

供使用 easy-windows-pack 开发应用的人记录业务入口。当前仓库提供 welcome 和组件示例；真实应用用途、页面和业务服务待用户填写。

| 起点 | 入口 | 用途 |
| --- | --- | --- |
| welcome 页面 | [frontend/index.html](../frontend/index.html)、[main.js](../frontend/src/main.js) | 从这里替换为自己的业务界面 |
| 桌面宿主 | [backend/src/demo.py](../backend/src/demo.py) | 装配窗口并接入应用的 Python API |
| 组件示例 | [frontend/src/components.html](../frontend/src/components.html) | 查看可选组件的用法 |

有真实业务后，按需补少量页面、组件或服务的路径和作用；无需数量盘点或框架内部清单。应用视觉与交互写在 [design.md](design.md)。

创建、开发与公共前端 API 见 [npm / Vite 指南](npm-vite.md)，构建和安装配置见 [打包指南](packaging.md)。框架维护者从 [agent 路由](agent.md) 与 [文档导航](README.md) 进入架构和开发专题。
