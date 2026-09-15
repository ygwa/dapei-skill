---
description: Manage a dapei feature — create one with mapped repos, advance stages, run gap analysis, accept, or close and backfill durable knowledge to workspace docs/.
argument-hint: "[create|gap-analysis|stage <name>|accept|close] <feature-name> [--repos <csv>] [--objective '<text>'] [--owner <user>] [--yes] [--notes '<text>']"
---

# /feature -- Manage a dapei feature

A feature is a unit of staged engineering work: it lives in `features/<name>/`, advances through an 8-stage DAG, and on close backfills its decisions and impact to the workspace dimension (`docs/`, `.dapei/`).

## Invocation

```
@dapei /feature create payment-refactor --repos payment-service,billing-core --objective "stabilize callback chain" --owner alice
@dapei /feature gap-analysis payment-refactor
@dapei /feature stage gap-analysis payment-refactor
@dapei /feature accept payment-refactor --notes "all gates passed"
@dapei /feature close payment-refactor
```

Modes are mutually exclusive — pick one per invocation.

## create Mode

Scaffold a new feature with mapped repos, initial context, and stage DAG.

### Step 1: Verify workspace is initialized

Apply `workspace.validate`. If it fails, halt and instruct the user to run **workspace-init** first.

### Step 2: Create the feature scaffold

Call `feature.create` with the parsed arguments. The engine creates:
- `features/<name>/feature.yaml`
- `features/<name>/context/runtime-context.md`
- `features/<name>/docs/` (8-stage skeleton)
- `features/<name>/agents.md` (per-feature AI rules)

### Step 3: Inject cognitive context

The system auto-loads the cognitive index and injects matching behaviors/state machines into `features/<name>/context/related-cognitive-context.md`.

### Step 4: Report

Output stage 1 (`analyze-current-state`) status: pending, and suggest next steps:

> "Want me to start analyze-current-state? I can run `cognitive.discover` against the mapped repos."

## gap-analysis Mode

Generate a gap-analysis scaffold for the feature, with up to `max_envelopes` related cognitive envelopes auto-injected.

### Step 1: Verify analyze-current-state is complete

Call `feature.gap-analysis` — the engine reads `features/<name>/reports/stage-analyze-current-state.completed`. If the marker is missing, halt and tell the user to finish analyze-current-state first.

### Step 2: Generate the scaffold

The engine writes `docs/02-gap-analysis.md` with stage header, objective echo, and a `## Gaps` section listing injected envelopes by behavior id.

### Step 3: Report

Output the scaffold path and how many envelopes were injected. Suggest next:

> "Want me to advance to solution-design? I can run the stage transition once you've reviewed the gaps."

## stage Mode

Advance the feature to a named stage in the lifecycle DAG. Enforces prereqs and confirmation gates.

```
@dapei /feature stage <stage-name> <feature-name> [--yes]
```

### Step 1: Validate the target stage

Call `feature.stage.transition` with `{ feature, stage }`. The engine:
- Refuses if the stage is not declared in `.dapei/workflows/feature-lifecycle.yaml`.
- Refuses if any required prior stage marker is missing.
- Refuses `solution-design` / `implementation` / `acceptance` without `confirmed=true` — these are confirmation gates.

### Step 2: Write the stage marker

The engine writes `features/<name>/reports/stage-<stage-name>.completed` and appends to `feature-progress.md`.

### Step 3: Report

Output the new stage status. Suggest next:

> "Want me to start <next-stage>? ..."

## accept Mode

Mark the feature accepted and write the acceptance report. This is the final confirmation gate.

### Step 1: Confirm the user understands this is a confirmation gate

This step crosses the implementation → done boundary. Halt unless `confirmed=true` is supplied (via `--yes` or explicit `--notes ...` with confirmed intent).

### Step 2: Verify architecture-review is complete

Call `feature.accept` with `{ feature, confirmed }`. The engine checks for `features/<name>/reports/stage-architecture-review.completed`.

### Step 3: Write the acceptance report

The engine writes `features/<name>/reports/acceptance-report.md` with feature name, date, and reviewer notes, and writes `stage-acceptance.completed`.

### Step 4: Report

Output the report path and the next step:

> "Feature <name> is accepted. Want me to run **feature close** to backfill knowledge to workspace docs/?"

## close Mode

Verify all stages complete, backfill durable knowledge to workspace docs/, archive worktree.

### Step 1: Verify all stages complete

Call `feature.status` and confirm every stage is `completed`. If any stage is `pending` or `in_progress`, halt and list the blockers.

### Step 2: Run guardrails

Call `feature.guardrail` to check evidence, decisions, and risk items.

### Step 3: Backfill knowledge to workspace

Call `feature.close`. The engine:
- Writes `docs/decisions/<feature>-decisions.md`
- Writes `docs/feature-impact/<feature>.md`
- Updates the cognitive index with any new behaviors/states from the feature
- Sets feature.yaml status: closed

Pause for user confirmation before this step (it crosses dimension boundary — feature → workspace).

### Step 4: Archive worktree (optional)

If the feature used a worktree, prompt the user to archive it.

### Output

A close report:
- Decisions written
- Behaviors backfilled
- Worktree status

## Notes

- Feature names must be `[a-z0-9-]+`.
- Mapping a repo that is not in the registry triggers a friendly error referencing the `repos.add` capability so the registry can be populated first.
- `create` does NOT advance the stage DAG — the user controls progression.
- `close` is the ONLY routine path where feature-dimension content writes to workspace-dimension. The boundary is explicit; do not bypass.
- `close` MUST pause for confirmation before Step 3.
- The lifecycle has 8 stages: `analyze-current-state`, `gap-analysis`, `solution-design`, `task-breakdown`, `implementation`, `local-validation`, `architecture-review`, `acceptance`. Three stages — `solution-design`, `implementation`, `acceptance` — are confirmation gates that require `confirmed=true`.
- Hard cross-skill/command references in command bodies are forbidden — see CLAUDE.md § Cross-reference rules.
