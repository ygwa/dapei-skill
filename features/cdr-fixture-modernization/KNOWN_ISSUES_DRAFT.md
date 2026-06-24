# Known Issues — DRAFT

> **Draft state.** This file lives in feature-dimension only.
> Maintainer copies to root `KNOWN_ISSUES.md` at `feature.close` (post-merge).
> See `feature.yaml` scope + AGENTS.md Knowledge Boundary & Dimension Rules.

Last updated: 2026-06-23
Source: round 1 (`feature/cdr-portal-aggregation`) + round 3 (`feature/cdr-fixture-modernization`) discovery.

---

## KI-01 — Schema migration (v2.2 unsupported)

**Symptom**: YAML artifacts written before CDR v0.1 (dapei-skill <= 2.2) use field names like `phases_completed`, `behavior.entry_points`, `behavior.core_flow`, `confidence.level`, `confidence.evidence_type`. Engine `packages/core/src/evidence.ts` schema rejects these silently with "missing field `entry`" or "missing field `sources`".

**Workaround**: Old artifacts archived as `<id>.v22.archive` with header comment. New artifacts follow CDR v0.3 schema (round 3 fixture: `order-create.yaml`, `order-state-machine`, etc.).

**Fix status**: `cdr.migrate.v22` capability **deferred to Round 4+** per Round 3 design D5. No ETA.

**Affected**: any workspace with pre-v2.3 cognitive artifacts. Affects round 1 fixture `sample-repo-analysis.v22.archive` only — not production users.

---

## KI-02 — `runtime/templates/docs/scripts/build-cognitive-pages.ts` is shipped but minimally exercised

**Symptom**: 273-line TS script copied into every user workspace via `packages/core/src/capabilities/domains/workspace.ts:68` (`copyIfMissing`) and exposed as `npm run docs:build-assets`. Not referenced by any current engine capability, `cdr.doc.generate`, or test. Output dir `docs/compiled/` is never created.

**Workaround**: Leave file in place. End-users can run `npm run docs:build-assets` if they want — it's a no-op when input is empty. Round 1 investigated removing it; **vestigial claim was incorrect** (U-2 finding during round 3 stage 5) — `workspace.ts:68` actively depends on it being present.

**Fix status**: Resolved by **NOT deleting**. Future Round 4+ may rewrite or replace; out of scope for round 3.

**Affected**: maintainers only (CI copies it). No user impact.

---

## KI-03 — `first-run.mjs` validates via capability call but accepts graceful fallback

**Symptom**: Round 3 `scripts/first-run.mjs` S6 (`s6_validateFixtures`) calls `runCapability("cdr.profile", ...)` from `packages/core/dist/index.js`. If `dist/` not built, import fails, and S6 silently downgrades to "skip deep validation". This means a fresh workspace can pass `first-run` without proof that fixtures actually validate.

**Workaround**: Maintainer must run `npm run build` before `npm run first-run` to enable strict validation. CI does this.

**Fix status**: Acceptable for v3.3.0. Tightening (refuse to continue when `dist/` missing) is a candidate for round 4+ if user feedback warrants.

**Affected**: maintainers running first-run from a clean checkout. End-users using `@dapei initialize ...` are unaffected.

---

## KI-04 — Portal auto-fold behavior for v0.5/v0.8 sections must not regress

