---
description: Create a new feature with mapped repos, initial context, and stage DAG.
argument-hint: "<feature-name> --repos <comma,separated> [--objective '<text>'] [--owner <user>]"
---

# /feature-create -- Create a new dapei feature

## Invocation

```
@dapei /feature-create payment-refactor --repos payment-service,billing-core --objective "stabilize callback chain" --owner alice
```

## Workflow

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

## Notes

- Feature names must be `[a-z0-9-]+`.
- Mapping a repo that is not in the registry triggers a friendly error suggesting `/repos-add` first.
- This command does NOT advance the stage DAG — the user controls progression.
