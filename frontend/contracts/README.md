# Easy Windows Pack UI Contracts

This directory contains framework-neutral contracts for independently shipped UI libraries.
It is intentionally free of Vue, router, store, network, and desktop-runtime dependencies.

The contracts are used by future NPM packages such as:

- `@easy-windows-pack/ui-core`
- `@easy-windows-pack/ui-api-tools`
- `@easy-windows-pack/ui-clife`
- `@easy-windows-pack/ui-ai`

A host application owns routing, authentication, network calls, file selection, uploads,
streaming, tool execution, and pywebview integration. Components receive state through
props/providers and communicate through events or callbacks.

## Composition

```text
ui-core
  ├── ui-api-tools   MatrixProgress, BootCurtain, Entrance
  ├── ui-clife       SidebarShell, SidebarGroup, SessionList
  └── ui-ai          ChatArea, ChatInput, ToolCallCard, ReasoningPanel
```

The TypeScript definitions in `index.d.ts` are the source of truth for the public data
shapes. They do not prescribe a framework implementation. A Vue package may expose Vue
components, while a framework-free package may expose Web Components or DOM factories.

## Design rules

- Use stable identifiers and explicit status values; do not infer state from CSS classes.
- Keep provider callbacks asynchronous and abortable where network work is involved.
- Components must be usable without a router or global store.
- Destructive actions and tool execution belong to the host adapter.
- Consumers can import one component library without importing unrelated libraries.
- SCSS is the recommended styling source; compiled CSS remains the default runtime artifact.
