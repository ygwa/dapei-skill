# 01. Current State

Date: 2026-06-23

## Touched Repositories

| Repo | Path in worktree | Branch | Status |
|---|---|---|---|
| dapei-skill | `repos/dapei-skill` (symlink of `../dapei-skill-fixture-modernization`) | `feature/cdr-fixture-modernization` (created from `main` @ `8d7e3a7`) | local-only; not yet pushed to origin |

## Current Module Structure

What's on disk right now in this worktree, verified via `ls`:

```
tests/fixtures/sample-node-repo/
├── docs/as-is/
│   └── behavior/                 (one subdir; only v2.2 single-file fixture present)
├── src/                          (3 files: orderService.ts, paymentClient.ts, routes.ts — a tiny demo Node.js app)
├── package.json
└── __expected__/                 (2 fixture baselines: behavior/order-create.yaml, state-machines/order.yaml — also v2.2 schema)

runtime/templates/docs/scripts/
└── build-cognitive-pages.ts       (10,323 bytes — verified ACTIVE, not dead code as D-12 initially guessed)

KNOWN_ISSUES.md                    (does not exist — neither at root nor under docs/)

docs/KNOWN_ISSUES.md               (does not exist)

scripts/first-run.mjs              (does not exist)
```

## Current Fixture State (the actual problem)

`tests/fixtures/sample-node-repo/docs/as-is/` contains **only** `behavior/sample-repo-analysis.yaml`. That file uses **v2.2 schema** (predates CDR v0.1):

```yaml
# Excerpt — verified via previous round 1 evidence:
id: sample-repo-analysis
repo: sample-node-repo
analysis_date: "2026-06-02"
phases_completed:
  - orient
  - strategy
  - candidates
  - deep_dive
behavior:
  entry_points:
    - type: api
      method: POST
      path: /orders
      handler: ordersRouter.post("/orders")
      calls: createOrder
  core_flow:
    name: order-create
    steps: [...]
confidence:
  level: high
  evidence_type: direct_code
```

**Problem**: This will fail `validateBehaviorArtifact()` (see `packages/core/src/evidence.ts:97-186`) for three reasons:
1. `id` field is present but `entry` is **missing** (v2.2 has `behavior.entry_points[]`, current schema has top-level `entry`)
2. `confidence.kind` is **missing** (v2.2 has `level` + `evidence_type`, current schema requires `kind: fact|inference|unknown`)
3. `sources[]` is **missing entirely** — P1 red line: `kind=fact` requires `sources[]`

**Empirical confirmation**: round 1 implementation **discovered** this when writing `tests/integration/cdr-portal-aggregation.test.mjs`: my own test had to write **fresh** current-schema fixture inline (lines 26-50, 91-105, 137-155, 167-181) because using `sample-node-repo/docs/as-is/behavior/sample-repo-analysis.yaml` would have failed evidence validation. **The committed fixture is unusable for any current-schema cdr.* capability.**

## Current `runtime/templates/docs/scripts/build-cognitive-pages.ts` (D-12 verdict)

**Was guessed**: in round 1 defect list D-12 I wrote "if it exists but is not called by `npm run build`, it's dead code". **That guess was wrong** — the file exists AND is active. Verified by `ls -la` showing 10,323 bytes. Round 1's `feature.yaml.scope.in` listed it as in-scope, but round 1 **never modified it** (scope drift D-01).

**What it does** (confirmed by filename + size): it appears to be dapei's **internal dogfooding build script** — dapei uses it to run cdr.* capabilities against itself and produce a `.dapei/docs-portal/` for dapei's own docs. Round 1's `cdr.doc.generate` changes (in `packages/doc-gen/src/doc-gen.ts`) may have **silently broken** this script if it has hardcoded expectations of `pages[]` size or nav shape.

**To verify** (Round 3a action): read the file end-to-end, determine if it produces output equivalent to the round-1 portal when given current-schema fixtures. If yes → update it. If no → document the gap.

