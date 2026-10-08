# Vue 核心规范

仅在宿主实际使用 Vue、`.vue`、Vue Router 或 Pinia 时读取。这里是对 vue-best-practices 的精简整合，不是原版全文或另一份必须同时加载的依赖。

## 适应现有工程

新 Vue 3 组件优先 Composition API 与 `<script setup>`；已有 TypeScript 就保持明确类型。已有 JavaScript、Options API 或老版本约定时就地兼容，不为执行 Skill 发起全项目迁移，也不因存在 Vite 就假定它使用 Vue。

SFC 保持职责清楚，段落顺序跟随仓库。页面组织功能组件；多个可独立变化的交互区、真实复用片段或繁重副作用适合拆开，不按固定 UI 区块数或行数强拆。

## 数据与组件契约

props 输入、事件输出；父层拥有的状态不在子层偷偷修改。内容和结构变化优先 slot，同一视觉角色的变化用语义 props；双向绑定只用于真正可编辑的值。

`defineProps` / `defineEmits` 与现有类型工具配合。使用 `defineModel` 等宏前确认本地 Vue 版本；不支持时沿用 `modelValue` / `update:modelValue`。不要为使用新宏升级依赖。

公共 UI 不绑定具体 store 或业务路由。provide/inject 适合明确的子树上下文，不把它变成隐藏的全局总线。只有跨页面或跨功能真实共享的状态才进入 Pinia；局部输入和展开状态优先局部持有。

## 响应式与模板

保留最少的源状态，用 `computed` 推导可计算结果；watch 主要承担 IO/副作用，不维护多份可推导数据。`ref` / `reactive` 依数据形态选择。

不要将 reactive/store 的状态直接解构为失去响应性的普通值；Pinia 状态/getter 可用 `storeToRefs`，action 保留 store 调用或按其契约解构。props 解构行为随编译器版本变化，跨版本代码优先保留 `props.x` 或明确 ref/getter。

列表使用稳定业务 key；模板只表达展示逻辑。避免在 computed/模板中执行网络请求、隐式写状态或大型重复计算；不对未可信内容直接使用 `v-html`。

## composable 与副作用

共享、有状态或复杂副作用可以进入 `useXxx`，纯转换用普通函数即可。composable 返回少量、清楚的状态与动作，并说明由谁清理；不要把所有业务塞进一个巨型 hook。

定时器、事件监听、订阅、观察器、第三方组件实例在相应作用域结束时释放。创建在异步回调中的 watcher 要特别确认停止方式。涉及快速请求切换、缓存页面或 WebView DOM 组件时，再读 [Vue 进阶](vue-advanced.md)。

沿用既有格式、检查与样式工具；TypeScript 项目有现成 `vue-tsc`/测试命令就按范围运行。组件/页面的结构与公开契约同步到 `index.md`，设计规则改变才修改 `design.md`。
