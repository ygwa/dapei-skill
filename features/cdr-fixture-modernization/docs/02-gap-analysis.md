# 02. Gap Analysis

Date: 2026-06-23

## Related Documents

- Previous: [01. Current State](./01-current-state.md)

## Business Gaps

### BG-1 · Sample-node-repo fixture fails on first user touch

| Field | Value |
|---|---|
| Symptom | `tests/fixtures/sample-node-repo/docs/as-is/behavior/sample-repo-analysis.yaml` is **v2.2 schema**. When a fresh user runs `cdr.bootstrap` against this fixture, `validateBehaviorArtifact()` throws because `entry`, `confidence.kind`, and `sources[]` are all missing (P1 red lines). |
| Impact | **Round 3 priority #1**. New user immediately gets a confusing error. They may conclude "dapei doesn't work" and leave. |
| Empirically confirmed by | Round 1 implementation: `tests/integration/cdr-portal-aggregation.test.mjs` had to write its own inline current-schema fixture because using sample-node-repo would fail validation. |
| Blocks | Onboarding script (BG-2), KNOWN_ISSUES entry (#1), CI smoke test (TstG-1). |

### BG-2 · No first-time-user onboarding script

| Field | Value |
|---|---|
| Symptom | New user must run ~7 cdr.* capabilities by hand in correct order (`workspace.init` → `repos.add` → `repos.analyze` → `cdr.entries.{candidate,propose,confirm}` → `cdr.behavior.upsert` → `cdr.state.derive` → `cdr.domain.compose` → `cdr.business.compose` → `cdr.capability.map.init` → `cdr.doc.generate`). No `npm run first-run` (or equivalent). |
| Impact | First-run UX is high-friction. Round 1 hit **4 schema mismatches** in test fixture writing alone; a new user would hit them too with no hint. |
| Empirically confirmed by | `grep first-run / first_time / onboarding` on `package.json` returned nothing (verified 2026-06-23). |
| Blocks | First-time-user success (the entire "this thing works for newcomers" experience). |

### BG-3 · Sample-node-repo fixture is incomplete (only behavior)

| Field | Value |
|---|---|
| Symptom | `tests/fixtures/sample-node-repo/docs/as-is/` contains ONLY `behavior/`. There are **no** `domains/`, `state-machines/`, `business-rules/`, `entries/`, or `capabilities/`. So even if BG-1 were fixed, the fixture would not exercise the cross-artifact aggregation pages added in round 1 (`/business-modules/`, `/behaviors/by-entry-type/`, etc.). |
| Impact | The fixture cannot validate round 1's cross-artifact aggregation features. Anyone testing "does cdr.doc.generate produce cross-artifact pages" needs to either reuse round 1's inline test fixture (coupled to test file) or build their own. |
| Empirically confirmed by | `ls tests/fixtures/sample-node-repo/docs/as-is/` returned only `behavior/` subdir (verified 2026-06-23). |
| Blocks | A realistic CI smoke test of round 1's portal output. |

### BG-4 · KNOWN_ISSUES.md does not exist

| Field | Value |
|---|---|
| Symptom | No top-level or `docs/KNOWN_ISSUES.md` exists. All round-1-discovered issues live only in commit history (`3e5848c` commit message) and feature workspace reports. |
| Impact | New user hitting a round-1-discovered issue has no canonical doc to grep; ends up filing a GitHub issue or giving up. |
| Empirically confirmed by | `ls KNOWN_ISSUES.md docs/KNOWN_ISSUES.md` both returned "No such file or directory" (verified 2026-06-23). |
| Blocks | BG-1, BG-2, BG-3 — every onboarding pain point should be recorded somewhere durable. |

### BG-5 · `runtime/templates/docs/scripts/build-cognitive-pages.ts` may produce stale output post-round-1

| Field | Value |
|---|---|
| Symptom | This 10,323-byte file is **active** (not dead code, contradicting my earlier D-12 guess). Round 1 added new pages (`/business-modules/`, `/behaviors/by-entry-type/`, etc.) and a new `nav` parameter to `generateVitepressConfig`. If `build-cognitive-pages.ts` hardcodes expectations of `pages[]` size or nav shape, its output is now stale. |
| Impact | **Dapei's own dogfooding pipeline may produce broken portal**. Even if not actively invoked in CI today, it's a latent break. |
| Empirically confirmed by | (verified 2026-06-23: `ls -la` shows 10,323 bytes, file exists). Full content not yet read in this session; will be read in stage 3 design. |
| Blocks | Confidence that round 1 + 3 don't silently break dapei's internal pipeline. |

## Technical Gaps

### TG-1 · Scope drift between round 1's `feature.yaml.scope.in` and implementation

| Field | Value |
|---|---|
| Symptom | Round 1's `feature.yaml.scope.in` listed 6 paths including `runtime/templates/docs/scripts/build-cognitive-pages.ts`. Round 1's actual implementation **never modified this file** (verified by `git diff 8d7e3a7..HEAD -- runtime/templates/` returning empty). |
| Impact | Manifest lied — feature declared it would touch this file but didn't. |
| Empirically confirmed by | `git diff --stat` of round 1 commit. |
| Blocks | Round 3 must verify whether to update the file (per BG-5) or amend round 1's `feature.yaml` to acknowledge the scope drift. |

### TG-2 · Schema alias backwards-compat for v2.2 fixtures

| Field | Value |
|---|---|
| Symptom | If any other dapei user (not the maintainer) has v2.2 cognitive artifacts lying around in their workspace, round 1+2+3 will reject them. |
| Impact | Real users with pre-CDR cognitive state can't migrate without a manual converter. |
| Risk level | Low (most users are pre-existing-dapei-skill users, few have v2.2 hand-rolled artifacts), but the option is cheap. |
| Round 3 decision needed | Either write a `cdr.migrate.v22` capability (1-2 days of work), or document that v2.2 is unsupported and require user re-creation. |

### TG-3 · No `cdr.bootstrap` smoke test in CI

| Field | Value |
|---|---|
| Symptom | There's no integration test that runs the full cdr.bootstrap flow on a fresh workspace and verifies "yes, you get a usable portal". CI runs `cdr-vitepress-build` etc. on **already-bootstrapped** workspaces; it doesn't test the bootstrap path itself. |
| Impact | First-time-user onboarding can regress without CI catching it. |
| Round 3 acceptance includes | A new `tests/integration/cdr-bootstrap.test.mjs` that runs the full bootstrap flow against the upgraded fixture. |

## Test Gaps

### TstG-1 · No bootstrap-path integration test

| Field | Value |
|---|---|
| Symptom | Same as TG-3. |
| Round 3 acceptance | New `tests/integration/cdr-bootstrap.test.mjs` exists, passes, runs in < 60 seconds. |

### TstG-2 · No fixture-as-documentation test

| Field | Value |
|---|---|
| Symptom | The fixture should serve as **living documentation** of "what good CDR artifacts look like". But there's no test asserting "if the fixture changes, the docs/ round-trip is still valid". |
| Round 3 acceptance | The fixture + integration test pair acts as the documentation. |

### TstG-3 · No round 1 regression assertion in CI from round 3's perspective

| Field | Value |
|---|---|
| Symptom | Round 1's PR #11 added 22 passing tests. But these run against round 1's inline fixtures. If round 3 changes the canonical fixture and the round 1 tests break, we don't know whether round 3 broke round 1 or round 1 was always fragile. |
| Round 3 acceptance | Run round 1's 22 tests post-fixture-upgrade; assert all still pass. |

## Risks

### Risk-1 · Schema migration could break existing user data

If user X has a workspace with v2.2 cognitive artifacts and upgrades dapei, their data becomes "invalid". We don't have a clear migration story.

**Mitigation**: in `KNOWN_ISSUES.md` document that v2.2 is unsupported; offer `cdr.migrate.v22` as a separate capability (out of round 3 scope).

### Risk-2 · `dapei-demo` repo size explosion

If the new `dapei-demo` fixture becomes the "canonical demo" and grows to 50+ files, dapei-skill repo size doubles. We don't want bloat.

**Mitigation**: keep fixture ≤ 10 files (1 behavior + 1 state machine + 1 domain + 2 business rules + 1 capability map entry); document the size budget in KNOWN_ISSUES.

### Risk-3 · Onboarding doc written from AI's perspective, not user's

If I write the onboarding doc, it'll reflect what *I* would want to know — not what a fresh user actually needs. Risk of skipping obvious-to-me steps.

**Mitigation**: doc is treated as draft; user (maintainer) is expected to dogfood it on a friend / colleague before round 3 ships.

## Open Questions (for stage 3 design)

These are the 4 unknowns from `feature.yaml` line 28-32, plus 1 new one surfaced by gap analysis:

1. **Q1 — Fixture location**: upgrade existing `tests/fixtures/sample-node-repo/` in place, OR create fresh `tests/fixtures/dapei-demo/`? (Round 1's defect list D-12 inferred "in place" but I never read the file to confirm)
2. **Q2 — KNOWN_ISSUES.md location**: top-level workspace-dimension file (`KNOWN_ISSUES.md`) vs feature-dimension file (lands via `feature.close`)? Per `AGENTS.md` Knowledge Boundary, workspace-dim is correct. Means it lands **post** round 3 ship, not in round 3 commit.
3. **Q3 — build-cognitive-pages.ts disposition**: (a) update to emit current-schema portal, (b) remove if dapei no longer dogfoods, or (c) replace? Need to read the file first.
4. **Q4 — `first-run` idempotency**: idempotent (re-runnable on existing workspace) vs strict (only empty workspace)? Idempotent is friendlier.
5. **Q5 (new) — v2.2 backward-compat migration**: write `cdr.migrate.v22` capability now, or defer + document only? (Per Risk-1 mitigation.)

## Round Plan

| Round | Scope | Exit criterion |
|---|---|---|
| **3a (this feature)** | Upgrade sample-node-repo fixture to current schema + add missing artifact types + new `npm run first-run` script + KNOWN_ISSUES.md (10 entries) + read & decide on `build-cognitive-pages.ts` + new `tests/integration/cdr-bootstrap.test.mjs` | Fresh checkout → `npm run first-run` → non-empty portal in < 60s; existing 22 tests still pass; KNOWN_ISSUES.md exists |
| **3b (deferred, separate feature if needed)** | If `build-cognitive-pages.ts` is ACTIVE and stale: update to current portal shape | dapei's dogfooding pipeline produces equivalent portal output |
| **3c (deferred, separate feature if needed)** | `cdr.migrate.v22` capability for users with v2.2 data | Migration script exists + tests pass |

3b and 3c are **out of round 3 scope** per `feature.yaml.scope.out`. They are documented here for transparency but not implemented in this feature.
