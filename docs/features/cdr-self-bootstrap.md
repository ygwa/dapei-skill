# CDR Self-Bootstrap (Phase 4 of v0.3)

**Date**: 2026-06-21
**Workspace**: `/tmp/dapei-self-bootstrap/` (sandbox, not in this repo)
**Repo analyzed**: `dapei-skill` (local clone of this repo)
**Feature tag**: `cdr-self-bootstrap`

## What we did

Ran the full Cognitive Discovery Runtime (CDR) pipeline against `dapei-skill`
itself as a dogfooding exercise. The goal was to answer two questions:

1. Does the engine actually work end-to-end on a real monorepo?
2. Does the produced `docs/as-is/` cognitive memory give us a useful,
   navigable view of this project?

## Pipeline phases executed

| Phase | Capability | Result |
| --- | --- | --- |
| 0 | `workspace.init` (manual) | `/tmp/dapei-self-bootstrap/` with `.dapei/repos.yaml` |
| 1 | `cdr.bootstrap dapei-skill` | Profile written; 109 code files listed |
| 2 | `cdr.entries.candidate` + AI scanner | 12 entries proposed + confirmed |
| 3 | `cognitive.artifact.upsert` (×4) | 4 behaviors written |
| 3 | `cdr.business.compose` (×2) | 2 business rules written |
| 3 | `cdr.domain.compose` (×2) | 2 domains composed |
| 3 | `cdr.capability.map.init` | L1 capability map with 3 capabilities |
| 4 | `cdr.doc.generate` | 17 markdown pages in `.dapei/docs-portal/` |
| 5 | `cdr.feature.link` | 11 assets tagged with `created_by_feature=cdr-self-bootstrap` |

## Confirmed entry points (Phase 2 AI scanner pass)

The AI identified 12 product-level entry points after reading 109 candidate
files. Each entry was registered via `cdr.entries.propose` with `sources[]`
pointing at the actual line in the source code:

1. `engine-cli-main` — `engine/dapei-engine.ts:55` (CLI binary)
2. `scripts-dapei-wrapper` — `scripts/dapei:1` (shell wrapper)
3. `router-route-intent` — `packages/router/src/index.ts:634` (NL router)
4. `core-run-capability` — `packages/core/src/index.ts:15` (`runCapability`)
5. `core-capability-registry` — `packages/core/src/capability-registry.ts:1`
6. `cdr-capabilities` — `packages/cdr/src/capabilities.ts:1` (CDR surface)
7. `cap-workspace-init` — `packages/core/src/capabilities/domains/workspace.ts:1`
8. `cap-feature-lifecycle` — `packages/core/src/capabilities/domains/feature.ts:1`
9. `cap-repos-add-analyze` — `packages/core/src/capabilities/domains/repos.ts:1`
10. `cap-context-build` — `packages/core/src/capabilities/domains/context.ts:1`
11. `cap-doc-generate` — `packages/doc-gen/src/doc-gen.ts:1`
12. `runtime-codegraph` — `packages/runtime-adapters/src/codegraph.ts:1`

## Behaviors written (Phase 3)

| Behavior | Source location | Evidence |
| --- | --- | --- |
| `dapei-engine-run` | `engine/dapei-engine.ts:55` | fact + sources[] |
| `workspace-init` | `packages/core/src/capabilities/domains/workspace.ts:1` | fact + sources[] |
| `cdr-bootstrap` | `packages/cdr/src/capabilities.ts:3914` | fact + sources[] |
| `feature-close` | `packages/core/src/capabilities/domains/feature.ts:1` | fact + sources[] |

## Business rules written (Phase 3)

- `capability-id-kebab-case` (invariant) — every `CapabilitySpec.id` must
  match `^[a-z0-9-]+$`. Applies to all 4 behaviors above.
- `evidence-fact-requires-sources` (constraint) — `confidence.kind=fact`
  requires `sources[]` where every entry has a real file path. Applies to all 4
  behaviors above.

## Domains composed (Phase 3)

- **Engine Runtime** — derived from `dapei-engine-run`, `workspace-init`,
  `feature-close`. Covers capability execution, registry, schema validation,
  audit logging.
