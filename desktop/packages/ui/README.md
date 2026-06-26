# @dapei/desktop-ui

共享 React 组件（Tailwind + shadcn 后续加入）。

```
src/
├── shell/        # DimensionBadge、AppShell 布局 primitive
└── components/   # StageStepper、EvidenceCard、ToolCallCard
```

**不**直接调用 IPC；由 `apps/electron/renderer` 注入数据与 hooks。
