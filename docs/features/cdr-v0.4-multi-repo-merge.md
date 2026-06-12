# CDR v0.4 — Multi-Repo Merge (feature/cdr-v0.4-multi-repo-merge)

## What this PR delivers

The foundational fix that unblocks every later phase of the "L2/L3 first,
reverse-cluster to L1" plan: per-repo namespace for behavior / state-machine /
domain / business-rule artifacts. Two repos can now both produce an
`order-create` behavior without overwriting each other.

### 1. Per-repo artifact paths

`artifactRelativePath` in `packages/core/src/cognitive-index.ts` now resolves
to `<section>/<repo>/<id>.yaml` when the artifact carries a `repo` field.
Sections that go per-repo:

- `behavior` — `docs/as-is/behavior/<repo>/<id>.yaml`
- `state-machine` — `docs/as-is/state-machines/<repo>/<entity>.yaml`
- `domain` — `docs/as-is/domains/<repo>/<slug>.yaml`
- `business-rule` — `docs/as-is/business-rules/<repo>/<id>.yaml`

Sections that stay global (single source of truth per product / repo):

- `capability-map` — `docs/as-is/capabilities/product-map.yaml`
- `profile` — `docs/as-is/profiles/<repo>.yaml` (already per-repo)
- `entries` — `docs/as-is/entries/<repo>.yaml` (already per-repo)

### 2. Per-repo dedup in `upsertIndexEntry`

`behavior` / `state-machine` / `domain` / `business-rule` index entries are
now keyed on `(id, repo)` so two repos can have the same behavior id
without one overwriting the other in the index. Legacy global entries (no
`repo` field) still dedupe on id alone, preserving backward compatibility.

### 3. `cdr.state.derive` resolves behavior paths via the index

The previous implementation hard-coded `join(behaviorDir, ${bid}.yaml)`,
which broke as soon as a behavior moved to a per-repo path. Now the
capability looks up the canonical path from the cognitive index, falling
back to the flat legacy path only when the index has no record of the id.

The same fix is applied to `cognitive.state.suggest`.

### 4. `cdr.domain.compose` writes through `artifactRelativePath`

Previously the capability hand-rolled the path
`cp.domainDir/${domainSlug}.yaml`, ignoring the `repo` field. Now it uses
`artifactRelativePath`, so a domain composed from one repo's behaviors
lives at `domains/<repo>/<slug>.yaml`.

### 5. Cognitive index `stale` field reserved

All four per-repo index entry types (`IndexBehaviorEntry`,
`IndexStateMachineEntry`, `IndexDomainEntry`, `IndexBusinessRuleEntry`,
`IndexCapabilityMapEntry`) now extend a `StaleFields` interface with
`stale? / stale_reason? / stale_at? / stale_base?` fields. The
implementation of `cdr.stale.scan` lands in the next PR; this PR only
reserves the schema so we do not have to migrate the index format twice.

### 6. `cdr.doc.generate` per-repo portal pages

`loadYamlDir` now infers the per-repo namespace from the file's parent
directory and stores it on each `ParsedDoc`. Page generators then route
the file to `<output>/<section>/<repo>/<id>.md` and link it at
`/<section>/<repo>/<id>` in the VitePress sidebar.

### 7. New fixture: `mall-order` + `mall-payment`

Two tiny Node.js fixtures that share an `Order` entity and emit cross-repo
domain events. Previously every fixture was single-repo. The new
`tests/integration/cdr-v0.4-multi-repo.test.mjs` covers:

- Same `order-create` behavior id in both repos writes to two distinct
  files and registers two distinct index entries.
- Cross-repo `cdr.state.derive` for the `Order` entity succeeds without
  a per-repo filter on the input.
- Cross-repo `cdr.domain.compose` produces a domain with `derived_from`
  pointing at behaviors from both repos.
- `cdr.doc.generate` emits both `behaviors/mall-order/order-create.md` and
  `behaviors/mall-payment/order-create.md`; the VitePress sidebar links
  both.

A second test asserts the **backward-compat fallback**: a behavior file
planted at the legacy flat path `docs/as-is/behavior/<id>.yaml` is still
readable by `cdr.state.derive`.

## How to verify locally

