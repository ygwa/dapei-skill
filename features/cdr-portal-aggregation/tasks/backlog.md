# Task Backlog — Round 1 cdr-portal-aggregation

Date: 2026-06-22

Per `SKILL.md` § "Todo list" rule 2:

> **状态变更同步到磁盘**:todo 完成时在 `features/<f>/tasks/backlog.md` 对应行加 `✅ <date>`,保证主 agent context 被压缩后历史可恢复。

This file is the on-disk mirror of the AI client's native todo list. Items here must stay in sync with the active todo list. The source of truth for **scope / acceptance / dependencies / D-mapping** is `../docs/05-task-breakdown.md`; this file is the persistence layer.

## Round 1 · Stage 1-4 (Design) — ✅ DONE 2026-06-22

| # | Item | Status | Date | Notes |
|---|---|---|---|---|
| D-1 | `feature.yaml` written | ✅ | 2026-06-22 | self-host change, single repo `dapei-skill` |
| D-2 | `docs/01-current-state.md` written | ✅ | 2026-06-22 | 6 issues with file:line evidence; later appended Related Context + Handoff Status |
| D-3 | `docs/02-gap-analysis.md` written | ✅ | 2026-06-22 | 10 BG / 4 TG / 3 TstG / Risks / Round Plan |
| D-4 | `docs/04-technical-design.md` written + D1..D7 locked | ✅ | 2026-06-22 | All 7 decisions = option A "recommended", user-confirmed via `question` tool |
| D-5 | `docs/05-task-breakdown.md` written | ✅ | 2026-06-22 | 16 tasks T1.1..T6.2 across 5 phases |
| D-6 | `memory/handoff.md` written | ✅ | 2026-06-22 | Full handoff package for whoever resumes Stage 5 |
| D-7 | `context/repo-context.md` written | ✅ | 2026-06-22 | AGENTS.md § How Context Injection Works |
| D-8 | `context/related-cognitive-context.md` written | ✅ | 2026-06-22 | explains empty upstream injection |
| D-9 | `context/runtime-context.md` written | ✅ | 2026-06-22 | dimension guard header per AGENTS.md line 53-58 |
| D-10 | `tasks/backlog.md` (this file) written | ✅ | 2026-06-22 | on-disk mirror of todo list per SKILL.md line 78 |

## Round 1 · Stage 5 (Implementation) — ⏸ BLOCKED 2026-06-22

**Block reason:** `SKILL.md` § 阶段确认点 mandates user confirmation before `implementation`. To date, the user has locked D1..D7 (design) but has **not** explicitly stated "continue implementation" or equivalent. "Continue" session-resume tokens are session machinery, not user intent.

**Block reason (secondary):** the active session has `bash` + `write` + `question` tools but no `edit` / `read` tools at sufficient fidelity to safely edit `packages/doc-gen/src/doc-gen.ts` (1057 lines, growth ~400-500). Implementation should resume in a session where `read` + `edit` are confirmed present and the Stage 5 entry checklist (in `context/runtime-context.md` § Stage 5 entry checklist) has been run.

| # | Item | Status | Date | Dependencies |
|---|---|---|---|---|
| I-1 | T1.1 — `buildCrossArtifactIndex` in-file helper | ✅ DONE 2026-06-22 | 2026-06-22 | Stage 5 user confirmation (received C-1) |
| I-2 | T1.2 — replace hand-written `allPages` with `listFilesRecursively` | ✅ DONE 2026-06-22 | 2026-06-22 | I-1 |
| I-3 | T2.1 — `generateDomainPage` cross-links | ✅ DONE 2026-06-22 | 2026-06-22 | I-1 |
| I-4 | T2.2 — `generateCapabilityPage` spans | ✅ DONE 2026-06-22 | 2026-06-22 | I-1 |
| I-5 | T2.3 — `generateBehaviorPage` drives transitions | ✅ DONE 2026-06-22 | 2026-06-22 | I-1 |
| I-6 | T2.4 — `generateStatePage` behavior column + D2 strikethrough | ✅ DONE 2026-06-22 | 2026-06-22 | I-1 |
| I-7 | T2.5 — `generateBusinessRulePage` applies_to/derived_from | ✅ DONE 2026-06-22 | 2026-06-22 | I-1 |
| I-8 | T3.1 — `/business-modules/index.md` (D4) | ✅ DONE 2026-06-22 | 2026-06-22 | I-1 |
| I-9 | T3.2 — `/behaviors/by-entry-type/` (D5) | ✅ DONE 2026-06-22 | 2026-06-22 | I-1 |
| I-10 | T3.3 — `/business-rules/by-kind/` | ✅ DONE 2026-06-22 | 2026-06-22 | I-1 |
| I-11 | T3.4 — `/entries/<repo>/index.md` (BG-9) | ✅ DONE 2026-06-22 | 2026-06-22 | I-1 |
| I-12 | T4.1 — `detectExistingPortalSections` + `fold_v08_sections` (D3) | ✅ DONE 2026-06-22 | 2026-06-22 | I-2 |
| I-13 | T5.1 — `cdr-portal-aggregation.test.mjs` (D7) | ✅ DONE 2026-06-22 | 2026-06-22 | I-3..I-12 |
| I-14 | T5.2 — CHANGELOG + `.changeset/cdr-portal-aggregation.md` | ✅ DONE 2026-06-22 | 2026-06-22 | I-13 |

## Round 1 · Stage 5 (Implementation) — ✅ DONE 2026-06-22

