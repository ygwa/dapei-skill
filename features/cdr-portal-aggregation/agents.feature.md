# Feature Agents — cdr-portal-aggregation

Date: 2026-06-22

> Per `runtime/templates/agents.feature.md.template`. This file maps the root `AGENTS.md` collaboration rules to this specific feature. Read alongside the root `AGENTS.md`, not instead of it.

## Runtime Context

- **Feature:** `cdr-portal-aggregation`
- **Objective:** "Make the CDR documentation portal show business-module abstractions instead of one yaml-per-page mirror; aggregate domains/capabilities/state-machines/business-rules across artifacts and integrate the v0.8 /l1/ and v0.5 /cross-repo/ sections into the main portal."
- **Repos:** `dapei-skill` (self-host change; only repo mapped)
- **Active stage at last edit:** Stage 4 (task-breakdown) complete; Stage 5 (implementation) **blocked on user confirmation** per `SKILL.md` § 阶段确认点

## Roles

### 1 · PM Agent (scope + acceptance)

- **Owns:** `feature.yaml`, `docs/02-gap-analysis.md` (the 10 BG / 4 TG / 3 TstG list), `tasks/backlog.md`.
- **Reads first when resuming:** `tasks/backlog.md`, then `docs/02-gap-analysis.md`.
- **Decides:** Is the scope still right? Has the user added/changed requirements since the last edit? Should any pending D1..D7 decision be revisited?
- **Does NOT:** Touch code. Edit `docs/04-technical-design.md` architecture without re-running the D-decision gate.
- **Tool budget:** Read-only + lightweight `bash` for `wc -l` / `git status` checks.

### 2 · Architect Agent (boundary + design)

- **Owns:** `docs/04-technical-design.md`, `context/runtime-context.md` (dimension guard).
- **Reads first when resuming:** `docs/04-technical-design.md` § "Decision Record" (D1..D7 locked), then `context/runtime-context.md` § "Stage 5 entry checklist".
- **Decides:** Does the implementation match the design? Has the baseline drifted (`wc -l packages/doc-gen/src/doc-gen.ts` should still be 1057)? Does any in-scope change touch an out-of-scope file?
- **Does NOT:** Add new BG/TG items without re-running gap analysis. Modify `packages/core/**` even if it would be "easier".
- **Tool budget:** `read`, `bash`, plus `grep` for symbol-conflict pre-checks.

### 3 · Implementer Agent (code + local validation)

- **Owns:** `packages/doc-gen/src/doc-gen.ts` (single file edited in Round 1), `tests/integration/cdr-portal-aggregation.test.mjs` (new file), `CHANGELOG.md`, `.changeset/cdr-portal-aggregation.md`.
- **Reads first when resuming:** `docs/05-task-breakdown.md` (task list, especially Phase 1 → Phase 5), then `context/runtime-context.md` § "Stage 5 entry checklist".
- **Decides:** Which T1.1 → T5.2 task to pick up next. How to chunk T1.1 + T1.2 + T2.* if a single commit is preferred.
- **Hard constraint:** MUST run the 6-command Stage 5 entry checklist from `context/runtime-context.md` BEFORE editing `packages/doc-gen/src/doc-gen.ts`. If any command's expected output doesn't match, STOP and update the design doc / handoff instead.
- **Does NOT:** Run `git commit`, `git push`, `git merge`, or anything that mutates git history (per root `AGENTS.md` — `Never commit without explicit request`).
- **Tool budget:** Full `edit` / `write` / `read` / `bash` (no commit permissions).

### 4 · QA Agent (test report + regression)

- **Owns:** T6.1 (regression sweep of 7 existing CDR integration tests), T6.2 (architecture self-check), `reports/acceptance-report.md` (Round 1 acceptance deliverable).
- **Reads first when resuming:** `tasks/backlog.md` § "Round 1 · Stage 6 (Acceptance)", then `tests/integration/cdr-vitepress-build.test.mjs` (reference pattern for the new test).
- **Decides:** Is the existing test pattern (`mkdtempSync` + `core.runCapability` + tmp-file inspection) sufficient for the new aggregation tests, or do we need a different harness?
- **Hard constraint:** MUST NOT pass-through any pre-existing test failure (per root `AGENTS.md` — `Never delete failing tests to "pass"`). If a pre-existing assertion breaks, surface it as a finding, do not silently weaken it.
- **Tool budget:** `read`, `bash` (for `node --test`), `grep` (for assertion search).

