---
description: Check architecture drift — compare documented as-is state with current code state across all assets.
argument-hint: "[--repo <name>] [--feature <name>]"
---

# /drift-check -- Detect drift between docs and code

## Invocation

```
@dapei /drift-check
@dapei /drift-check --repo mall-order
@dapei /drift-check --feature payment-refactor
```

## Workflow

### Step 1: Detect stale assets

Call `cdr.asset.stalecheck`. The engine compares asset `sources[].file` mtime/hash against the asset's `revision`. Returns list of stale assets.

### Step 2: Check architecture drift

Call `cdr.architecture.driftcheck`. The engine compares documented behaviors against current entry points.

### Step 3: Report

Output a structured report:
- Stale assets (with file paths and reason)
- Missing behaviors (entry exists in code but not in docs)
- Orphan behaviors (doc exists but entry removed)
- Suggested remediation per item

### Step 4: Suggest remediation

For each stale/missing item, suggest the capability call that would fix it. Do NOT auto-fix — the user must approve each remediation.
