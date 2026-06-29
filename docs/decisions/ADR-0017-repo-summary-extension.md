---
id: ADR-0017
title: "RepoSummary contract extension — syncStatus / lagCommits / lastSyncAt"
status: proposed
date: 2026-06-26
deciders: [ygwa]
technical-story: "feature/m3-ui-density (pre-PR-2 contract-first)"
---

## Problem Statement

PR-1's `RepoSummaryCard` (`packages/ui/src/components/RepoSummaryCard.tsx`)
renders a "latest" / "behind N" / "diverged" badge per repo. The
current `RepoSummary` contract has only `name / branch / hash /
cloned`. Sync status (synced / behind / diverged) and lag count
must be surfaced to the renderer for the Dashboard right rail.

## Constraints

- Backward compatible — existing callers reading `name / branch /
  hash / cloned` keep working.
- Sync status is engine-derived (git status + rev-list). Desktop
  service computes it from the existing repos.* capability output,
  not a new engine capability. If the engine later ships a
  `repos.status` capability, the service can switch over.
- Renderer must not import services.

## Decision

Extend `RepoSummary` with 3 optional fields:

```ts
// packages/contracts/src/index.ts
export interface RepoSummary {
  name: string;
  branch?: string;
  hash?: string;
  cloned: boolean;
  syncStatus?: "synced" | "behind" | "diverged" | "unknown";
  lagCommits?: number;             // only meaningful when syncStatus === "behind"
  lastSyncAt?: string;             // ISO timestamp of last successful fetch
}
```

```ts
// packages/services/src/repos/index.ts (mirror)
```

### Field provenance (services layer)

`parseRepoText` in `packages/services/src/repos/index.ts:68-89`
extends to:

1. **syncStatus** — read `repos/<name>/.git/FETCH_HEAD` mtime vs
   `now()` (24h threshold → "behind" if FETCH_HEAD mtime > 24h and
   branch has unpushed commits; otherwise "synced"). For an even
   cheaper signal, run `git -C <repo> rev-list --count
   @{u}..HEAD` — non-zero → "behind".
2. **lagCommits** — `git -C <repo> rev-list --count HEAD..@{u}`.
   Default 0 if no upstream.
3. **lastSyncAt** — `statSync(repos/<name>/.git/FETCH_HEAD).mtime.toISOString()`.
   Falls back to `undefined` if FETCH_HEAD doesn't exist.

Best-effort: if git binary is missing or the repo isn't a git repo,
`syncStatus` defaults to `"unknown"` and the other fields stay
`undefined`.

### Renderer usage

`RepoSummaryCard` already handles the new fields via
`repoSyncTone(status)` (ADR-0014). The `syncStatus === "behind"` case
renders the lag count in the warning badge; other cases render
textual labels.

## Consequences

### Positive

- Dashboard right rail becomes informative: a glance shows which
  repos need a `git fetch` and which are clean.
- "一键 Sync" CTA surfaces automatically when any repo is
  `behind` or `diverged` (already implemented in
  `RepoSummaryCard.tsx:73-92`).

### Negative

- Per-repo git ops on every `repos.list()` call adds IO. Cached in
  the service for 30s to avoid hammering the FS; out of scope for
  this ADR — note for PR-7+.
- Diverged detection (`syncStatus === "diverged"`) requires
  `git status --porcelain -uno`; complex. M3-UI ships
  `"diverged"` as a label but the service initially emits
  `"unknown"` for non-clean-paths cases. Deferred.

## Verification

- `pnpm --filter @dapei/desktop-services typecheck` clean.
- New test in `packages/services/src/repos/__tests__/` parses a
  fixture text dump and asserts the new fields default cleanly.
- `desktop-api.ts` dev stub fills the new fields with mock data.
- `pnpm test` — 61 tests pass + 1-2 new service tests.

## Open Questions

- `repos.sync()` engine capability already exists and returns
  `{ok, synced: string[]}`. Should `lastSyncAt` be updated by
  this code path? Defer to a follow-up ADR.