- **Cognitive Discovery** — derived from `cdr-bootstrap`. Covers L0 profile,
  L2 entries, L3 behaviors/states, L2 domains, L1 capability map.

## Capability map (Phase 3)

`docs/as-is/capabilities/product-map.yaml`:
- `engine-runtime` (Engine Runtime)
- `cognitive-discovery` (Cognitive Discovery)
- `documentation-portal` (Documentation Portal)

## Bugs / issues found during dogfooding

### 1. `vitepress build` fails — un-registered Vue components

**Severity**: medium (blocks `vitepress preview` and `vitepress build`, but
the generated markdown pages are still useful as plain text).

**Symptom**:

```
[vite:vue] [plugin vite:vue] behaviors/dapei-skill/cdr-bootstrap.md (24:25):
Element is missing end tag.
```

**Root cause**: `runtime/templates/docs/.vitepress/theme/index.ts` is a stub
that does not register the three Vue components that `cdr.doc.generate`
emits into markdown pages:

- `<BehaviorFlow :steps='...' />` — referenced in `doc-gen.ts:339`
- `<CodeLink :source='...' />` — referenced in `doc-gen.ts` throughout
- `<StateMachine />` — referenced in `doc-gen.ts` for state machine pages

The README's "v2.3 architecture" section claims three custom Vue 3 components
are "registered via a per-portal `theme/index.ts`", but the actual template
just imports DefaultTheme without registering anything.

**Fix** (proposed for next feature branch): ship a `BehaviorFlow.vue`,
`CodeLink.vue`, and `StateMachine.vue` in `packages/doc-gen/templates/components/`
and update `runtime/templates/docs/.vitepress/theme/index.ts` to register them
via `app.component('BehaviorFlow', ...)`. Without this, no user can run
`vitepress build` against a real CDR output without manual template surgery.

### 2. `cdr.entries.propose` is not safe under parallel calls

**Severity**: low (cosmetic; idempotent on retry).

**Symptom**: When proposing + confirming many entries in a `for` loop with
parallel shell invocations, the YAML file gets read-modify-written concurrently
and one confirm can race against another's propose, causing "entry not found"
errors that resolve on retry.

**Fix** (optional): serialize `cdr.entries.propose` and `cdr.entries.confirm`
on a per-repo mutex, or have callers batch via a single
`cdr.entries.bulk` capability.

### 3. `cognitive.artifact.upsert` rejects `writes[].operation: create`

**Severity**: low (doc gap; the WRITE_OPS set is `[insert, update, delete,
upsert, read]` and `create` is not in it).

**Symptom**: First attempt at writing behaviors with `operation: create`
failed validation. Fix: use `insert` (or `upsert`).

**Fix** (optional): add `create` to WRITE_OPS for clarity, or document the
set explicitly in the evidence.ts JSDoc.

## Artifacts produced

This report references artifacts in `/tmp/dapei-self-bootstrap/`. They are
NOT committed to this repo (they're sandbox products, not durable knowledge).
The structure they have is:

```
docs/as-is/
├── profiles/dapei-skill.yaml
├── entries/dapei-skill.yaml (12 entries)
├── behavior/dapei-skill/*.yaml (4 behaviors)
├── business-rules/dapei-skill/*.yaml (2 rules)
├── domains/*.yaml (2 domains)
├── capabilities/product-map.yaml (L1)
└── state-machines/ (empty — none derived in this run)

.dapei/
├── cognitive/index.yaml (cognitive index with 11 entries tagged created_by_feature=cdr-self-bootstrap)
└── docs-portal/ (17 generated markdown pages; VitePress build currently broken — see issue #1)
```

## Verification of v3.2.0 baseline

After running this exercise, the unmodified `dapei-skill` repo still passes:

```
> npm run typecheck
tsc -p tsconfig.json    (no errors)

> npm run test:unit
ℹ tests 319
ℹ pass 319
ℹ fail 0
```

## Recommendation

Issue #1 (VitePress component registration) is a **ship-blocker for v3.3**
if any user tries `vitepress preview` on a real CDR output. The other two
issues are paper-tiger polish.

The cleanest next move is a `feature/cdr-v0.10-portal-components` branch that
ships the three Vue components and updates the theme template. Without it,
the CDR portal is write-only.