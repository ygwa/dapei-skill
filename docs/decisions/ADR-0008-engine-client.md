---
id: ADR-0008
title: "EngineClient is a contract, not an implementation; SubprocessEngineClient is the only shipped impl in M1"
status: proposed
date: 2026-06-25
deciders: [ygwa]
technical-story: "feature/desktop-m1-m2 (M1-1)"
---

## Problem Statement

The desktop main process needs to invoke `runCapability(id, input, ctx)` from `@dapei/core`. There are two ways to do this:

1. **In-process import** — `import { runCapability } from "@dapei/core"`. Fast, no subprocess, but couples the desktop to the engine's process state, blocks the main thread on long capabilities, and forces the desktop to carry `@dapei/core` and its transitive deps (cdr, router, doc-gen's VitePress dep tree) as runtime imports.
2. **Subprocess spawn** — `node --experimental-strip-types engine/dapei-engine.ts run --capability <id> --input '<json>'`. Slow (~150ms cold), decouples, no transitive deps in the desktop binary, capability errors return as exit codes.

The current `desktop/apps/electron/src/main/engine/subprocess-client.ts` already implements (2) by spawning the root `engine/dapei-engine.ts`. But the contract is implicit: the `EngineClient` interface in `desktop/packages/engine-client/src/index.ts` is one line (`export * from "./types.ts"`), the `CapabilityInvokeRequest` shape lives in `desktop/packages/contracts/src/ipc/`, and `WorkspaceContext` (the per-call context for the capability) does not exist as a typed entity — it is implicit in the subprocess environment.

Three concrete problems:

- **`services` and `agent` packages have no shared context type**. Each handler that needs a workspace root + feature + dimension reaches into `process.env` or `request.input` differently.
- **The dimension rule (ADR-0004)** — "feature dimension may not write to workspace dimension" — has no enforcement surface. The current code in `register-handlers.ts` accepts any capability without checking which dimension is active.
- **Concurrent calls race on `process.env`**. Two `engine.run` calls fired in the same tick would both read `process.env.DAPEI_WORKSPACE_ROOT` at spawn time; if a second call mutates the env between spawn and read, the first call sees the second's value. Node.js is single-threaded but `process.env` is global mutable state.

## Constraints

- The desktop must not modify `packages/core/src/runCapability` signature. That function is the engine's stable API.
- The desktop must not depend on the engine's internal types (`@dapei/core/src/*`) at compile time. ADR-0003 says "AI is scanner, engine is validator"; the engine is a black box from the desktop's perspective.
- Capability invocation must remain **non-blocking on the renderer**. Electron's main process is fine to block briefly; the renderer never sees the engine call directly (everything goes through IPC + handlers).
- The M1-6 Agent-Share work needs to call the engine from inside the same main process, so the `EngineClient` instance must be **reusable** (not a one-shot factory).

## Decision

Lock the `EngineClient` contract and the `WorkspaceContext` contract as types, then ship exactly one implementation in M1: **`SubprocessEngineClient`**.

### Contract — `EngineClient`

```ts
// desktop/packages/engine-client/src/types.ts
export interface EngineClient {
  run(req: CapabilityInvokeRequest, ctx: WorkspaceContext): Promise<CapabilityInvokeResponse>;
}
```

- One method: `run`. No `stream`, no `abort`, no `subscribe`. If we later need streaming, we add a second method (`runStream` or `events()`), we do not overload `run`.
- The implementation must throw only on catastrophic spawn failure (engine binary missing). All capability-level errors come back inside `CapabilityInvokeResponse.error` with a stable `code` field.
- The implementation must not mutate `process.env` at the time of invocation. All workspace/feature/dimension context is **threaded through the subprocess boundary explicitly** (per ADR-0009: env vars set on the spawned child only, not on the parent).

### Contract — `WorkspaceContext`

```ts
// desktop/packages/engine-client/src/types.ts
export interface WorkspaceContext {
  /** Absolute path of the workspace root (e.g., `/Users/.../mall-core`). */
  workspaceRoot: string;
  /** Optional feature name; present iff the renderer is in the Feature dimension. */
  feature?: string;
  /** Dimension the renderer is currently in. Drives ADR-0004 enforcement. */
  dimension: "workspace" | "feature";
}
```

- `WorkspaceContext` is constructed once at app boot (when the user opens a workspace) and held in the main process. It is **not** passed through IPC; renderer-side code never sees it.
- `WorkspaceContext` is **the** enforcement surface for the dimension rule. See "Dimension rule" below.

### Contract — `CapabilityInvokeRequest` (already in `desktop/packages/contracts/src/ipc/capability.ts`, no change)

The existing shape (`capabilityId`, `input`, `workspaceRoot`, `feature?`) is correct. We add one Zod-validated refinement: `feature` is allowed only when `ctx.dimension === "feature"`, blocked otherwise.

### Implementation — `SubprocessEngineClient` (M1-1 deliverable)

