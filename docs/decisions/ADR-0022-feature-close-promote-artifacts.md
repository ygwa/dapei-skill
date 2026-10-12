---
id: ADR-0022
title: "feature.close owns the closeout backfill contract (promote_artifacts)"
status: accepted
date: 2026-10-12
deciders: [ygwa]
technical-story: "repo-hardening"
---

## Problem Statement

Feature closeout is the only moment at which a feature's local knowledge is
allowed to cross into the workspace dimension (ADR-0004). The capability that
does it, `feature.close`, grew an optional `promote_artifacts` block during M3
with no decision record of its own: the code cited `ADR-0017` for the contract,
but ADR-0017 documents the `RepoSummary` extension. The rule it enforces
("feature dimension does not write workspace dimension; closeout backfills it")
had no discoverable, engine-side record, which matters because it is the
highest-risk contract in the product: it is the one place where a feature can
mutate global `docs/`.

## Decision

`feature.close` accepts an optional `promote_artifacts` object with four
**independent, individually optional** sub-blocks, all
`additionalProperties: false`:

| Sub-block | Shape | What it promotes |
| --- | --- | --- |
| `decisions` | `{ skip?: boolean, target_path?: string }` | the feature's decision records into the workspace `docs/decisions/`; `skip: true` suppresses the copy |
| `architecture` | `{ entries: [{ source_path, target_path }] }` | explicit architecture documents into the workspace `docs/architecture/` |
| `cognitive` | `{ unlink: [{ kind, id, repo? }] }` | removes feature-scoped cognitive index entries (`kind` ∈ behavior / state-machine / domain / business-rule / capability-map) |
| `reports` | `{ copy_paths: [string] }` | selected feature reports into the workspace report location |

Behavioural contract:

1. Every promotion is a **content-hash-guarded write** (`writeIfContentChanged`):
   a file is written only when it is absent or its content changed, so running
   `feature.close` twice is a no-op the second time. The returned
   `data.promoted[]` / `data.skipped[]` lists must reflect that.
2. `promote_artifacts` is optional; omitting it keeps the pre-M3 closeout.
3. `feature.close` unconditionally invokes `cdr.feature.link` (v2.0.0
   behaviour), which is why the M3 design dropped a
   `cognitive.entries.action: 'link'` sub-action — only `unlink` was added.
4. Promotion never writes outside `docs/**` and `.dapei/**` of the workspace
   root, and never touches `features/<feature>/**` other than to read.

## Consequences

### Positive

- The rule "features never write the workspace dimension directly, closeout
  does" now has a decision record that the code can cite instead of the
  unrelated ADR-0017.
- The four sub-blocks are documented as independent, so a caller can promote
  only reports, or only decisions, without reasoning about the others.

### Negative

- The workspace-side target layout for promoted artifacts is documented here but
  not yet validated by the engine beyond the `source_path`/`target_path` pair,
  so a caller can still point a promotion at an unintended path inside
  `docs/`.
- Desktop clients that carried a hand-mirrored copy of this schema
  (`desktop/packages/contracts/src/feature/types.ts`) left the repository with
  the desktop subtree (ADR-0021); the schema is now defined in exactly one
  place: `promoteArtifactsSchemaShape` in
  `packages/core/src/capabilities/domains/feature.ts`.
