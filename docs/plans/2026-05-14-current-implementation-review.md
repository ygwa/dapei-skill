# dapei.skill Current Implementation Review

Date: 2026-05-14

## Review Scope

This review checks the current repository implementation against the previous gap roadmap and the planning image target.

It focuses on what has improved, what is still missing, and what should be fixed first so future Agents can continue safely.

Reviewed files:

- `README.md`
- `DESIGN.md`
- `.dapei/commands.yaml`
- `.dapei/feature.schema.yaml`
- `.dapei/workflows/feature-lifecycle.yaml`
- `.dapei/rules/*.yaml`
- `scripts/dapei`
- `scripts/dapei-guardrail`
- `dos/templates/*`
- `workspace/features/payment-refactor/*`

Commands run:

- `bash -n scripts/dapei scripts/dapei-guardrail init.sh`
- `./scripts/dapei status feature`
- `./scripts/dapei-guardrail payment-refactor`

Note: guardrail execution updated a timestamp in the sample report during review; it was restored immediately.

## Overall Assessment

Current implementation has moved from a minimal v0.1 skeleton toward Phase 1 of the roadmap.

The main improvements are:

- Feature manifest schema is now canonicalized around `version: "0.2"`.
- `create feature` now creates the numbered feature docs `01-current-state.md` through `06-acceptance.md`.
- Memory file names now align more closely with the planning image: `decision-log.md` and `risk.md`.
- Workflow outputs now reference the numbered docs under `docs/`.
- `run workflow` validates that the requested stage exists and tries to enforce stage dependencies.
- `.gitignore` now excludes `.agent-shell/` transcripts.

The main remaining issue is:

- The lifecycle is still not executable end-to-end. `run workflow` writes `Status: started`, but never validates required outputs, never generates stage outputs, and never writes the `reports/stage-<stage>.completed` marker that its own dependency checker requires.

This means the first stage can start, but later stages are effectively blocked unless someone manually creates completion marker files.

## What Has Improved

### 1. Feature Schema Is Now v0.2

Status: improved.

Evidence:

- `.dapei/feature.schema.yaml` now uses `enum: ["0.2"]`.
- `dos/templates/feature.yaml.template` now emits `version: "0.2"`.
- `scripts/dapei` writes `version: "0.2"` in `write_feature_manifest`.
- `workspace/features/payment-refactor/feature.yaml` has been migrated to `version: "0.2"`.

Remaining gap:

- There is no schema validation command yet, so the schema is documentation rather than an enforced contract.
- `last-review-at: ""` does not satisfy `format: date-time` in JSON Schema if validation is enabled.

Recommendation:

- Add explicit support for nullable or absent `last-review-at`, or only write it after the first review.
- Add `./scripts/dapei validate manifest <feature>` or include schema validation in `create feature` and `run workflow`.

### 2. Numbered Feature Docs Exist

Status: improved.

Evidence:

- `dos/templates/01-current-state.md.template` through `dos/templates/06-acceptance.md.template` exist.
- `scripts/dapei` creates `docs/01-current-state.md` through `docs/06-acceptance.md` in new feature workspaces.
- `.dapei/workflows/feature-lifecycle.yaml` now names those docs as stage outputs.

Remaining gap:

- `scripts/dapei` duplicates simplified template content inline instead of copying/rendering from `dos/templates`.
- Several generated docs use quoted heredocs, so `Date: $current_date` is written literally for docs `02` through `06` instead of substituting the date.
- Existing sample feature `payment-refactor` does not contain the numbered docs, so migration is incomplete.

Recommendation:

- Replace inline heredocs with a reusable template renderer.
- Add a migration/backfill command: `./scripts/dapei migrate feature <name>`.
- Ensure existing features can be upgraded without overwriting human-written docs.

### 3. Workflow Definition Better Matches The Planning Image

Status: improved.

Evidence:

- Workflow stages now map to docs and reports more concretely:
  - `analyze-current-state` outputs `docs/01-current-state.md`.
  - `gap-analysis` outputs `docs/02-gap-analysis.md`.
  - `solution-design` outputs `docs/03-business-design.md` and `docs/04-technical-design.md`.
  - `task-breakdown` outputs `docs/05-task-breakdown.md` and `tasks/backlog.md`.
  - `local-validation` outputs validation and test reports.
  - `acceptance` outputs acceptance report and release notes.

