# CDR v0.8 — Reverse-cluster to L1 (feature/cdr-v0.8-reverse-cluster)

## What this PR delivers

The L1 capability map, which used to be hand-rolled by the AI
via `cdr.capability.map.init`, is now reachable through an
**engine-driven reverse-cluster pipeline** that:

1. Reads `behavior.events[]`, `behavior.writes[]`,
   `behavior.calls[].target_repo`, and `business-rule.applies_to[]`
   from the cognitive index.
2. Clusters behaviors into candidate domain groupings.
3. Writes a suggestions file the AI reviews.
4. Synthesizes the L1 capability map with engine-computed
   `spans_repos` / `behavior_count` / `fact_ratio`.
5. Renders a new `/l1/` portal section peer of `/cross-repo/`.

The contract is **read-then-human-commit**: the engine never
calls `cdr.domain.compose` itself. The suggestions file is the
seam.

### 1. `cdr.domain.suggest` (new in v0.8)

Read-only reverse-cluster of behaviors into suggested domain
candidates. Output: `docs/as-is/cross-repo/domain-suggestions.yaml`.

Edges considered, in priority order (tied by edge weight):

| Edge type | Weight | Source |
| --- | --- | --- |
| shared-events | 4 | both behaviors publish any of the same event names |
| shared-writes | 3 | both behaviors write any of the same table names |
| cross-repo-calls | 2 | A.calls[].target_repo == B.repo (or vice versa) |
| business-rule | 1 | some business-rule's applies_to contains both ids |

Clusters are connected components of the resulting graph. Each
cluster carries:

- `suggested_name` + `suggested_domain_slug` + `naming_reason`
  (most-frequent event-name subject, prefix `Cross-Repo:` when
  the cluster spans >1 repo)
- `confidence: high | medium | low`
  - high = shared-events + cross-repo
  - medium = shared-events OR shared-writes
  - low = everything else (business-rule only, etc.)
- `behavior_keys[]`, `repos[]`, `evidence[]` per edge type

Hard contract: **never calls `cdr.domain.compose`**. Suggest
and commit stay two separate steps.

### 2. `cdr.capability.map.synth` (new in v0.8)

Engine-driven clustering of *domains* into a capability map.
Distinct from v0.3 `cdr.capability.map.init` (which is a thin
pass-through of capabilities the AI hands it).

Domain sources, in priority order:

1. `input.manual_domains[]` — AI pre-staged a curated list
2. `docs/as-is/domains/**/*.yaml` — composed via `cdr.domain.compose`
3. `domain-suggestions.yaml` — from `cdr.domain.suggest`, only
   when `use_suggested_domains: true`

For each capability, the engine back-fills `spans_repos`,
`behavior_count`, and `fact_ratio` by resolving the capability's
named domains back to the cognitive index. These are objective
metrics the AI cannot self-derive without re-running the index
queries.

Two modes:

- **Auto-synthesize** (no `capabilities[]` passed): one capability
  per domain, id = `domain.<slug>`.
- **AI-curated** (`capabilities[]` passed): each AI-provided
  capability gets its id validated against the v0.5 multi-segment
  regex (`^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i`) and its metrics
  unioned across the named domains.

Empty workspace is a legitimate state: the file is written with
`status: empty` and a clear "no domains yet" message so the AI
gets a usable pointer to the next step.

### 3. `cdr.reversecluster.doc.generate` (new in v0.8)

Renders the L1 capability map and the cluster-suggestions report
to the VitePress portal at `<output>/l1/`. Peer of v0.5's
`cdr.crossrepo.doc.generate`; the two sections are siblings and
use the same Vue 3 components shipped in the per-portal theme.

Page set:

- `l1/index.md` — L1 overview + Mermaid total graph
- `l1/<capability-id>.md` — one page per capability
- `l1/cluster-suggestions.md` — cdr.domain.suggest output rendered
  for the AI to consult when authoring `cdr.domain.compose` calls

The capability NEVER re-runs `cdr.capability.map.synth` or
`cdr.domain.suggest`. Pure read of artifacts those capabilities
already wrote. If the product-map is missing, fails fast with a
clear pointer at `cdr.capability.map.synth`.

Empty workspace case is supported: capability-map.synth writes a
`status: empty` product-map, and this capability renders an
empty-state `l1/index.md` so the AI still gets a usable pointer
to the next step.

### 4. Cognitive index enrichment

Two new optional fields on `IndexBehaviorEntry`:

- `events[]` — copied from `behavior.events[]` (after dedup + sort)
- `writes[]` — projected from `behavior.writes[]` to its resource
  name (`table` or `target`), since the existing writes[] entries
  are `{ table, operation }` objects, not strings