```bash
# 1. Pick up the worktree
cd .worktrees/cdr-v0.4-multi-repo-merge

# 2. Run the full verify pipeline
npm run verify

# Expected:
#   typecheck: clean
#   test: 254 pass / 0 fail (205 unit + 28 integration + 13 scenarios + 8 ai-behavior)
#   smoke: 16/16 + 4 L-levels PASS
```

## What's NOT in this PR

- **`cdr.stale.scan` implementation** — the `stale` field is reserved in
  the index schema, but the capability that populates it lands in a
  follow-up. This PR's only contribution on the stale front is the schema
  reservation.
- **Engine plan / pipeline execution** — running
  `candidate → propose → confirm → upsert × N → derive × M → compose × K`
  across 5+ repos still requires the LLM to drive the loop manually.
  Schema + plumbing are ready; the engine-level orchestration lands
  after the doc-portal work.
- **Cross-repo event graph (`cdr.behaviors.cross_link`)** and the
  reverse-clustering capabilities (`cdr.domain.suggest`,
  `cdr.capability.map.synth`) are Phase B and follow this PR.

## Files changed

| File | Change |
| --- | --- |
| `packages/core/src/cognitive-index.ts` | Per-repo `artifactRelativePath`; `StaleFields`; per-repo dedup in `upsertIndexEntry` |
| `packages/core/src/capabilities/domains/cdr.ts` | `cdr.state.derive` resolves via index; `cdr.domain.compose` writes through `artifactRelativePath`; one `const index` re-declaration removed |
| `packages/core/src/capabilities/domains/cognitive.ts` | `cognitive.state.suggest` resolves via index with legacy fallback |
| `packages/doc-gen/src/doc-gen.ts` | `ParsedDoc.repo` field; per-repo URL + page path; sidebar links include `(repo)` annotation |
| `tests/fixtures/mall-order/{package.json, src/routes.ts, src/orderService.ts}` | New fixture: HTTP POST /orders |
| `tests/fixtures/mall-payment/{package.json, src/routes.ts, src/paymentService.ts}` | New fixture: HTTP POST /payments, sibling entity |
| `tests/integration/cdr-v0.4-multi-repo.test.mjs` | New test: cross-repo no-collision + cross-repo state merge + backward-compat fallback |
| `tests/integration/cdr-e2e.test.mjs` | Assertion paths updated to per-repo layout |
| `tests/unit/cdr.test.mjs` | Two legacy-path assertions updated to per-repo layout |
| `tests/unit/cognitive-upsert.test.mjs` | One legacy-path assertion updated to per-repo layout |
| `scripts/smoke-test.sh` | Test 9 expectation updated to per-repo behavior file path |

## Breaking changes

**Path layout for new writes.** Existing flat files at
`docs/as-is/behavior/<id>.yaml` (and the other per-repo sections) written
before this PR are still **readable** — both `cdr.state.derive` and
`cognitive.state.suggest` fall back to the legacy path when the index has
no record. New writes always go to the per-repo path.

**Index dedup key change.** Pre-v0.4 index entries deduped on `id` only.
If a workspace has pre-existing index entries for the same id in multiple
repos, the second write will overwrite the first. The fix is to re-run
`@dapei discover behaviors` for each affected repo so the engine
re-writes the entries with the correct `repo` field.

## ADR-style rationale

**Why `<section>/<repo>/<id>.yaml` (subdir) instead of `<section>/<repo>__<id>.yaml` (flat)?**

- The directory tree mirrors the mental model: a reader looking at
  `docs/as-is/behavior/` immediately sees which repos have behaviors
  under management.
- VitePress sidebar groups naturally fall out of subdirs.
- All `cd <repo>` / glob operations keep working.
- The `__` separator would have been an extra encoding step in URLs and
  would have collided with the kebab-case naming convention already used
  for repo names.

**Why reserve the `stale` field before `cdr.stale.scan` exists?**

- Schema migrations of `index.yaml` are non-trivial: every reader, every
  writer, every consumer of the index has to be updated in lockstep.
  Doing it once while we already touch the index is cheaper than doing
  it twice.
- The `StaleFields` interface is purely additive. Nothing in the
  codebase reads `stale` yet, so this PR cannot break existing behavior
  by leaving the field unpopulated.
- The next PR (`cdr.stale.scan`) can drop the scanner in without
  touching the schema, the writers, or any consumer.