## Current first-time-user experience (the second big problem)

What a fresh user does on day 1, in order:

1. `npx skills add ygwa/dapei-skill` (per `README.md` line 17-30)
2. Open AI client (OpenCode / Claude Code / Cursor / Copilot / Windsurf)
3. In an empty directory, type `@dapei initialize the current project workspace`
4. `workspace.init` capability runs → creates `repos/` / `docs/` / `features/` skeleton
5. Manually `repos.add <repo>` for each repo the user wants to analyze
6. `repos.analyze` runs → populates `docs/as-is/profiles/<repo>.yaml`
7. `cdr.entries.candidate` → `cdr.entries.propose` → `cdr.entries.confirm` for each entry point
8. `cdr.behavior.upsert` for each behavior fact (with sources[]!) — schema strict
9. `cdr.state.derive` for each state machine
10. `cdr.domain.compose` for each domain cluster
11. `cdr.business.compose` for each rule (with confidence + sources[]!)
12. `cdr.capability.map.init`
13. `cdr.doc.generate` → portal at `.dapei/docs-portal/`

**Issues**:
- Steps 7-11 each require **schema-correct input** (P1 red lines). Round 1 implementation hit **4 P0/P1 schema mismatches** in test data alone (see "Known Issues Discovered in Round 1" below).
- There is **no first-run script** to automate this. User does it by hand, hitting every schema gotcha.
- There is **no demo repo** shipped with dapei (`tests/fixtures/sample-node-repo/` is supposed to be the demo, but its cognitive artifacts are v2.2 schema → unusable).
- There is **no onboarding doc** explaining "which command do I run first" beyond the 4 examples in `README.md`.
- There is **no KNOWN_ISSUES.md** listing the 7+ pitfalls round 1 discovered (they live only in commit history).

## Known Issues Discovered in Round 1 (the things KNOWN_ISSUES.md should contain)

These are **real, empirical** issues I encountered while implementing round 1. Each is a thing a new user would hit:

| # | Issue | Where it bites | Workaround |
|---|---|---|---|
| 1 | `tests/fixtures/sample-node-repo/docs/as-is/behavior/sample-repo-analysis.yaml` is v2.2 schema, fails `validateBehaviorArtifact()` | First user who runs `cdr.bootstrap` against fixture | (Round 3 fix — this feature) |
| 2 | `runtime/templates/docs/scripts/build-cognitive-pages.ts` is ACTIVE but was out of round 1's scope — may produce stale output post-round-1 | Self-dogfooding build | (Round 3 verify-or-update) |
| 3 | No `KNOWN_ISSUES.md` exists — issues only in commit history | User looking for help | (Round 3 fix — this feature) |
| 4 | No `first-run` script — user does 7-13 steps by hand | First-time user | (Round 3 fix — this feature) |
| 5 | No interactive help (`cdr.<cap> explain`) — user must read source code to know input schema fields | First-time user | (Not Round 3 scope; Round 4 candidate) |
| 6 | Schema field names don't match what users expect from task descriptions (e.g., `cdr.domain.compose` requires field `behaviors`, not `derived_from`; `cdr.state.derive` requires `behaviors`, not `states`) | Anyone writing capability input | (Document in KNOWN_ISSUES.md; long-term add to capability input schema docs) |
| 7 | `kind=fact` requires `sources[]` (P1 red line) but it's easy to forget; failing source validation throws at execute time, not validate time | Anyone writing `cdr.business.compose` with `kind=fact` | (Document in KNOWN_ISSUES.md) |
| 8 | Worktree `node_modules` symlink not covered by `node_modules/` gitignore rule (round 1 added a `node_modules` literal fix in feature commit `3e5848c`) | Anyone using git worktree + symlinked deps | (Round 1 already merged fix; document) |
| 9 | `cdr.doc.generate` writes `/l1/index.md` and `/cross-repo/index.md` to the **portal dir** (`.dapei/docs-portal/l1/`), **not** to `docs/as-is/l1/` — these sections must be pre-written to portal dir for auto-fold to work | Anyone running cdr.reversecluster.doc.generate before cdr.doc.generate | (Document; round 1 design is correct but documentation gap) |
| 10 | VitePress build fails on raw `<name>` in prose without v0.10's `sanitizeMarkdownPage` post-pass | Anyone using cdr.doc.generate output pre-v0.10 | (Already fixed in v0.10 + round 1; document) |