These fields existed in the behavior YAML schema since v0.3 but
the cognitive index never tracked them. v0.8 reverse-cluster
needs them as cheap, already-on-the-document signals to find
cross-repo behaviors that publish the same event or write the
same table. Both are optional; pre-v0.8 index entries without
them keep working.

### 5. Router + SKILL.md

- Six new v0.8 intent patterns (English + 中文) for the three
  new capabilities. Pattern ordering is load-bearing: v0.8
  patterns must precede the v0.3 init / doc.generate catch-alls,
  and the v0.5 cross-repo portal pattern is hoisted above the
  catch-all for the same reason. The "Order matters" comment
  captures this so future contributors do not silently break
  the disambiguation.
- Contract: `synth*` wins over `init` / `build` (which stay on
  `cdr.capability.map.init` for backward compat). `L1` /
  `capability-map` noun wins over v0.3 `docs|portal` catch-all.
  `cross-repo portal` stays on `cdr.crossrepo.doc.generate`.
- SKILL.md Phase 5.7 — new section documenting the two-stage
  pipeline and explicitly teaching the AI to **never** expect
  `cdr.domain.suggest` to commit a domain for it.

### 6. Capability-map artifact validation

Two small follow-on fixes discovered while wiring synth:

- `cognitive-index.ts:upsertIndexEntry` previously threw
  "confidence must be an object" on every capability-map write
  because `parseConfidence` is unconditional. Capability-map
  artifacts do not carry a confidence block (their validity is
  decided from product+capabilities alone). Now bypassed for
  type=capability-map.
- `cdr.domain.compose` input schema now allows optional
  `confidence:{}`. Existing callers (which never passed it)
  keep working; the default `medium / inference /
  composed_from_behaviors` block is used when the AI does not
  pass one.

## What's NOT in this PR

- **Auto-calling `cdr.domain.compose` from `cdr.domain.suggest`.**
  This would violate the P1 red-line extension that suggestions
  stay separate from commits. The AI picks clusters and decides
  which become domains.
- **Multi-product capability map.** `cdr.capability.map.synth`
  writes a single global `product-map.yaml`. A workspace with
  multiple products would need either separate capability maps
  per product or a `product` field on each capability; neither
  is in scope.
- **`cdr.graph.ensure` / warm-the-index.** Same as v0.7: the
  adapter's no-CLI marker handles this transparently; an explicit
  ensure capability can land later if needed.
- **Real CodeGraph integration.** v0.8 doesn't touch v0.7's
  adapter. The fake-codegraph fixture in tests still documents the
  CLI contract that v0.7.1 will rewrite to match the real
  `orient --root --budget small --json` shape (flagged in v0.7's
  delivery doc as future work).
- **Domain → repo binding.** Each domain can declare an optional
  `repo` for per-repo namespace, but the reverse-cluster pipeline
  does not require every domain to bind to a repo. Domains that
  span repos are first-class citizens of the L1 view.

## How to verify locally

```bash
cd .worktrees/cdr-v0.8-reverse-cluster
npm run verify
# typecheck: clean
# test: 287 pass / 0 fail (134 cognitive+cdr unit + 3 v0.8 integration + existing suite)
# smoke: 16/16 + 4 L-levels PASS
```

Manually exercise the full pipeline:

```bash
# 1. Create workspace + add two repos with behaviors that share an event
# 2. cdr.domain.suggest → writes docs/as-is/cross-repo/domain-suggestions.yaml
# 3. AI reads suggestions, picks one, calls cdr.domain.compose
# 4. cdr.capability.map.synth → back-fills metrics into product-map.yaml
# 5. cdr.reversecluster.doc.generate → renders .dapei/docs-portal/l1/
# 6. npx vitepress build in the portal → see the /l1/ section live
```

## Files changed

| File | Change |
| --- | --- |
| `packages/core/src/cognitive-index.ts` | Track `events[]` and `writes[]` on behavior index entries; bypass `parseConfidence` for capability-map artifacts |
| `packages/core/src/capabilities/domains/cdr.ts` | New: `cdrDomainSuggest`, `cdrCapabilityMapSynth`, `cdrReverseClusterDocGenerate`. Plus `cdr.domain.compose` inputSchema now allows optional `confidence` |
| `packages/core/src/capabilities/index.ts` | Register the three new capabilities |
| `packages/router/src/index.ts` | Six new v0.8 intent patterns (English + 中文). Hoist cross-repo portal pattern above the v0.3 catch-all for precedence |
| `skills/cdr/SKILL.md` | New Phase 5.7 section; add the three v0.8 capabilities to the routing table |
| `tests/unit/cdr-domain-suggest.test.mjs` | New: 10 unit tests for `cdr.domain.suggest` |
| `tests/unit/cdr-capability-synth.test.mjs` | New: 8 unit tests for `cdr.capability.map.synth` |
| `tests/unit/cdr-reverse-cluster-doc.test.mjs` | New: 7 unit tests for `cdr.reversecluster.doc.generate` |
| `tests/unit/cdr.test.mjs` | Add 12 router-intent tests for v0.8 (synth wins over init, L1 wins over catch-all, cross-repo portal stays on its own) |
| `tests/integration/cdr-v0.8-reverse-cluster.test.mjs` | New: 3 end-to-end tests across mall-order + mall-payment |
| `docs/features/cdr-v0.8-reverse-cluster.md` | This file |
| `CHANGELOG.md` | Unreleased section |
| `.changeset/cdr-v0.8-reverse-cluster.md` | Minor version bump |

