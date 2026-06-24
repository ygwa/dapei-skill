# 04. Technical Design

Date: 2026-06-23

## Related Documents

- Previous: [02. Gap Analysis](./02-gap-analysis.md)

## Decision Record

Locked 2026-06-23 via `question` tool, all option A "recommended":

| # | Decision | Locked option | Implication |
|---|---|---|---|
| **D1** | Fixture location (where to put current-schema cognitive artifacts) | **(A) Upgrade in place** | Modify `tests/fixtures/sample-node-repo/docs/as-is/` directly; add new artifact types under existing directory tree. No new directory. |
| **D2** | KNOWN_ISSUES.md location | **(A) Workspace-dimension, land at `feature.close`** | Round 3 PR does NOT include this file. Maintainer creates it on `feature.close` per `AGENTS.md` Knowledge Boundary. During stage 5, Round 3 writes a `KNOWN_ISSUES_DRAFT.md` in feature-dimension that the maintainer copies to root on close. |
| **D3** | `runtime/templates/docs/scripts/build-cognitive-pages.ts` disposition | **(A) Remove** | Delete the 273-line vestigial script. Empirically verified (Round 3 stage 1): no code in repo references it; `docs/compiled/` output dir does not exist; not in any package.json script. dapei uses round-1 `cdr.doc.generate` as canonical portal pipeline. |
| **D4** | `first-run` script design | **(A) Idempotent** | Re-runnable on existing workspace. Detects state (already-init'd? already-has-fixture? already-has-cdr-artifacts?) and skips or patches. Documented state machine in design § "First-Run State Machine" below. |
| **D5** | v2.2 backward-compat migration | **(A) Defer + KNOWN_ISSUES doc** | Do NOT write `cdr.migrate.v22` capability in Round 3. Document in KNOWN_ISSUES.md that v2.2 cognitive artifacts are unsupported; users must re-create via `cdr.bootstrap`. Rationale: dapei-skill is a young project (v1.0 = 2026-05-13), v2.2 user base estimated small. Migration can be a separate feature if demand emerges. |

## Architecture Overview

Round 3 is **fixture + tooling only**. No engine code (`packages/core`, `packages/cdr`, `packages/doc-gen`, `packages/router`) changes. The deliverables are:

1. **Sample-node-repo fixture upgrade** (D1)
2. **`npm run first-run` script** (D4)
3. **`KNOWN_ISSUES_DRAFT.md`** (feature-dim; D2) → maintainer copies to root KNOWN_ISSUES.md on close
4. **Delete `build-cognitive-pages.ts`** (D3)
5. **New `tests/integration/cdr-bootstrap.test.mjs`** (acceptance test)
6. **Round 3 PR includes nothing under `docs/` or root** — workspace-dim files land post-merge via maintainer's `feature.close` workflow

### First-Run State Machine (D4 implementation sketch)

```
┌─ first-run invoked ────────────────────────────────────┐
│  detect current state via:                             │
│    - exists .dapei/workspace.yaml? → init done         │
│    - exists tests/fixtures/sample-node-repo/docs/as-is/ │
│      /behavior/sample-repo-analysis.yaml (current)?    │
│    - exists .dapei/docs-portal/index.html (built)?       │
│                                                        │
│  steps:                                                 │
│    1. if !init → run workspace.init                     │
│    2. if !demo_repo → copy sample-node-repo to          │
│       repos/sample-node-repo/ (idempotent: skip if     │
│       exists)                                          │
│    3. run repos.add sample-node-repo                    │
│    4. run repos.analyze sample-node-repo               │
│    5. upsert cognitive artifacts (Round 3 new fixture): │
│       cdr.behavior.upsert (order-create)                │
│       cdr.state.derive (Order)                          │
│       cdr.domain.compose (checkout)                     │
│       cdr.business.compose (order-amount-positive)     │
│       cdr.business.compose (order-cancel-allowed)      │
│       cdr.capability.map.init (place-order)             │
│    6. run cdr.doc.generate                              │
│    7. print "open .dapei/docs-portal/index.md to view"   │
│                                                        │
│  any step fails → exit non-zero, print which step,     │
│  print how to resume                                   │
└────────────────────────────────────────────────────────┘
```

### Component Design

#### C-1 · New fixture YAMLs (D1)

Location: `tests/fixtures/sample-node-repo/docs/as-is/{behavior,state-machines,domains,business-rules,capabilities}/`

| File | Type | Schema source |
|---|---|---|
| `behavior/order-create.yaml` | current-schema behavior fact | `validateBehaviorArtifact` in `packages/core/src/evidence.ts:97` |
| `state-machines/order.yaml` | current-schema state machine | `validateStateMachineArtifact` in `evidence.ts:188` |
| `domains/checkout.yaml` | current-schema domain with `derived_from` (P1) | `validateDomainArtifact` in `evidence.ts:232` |
| `business-rules/order-amount-positive.yaml` | current-schema business rule (invariant) with `kind=fact` + `sources[]` (P1) | `validateBusinessRuleArtifact` in `evidence.ts:305` |
| `business-rules/order-cancel-allowed.yaml` | current-schema business rule (authorization) | same |
| `capabilities/product-map.yaml` | current-schema capability map entry with `domains[]` + `spans_repos[]` | `validateCapabilityMapArtifact` in `evidence.ts:280` |

Plus the existing `behavior/sample-repo-analysis.yaml` (v2.2) **moved** to `behavior/sample-repo-analysis.v22.archive` with a header comment explaining "kept for reference; v2.2 schema is unsupported, see KNOWN_ISSUES.md".

#### C-2 · `scripts/first-run.mjs` (D4)

| Aspect | Design |
|---|---|
| Language | Node.js ≥ 22.6 (matches `engines.node` in `package.json`) |
| CLI | `node scripts/first-run.mjs` or `npm run first-run` |
| Exit codes | 0 = success; 1 = recoverable failure (print how to resume); 2 = unrecoverable (e.g., fixture missing) |
| Logging | Step-by-step progress: `[1/7] workspace.init ... OK` |
| State detection | Read filesystem, not in-memory cache (so re-running after partial failure works) |
| Idempotency check | Check each step's expected artifact before running; skip with `[skip]` if exists |
| Failure recovery | Print last successful step; user can re-run to resume |

#### C-3 · `KNOWN_ISSUES_DRAFT.md` (D2, feature-dim)

10 entries copied from round 1's known-issues list (see `01-current-state.md` § "Known Issues Discovered in Round 1"):

```
# KNOWN_ISSUES_DRAFT — Round 3 candidate content

> **This file lives in feature-dimension only.**
> On `feature.close`, the maintainer copies it to `KNOWN_ISSUES.md` at the repo root.

## Schema migration (v2.2 unsupported)

**Affected**: users with pre-CDR cognitive artifacts in their workspace
(v2.2 schema: `phases_completed` / `core_flow` / `confidence.level`).

**Symptom**: After upgrading to dapei-skill ≥ 3.3.0, `validateBehaviorArtifact()` throws.
**Workaround**: Re-create cognitive artifacts via `cdr.bootstrap` against current schema.
**Tracking**: Separate feature if demand emerges.

[... 9 more entries: schema field name gotchas, P1 red lines, worktree node_modules fix, ...]
```

#### C-4 · Delete `runtime/templates/docs/scripts/build-cognitive-pages.ts` (D3)

Single `git rm` commit. No content replacement (the file is replaced by round-1 `cdr.doc.generate` as the canonical pipeline).

#### C-5 · `tests/integration/cdr-bootstrap.test.mjs` (acceptance)

| Test | Asserts |
|---|---|
| `bootstrap: idempotent re-run leaves workspace intact` | Run `npm run first-run` twice; assert no duplicate artifacts, no diff in `.dapei/cognitive/index.yaml` |
| `bootstrap: empty workspace produces non-empty portal` | Run in `mkdtempSync` workspace; assert `.dapei/docs-portal/index.md` exists + ≥ 5 sections |
| `bootstrap: existing workspace skips re-init` | Pre-create `.dapei/workspace.yaml`; run `npm run first-run`; assert no error |
| `bootstrap: round 1 tests still pass post-fixture-upgrade` | Run the round 1 22-test suite; assert all 22 pass |

## Data Model

### Fixture YAML schemas (all current CDR schema)

```yaml
# behavior/order-create.yaml
id: order-create
repo: sample-node-repo
entry:
  type: api
  method: POST
  path: /orders
steps:
  - name: validate
    action: check items
  - name: persist
    action: insert into orders table
writes:
  - table: orders
    operation: insert
events:
  - order.created
confidence:
  level: high
  kind: fact
  evidence_type: direct_code
sources:
  - file: src/routes.ts
    line: 3
    repo: sample-node-repo
```

```yaml
# state-machines/order.yaml
entity: Order
repo: sample-node-repo
states:
  - CREATED
  - PAID
  - CANCELLED
transitions:
  - from: null
    to: CREATED
    trigger: POST /orders
    behavior_id: order-create
  - from: CREATED
    to: PAID
    trigger: payment.success
  - from: CREATED
    to: CANCELLED
    trigger: cancel
initial_state: CREATED
confidence:
  level: medium
  kind: inference
derived_from:
  - order-create
```

```yaml
# domains/checkout.yaml
domain: checkout
description: Order placement and lifecycle.
derived_from:
  - order-create
```

```yaml
# business-rules/order-amount-positive.yaml
id: order-amount-positive
kind: invariant
description: Order amount must be positive.
expr: order.amount > 0
applies_to:
  - order-create
confidence:
  level: high
  kind: fact
sources:
  - file: src/routes.ts
    line: 5
    repo: sample-node-repo
```

```yaml
# business-rules/order-cancel-allowed.yaml
id: order-cancel-allowed
kind: authorization
description: Only the order owner may cancel.
applies_to:
  - order-create
confidence:
  level: high
  kind: fact
sources:
  - file: src/routes.ts
    line: 7
    repo: sample-node-repo
```

```yaml
# capabilities/product-map.yaml
product: sample-mall
capabilities:
  - id: place-order
    name: Place Order
    description: End-to-end order placement.
    domains:
      - checkout
    spans_repos:
      - sample-node-repo
```

All 7 files must pass `validateArtifact()` against the corresponding schema. Test verifies this in `tests/integration/cdr-bootstrap.test.mjs`.

## API Design

No new public APIs. Round 3 adds:
- 1 new `scripts/first-run.mjs` (CLI script)
- 1 new `package.json` script entry: `"first-run": "node scripts/first-run.mjs"`
- 1 file deletion: `runtime/templates/docs/scripts/build-cognitive-pages.ts`
- 6 new fixture YAML files (see C-1)
- 1 new `KNOWN_ISSUES_DRAFT.md` (feature-dim, to be promoted to root KNOWN_ISSUES.md at `feature.close`)
- 1 new `tests/integration/cdr-bootstrap.test.mjs`

No capability inputs change. No engine code changes. No schema additions.

## Error Handling

`scripts/first-run.mjs` exit semantics:

| Exit code | Meaning | Recovery |
|---|---|---|
| 0 | Success | (none) |
| 1 | Recoverable failure (e.g., `cdr.behavior.upsert` failed but prior steps OK) | Print last successful step + `re-run npm run first-run to resume from step N` |
| 2 | Unrecoverable (e.g., fixture YAML fails schema validation — bug in Round 3's own artifacts) | Print error + stack + `this is a bug; report at github.com/ygwa/dapei-skill/issues` |

Each capability call wrapped in try/catch; on catch, log step name + error + continue or abort per exit code semantics.

## Migration Strategy

Round 3 is **purely additive** to user-visible artifacts (new fixture, new script, new test) and **purely subtractive** in one place (delete vestigial build script). No migration path needed because:

- `npm run first-run` is new (no user has it)
- Fixture upgrade is in-place, but the old fixture is unusable currently (v2.2 schema fails evidence validation), so any user attempting to use it would already be broken
- `build-cognitive-pages.ts` deletion has no user-facing impact (empirically: no code references it)
- KNOWN_ISSUES.md is new (didn't exist before)

The v2.2 schema alias concern (Risk-1) is deferred per D5; users with v2.2 data are documented as unsupported.

## Acceptance Criteria (recap from feature.yaml)

- **R3a fixture**: 6 fixture files under `docs/as-is/{behavior,state-machines,domains,business-rules,capabilities}/`, all current schema, all `kind=fact` rules have `sources[]`
- **R3a first-run**: `npm run first-run` idempotent, completes < 60s on fresh checkout, exits non-zero on failure with resume instructions
- **R3a KNOWN_ISSUES_DRAFT**: 10 entries, each with workaround + fix status
- **R3b build-cognitive-pages.ts**: deleted; `grep -r build-cognitive-pages` returns empty
- **R3 backward compat**: existing 22 tests still pass

## Round 3 PR scope (single commit expected)

| Status | File | Reason |
|---|---|---|
| Modified | `tests/fixtures/sample-node-repo/docs/as-is/behavior/sample-repo-analysis.yaml` → renamed to `sample-repo-analysis.v22.archive` | Archive v2.2 fixture |
| New | `tests/fixtures/sample-node-repo/docs/as-is/behavior/order-create.yaml` | Current-schema behavior fact |
| New | `tests/fixtures/sample-node-repo/docs/as-is/state-machines/order.yaml` | Current-schema state machine |
| New | `tests/fixtures/sample-node-repo/docs/as-is/domains/checkout.yaml` | Current-schema domain |
| New | `tests/fixtures/sample-node-repo/docs/as-is/business-rules/order-amount-positive.yaml` | Current-schema invariant |
| New | `tests/fixtures/sample-node-repo/docs/as-is/business-rules/order-cancel-allowed.yaml` | Current-schema authorization |
| New | `tests/fixtures/sample-node-repo/docs/as-is/capabilities/product-map.yaml` | Current-schema capability map |
| Modified | `package.json` | Add `first-run` script |
| New | `scripts/first-run.mjs` | First-run implementation |
| Deleted | `runtime/templates/docs/scripts/build-cognitive-pages.ts` | D3 removal |
| New | `tests/integration/cdr-bootstrap.test.mjs` | Acceptance test |
| New | `features/cdr-fixture-modernization/KNOWN_ISSUES_DRAFT.md` | D2 feature-dim draft (not in PR — lands at `feature.close`) |
| New | `features/cdr-fixture-modernization/feature.yaml` | Manifest (already exists) |
| New | `features/cdr-fixture-modernization/docs/01-current-state.md` | Stage 1 (already exists) |
| New | `features/cdr-fixture-modernization/docs/02-gap-analysis.md` | Stage 2 (already exists) |
| New | `features/cdr-fixture-modernization/docs/04-technical-design.md` | This file |

Total: 6 new YAMLs, 1 new script, 1 new test, 1 archive rename, 1 deletion, 1 package.json edit = ~11 file changes in the PR.

KNOWN_ISSUES.md (workspace-dim root) is **NOT** in this PR; maintainer creates it on `feature.close` per D2.
