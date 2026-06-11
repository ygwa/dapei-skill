---
description: Initialize a new dapei workspace in the current directory with full scaffolding and validation.
argument-hint: "[--name <workspace-name>] [--locale <zh-CN|en-US>]"
---

# /workspace-init -- Initialize a dapei workspace

## Invocation

```
@dapei /workspace-init
@dapei /workspace-init --name my-workspace --locale zh-CN
```

## Workflow

### Step 1: Verify directory is empty or conforming

Call `workspace.validate`. If non-empty and non-conforming, halt and ask the user to choose another directory.

### Step 2: Scaffold

Call `workspace.init` with parsed arguments. The engine creates:
- `.dapei/workspace.yaml`
- `.dapei/commands.yaml`
- `.dapei/schemas/`, `.dapei/rules/`, `.dapei/cognitive/`, `.dapei/workflows/`
- `repos/`, `features/`, `docs/as-is/`, `docs/architecture/`, `docs/decisions/`

### Step 3: Report

Output the workspace overview and suggest next steps:

> "Want me to add a repo? Try `/repos-add <name> <git-url>`."
