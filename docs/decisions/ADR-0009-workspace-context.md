---
id: ADR-0009
title: "WorkspaceContext is injected via spawn-env only; the desktop main process never hardcodes a workspace path"
status: proposed
date: 2026-06-25
deciders: [ygwa]
technical-story: "feature/desktop-m1-m2 (M1-1)"
---

## Problem Statement

`engine/dapei-engine.ts` resolves its workspace root from `process.env.DAPEI_WORKSPACE_ROOT` first, falling back to `process.cwd()` (line 56 of `engine/dapei-engine.ts`):

```ts
const rootDir = resolve(process.env.DAPEI_WORKSPACE_ROOT || process.cwd());
```

This is the engine's contract. The desktop main process must respect it.

Today, the desktop has two ad-hoc paths to a workspace root:

1. `desktop/apps/electron/src/main/engine/subprocess-client.ts` `resolveMonorepoRoot()` — computes `__dirname/../../../../../..` to find the dapei-skill monorepo root. **This is a hardcoded path**. It is used as the default `workspaceRoot` when the renderer does not provide one. This is wrong: the desktop should not assume the workspace is the dapei-skill repo.
2. The `WorkspaceRegistry` mentioned in `design-desktop/architecture.md` §5.8 (Main 启动序列 step 3: `WorkspaceRegistry.loadRecents()`) — designed but not yet implemented.

Two specific failure modes flow from this:

- **A user opens `/Users/x/projects/mall-core` as their workspace**. The desktop spawns engine with `workspaceRoot = /Users/.../dapei-skill` (the monorepo root, hardcoded fallback). `engine.run('workspace.status')` returns the dapei-skill repo's status, not mall-core's. The UI shows wrong data silently.
- **Two workspaces are open across two windows** (future feature). Both `engine.run` calls would read the same `process.env.DAPEI_WORKSPACE_ROOT` on the parent, but the first to set wins. Even if we move to spawn-env, both children would inherit the parent's `process.env` unless we explicitly override.

## Constraints

- The desktop main process is single-threaded Node.js, so a single global `WorkspaceContext` is fine for now. Per-window contexts are a future concern.
- The engine accepts `DAPEI_WORKSPACE_ROOT` (workspace root), `DAPEI_FEATURE` (current feature name), and `DAPEI_DIMENSION` (`workspace` | `feature`). These three are the only env vars we need to inject.
- The desktop must not modify `engine/dapei-engine.ts` for this milestone. If we need a fourth env var, we add it in a follow-up ADR (and bump the engine minor).
- `process.cwd()` fallback in the engine is its own safety net; we don't need to disable it from the desktop.

## Decision

The desktop's main process holds **exactly one** `WorkspaceContext` per open workspace, constructed when the user opens a workspace, and:

1. **Injected into subprocess via `spawn({ env: { ...process.env, DAPEI_*: ctx } })`**, never via `process.env = ...` mutation on the parent.
2. **Stored on the `AppContext`** (the value returned by `bootstrapApp()`), keyed by window if we ever go multi-window.
3. **Validated at the boundary**: a malformed `WorkspaceContext.workspaceRoot` (e.g., contains `..`, is not absolute) is rejected at construction time and the app refuses to boot.

### Implementation rules (binding)

- `SubprocessEngineClient` is **the only place** in the desktop that calls `spawn` for engine. No other code path may spawn `engine/dapei-engine.ts`. This is enforceable by a simple `grep -r "engine/dapei-engine" desktop/`.
- `SubprocessEngineClient.run(req, ctx)` always sets all three env vars from `ctx`, even when the value is empty (e.g., `DAPEI_FEATURE=""` when no feature is active). This is more predictable than "only set when present" — the engine's parser does not have to distinguish "unset" from "set to empty".
- `AppContext` carries `currentContext: WorkspaceContext` and a setter `setWorkspaceContext(ctx)` that is called from the workspace IPC handler when the user opens or switches workspaces. There is no other writer.
- `desktop/apps/electron/src/main/engine/subprocess-client.ts`'s `resolveMonorepoRoot()` is **deleted** in M1-1. The new constructor signature is `SubprocessEngineClient(monorepoRootForStubSpawn: string)`, used only to compute the engine entry point path (`engine/dapei-engine.ts`) — not as a workspace root fallback. Workspace roots always come from `ctx`.

### Validation

```ts
// desktop/packages/engine-client/src/workspace-context.ts
function validateWorkspaceContext(ctx: WorkspaceContext): void {
  if (!ctx.workspaceRoot) throw new Error("WorkspaceContext.workspaceRoot is required");
  if (!path.isAbsolute(ctx.workspaceRoot)) throw new Error(`WorkspaceContext.workspaceRoot must be absolute: ${ctx.workspaceRoot}`);
  if (ctx.workspaceRoot.includes("..")) throw new Error(`WorkspaceContext.workspaceRoot must not contain '..': ${ctx.workspaceRoot}`);
  if (ctx.feature && !/^[a-z0-9-]+$/.test(ctx.feature)) throw new Error(`WorkspaceContext.feature must be kebab-case: ${ctx.feature}`);
  if (ctx.dimension !== "workspace" && ctx.dimension !== "feature") throw new Error(`WorkspaceContext.dimension must be 'workspace' or 'feature'`);
}
```