- Spawns `process.execPath` (Electron's bundled Node) with `engine/dapei-engine.ts` as argument. Stays in the main process.
- Passes `WorkspaceContext` via **child-process env only** (`DAPEI_WORKSPACE_ROOT`, `DAPEI_FEATURE`, `DAPEI_DIMENSION`). Never mutates the parent's `process.env`.
- Each call gets a **fresh child** in M1. This is wasteful (~150ms per call) but bulletproof for correctness and crash isolation. We batch in a later milestone if a benchmark proves it matters.
- Parses the child's stdout as JSON-or-text per `engine/dapei-engine.ts`'s output convention. Surfaces non-zero exits as `CapabilityInvokeResponse.error.code = "ENGINE_EXIT"`. Spawn failures (engine binary missing) as `code = "SPAWN_FAILED"`.
- Returns `CapabilityInvokeResponse` typed from `@dapei/desktop-contracts` (single source of truth, no redefinition).

### Dimension rule enforcement

The dimension rule (ADR-0004) is enforced **inside `SubprocessEngineClient.run`**:

```ts
// pseudo
const WRITE_CAPABILITIES_TO_BLOCK = [
  /^docs\.(write|create|delete|update)/,
  /^cognitive\.artifact\.upsert$/,
  // ... add as needed
];

if (ctx.dimension === "feature") {
  for (const re of WRITE_CAPABILITIES_TO_BLOCK) {
    if (re.test(req.capabilityId)) {
      return { ok: false, error: { code: "DIMENSION_BLOCKED", message: `...` } };
    }
  }
}
```

- The list is **engine-side, not UI-side**. The UI shows a friendly toast on `DIMENSION_BLOCKED`; the engine is the gate.
- The list is **not exhaustive in M1**. We start with the obvious 3-4 patterns; the rest is added as feature work surfaces it. Any test that catches a missed case is a contribution to the list.

### `StubEngineClient` (kept for tests + smoke)

The existing `StubEngineClient` is kept for two purposes: (a) unit tests that don't want a subprocess, (b) `DAPEI_ENGINE_MODE=stub` for CI / smoke runs. It implements the same `EngineClient` interface; nothing in the desktop cares which one is wired in.

## Alternatives Considered

### Option A: In-process import
- **Pros:** Fast (~5ms), no subprocess.
- **Cons:** Carries `@dapei/core` (and `@dapei/cdr`'s evals, and the doc-gen VitePress dep tree) into the desktop binary. Long capabilities block the main thread. The desktop becomes a Skill binary by accident. **Rejected** because the design doc (`design-desktop/architecture.md` §2.2) explicitly says desktop packages must not import `@dapei/core`.

### Option B: Utility Process fork
- **Pros:** More structured than `spawn`; can hold a persistent Node process; can be terminated cleanly.
- **Cons:** Requires the engine to be a long-lived process listening on stdin. The current `engine/dapei-engine.ts` is one-shot (run → exit). Restructuring the engine to be long-lived is a larger change than the desktop wants to take on in M1. The same `SubprocessEngineClient` shape works fine over Utility Process later — the contract is what matters.

### Option C: Contract + single impl (chosen)
- **Pros:** The contract is the hard part; the impl is swappable later (subprocess → utility process → in-process, in that order, when benchmarks demand it). Locking the contract now means the renderer can be written against `EngineClient` without knowing how it works.
- **Cons:** We pay 150ms per call. We don't have benchmarks yet to know if this matters. The "fresh child per call" is wasteful. Mitigation: log per-call latency in dev; add a TODO in `subprocess-client.ts` to revisit in M3.

## Consequences

### Positive
- `EngineClient` is now a real interface in `@dapei/desktop-engine-client`. Tests can mock it. `services` packages depend on the interface, not the impl.
- `WorkspaceContext` is the single source of truth for "what dimension is the user in" and "what's the workspace root". Handlers stop reaching into `process.env` directly.
- The dimension rule has a real enforcement point. ADR-0004 stops being aspirational.
- `subprocess-client.ts` becomes testable: the `WorkspaceContext` is passed in, the subprocess is constructed with those values, the result is parsed. Contract tests in `desktop/packages/engine-client/src/__tests__/` can mock `child_process.spawn`.

### Negative
- 150ms per call adds latency to every UI action. For `workspace.status` and `repos.list` (small reads) this is noticeable. Mitigation: TanStack Query caching on the renderer side (already in use per `desktop/README.md`).
- A list of "write capabilities to block" is a maintenance burden. The list is a finite set, but adding to it requires touching this file. Mitigation: a Vitest test that scans `packages/core/src/capabilities/*.ts` and asserts every write capability is in the blocklist (catches gaps automatically).
- `WorkspaceContext` is constructed in main and never crosses IPC, which is correct but means a renderer-side bug in dimension detection won't surface as a wrong context. We need an integration test that proves "renderer says 'feature dimension' → main's ctx.dimension is 'feature'".

### Neutral
- The `StubEngineClient` is unchanged. Tests get a cleaner target.

## References

- `desktop/packages/engine-client/src/index.ts` (current 1-line stub)
- `desktop/packages/engine-client/src/types.ts` (current types stub)
- `desktop/apps/electron/src/main/engine/subprocess-client.ts` (the existing implementation)
- `desktop/packages/contracts/src/ipc/capability.ts` (the `CapabilityInvokeRequest` shape)
- `engine/dapei-engine.ts` (the entry point that is spawned)
- ADR-0003 (AI as scanner, engine as validator)
- ADR-0004 (Workspace and Feature dimensions are physically separated)
- ADR-0005 (engine never calls LLMs)
- `.omo/plans/desktop-m1-m2.md` §M1-1
