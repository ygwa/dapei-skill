---
id: ADR-0019
title: "Dashboard Advisor — rule-based, read-only suggestions with pre-filled capability actions"
status: proposed
date: 2026-06-27
deciders: [ygwa]
technical-story: "feature/m3-cognitive-jump (M3-6)"
---

## Problem Statement

The P1 Dashboard is the user's landing surface after opening a workspace.
Today it shows four static blocks (WorkspaceHealthBar, features list, repos
list, knowledge summary) but **nothing tells the user what to do next**. A
fresh workspace can sit idle for days because the user is unsure what's
blocking them; an out-of-date repo can drift because there's no obvious
prompt to `repos.sync`.

We need a **rule-based advisor** that reads local fs + git state on
demand and surfaces a short, ranked list of "next actions" with
pre-filled capability inputs and one-click execution.

## Constraints

- **Not an LLM.** Each rule is a pure function of fs/git state, ≤ 50
  lines of TypeScript. No embeddings, no summarization, no scoring
  via ML.
- **Read-only.** The advisor never mutates anything. It reads
  `features/<f>/feature.yaml`, `repos/<r>/.git`, `docs/as-is/`, and
  emits `Suggestion[]` for the UI. The UI's "执行" button calls the
  engine — the advisor only pre-fills the inputs.
- **Local engine-not-required.** The advisor never calls
  `engine.run()`. It calls `git rev-list` (child_process) and reads
  yaml. This is intentional: the advisor should work even when the
  engine subprocess is starting up or in offline mode.
- **Deterministic.** Given the same workspace state, the advisor
  returns the same suggestions in the same order. Severity
  (`urgent > warn > info`) breaks ties.
- **Bounded output.** `Suggestion[]` with one entry per rule per
  matched condition. Empty workspace → empty array.

## Decision

Add a new desktop-side service `@dapei/desktop-services/advisor` with:

```ts
export interface AdvisorService {
  getSuggestions(workspaceRoot: string): Promise<Suggestion[]>;
}

export type Suggestion = {
  id: string;            // stable across runs (e.g. "repo-behind:mall-order")
  severity: "info" | "warn" | "urgent";
  title: string;
  description: string;
  action: {
    capability: string;        // e.g. "repos.sync"
    input_template: object;    // e.g. { target: "mall-order" }
    target_route: string;      // e.g. "/w/<ws>/repos"  (where to navigate after exec)
  } | null;                    // null = "no auto-action, just a hint"
};
```

Plus four rule files in `advisor/rules/`:

| Rule | File | Input source | Output severity |
|------|------|--------------|------------------|
| `repo-behind-origin` | `git rev-list --count HEAD..@{u}` per repo | `warn` if > 0 |
| `stale-feature` | `feature.yaml` `lastActivity` mtime vs now | `warn` if > 3 days |
| `empty-cdr` | `docs/as-is/*` file count vs `repos/*/src` file count | `info` if ratio < threshold |
| `pending-confirmation` | feature stage is one of "solution-design", "implementation", "acceptance" AND no `confirmed: true` log entry in the last 24h | `urgent` |

### Severity ordering

Suggestions are sorted: `urgent` first, then `warn`, then `info`.
Within the same severity, the original rule order is preserved
(deterministic tie-break).

### UI integration

- New IPC channel `dapei:advisor:getSuggestions` (read-only, no
  dimension tag).
- Dashboard `DashboardView` mounts → fetch once → cache via
  `useQuery`.
- `dapei:workspace:mutated` push event refetches (covers feature
  close, repo sync, etc.).
- Manual "刷新建议" button in the Dashboard top bar.
- "执行" button on each suggestion calls
  `engine.run(capability, input_template)` via the existing
  `DesktopApi.capability.run` bridge, then `navigate(target_route)`.
- Severity > `info` (i.e. `warn` or `urgent`) → top-sticky banner;
  otherwise inline section.

## Consequences

### Positive

- P1 Dashboard now tells the user what to do. Empty workspace
  becomes self-explanatory ("create a feature"), stale repos stop
  drifting, stale features get a nudge.
- Rule-based = predictable. No surprise suggestions. Easy to test
  in isolation.
- No engine changes. The advisor is desktop-internal; engine
  capabilities are invoked only when the user clicks "执行".

### Negative

- 4 rules cover the common cases but not all. New rules require
  new files. (This is the right trade-off vs. a config-driven
  rule engine — explicit code is auditable.)
- `empty-cdr` rule's threshold is heuristic; the rule itself is
  best-effort. False positives → "this looks empty" is non-blocking.
- The "execute" button invokes a real engine call. If the engine
  is offline, the click shows an error toast. Future: dry-run mode.

### Neutral

- One new IPC channel + handler + UI section. Maintenance surface
  grows by one entry.
- The DesktopApi surface gains `advisor.getSuggestions()`. No
  breaking change to existing methods.

## Implementation Status

Pending. Iter 4 / Wave A.1.

## Verification

- `pnpm --filter @dapei/desktop-services typecheck` clean
- `pnpm test:advisor` — 10 cases all green (per plan §M3-6 #8)
- `pnpm -r typecheck` clean
- E2E: open a dapei-smoke workspace with 1 behind repo + 1 stale
  feature → Dashboard shows 2 suggestions → click "执行" on
  repo-behind → engine runs `repos.sync` → suggestion disappears
  after refetch.

## Open Questions

- Should the advisor emit events on every `git fetch` even when
  the user isn't in the Dashboard? Defer to M3.7 — the current
  `dapei:workspace:mutated` refetch is good enough.
- Should `pending-confirmation` be split into 3 rules (one per
  stage)? The current spec folds them into one rule. Single rule
  is easier to test; defer to M3.7 if granularity becomes a
  UX issue.
