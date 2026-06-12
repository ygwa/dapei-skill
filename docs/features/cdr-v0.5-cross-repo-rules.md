# CDR v0.5 — Cross-Repo Business Rules (feature/cdr-v0.5-cross-repo-rules)

## What this PR delivers

The first iteration of "reverse-cluster to L1": once the L2/L3 artifacts
(behaviors, business-rules) are in place across multiple repos, the
engine can compute a cross-repo business-rule view without LLM
assistance. AI recognition of cross-repo relationships stays in the
AI's court — the engine does not infer "B service subscribes to A
service's event" from event-name heuristics. The AI writes
business-rule artifacts that name the spans; the engine reads them
and groups them.

### 1. `cdr.business.crosslink`

Read-only computation. Walks `docs/as-is/business-rules/` (recursive,
so it picks up v0.4's per-repo layout) and resolves each rule's
`applies_to[]` against the cognitive index to recover the `(behavior,
repo)` pairs. Groups by `kind` (invariant / constraint / authorization
/ sla / compensation). Writes `docs/as-is/cross-repo/cross-links.yaml`
with total counts, intra-repo vs cross-repo split, and the kind
groups.

Filters:
- `min_confidence` (low | medium | high, default low) drops rules
  whose evidence is below the threshold
- `kinds: ["sla", "compensation"]` narrows to a subset
- `include_intra_repo: true` (default false) keeps single-repo rules

Returns the same data in `data.rules[]` so callers can render without
re-reading the file. Reports `data.skipped[]` for applies_to ids that
are not in the cognitive index.

An empty workspace (no business-rules directory) is a legitimate
state — the capability emits an empty cross-links file rather than
throwing.

### 2. `cdr.crossrepo.doc.generate`

Renders the cross-link view to a VitePress section at
`<output>/cross-repo/`. The section is a peer of the existing
`/behaviors/`, `/domains/` etc. sections. It uses the same per-portal
theme and Vue 3 components that the v0.4 portal uses — no new theme
work needed.

Pages emitted:
- `cross-repo/index.md` — overview grouped by kind, plus a single
  Mermaid `graph LR` showing every cross-repo rule
- `cross-repo/<rule-id>.md` — one page per rule with applies_to
  table and a Mermaid subgraph per rule

If the cross-links file is missing, the capability fails fast with
`FILE_MISSING` and a clear message pointing the caller at
`cdr.business.crosslink`.

### 3. Router intents

Two new English + Chinese intent groups:

| User intent | Capability |
|---|---|
| `build cross-repo rules` / `建立/生成/汇总 跨仓库 业务规则` | `cdr.business.crosslink` |
| `build cross-repo portal` / `生成/渲染 跨仓库 门户` | `cdr.crossrepo.doc.generate` |

Capability ids were renamed from `cdr.business.cross_link` /
`cdr.cross_repo.doc.generate` to satisfy the existing
`domain.name` regex (no underscores — see v0.2 CHANGELOG for the
parallel precedent).

### 4. `skills/cdr/SKILL.md` Phase 5.5

New workflow phase teaching AI to recognise five recurring
cross-repo relationship patterns and write the right kind of
business rule for each:

| Pattern | `kind` |
|---|---|
| Synchronous HTTP / RPC between services | `authorization` or `sla` |
| Event-driven async compensation | `compensation` |
| Event-driven time budget | `sla` |
| Shared DB row consistency | `invariant` |
| Cross-service state machine advancement | `sla` |

The skill explicitly states the engine/AI split: AI writes the
business rules; the engine reads them and renders the cross-repo
view.

## What's NOT in this PR

- **Automatic discovery of cross-repo relationships.** v0.5 does not
  infer "B service subscribes to A service's event" from event-name
  heuristics. AI recognition is the only path in. Step 2 of the
  roadmap (structured `behavior.calls`) and Step 3 (CodeGraph
  integration) will give the engine more to work with later.
- **`cdr.stale.scan` implementation.** Still on the v0.4 StaleFields
  schema; the scanner lands separately.
- **Cross-repo event graph as a Vue component.** v0.5 uses
  Mermaid in markdown, not a custom Vue 3 component. The
  Mermaid blocks render the same way BehaviorFlow / StateMachine
  blocks do. A custom component can replace Mermaid later if we
  want click-to-source behaviour.
- **Multi-source cross-repo diff** (last v0.4 doc paragraph).
  Deferred to a Step 2 / Step 3 PR.

## How to verify locally

```bash
cd .worktrees/cdr-v0.5-cross-repo-rules
npm run verify
# typecheck: clean
# test: 263 pass / 0 fail (214 unit + 28 integration + 13 scenarios + 8 ai-behavior)
# smoke: 16/16 + 4 L-levels PASS
```

## Files changed

| File | Change |
| --- | --- |
| `packages/core/src/capabilities/domains/cdr.ts` | `cdrBusinessCrossLink` and `cdrCrossRepoDocGenerate` capabilities; empty-workspace handling in crosslink |
| `packages/core/src/capabilities/index.ts` | Register the two new capabilities |
| `packages/router/src/index.ts` | Two new intent groups (English + Chinese) |
| `skills/cdr/SKILL.md` | New Phase 5.5 with the cross-repo rules workflow and a kind-mapping table |
| `tests/unit/cdr-crosslink.test.mjs` | New: 9 unit tests covering empty / intra / cross-repo / filter / skipped / portal cases |
| `tests/integration/cdr-v0.5-cross-repo.test.mjs` | New: end-to-end against the v0.4 mall-order + mall-payment fixtures |

## Breaking changes

None. Both new capabilities are additive; no existing capability
contract changed. The P1 red lines (`fact` requires `sources[]`,
`domain` requires `derived_from`, etc.) are unchanged. Pre-v0.5
business-rule artifacts continue to work; the engine simply reads
their `applies_to[]` and resolves against the index.

## ADR-style rationale

**Why engine-only computation rather than AI-assisted?**

A previous draft of this work proposed having AI confirm edge
direction between events. That is unnecessary for v0.5: by the time
the engine runs, every cross-repo relationship is already encoded
as a business rule with named behaviors in named repos. The
"direction" of the relationship is implicit in the rule's `kind`
and the `applies_to` ordering. If the AI wants to record a specific
direction ("A causes B, never the reverse"), it picks `kind:
compensation` and lists A first.

**Why not just do Mermaid from the events field directly?**

Because "event X is published by A and consumed by B" is a
**semantic** claim, not a syntactic one. The same event name can
mean different things in different repos. Business rules are the
right place for this kind of claim because they have evidence
requirements (`kind=fact` requires `sources[]`) and they are
re-runnable: if the consumption logic moves to a third service, the
rule is updated and the view updates with it. Static Mermaid from
event names would silently rot.

**Why a separate `cdr.crossrepo.doc.generate` rather than a new
section in `cdr.doc.generate`?**

`cdr.doc.generate` is a peer-of-capability that walks all six
existing sections. Adding a seventh to it would mean changing its
capability contract. A separate capability has a single
responsibility (render the cross-repo view) and a single failure
mode (cross-links file missing). The two compose: a portal build is
`cdr.doc.generate` plus `cdr.crossrepo.doc.generate`.
