# Related Cognitive Context

Date: 2026-06-22

## Summary

**No external cognitive artifacts are injected for this feature.**

This feature (`cdr-portal-aggregation`) is a **self-host change** to the `dapei-skill` platform itself. Per `feature.yaml.repos[]`, the only mapped repo is `dapei-skill` (the engine). There are no product repos registered, so the `docs/as-is/*` index contains no upstream behaviors, state machines, domains, business rules, profiles, or entries to surface as "related context".

The cognitive artifacts that Round 1 *produces* are documented in:

- `docs/04-technical-design.md` § Component Design (the `CrossArtifactIndex` data structure and 4 new page generators)
- `docs/05-task-breakdown.md` § Phase 3 (the new aggregation pages)
- `memory/handoff.md` (full handoff package for whoever picks up Stage 5)

Those are *outputs* of the feature, not *inputs*. They should not be cited as "related cognitive context" — citing outputs as context would create a circular reference loop in `runtime-context.md`.

## What this file exists for

`AGENTS.md` § "How Context Injection Works" specifies that `related-cognitive-context.md` is generated on `feature.create` by matching against:

- the specified `repos[]`
- the keywords in `objective`

For a self-host feature, both matches yield zero upstream artifacts. This file declares that explicitly so a future Stage 5 / Stage 6 session does not waste time searching for a non-existent upstream index.

If a future variant of this feature targets an external product (e.g., analyzing `mall-order` as a repo), this file is the slot for the matched behaviors and state machines.

## Why upstream context would normally help (and why it does not here)

In a typical feature workflow:

1. `feature.create` registers 1-N product repos.
2. The cognitive index already contains behaviors / state machines / domains for those repos (written by prior `cdr.profile` / `cdr.behavior.upsert` / `cdr.state.derive` / `cdr.domain.compose` runs).
3. `related-cognitive-context.md` injects the matched subset so the AI starts with durable knowledge instead of re-reading code.
4. Stage 5 implementation extends or modifies those artifacts through the feature's local worktree.

For `cdr-portal-aggregation` the loop is *inverted*: the feature's deliverable **is** the documentation portal generator. The "products" the portal documents are not yet in scope of this feature. They will appear only when a user runs `cdr.doc.generate` against their own workspace. So there is nothing to inject.

## If a future task seems to require context

If during Stage 5 / Stage 6 the implementing session reads `runtime-context.md` and finds itself looking for "related" behaviors or rules that this feature should respect:

1. Check `docs/as-is/behavior/` and `docs/as-is/domains/` in the **product repo's** workspace — not in this repo.
2. If the feature is being run against a test workspace (per `tests/integration/cdr-portal-aggregation.test.mjs` plan in T5.1), the workspace is generated from scratch inside a `mkdtempSync` directory and contains zero artifacts at the start. The fixtures it injects are inline in the test file.
3. If the implementation finds that it needs sample behaviors to validate cross-artifact rendering, it should fabricate them inline in the test (mirroring `cdr-vitepress-build.test.mjs` lines 25-50), **not** depend on committed fixtures (per Round 1 Issue 6 in `01-current-state.md` — committed fixture is on the v2.2 schema and would fail `validateBehaviorArtifact`).

## Self-check at Stage 5 entry

When implementation begins, the first 30 seconds should:

1. Read this file. Confirm "no external cognitive artifacts" is still true (no `repos.add` happened during the design phase).
2. Read `memory/handoff.md`. Confirm task list is current (no scope creep).
3. Read `docs/05-task-breakdown.md` (skim). Identify T1.1 as the entry task.
4. Confirm with the user before T1.1 starts.

If any of these three reads reveals drift (e.g., a workspace got `repos.add` between Stage 4 and Stage 5), update this file before continuing.
