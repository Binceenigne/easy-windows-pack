# React 组合式组件

仅当当前任务实际使用 React / JSX / TSX 且涉及组件组合时读取。普通 Vue/原生 JS 任务不加载。

沿用宿主已有 React 版本与数据层。吸收 vercel-composition-patterns 的组合思想，不强制迁移 React 19 或套用新的 ref/context API。

组件通过 props、children 和必要的具名子组件组合表达结构；不同结构优先组合，不把所有场景塞进布尔开关。真正的正交配置如 size、tone、disabled 不必因“避免布尔”而被禁止。

状态所有者保持明确。多部分控件确实共享状态时可以用局部 context/compound components；一个静态按钮无需 provider。context 描述状态与动作契约，使 UI 可以变化而不绑定某一种后台实现。

将访问 API、业务决策与可复用展示拆开，但不为了“无状态组件”制造纯转发的多层包装。已有 hooks 或组件库能满足需求时直接使用。

受控/非受控模式保持清楚，事件与默认值不发生意外改变；ref、原生语义、attrs 和无障碍属性按当前 React 与宿主组件库的契约处理。不要把某个框架版本的便利 API 当成所有项目的规则。

仅当出现真实性能问题再采用缓存、memo 或额外状态库。公开 API/组件归属改变更新项目 `index.md`，视觉/交互通用规则改变更新 `design.md`。