Remaining gap:

- The CLI does not parse workflow inputs/outputs from YAML.
- The CLI does not check whether declared outputs exist after a stage.
- The CLI does not create the reports declared for later stages.

Recommendation:

- Implement a small workflow helper that can read stage `requires`, `inputs`, and `outputs` reliably.
- Keep the first version deterministic: validate files, create missing report shells, and mark completion only when required outputs exist.

### 4. Stage Dependency Check Was Started

Status: partially improved, but currently incomplete.

Evidence:

- `run_workflow_stage` finds a stage by id in `.dapei/workflows/feature-lifecycle.yaml`.
- It reads inline `requires: [...]` and checks for `reports/stage-<required>.completed`.

Remaining gap:

- No command ever writes `reports/stage-<stage>.completed`.
- The current stage records only `Status: started`.
- There is no `complete` mode or success/failure status.
- The parser only handles a very narrow YAML shape and will break if `requires` becomes multi-line.

Recommendation:

- Add one of these command designs:
  - `./scripts/dapei run workflow <feature> --stage <stage> --complete`
  - `./scripts/dapei complete stage <feature> <stage>`
  - Make `run workflow` validate outputs and immediately mark completed for document-only stages.

### 5. Memory Naming Is Closer To The Plan

Status: improved.

Evidence:

- New feature creation writes `memory/decision-log.md`.
- New feature creation writes `memory/risk.md`.
- `report feature` reads `memory/risk.md`.

Remaining gap:

- Existing `payment-refactor` has the renamed files but their titles still say `# Decisions` and `# Risks`, not `# Decision Log` / `# Risk Log`.
- There is no append protocol for decisions, tradeoffs, risks, questions, or timeline entries.
- No command updates memory automatically.

Recommendation:

- Define memory entry formats in templates.
- Add helper commands such as `dapei memory add decision`, `dapei memory add risk`, or keep this as Agent convention first.

## Current Defects And Risks

### P0: Workflow Stages Cannot Progress Naturally

Impact: later stages are blocked by dependency markers that are never created.

Evidence:

- `run_workflow_stage` checks for `reports/stage-<required>.completed`.
- `run_workflow_stage` only appends `Status: started` to `reports/feature-progress.md`.
- No code writes a `stage-*.completed` file.

Fix:

- Add stage completion behavior and output validation.
- A minimal fix is to write `reports/stage-<stage>.completed` after validating declared outputs exist.

### P1: Generated Docs Do Not Use The Existing Templates

Impact: templates and generated files will drift.

Evidence:

- `dos/templates/*.template` exist.
- `init_feature_files` writes separate inline heredocs.

Fix:

- Implement `render_template <template> <output>` with substitutions for `{{date}}`, `{{objective}}`, and `{{repos}}`.
- Use `dos/templates` as the only source for new feature docs.

### P1: Date Substitution Is Broken In Generated Docs 02-06

Impact: new feature docs will contain literal `$current_date`.

Evidence:

- `docs/02-gap-analysis.md` through `docs/06-acceptance.md` use single-quoted heredocs like `<<'EOF_DOC'`.

Fix:

- Use template rendering or unquoted heredocs for fields that require substitution.

### P1: Existing Feature Workspaces Are Not Migrated

Impact: sample feature does not represent the current contract, and Agents may learn the wrong structure.

Evidence:

- `workspace/features/payment-refactor` has no `docs/01-current-state.md` through `docs/06-acceptance.md`.
- `payment-refactor` reports are still older placeholders.

Fix:

- Add migration/backfill support.
- Update sample feature carefully, preserving any human-written content.

### P1: Feature Manifest `last-review-at` Is Invalid Under Strict Schema Validation

Impact: future schema validation will fail on newly created features.

Evidence:

- Schema says `last-review-at` has `format: date-time`.
- Template and CLI write `last-review-at: ""`.

Fix:

- Omit `last-review-at` until first review, or allow `type: ["string", "null"]` and write `null`.

