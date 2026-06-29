---
id: ADR-0019
title: "WorkspaceStatus contract extension — suggestion (engine-recommended next step)"
status: proposed
date: 2026-06-26
deciders: [ygwa]
technical-story: "feature/m3-ui-density (pre-PR-2 contract-first)"
---

## Problem Statement

PR-1's `WorkspaceHealthBar` (`packages/ui/src/components/WorkspaceHealthBar.tsx`)
renders a "建议下一步 (Dapei Rules)" block — a one-line engine
recommendation that tells the user what to do next. The current
`workspace.status()` capability returns `{repoCount, featureCount,
conforms}`. The engine should be able to attach a suggestion.

## Constraints

- Backward compatible — existing callers reading `repoCount /
  featureCount / conforms` keep working.
- The suggestion is engine opinion, not desktop opinion. The
  engine decides *what* to suggest; the desktop decides *how* to
  render it (via `WorkspaceHealthBar`'s CTA slot).
- The suggestion may be empty (engine has nothing to recommend).
  Renderer falls back to "All synced" placeholder.

## Decision

Extend `WorkspaceStatus` (services layer) with 1 optional field:

```ts
// packages/services/src/workspace/index.ts
export interface WorkspaceStatus {
  repoCount: number;
  featureCount: number;
  conforms: boolean;
  suggestion?: string;             // NEW
}
```

The contracts-layer `DesktopApi.capability.run` returns a generic
`CapabilityInvokeResponse` so no contract change is needed there —
the desktop service interprets `result.data` as `WorkspaceStatus`
after ADR-0019 lands.

### Field provenance

The desktop service reads the engine's `workspace.status` capability
output, which today returns `{repoCount, featureCount, conforms}`.
The desktop service now also does a best-effort second pass:

1. If any repo has `syncStatus === "behind"` (ADR-0017), build
   suggestion: `'<repo> 落后 N commits, 建议立即同步以避免 Feature 冲突。'`
2. Else if any feature has `stage === "方案设计"` (etc.), suggest
   advancing.
3. Else omit.

This keeps the engine side unchanged (desktop is opinionated about
UX) while letting the engine override later if/when it has its own
recommendation engine.

## Consequences

### Positive

- Dashboard 顶部 4 列健康条 + 建议池立刻有内容可渲染
- 升级到 engine 原生建议只需把 service 里的 `buildSuggestion()`
  替换成读 engine capability 的字段

### Negative

- 当前的 suggestion 拼装在 service 层做，会跟未来的 engine
  recommendation 重复。等 engine 上线时需要清理 service 的
  fallback 逻辑。PR-6 时关注。

## Verification

- typecheck / test 全过
- 新增 1 个 service test 验证 `buildSuggestion()` 在 behind / synced
  两种情况下输出正确

## Open Questions

- 未来 engine 是否要 expose `workspace.recommend` capability？
  还是建议就在 engine 的 status data 里加字段？等 engine 上线时
  再定。