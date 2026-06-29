---
id: ADR-0016
title: "FeatureSummary contract extension — objective / repos / priority / updatedAt"
status: proposed
date: 2026-06-26
deciders: [ygwa]
technical-story: "feature/m3-ui-density (pre-PR-2 contract-first)"
---

## Problem Statement

The PR-1 dashboard-density upgrade added a 6-field `FeatureCard`
(`packages/ui/src/components/FeatureCard.tsx`) showing priority,
objective, repos, and updatedAt. The current `FeatureSummary`
contract has only `name / stage / active / openedAt`. M3-UI needs
those four additional fields surfaced to the renderer.

The same `FeatureSummary` shape exists in two layers — the
**contracts** layer (`packages/contracts/src/index.ts:25-30`, the
type the renderer sees via the preload bridge) and the **services**
layer (`packages/services/src/feature/index.ts:4-9`, the type the
main process hands back). Both must be extended in lockstep.

## Constraints

- Backward compatible — existing callers that destructure only
  `name / stage / active / openedAt` must keep working.
- The field source is `features/<name>/feature.yaml` which is owned
  by the dapei-engine (`packages/core/src/capabilities/domains/feature.ts:183-188`).
  Engine `feature.create` already writes `objective` and `repos`;
  `priority` is NOT yet in the engine's manifest. The desktop
  service parses the yaml best-effort.
- Renderer must not import services. Contract type is the only
  thing the renderer can see.
- ADR-0010 (dimension rule) is unaffected — `feature.list` is
  workspace-dim read; no write.

## Decision

Extend both `FeatureSummary` types with 4 optional fields:

```ts
// packages/contracts/src/index.ts
export interface FeatureSummary {
  name: string;
  stage: string | null;
  active: boolean;
  openedAt: string;                // existing — semantic unchanged
  objective?: string;              // NEW: feature.yaml `feature.objective`
  repos?: string[];                // NEW: feature.yaml `feature.repos[*].name`
  priority?: "P0" | "P1" | "P2" | "P3";  // NEW: derived; default P3 if absent
  updatedAt?: string;              // NEW: yaml mtime; falls back to openedAt
}
```

```ts
// packages/services/src/feature/index.ts
export interface FeatureSummary {        // mirror
  name: string;
  stage: string | null;
  active: boolean;
  openedAt: string;
  objective?: string;
  repos?: string[];
  priority?: "P0" | "P1" | "P2" | "P3";
  updatedAt?: string;
}
```

### Field provenance (services layer)

`parseFeatureText` in `packages/services/src/feature/index.ts:93-127`
extends to:

1. **objective** — read `features/<name>/feature.yaml`, regex match
   `objective: "..."`. If unparseable, omit (renderer shows "—").
2. **repos** — read same yaml, regex match `- name: "<repo>"` under
   the `repos:` list. De-duplicate. Order preserved.
3. **priority** — read same yaml, regex match `priority: "P[0-3]"`.
   If absent (engine hasn't shipped the field), default to `"P3"`
   so the badge renders but with neutral tone.
4. **updatedAt** — `statSync(features/<name>/feature.yaml).mtime.toISOString()`.
   Falls back to `openedAt` if the file doesn't exist (shouldn't
   happen — engine always creates it — but defensive).

### Renderer usage

`apps/electron/src/renderer/src/lib/desktop-api.ts:31-39` dev stub
fills the new fields with hard-coded mock data so PR-2 / PR-3 can
land without waiting for services to fully populate them.

`FeatureCard` already accepts the new fields as optional — the
contract addition is forward-compatible (PR-1 view primitives
already handle `undefined` per ADR-0014 design).

## Consequences

### Positive

- Dashboard's `FeatureCard` (PR-1) can render all 6 fields once the
  services populates them; PR-2/3 wiring is mechanical.
- Engine priority field is a forward-compat suggestion; if the
  engine ships `priority` later, the service picks it up
  automatically.
- No IPC channel payload changes — `feature.list` request schema
  stays `z.object({}).strict()` (no fields, no extras allowed).

### Negative

- Two `FeatureSummary` types (contracts vs services) — already a
  pre-existing wart, not introduced here. Both kept in lockstep.
- `parseFeatureText` does its own yaml parsing instead of asking
  the engine. This is a deliberate trade-off (no engine change
  needed); PR-3 of M3-UI may add `feature.list.structured` capability
  and migrate.

## Verification

- `pnpm --filter @dapei/desktop-services typecheck` clean.
- `pnpm test` — 61 tests pass; new test in `packages/services/src/feature/__tests__/`
  parses a fixture feature.yaml and asserts the 4 new fields.
- `pnpm test:ipc` — feature.list schema still rejects extras.
- `desktop-api.ts` dev stub: render Dashboard with mock features
  and verify the new fields appear in the UI.

## Open Questions

- Should `FeatureSummary.openedAt` be renamed `updatedAt`? Current
  value is `new Date(0).toISOString()` (placeholder from M1). Keep
  both: `openedAt` stays as the legacy semantic ("when the feature
  was first listed"), `updatedAt` is mtime. No breaking change.