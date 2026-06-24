# 05. Task Breakdown

Date: 2026-06-23

## Related Documents

- Previous: [04. Technical Design](./04-technical-design.md)

## Task Backlog

### Phase 1 — Foundation (fixture upgrade)

#### T1.1 · Archive v2.2 sample-repo-analysis.yaml

- **Scope:** Rename `tests/fixtures/sample-node-repo/docs/as-is/behavior/sample-repo-analysis.yaml` to `sample-repo-analysis.v22.archive` and prepend a header comment explaining "v2.2 schema; unsupported; see KNOWN_ISSUES.md"
- **Files:** 1 file rename
- **Acceptance signal:** `git status` shows rename only; new file has 3-line header comment
- **Dependency:** none

#### T1.2 · Write current-schema behavior fixture

- **Scope:** Create `tests/fixtures/sample-node-repo/docs/as-is/behavior/order-create.yaml` matching the schema in design § C-1
- **Files:** 1 new YAML
- **Acceptance signal:** file passes `validateBehaviorArtifact()` (round 1 integration test verifies this)
- **Dependency:** none

#### T1.3 · Write current-schema state-machine fixture

- **Scope:** Create `tests/fixtures/sample-node-repo/docs/as-is/state-machines/order.yaml` with 3 states (CREATED, PAID, CANCELLED) and 3 transitions, 1 linking to `behavior_id: order-create`
- **Files:** 1 new YAML
- **Acceptance signal:** file passes `validateStateMachineArtifact()`
- **Dependency:** T1.2 (state machine references behavior_id from T1.2)

#### T1.4 · Write current-schema domain fixture

- **Scope:** Create `tests/fixtures/sample-node-repo/docs/as-is/domains/checkout.yaml` with `domain: checkout`, `derived_from: [order-create]` (P1)
- **Files:** 1 new YAML
- **Acceptance signal:** file passes `validateDomainArtifact()` (P1 red line: `derived_from` required)
- **Dependency:** T1.2

#### T1.5 · Write current-schema business rule fixtures (×2)

- **Scope:** Create 2 files: `business-rules/order-amount-positive.yaml` (invariant, kind=fact, sources[]) and `business-rules/order-cancel-allowed.yaml` (authorization, kind=fact, sources[])
- **Files:** 2 new YAMLs
- **Acceptance signal:** both files pass `validateBusinessRuleArtifact()` (P1: `kind=fact` requires `sources[]`)
- **Dependency:** T1.2

#### T1.6 · Write current-schema capability map fixture

- **Scope:** Create `tests/fixtures/sample-node-repo/docs/as-is/capabilities/product-map.yaml` with 1 capability `place-order`, `domains: [checkout]`, `spans_repos: [sample-node-repo]`
- **Files:** 1 new YAML
- **Acceptance signal:** file passes `validateCapabilityMapArtifact()`
- **Dependency:** T1.4 (references domain)

### Phase 2 — Tooling (first-run + build script removal)

#### T2.1 · Implement `scripts/first-run.mjs`

- **Scope:** Node.js ≥ 22.6 ESM script. Implements the 7-step state machine in design § C-2. Idempotent: detects existing state, skips or patches. Exit codes 0/1/2 per design.
- **Files:** 1 new script (~150 lines)
- **Acceptance signal:** runs successfully on empty workspace in < 60s; produces non-empty `.dapei/docs-portal/`
- **Dependency:** T1.* (fixture must be in place)

#### T2.2 · Add `first-run` script to `package.json`

- **Scope:** Add `"first-run": "node scripts/first-run.mjs"` to `package.json` scripts
- **Files:** 1 file edit
- **Acceptance signal:** `npm run first-run` invokes the script
- **Dependency:** T2.1

#### T2.3 · Delete `runtime/templates/docs/scripts/build-cognitive-pages.ts`

- **Scope:** `git rm runtime/templates/docs/scripts/build-cognitive-pages.ts`. Empirically verified (round 3 stage 1) as vestigial: no code references it, output dir `docs/compiled/` does not exist.
- **Files:** 1 file deletion
- **Acceptance signal:** `grep -r build-cognitive-pages` returns empty
- **Dependency:** none

### Phase 3 — Documentation (KNOWN_ISSUES draft)

#### T3.1 · Write `KNOWN_ISSUES_DRAFT.md` (feature-dimension)

