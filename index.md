# 项目索引

> 本文件登记宿主项目的真实实现，不统计 Skill、模板、依赖目录或构建输出。开发前参考，相关代码变更时增量维护。

## 概览

- 项目 / 范围：easy-windows-pack，可复用 Windows WebView 窗口框架。
- 技术栈 / 主要入口：Python、pywebview、原生 HTML/CSS/JavaScript；examples/demo.py。
- 盘点状态：部分覆盖，仅登记本次窗口 UI 与 demo 打包相关实现；全范围总数未知。
- 最近内容更新：待初始化时填写；不要仅为日期产生修改。

| 类型 | 已登记已实现数 | 全范围总数 / 覆盖说明 |
| --- | --- | --- |
| 业务页面 | 0 | 未知，未盘点 |
| 示例页面 | 1 | 部分覆盖，总数未知 |
| 共享 UI 组件 | 1 | 部分覆盖，总数未知 |
| 功能内 UI 组件 | 0 | 未知，未盘点 |
| 服务 / composable / 桥接入口 | 1 | 部分覆盖，总数未知 |

计数按语义实体：页面不重复计为组件，组件的尺寸/颜色变体不重复计数；仍在用的 deprecated 实现计入并标注；规划项不计入。完成全范围盘点前明确保留“部分覆盖/总数未知”。

## 页面

| ID / 名称 | 类型 | 路由或入口路径 | 作用 | 主要复用组件 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 窗口 demo | 示例页面 | examples/index.html；examples/demo.py | 展示窗口模式及 Windows/macOS 外观切换 | window-frame | 已实现 |

## 组件

| ID / 名称 | 归属 / 路径 | 作用与适用场景 | 公开输入 / 输出 / 生命周期 | 代表使用方 | 状态 |
| --- | --- | --- | --- | --- | --- |
| window-frame | frontend/window-frame.html、window-frame.css | 标题栏、窗口控制和缩放手柄 | data-window-style、data-titlebar-mode；通过 window-frame.js 绑定 | examples/index.html | 已实现 |

## 服务与共享逻辑

| 名称 | 路径 | 职责 / 公开入口 | 边界或注意事项 |
| --- | --- | --- | --- |
| 窗口前端桥接 | frontend/window-frame.js | bind、setWindowStyle、setTitleBarMode、call；同步窗口状态 | 外观切换独立于原生窗口模式 |

## 样式与复用入口

- 公共 UI / 功能目录：待确认。
- token / 共享样式来源：待确认；规则见同目录 `design.md`。
- 相邻参考实现：待确认。

## 开发命令

| 用途 | 已确认命令 | 工作目录 / 限制 |
| --- | --- | --- |
| demo EXE | ./build-demo.ps1 -Python <解释器路径> | 项目根目录；需要 PyInstaller 和 pywebview；产物在 dist |
| JS 语法检查 | node --check frontend/window-frame.js | 项目根目录 |

## 未覆盖与规划

- 尚未核实：当前项目全量页面和组件；后续随相关开发补齐，不默认启动全仓审计。
- 规划但未实现：暂无已确认记录。

清单较大时将详情按功能分片，保留本文件作为摘要与链接入口。路径与数量由实际变更更新，不生成全仓流水账。