**Symptom**: Round 1 (PR #11) added auto-fold for L1 sections (`<CapabilityGroup>`) and v0.8 reverse-cluster sections. If a future change adds new portal sections without updating `BehaviorFlow.vue`/`StateMachine.vue` fold logic, the new sections may render fully expanded by default, breaking IA.

**Workaround**: Round 3 acceptance test `tests/integration/cdr-portal-aggregation.test.mjs` checks section count and default-fold state. If new sections are added in future rounds, add corresponding fold entries.

**Fix status**: Regression covered by existing round 1 tests (T4.2 verifies 22/22 still pass).

**Affected**: any future portal-section addition.

---

## KI-05 — `KNOWN_ISSUES.md` not yet at repo root

**Symptom**: This draft (`KNOWN_ISSUES_DRAFT.md`) lives in feature-dim only. Root `KNOWN_ISSUES.md` does not exist. Until maintainer copies this draft to root at `feature.close`, new contributors cannot discover KI-01..04 from the repo landing page.

**Workaround**: This draft is the authoritative source until copy lands.

**Fix status**: Tracked as T5.1 in round 3 task-breakdown. Lands post-merge at `feature.close`.

**Affected**: new contributors, release notes.

---

## KI-06 — CDR portal depends on `npx vitepress build` (Node-only)

**Symptom**: `.dapei/docs-portal/` build requires VitePress + Vue 3 devDeps. If user workspace has no Node toolchain (unusual but possible for pure-doc repos), `cdr.doc.generate` fails.

**Workaround**: Round 1 smoke test verifies portal builds in CI; users running `@dapei generate documentation portal` get clear error message if VitePress missing.

**Fix status**: Documented limitation, no fix planned.

**Affected**: Node-less workspaces (rare).

---

## KI-07 — Chinese (`@dapei`) intent routing limited to listed keywords

**Symptom**: README § CDR lists Chinese variants: `分析` → `cdr.profile`, `扫描入口` → `cdr.entries.prepare`, etc. New Chinese phrasings (e.g. `看下单流程`) are NOT routed and fall back to router no-match.

**Workaround**: Use English `cdr.<cap>` or listed Chinese keywords. Round 3 does not extend routing.

**Fix status**: Round 4+ candidate for `packages/router` extension.

**Affected**: Chinese-only users with non-listed phrasings.

---

## KI-08 — `features/<feature>/docs/00-project-overview.md` is Round 1 untracked artifact

**Symptom**: During round 1 stage 5, I wrote `features/cdr-portal-aggregation/docs/00-project-overview.md` (369 lines, untracked) as a self-summary. Round 1 PR #11 does NOT include this file. If round 3 closes cleanly and round 1 PR merges, this file lives in round 1 worktree only.

**Workaround**: Acceptable — it was self-context, not feature deliverable. Will be lost when round 1 worktree is removed post-merge.

**Fix status**: None. Round 1 self-summary, not a deliverable.

**Affected**: none (was self-context).

---

## KI-09 — Round 3 stage 5 mid-flight scope correction (D3)

**Symptom**: Round 3 design D3 claimed `runtime/templates/docs/scripts/build-cognitive-pages.ts` was vestigial based on stage 1 grep. Stage 5 execution (U-2) found a real code reference at `packages/core/src/capabilities/domains/workspace.ts:68` (`copyIfMissing`). Deletion was reverted. **Lesson**: stage 1 "no code refs" finding was wrong because the grep was over-narrow (excluded `.ts` by mistake, or `copyIfMissing` arg was missed).

**Workaround**: Apply this lesson: **always grep with `--include` covering all extensions and inspect call sites before claiming "vestigial"**.

**Fix status**: Process lesson, no code fix.

**Affected**: future vestigial-file investigations.

---

## KI-10 — `feature.yaml` scope.in drift between rounds

**Symptom**: Round 1 `feature.yaml` listed `runtime/templates/docs/scripts/build-cognitive-pages.ts` in scope.in but round 1 never modified it. Round 3 inherited this scope drift. AGENTS.md says scope.in drives the PR review surface.

**Workaround**: Round 3 keeps file in scope.in (file IS shipped via workspace.ts:68) but round 3 makes no code changes to it. Future rounds should audit scope.in against actual diff.

**Fix status**: Process lesson. Future rounds: validate scope.in against `git diff main --stat` before opening PR.

**Affected**: PR review surface accuracy.

---

## Summary

| ID | Severity | Fix status |
|---|---|---|
| KI-01 | medium (legacy users) | deferred (Round 4+) |
| KI-02 | low (maintainer-only) | resolved (don't delete) |
| KI-03 | low (maintainer-only) | accepted |
| KI-04 | low (regression-covered) | resolved (tests in place) |
| KI-05 | low (new contributors) | post-merge (T5.1) |
| KI-06 | low (rare workspaces) | documented |
| KI-07 | low (CN users) | Round 4+ candidate |
| KI-08 | none (self-context) | none |
| KI-09 | none (process) | lesson |
| KI-10 | low (review accuracy) | lesson |