- **Scope:** Write 10 entries (copied from round 1's known-issues list in `01-current-state.md`). Header note: "this file lives in feature-dim only; maintainer copies to root KNOWN_ISSUES.md at `feature.close`"
- **Files:** 1 new feature-dim file
- **Acceptance signal:** 10 entries, each with symptom + workaround + fix status
- **Dependency:** none

### Phase 4 — Test (acceptance)

#### T4.1 · Write `tests/integration/cdr-bootstrap.test.mjs`

- **Scope:** 4 tests per design § C-5: idempotent re-run, empty-workspace produces portal, existing-workspace skips re-init, round 1 regression check
- **Files:** 1 new test file (~250 lines)
- **Acceptance signal:** all 4 tests pass
- **Dependency:** T1.*, T2.*

#### T4.2 · Verify round 1 tests still pass

- **Scope:** Run `node --experimental-strip-types --test tests/integration/cdr-{vitepress-build,portal-aggregation,...}.test.mjs`; assert 22/22 pass (round 1 baseline)
- **Files:** no file changes
- **Acceptance signal:** test count = 22, all pass
- **Dependency:** T1.* (new fixture might affect round 1 tests if they referenced sample-node-repo; verified in round 1 they don't, but T4.2 is the empirical check)

### Phase 5 — Closeout (workspace-dim landing)

This phase runs **after** PR merge, at `feature.close`. NOT in Round 3 PR per D2.

#### T5.1 · Maintainer creates `KNOWN_ISSUES.md` at root

- **Scope:** Copy `features/cdr-fixture-modernization/KNOWN_ISSUES_DRAFT.md` → `KNOWN_ISSUES.md` at repo root
- **Files:** 1 new workspace-dim file
- **Acceptance signal:** `KNOWN_ISSUES.md` exists at root with 10 entries
- **Dependency:** PR merge + feature.close

## Dependencies Graph

```
T1.1 → T1.2 → T1.3
            ↘
              T1.4 → T1.5 → T1.6
              ↓
              T2.1 → T2.2
              ↓
T2.3 (independent)

T1.* → T4.1 → T4.2

T1.*, T2.* → T3.1 (independent of ordering)

All → (after PR merge) T5.1 (closeout, NOT in PR)
```

## Effort Estimate

| Task | Estimate | Notes |
|---|---|---|
| T1.1 | 0.1h | git mv + edit header |
| T1.2 | 0.5h | write YAML matching design § C-1; verify schema |
| T1.3 | 0.5h | write YAML, link to T1.2 |
| T1.4 | 0.3h | simple YAML |
| T1.5 | 0.5h | 2 YAMLs |
| T1.6 | 0.3h | simple YAML |
| T2.1 | 2h | bulk of implementation; state detection + 7-step orchestration + error handling |
| T2.2 | 0.1h | package.json edit |
| T2.3 | 0.1h | git rm |
| T3.1 | 1h | 10 entries from round 1's known-issues |
| T4.1 | 2h | 4 test cases + tmp-workspace setup mirroring `cdr-portal-aggregation.test.mjs` |
| T4.2 | 0.5h | run full test suite, observe |
| T5.1 | 0.1h | cp file at closeout |
| **Total** | **~8h** | One focused day for a senior engineer |

## Timeline

| Day | Tasks | Gate |
|---|---|---|
| Day 1 AM | T1.1, T1.2, T1.3, T1.4, T1.5, T1.6 (fixture upgrade) | Internal smoke: load each YAML via cdr.* capabilities in a one-off script |
| Day 1 PM | T2.1, T2.2 (first-run script) | Internal smoke: run on tmp workspace, verify portal generated |
| Day 2 AM | T2.3 (delete build-cognitive-pages), T3.1 (KNOWN_ISSUES draft), T4.1 (bootstrap test) | Internal smoke: run bootstrap test, verify all 4 tests pass |
| Day 2 PM | T4.2 (round 1 regression), commit, push | **Implementation checkpoint** — pause for user, ask: commit + open PR? |
| (post-merge) | T5.1 (closeout) | After PR merge + maintainer's `feature.close` workflow |

## Pause points (per `SKILL.md` § 阶段确认点)

| Pause | Reason |
|---|---|
| Before T2.1 starts (after stage 4 done) | Confirm stage 4 task list; user can reorder or skip tasks |
| After Day 2 PM (before commit) | Confirm implementation matches design; user may want to amend before PR |
| Before T5.1 | Maintainer action (not part of AI's execution) |

## Open Questions (resolved by stage 3 design)

All D-decisions (D1..D5) are locked. No remaining questions.

## Out of scope for Round 3 (deferred)

- `cdr.migrate.v22` capability (D5 deferred)
- CI templates public release (`templates/.github/workflows/dapei-*.yml`) — separate feature
- Multi-AI-client conformance test suite — separate feature
- `cdr.<cap> explain` interactive help — separate feature
- demo repo growth controls (Round 3 risk-2 mitigation) — separate feature if needed
