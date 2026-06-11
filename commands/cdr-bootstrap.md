---
description: Bootstrap CDR for a repo — profile, discover entries, deep-dive behaviors, and emit the documentation portal.
argument-hint: "<repo-name> [--skip-portal]"
---

# /cdr-bootstrap -- Bootstrap Cognitive Discovery Runtime for a repo

Walk a repo from raw code to a queryable knowledge portal in a single guided flow.

## Invocation

```
@dapei /cdr-bootstrap mall-order
@dapei /cdr-bootstrap payment-service --skip-portal
```

## Workflow

### Step 1: Profile the repo

Apply the `cdr.profile` capability. The engine returns directory_tree and manifest_files; the AI reads them to infer the stack.

Expected output: `docs/as-is/profiles/<repo>.yaml`

### Step 2: Discover entry candidates (AI reads code)

Call `cdr.entries.candidate` to receive `files[]` with content slices. The AI reads each file's content and identifies entry points (HTTP/RPC handlers, message consumers, schedulers).

For each entry the AI identifies, call `cdr.entries.propose` with `sources[]` referencing the file + line. The engine validates each source.

### Step 3: Confirm entries

The user reviews the proposed entries. For each one to keep, call `cdr.entries.confirm` (requires `sources[]`).

Pause for user confirmation before proceeding.

### Step 4: Deep-dive behaviors

For each confirmed entry, use the `cognitive` skill workflow (Phase 4 Deep Dive) to trace calls/writes/events/risks and call `cdr.behavior.upsert`.

Expected output: `docs/as-is/behavior/<id>.yaml`

### Step 5 (optional): Derive state machines

For each domain entity identified during deep-dive, call `cdr.state.derive` to draft a state machine.

### Step 6 (optional): Compose domains

Call `cdr.domain.compose` with `derived_from: [behavior-id, …]` to cluster behaviors into a domain artifact.

### Step 7 (optional): Generate documentation portal

Unless `--skip-portal`, call `cdr.doc.generate` to emit the VitePress site at `.dapei/docs-portal/`.

### Output

A short report summarizing:
- Profile path
- N entries confirmed
- N behaviors documented
- Portal URL (if generated)

## Notes

- This command does NOT skip evidence validation. Every artifact must carry `sources[]` for `kind=fact` claims.
- The user MUST review entries before deep-dive — do not silently confirm.
- For multi-repo bootstrap, run this command per-repo. There is no `--all` flag (yet).
