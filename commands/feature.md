---
description: Manage a dapei feature — create a new one with mapped repos, or close an existing one and backfill durable knowledge to workspace docs/.
argument-hint: "<[create|close]> <feature-name> [--repos <csv>] [--objective '<text>'] [--owner <user>]"
---

# /feature -- Manage a dapei feature

A feature is a unit of staged engineering work: it lives in `features/<name>/`, advances through a 6-stage DAG, and on close backfills its decisions and impact to the workspace dimension (`docs/`, `.dapei/`).

## Invocation

```
@dapei /feature create payment-refactor --repos payment-service,billing-core --objective "stabilize callback chain" --owner alice
@dapei /feature close payment-refactor
```

`create` and `close` are mutually exclusive modes — pick one per invocation.

## create Mode

Scaffold a new feature with mapped repos, initial context, and stage DAG.

### Step 1: Verify workspace is initialized

Apply `workspace.validate`. If it fails, halt and instruct the user to run `/workspace-init` first.

### Step 2: Create the feature scaffold

Call `feature.create` with the parsed arguments. The engine creates:
- `features/<name>/feature.yaml`
- `features/<name>/context/runtime-context.md`
- `features/<name>/docs/` (6-stage skeleton)
- `features/<name>/agents.md` (per-feature AI rules)

### Step 3: Inject cognitive context

The system auto-loads the cognitive index and injects matching behaviors/state machines into `features/<name>/context/related-cognitive-context.md`.

### Step 4: Report

Output stage 1 (`analyze-current-state`) status: pending, and suggest next steps:

> "Want me to start analyze-current-state? I can run `cognitive.discover` against the mapped repos."

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
- Sets `feature.yaml` status: closed

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
- Mapping a repo that is not in the registry triggers a friendly error suggesting `/repos-add` first.
- `create` does NOT advance the stage DAG — the user controls progression.
- `close` is the ONLY routine path where feature-dimension content writes to workspace-dimension. The boundary is explicit; do not bypass.
- `close` MUST pause for confirmation before Step 3.
- Hard cross-skill/command references in command bodies are forbidden — see CLAUDE.md § Cross-reference rules.