Stage 5 (implementation) completed in one continuous run after user-confirmed C-1 option ("C-1 (推荐) 进入 implementation, T1.1 → T5.2, 在 T5.2 后停一次"). All 14 implementation tasks landed empirically (regression: 13/13 pass on `cdr-vitepress-build.test.mjs` + `cdr-portal-aggregation.test.mjs`).

Stage 6 (acceptance) **has not started** — awaiting explicit user confirmation per SKILL.md § 阶段确认点 + AGENTS.md line 6. See `## Round 1 · Stage 6 (Acceptance)` below.

## Round 1 · Stage 6 (Acceptance) — ✅ DONE 2026-06-22

User confirmed "Stage 6: 跑 T6.1 + T6.2 验收" via `question` tool after Stage 5 closure. Both acceptance tasks completed empirically:

| # | Item | Status | Date | Result |
|---|---|---|---|---|
| A-1 | T6.1 — regression sweep 7 existing CDR integration tests | ✅ DONE 2026-06-22 | 2026-06-22 | 12/12 pass (combined with T5.1's 10 cdr-portal-aggregation tests: **22/22**) |
| A-2 | T6.2 — architecture self-check vs AGENTS.md | ✅ DONE 2026-06-22 | 2026-06-22 | 3/3 sub-checks PASS (scope / in-scope / evidence-validator-unchanged); full report at `reports/architecture-review.md` |

## Round 1 · Feature Close — ⏸ AWAITING USER DECISION 2026-06-22

Round 1 implementation + acceptance both empirically complete. **Per `AGENTS.md` line 1 ("Never commit without explicit request") and `SKILL.md` § 阶段确认点, the following actions require explicit user instruction:**

| Action | Status |
|---|---|
| `git commit` | ⏸ awaiting user instruction |
| `git push` | ⏸ awaiting user instruction |
| `git merge` / PR creation | ⏸ awaiting user instruction |
| `bash scripts/release.sh patch` (cut v3.3.0 from `.changeset/cdr-portal-aggregation.md`) | ⏸ awaiting user instruction |
| `git tag vX.Y.Z` | ⏸ awaiting user instruction |
| `feature.close` (backfill any verified changes to workspace-dimension paths) | ⏸ awaiting user instruction |
| Start Round 2 (new `feature.create`) | ⏸ awaiting user instruction |
| Start Round 3 (new `feature.create`) | ⏸ awaiting user instruction |

The handoff package (`memory/handoff.md`, `reports/stage-5-implementation-report.md`, `reports/architecture-review.md`, `reports/acceptance-report.md`, this `tasks/backlog.md`) is sufficient to resume any of the above actions without further context-derivation.

## Round 2 (Quality Signals) — ⏸ BLOCKED 2026-06-22

**Block reason:** Round 2 is unlocked after Round 1 acceptance. Specifically it depends on `buildCrossArtifactIndex` precomputed counts (T1.1 output) being available at runtime. Cannot start until Stage 5 ships T1.1..T6.2 and Stage 6 confirms acceptance.

| # | Item | Status | Date | Dependencies |
|---|---|---|---|---|
| R2-1 | quality signals on home page (entry-coverage / behavior-coverage / fact-ratio / stale-queue) | ⏸ pending Round 1 acceptance | — | A-2 |
| R2-2 | quality signals on capability page (per-capability subset) | ⏸ pending Round 1 acceptance | — | A-2 |
| R2-3 | runtime/template's `build-cognitive-pages.ts` parity | ⏸ pending Round 1 acceptance | — | A-2 |

## Round 3 (Fixture Modernization) — ⏸ BLOCKED 2026-06-22

**Block reason:** Same as Round 2. Additionally, fixture modernization requires a current-schema sample with behaviors + state machines + domain + capability map + business rules so `cdr.bootstrap` produces a non-empty portal against the fixture.

| # | Item | Status | Date | Dependencies |
|---|---|---|---|---|
| R3-1 | modernize `tests/fixtures/sample-node-repo/docs/as-is/behavior/sample-repo-analysis.yaml` from v2.2 → current schema | ⏸ pending Round 1 acceptance | — | A-2 |
| R3-2 | seed `domains/`, `capabilities/`, `business-rules/`, `state-machines/`, `entries/` under same fixture | ⏸ pending Round 1 acceptance | — | R3-1 |
| R3-3 | assert `cdr.bootstrap` against the fixture produces a non-empty portal | ⏸ pending Round 1 acceptance | — | R3-2 |

## State at last edit

| Field | Value |
|---|---|
| Last edit date | 2026-06-22 |
| Last edit action | Wrote this file (D-10) |
| Next planned action | **WAIT for user confirmation before Stage 5** |
| Session capability | `bash`, `write`, `question` confirmed; `edit`, `read` not confirmed at fidelity needed for `packages/doc-gen/src/doc-gen.ts` (1057 lines) |

## Resume protocol

When the next session picks up Round 1 Stage 5:

1. Read this file (`backlog.md`) end-to-end.
2. Read `../context/runtime-context.md` § "Stage 5 entry checklist" — run the 6 bash commands it specifies.
3. If the 6 commands pass, ask the user **once**: "I have D1..D7 locked and the entry checklist passes. Per `SKILL.md` § 阶段确认点 I am pausing here before Stage 5 (implementation). Do you confirm proceeding through T1.1 → T5.2 with one more pause at Stage 6 (acceptance)?"
4. If user says yes, run T1.1 → T5.2 in order. After each task, update both the AI client todo list AND this file (add `✅ <date>` on the relevant row).
5. After T5.2, update this file to mark all I-* rows ✅ and pause for Stage 6 confirmation.
6. After Stage 6 confirmation, run T6.1 → T6.2. After T6.2, write `../reports/acceptance-report.md`.