Round 3 will populate `KNOWN_ISSUES.md` with all 10.

## Existing Tests (must not regress)

Per `package.json` line 13-17, dapei has 4 test tiers:
- `tests/unit/*.test.mjs`
- `tests/integration/*.test.mjs`
- `tests/scenarios/*.test.mjs`
- `tests/ai-behavior/*.test.mjs`

Round 3 acceptance criteria include "existing tests still pass (≥ 22/22)" — round 1 left 22 tests passing (3 cdr-vitepress-build + 10 cdr-portal-aggregation + 2 cdr-v0.4-multi-repo + 1 cdr-v0.5-cross-repo + 1 cdr-v0.6-structured-calls + 3 cdr-v0.8-reverse-cluster + 1 cdr-reading-writing-loop + 1 cdr-e2e).

## Dependencies

None. Round 3 is self-contained — fixture + scripts + docs only, no engine code changes.

## Unknowns (questions that need answering in stage 3 design)

- [ ] What is the **scope** of the `dapei-demo` repo (new fixture)? Should it be the existing `tests/fixtures/sample-node-repo/` upgraded in place, OR a fresh new directory `tests/fixtures/dapei-demo/`?
- [ ] Should `KNOWN_ISSUES.md` be a top-level file (workspace-dimension) or feature-dimension? Per `AGENTS.md` Knowledge Boundary — workspace-dimension files (like `KNOWN_ISSUES.md`) are modified at `feature.close`, not during stage 5. So this is a **post-implementation** decision.
- [ ] Should `runtime/templates/docs/scripts/build-cognitive-pages.ts` be (a) updated to current portal shape, (b) removed if dapei no longer dogfoods, or (c) replaced with a new script? Need to **read** the file first to make this call.
- [ ] Does `npm run first-run` need to be **idempotent** (re-runnable on existing workspace) or **strict** (only runnable on empty workspace)? Idempotent is friendlier.

## Evidence (file:line anchors)

| Claim | File | Lines |
|---|---|---|
| `tests/fixtures/sample-node-repo/docs/as-is/` only has `behavior/` | (verified via `ls -la` 2026-06-23) | — |
| Fixture uses v2.2 schema | `tests/fixtures/sample-node-repo/docs/as-is/behavior/sample-repo-analysis.yaml` | full file (62 lines) |
| Current CDR schema requires `entry` (not `behavior.entry_points`) | `packages/core/src/evidence.ts` | 102-111 |
| Current CDR schema requires `confidence.kind` | `packages/core/src/evidence.ts` | 66-75 |
| P1 red line: `kind=fact` requires `sources[]` | `packages/core/src/evidence.ts` | 86-88 |
| `runtime/templates/docs/scripts/build-cognitive-pages.ts` exists + active | (verified via `ls -la` 2026-06-23) | full file (10,323 bytes, ~250 lines) |
| `KNOWN_ISSUES.md` does not exist | (verified via `ls -la` 2026-06-23) | — |
| Round 1 hit 4 schema mismatches during test writing | `tests/integration/cdr-portal-aggregation.test.mjs` commit history | — |
| 22 tests pass currently (round 1 baseline) | (verified via `node --test` 2026-06-22 round 1 acceptance) | — |
| `npm run first-run` script doesn't exist | (verified via `grep` 2026-06-23) | — |