### P1: `review feature` Uses Fragile YAML Parsing And Non-Portable `sed -i`

Impact: review state may not update reliably on macOS, and repo parsing can match unintended `name:` lines.

Evidence:

- `feature_review` scans every line matching `name: "..."`.
- `sed -i` without a backup extension is not portable across macOS/BSD sed.
- The sed failure is hidden by `|| true`.

Fix:

- Use a small YAML-aware helper or constrained parser for `feature.repos`.
- Use `perl -0pi -e` or a portable temp-file rewrite.
- Do not swallow state-update failures silently.

### P2: Guardrail Rules Are Still Hardcoded

Impact: `.dapei/rules/*.yaml` looks extensible but is not actually interpreted.

Evidence:

- `scripts/dapei-guardrail` only checks hardcoded files and naming.
- It does not load `.dapei/rules/api.yaml`, `ddd.yaml`, `layering.yaml`, or `naming.yaml`.

Fix:

- Implement a rule runner for existing check types.
- Include severity, evidence, and remediation in the report.

### P2: Reports Are Still Source Pointers, Not Synthesized Reports

Impact: daily and architecture reports are not yet useful enough for handoff.

Evidence:

- `report_feature` writes links to progress, risk, open questions, and guardrail sources.
- It does not aggregate content, commits, test results, decisions, or open questions.

Fix:

- Aggregate key sections from memory and reports.
- Include changed files and commit ranges from mapped repos.

### P2: `status feature` Counts `.templates`

Impact: status output reported `Features (3)` while listing only `checkout-revamp` and `payment-refactor`.

Evidence:

- Count uses `find "$features_dir" -maxdepth 1 -type d -not -name features | wc -l`.
- Loop skips `.templates`, but count does not.

Fix:

- Exclude `.templates` and the root directory from the count.

### P2: `init.sh` Can Destroy Existing README/DESIGN Content

Impact: running init after docs exist will truncate `README.md` and `DESIGN.md`.

Evidence:

- `init.sh` contains `: > DESIGN.md` and `: > README.md`.

Fix:

- Only create files if missing.
- Never truncate existing documentation during initialization.

## Roadmap Progress Snapshot

| Roadmap Item | Current State | Assessment |
| --- | --- | --- |
| DAP-001 normalize feature manifest | Mostly done | Schema/template/CLI/sample now use `0.2`; `last-review-at` needs schema fix |
| DAP-002 add numbered feature doc templates | Partially done | Templates exist and new features generate docs; existing sample not migrated; generation duplicates templates |
| DAP-003 implement stage output validation | Started but incomplete | Stage exists/dependency check exists; no output validation or completion marker |
| DAP-004 context build command | Not started | No context pack builder |
| DAP-005 current-state scanner | Not started | Docs are placeholders only |
| DAP-006 gap-analysis generator | Not started | Docs are placeholders only |
| DAP-007 YAML guardrail runner | Not started | Guardrail checks remain hardcoded |
| DAP-008 validation command | Not started | No `validate feature` command |
| DAP-009 daily report aggregation | Not started | Report is source pointer only |
| DAP-010 integration registry | Not started | No `.dapei/integrations.yaml` |
| DAP-011 CLI regression tests | Not started | No test suite found |
| DAP-012 expand skill instructions | Not started | Skill remains minimal |

## Recommended Next Work Order

1. Fix stage completion first.
2. Switch feature doc generation to `dos/templates` rendering.
3. Backfill/migrate existing feature workspaces.
4. Fix schema validity for `last-review-at`.
5. Add minimal CLI smoke tests.
6. Start YAML-driven guardrail runner.

## Suggested Next Agent Prompt

```text
Review docs/plans/2026-05-14-current-implementation-review.md and implement the highest-priority fixes only.
Start with stage lifecycle correctness: make `run workflow` validate declared outputs and write `reports/stage-<stage>.completed` when a stage succeeds.
Then replace inline feature doc heredocs with rendering from `dos/templates`, preserving existing behavior and avoiding overwrites.
Add a smoke test that creates a temporary local git repo under workspace/codebase, creates a feature, runs analyze-current-state, and verifies generated docs plus stage completion marker.
Do not modify unrelated files.
```