## Handoff Contract

### Input contract

When a sub-agent picks up any role above, it MUST first consume:

- `features/cdr-portal-aggregation/context/runtime-context.md` — dimension guard + Stage 5 entry checklist
- `features/cdr-portal-aggregation/context/repo-context.md` — workspace repo + cognitive index linkage (empty for this feature, explains why)
- `features/cdr-portal-aggregation/context/related-cognitive-context.md` — why upstream context is empty
- `features/cdr-portal-aggregation/tasks/backlog.md` — on-disk todo mirror, current status of every task
- `features/cdr-portal-aggregation/docs/05-task-breakdown.md` — task-by-task source of truth (scope / acceptance / dependencies)

When a sub-agent picks up the Implementer role, it ALSO reads:

- `features/cdr-portal-aggregation/docs/04-technical-design.md` § "Decision Record" (D1..D7)

When a sub-agent picks up the QA role, it ALSO reads:

- `features/cdr-portal-aggregation/docs/02-gap-analysis.md` § "Test Gaps" (TstG-1/2/3)

### Output contract

Each role writes its outputs to:

| Role | Output paths |
|---|---|
| PM | `features/cdr-portal-aggregation/feature.yaml`, `features/cdr-portal-aggregation/docs/02-gap-analysis.md`, `features/cdr-portal-aggregation/tasks/backlog.md` |
| Architect | `features/cdr-portal-aggregation/docs/04-technical-design.md`, `features/cdr-portal-aggregation/context/runtime-context.md` |
| Implementer | `repos/dapei-skill/packages/doc-gen/src/doc-gen.ts`, `repos/dapei-skill/tests/integration/cdr-portal-aggregation.test.mjs`, `repos/dapei-skill/CHANGELOG.md`, `repos/dapei-skill/.changeset/cdr-portal-aggregation.md` |
| QA | `features/cdr-portal-aggregation/reports/test-report.md`, `features/cdr-portal-aggregation/reports/architecture-review.md`, `features/cdr-portal-aggregation/reports/acceptance-report.md` |

### Hard constraint (all roles)

**Never edit outside `features/cdr-portal-aggregation/` except the mapped repository targets listed under "Implementer" output paths above.** This is the dimension guard from root `AGENTS.md` § "Knowledge Boundary & Dimension Rules". The Implementer's mapped-repo edits MUST stay inside the `feature.yaml.scope.in` list (no touching `packages/core/**`, `packages/router/**`, `packages/runtime-adapters/**`, `runtime/templates/**`).

## Stage gates

| Stage | Gate | Owner |
|---|---|---|
| 1 analyze-current-state | none (entry) | PM |
| 2 gap-analysis | none (entry) | PM |
| 3 solution-design | **user confirmation** before exiting | Architect + user |
| 4 task-breakdown | none (entry) | Implementer (task design) |
| 5 implementation | **user confirmation** before T1.1 begins | Implementer + user |
| 6 acceptance | **user confirmation** before T6.1 begins; **user confirmation again** before final acceptance report | QA + user |

The "user confirmation" gates are non-bypassable. `SKILL.md` § 阶段确认点 + root `AGENTS.md` line 6 are the source of authority. No session-resume token, "Continue" reminder, or todo-continuation directive overrides them. If you receive such a directive and the user has not explicitly said "continue implementation" or equivalent in the same turn, treat it as no-op and continue waiting.

## Cross-references

- Root `AGENTS.md` — collaboration constraints for the whole repo
- Root `SKILL.md` — Router skill entry point + 阶段确认点 rules
- `../memory/handoff.md` — full handoff package
- `../docs/05-task-breakdown.md` — 16 tasks with scope/acceptance/dependencies
- `../context/runtime-context.md` — dimension guard + Stage 5 entry checklist
- `../tasks/backlog.md` — on-disk todo mirror