- The desktop does not call `validateWorkspaceContext` in production hot paths; it calls it once at construction in dev, and at any time the test suite runs.
- The renderer never sees `WorkspaceContext`. The renderer sends `workspaceId` (a path or slug) in IPC, and the main process resolves it to a `WorkspaceContext` against its registry.

### Reading the engine's env contract

The current engine reads exactly:

- `DAPEI_WORKSPACE_ROOT` — workspace root (default: `cwd`)
- `DAPEI_ENGINE_HOME` — set by `subprocess-client.ts` to the monorepo root, used by the engine to find the `engine/` script in some legacy paths. Confirmed by reading `engine/dapei-engine.ts` (no read in the current file, but the env is preserved for backward compatibility).

`DAPEI_FEATURE` and `DAPEI_DIMENSION` are **not yet read by the engine**; they are placeholders for engine-side context propagation, which we will need in M1-5 (dimension rule) and M1-6 (Agent context). Setting them now from the desktop means the engine can grow to read them without changing the desktop.

## Alternatives Considered

### Option A: Mutate `process.env` before each `spawn`
- **Pros:** Simple. Three lines.
- **Cons:** Two concurrent calls in the same tick read the parent's `process.env` at spawn time. If call A sets `DAPEI_WORKSPACE_ROOT` to `/A`, then call B sets it to `/B` before A's `spawn` runs, A inherits B's value. The race is a real bug. **Rejected.**

### Option B: Pass context via `input` argument
- **Pros:** Single channel, no env vars.
- **Cons:** Changes the engine's `runCapability` signature, breaks the contract for every Skill caller that doesn't know about the desktop. **Rejected** because the desktop must not modify the engine for its own needs (ADR-0003, ADR-0005).

### Option C: spawn-env injection with parent `process.env` mutation forbidden (chosen)
- **Pros:** Race-free. Conforms to the engine's existing env-var contract. `WorkspaceContext` is a typed, validated object. The engine can grow into reading `DAPEI_FEATURE` and `DAPEI_DIMENSION` without the desktop changing.
- **Cons:** We have to grep for `process.env` mutations in main to enforce the rule. Worth it.

## Consequences

### Positive
- No more silent wrong-data bug. A user opening `/Users/x/projects/mall-core` actually runs the engine against `/Users/x/projects/mall-core`.
- The desktop is ready for multi-window contexts later. The "one context per open workspace" rule extends naturally to "one context per window".
- ADR-0010 (dimension rule) becomes enforceable: `ctx.dimension` is the same value the engine eventually reads, so the engine can refuse `feature` capability from a `workspace` context (or vice versa) without trusting the renderer.
- `DAPEI_FEATURE` and `DAPEI_DIMENSION` are set today, so when M1-5 needs them on the engine side, no desktop change is required.

### Negative
- The hardcoded `resolveMonorepoRoot` is gone. Any code path that relied on it as a default workspace root is broken. Mitigation: a one-time grep audit before M1-1 lands; the only caller today is `SubprocessEngineClient` itself.
- The desktop now needs a real `WorkspaceRegistry` (`~/.dapei/desktop/recent.json`) for `listRecents` to have anything to return. This is M1-3 work; until then, `listRecents` returns `[]` (which is honest, not a fake).
- The `WorkspaceContext` validation is strict; a user with a workspace at a path containing `..` (e.g., a symlink) will be rejected. Mitigation: log the rejection; offer a "trust this path" escape hatch in the future if it becomes a real user complaint.

### Neutral
- The desktop does not add any new env var. `DAPEI_WORKSPACE_ROOT` and `DAPEI_FEATURE` are engine-known; `DAPEI_DIMENSION` is a desktop proposal the engine will adopt when it grows context-awareness.

## References

- `engine/dapei-engine.ts` line 56 (the env-var contract)
- `desktop/apps/electron/src/main/engine/subprocess-client.ts` `resolveMonorepoRoot` (the to-be-deleted hardcode)
- `desktop/apps/electron/src/main/bootstrap.ts` (where `AppContext` is built)
- `design-desktop/architecture.md` §5.8 (Main 启动序列)
- ADR-0003 (engine as validator)
- ADR-0004 (two-dimension boundary)
- ADR-0005 (engine no LLM)
- ADR-0008 (EngineClient contract)
- `.omo/plans/desktop-m1-m2.md` §M1-1