## Breaking changes

None for users on v0.4-0.7: the cognitive index fields are
optional, the capability-map upsert path is bypassed for the
type the AI doesn't carry, and `cdr.domain.compose` now accepts
an optional `confidence` (existing callers that didn't pass it
keep working).

Pre-v0.4 workspaces that have a flat `product-map.yaml` written
by v0.3 `cdr.capability.map.init` keep reading it — synth
**overwrites** the same file, but the v0.3 schema is a subset of
the v0.8 schema so any downstream consumer (doc-gen portal)
keeps working.

## ADR-style rationale

**Why a separate `cdr.domain.suggest` instead of teaching
`cdr.domain.compose` to do reverse-cluster?**

Two responsibilities. `cdr.domain.compose` is a **commit**
operation — it writes a `domain.yaml` with `derived_from` and is
guarded by P1 red-line validation. `cdr.domain.suggest` is a
**read** operation — it computes a report the AI reviews before
deciding what to commit. Mixing them would let the engine decide
domain semantics, which is exactly what the P1 red line says the
AI must own.

The two-step pattern (suggest → human-review → compose) is the
same shape v0.5 established for cross-repo business rules
(`cdr.business.crosslink` reads, `cdr.business.compose` commits).
Reusing the pattern keeps the mental model consistent.

**Why a separate `cdr.capability.map.synth` instead of extending
`cdr.capability.map.init`?**

Two responsibilities again. `init` is **pass-through** — the AI
hands the engine a `capabilities[]` array and the engine writes
it. `synth` is **engine-driven** — the engine reads domains
(composed or suggested), clusters them, and computes objective
metrics the AI cannot derive without re-running the index
queries.

The v0.3 init path stays unchanged for users who want to keep
hand-rolling the L1 hypothesis. The v0.8 synth path is for users
who want the engine to do the boring part.

**Why are `spans_repos` / `behavior_count` / `fact_ratio` worth
shipping separately from the existing capability-map schema?**

They're the objective metrics the AI has always had to guess at.
"Does this capability span multiple repos?" is a question that
takes the engine a single index lookup; the AI either skips it
or answers it wrong. Back-filling at write time means the portal
can render the L1 view with correct cross-repo annotations from
day one.

**Why is `fact_ratio` a fraction and not a kind classification?**

Because most clusters are mixed. A domain with 3 fact behaviors
and 2 inference behaviors has `fact_ratio: 0.6` — neither "all
fact" nor "all inference". The fraction is the honest answer;
the AI decides whether the ratio is high enough for the L1
view to trust.

**Why does `cdr.capability.map.synth` write `status: empty`
instead of failing on empty workspaces?**

Because empty is the *common* state at v0.8 adoption time. The
AI has just run `cdr.domain.suggest` and is staring at a report
of 0 clusters; failing the next step would be hostile UX.
Writing `status: empty` plus a clear "run cdr.domain.compose
first" message gives the AI the next action without a stack
trace.

**Why doesn't `cdr.reversecluster.doc.generate` re-run the
upstream capabilities?**

Pure read. If the AI calls `render L1 portal` before
`cdr.capability.map.synth`, the fast-fail with a clear pointer
is better UX than silently re-running expensive work. This
matches the v0.5 pattern (`cdr.crossrepo.doc.generate` requires
`cdr.business.crosslink` to have run first).

**Why hoist the cross-repo portal pattern above the v0.3
catch-all in the router?**

Both "render cross-repo portal" and "render documentation portal"
match the v0.3 catch-all (`(?=.*\b(?:generate|build|render)\b)
(?=.*\b(?:documentation|docs|portal)\b)`). Without hoisting,
`render cross-repo portal` lands on the wrong capability. The
"Order matters" comment in the router file documents this so the
v0.8 pattern order isn't accidentally shuffled later.