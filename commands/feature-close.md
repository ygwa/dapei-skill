---
description: Close a feature — verify all stages complete, backfill durable knowledge to workspace docs/, archive worktree.
argument-hint: "<feature-name>"
---

# /feature-close -- Close a dapei feature

## Invocation

```
@dapei /feature-close payment-refactor
```

## Workflow

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

- This is the ONLY routine path where feature-dimension content writes to workspace-dimension. The boundary is explicit; do not bypass.
- This command MUST pause for confirmation before Step 3.
