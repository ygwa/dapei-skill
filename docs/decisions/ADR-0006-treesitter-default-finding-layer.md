---
id: ADR-0006
title: "Tree-sitter as the default finding layer; semantic claims stay with the Agent"
status: proposed
date: 2026-06-25
deciders: [ygwa]
technical-story: "feature/cdr-treesitter-finding-layer"
---

## Problem Statement

ADR-0003 made `cdr.entries.candidate` return raw file listings + inlined content slices, deliberately removing framework regex/annotation parsers from the engine ("AI is scanner, engine is validator"). It acknowledged two negative consequences:

- "Higher token usage per propose call (AI reads more content)"
- "Slightly slower for very large repos"

The current `cdr.entries.candidate` (v0.7) returns up to `MAX_FILES_PER_CANDIDATE (200) × MAX_FILE_BYTES (200_000)` = 40 MB of raw content per call. This both wastes tokens and bypasses the SKILL.md 1 KB sub-agent response ceiling at scale.

v0.7 added CodeGraph as a "finding" substrate (orient / apisurface / refs / impact). CodeGraph is an **optional upgrade** — when the CLI is missing, every capability falls back to tree-walk + manifest. The fallback is too coarse: the engine hands raw text to the AI and asks it to do structural work that a parser could do deterministically.

We need a built-in, deterministic, low-cost structural finding layer that:

1. Returns **structured code maps** (imports / classes / functions / methods / decorators / annotations / line ranges / symbol handles) without inlining raw content by default.
2. Does **not** make semantic claims about what is a route, an entry point, or a behavior — those remain Agent responsibilities (ADR-0003).
3. **Coexists with CodeGraph** as a separate, optional, graph-level finding layer (refs / impact / call graph) — neither replaces the other.
4. Has a **clear failure model** distinct from CodeGraph's CLI-probe failure model.

## Constraints

- **Engine remains 100% deterministic** (ADR-0005). Tree-sitter parsing is deterministic; no LLM in the parse path.
- **No new end-user shell workflows** (AGENTS.md). User entry stays `@dapei …`.
- **Skill protocol remains unchanged** (ADR-0003). Tree-sitter improves the finding layer the skill layer reads; the skill protocol (read → propose → confirm with sources[]) does not change.
- **Tree-sitter is built-in** — no external CLI, no per-workspace init, no `.dapei/graph/.no-codegraph` marker.
- **First-class languages** are limited to TypeScript / JavaScript / Python / Java — matching the current sample fixtures (Express / NestJS / FastAPI / Spring).
- **No full call-graph / control-flow / business-rule extraction** — those are out of scope. CodeGraph retains that role when present.

## Forces

- **Token cost vs. finding cost**: a tree-sitter parse costs ~1–3 ms per medium file (500–2000 LOC) native, plus 150–300 ms cold-start per worker for all four grammars. This is dramatically cheaper than AI reading raw content.
- **Bundle weight**: `tree-sitter-typescript` ships ~37 MB on disk unpacked but only ~3 MB per grammar at runtime, per platform. `tree-sitter-javascript` / `tree-sitter-python` / `tree-sitter-java` add ~3–7 MB each.
- **Cross-platform prebuilds**: all four grammars ship native `.node` prebuilds for darwin-x64 / darwin-arm64 / linux-x64 / linux-arm64 / win32-x64 / win32-arm64. No system toolchain required in CI.
- **Bun compatibility**: native `tree-sitter` does **not** work under Bun (known limitation; `kcosr/codemap` README confirms). WASM via `web-tree-sitter` is the escape hatch. We accept Node-only as the default and document the Bun caveat.
- **Decorator/annotation AST asymmetry**: TS decorators sit as siblings inside `class_body` (not children of `method_definition`); Python decorators are preceding siblings of `function_definition`; Java annotations sit inside the decorated declaration. Per-language post-processing is required.
- **32 KB `bufferSize` boundary**: `node-tree-sitter` issues `Error: Invalid argument` at exactly 32768 bytes; parser must set `bufferSize: Math.max(1024 * 1024, source.length + 3)`.
- **`apisurface_hint` field conflict**: the current v0.7 `apisurface_hint` is written by CodeGraph's web-framework detection and exposed in candidate responses. Renaming the field or moving its source is a contract change.

## Decision

### 1. Layering

```
┌─────────────────────────────────────────────────────────┐
│  User:  @dapei discover entries for mall-order          │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Skill Router → skills/cdr/SKILL.md                     │
└───────────────────────────┬─────────────────────────────┘
                            ▼
       ┌────────────────────┴────────────────────┐
       ▼                                         ▼
┌──────────────────┐                  ┌────────────────────┐
│  Agent:          │                  │  Platform:         │
│  semantic claim  │                  │  schema, evidence, │
│  route is or is  │                  │  index, guardrail  │
│  not an entry    │                  │  context injection │
└────────┬─────────┘                  └─────────┬──────────┘
         │                                      │
         ▼                                      ▼
┌─────────────────────────────────────────────────────────┐
│  Finding layer (this ADR):                              │
│                                                        │
│  tree-sitter  ─── built-in, default, structural code map│
│  CodeGraph    ─── optional upgrade, cross-file graph    │
│                  (refs / impact / call graph)           │
│                                                        │
│  Both return structural signals. Neither auto-promotes  │
│  structural signals into kind=fact business artifacts.  │
└─────────────────────────────────────────────────────────┘
```

- **Tree-sitter**: built-in default. Always available when the engine runs. Returns file-level `code_map` (imports / classes / functions / methods / decorators / annotations / line ranges / symbol handles) and a weak structural signal `entry_candidates` (public methods with decorators — useful but not authoritative).
- **CodeGraph**: optional upgrade. Returns apisurface metadata (`apisurface_hint` shape retained as a structural finding signal at the **file level**) and call-graph information (`refs` / `impact`). When the CLI is missing, tree-sitter alone covers structural finding.
- **Agent**: still owns `apisurface_hint` declaration at the **entry level** (`cdr.entries.propose` / `cdr.entries.confirm` input). Agent reads `code_map` (and any optional CodeGraph `apisurface_hint`), decides which symbols are entry points, and submits proposals with `sources[]`.
- **Engine**: validates evidence, indexes, increments, and injects context. Never decides a symbol is a route. Never decides a symbol is an entry point.

### 2. `cdr.entries.candidate` contract change

**Before (v0.7)**:
```ts
{
  repo, file_count,
  files: [{ relpath, language, size_bytes, truncated, content, apisurface_hint? }],
  skipped, max_bytes, backend, backend_reason
}
```

**After (this ADR)**:
```ts
{
  repo, file_count,
  files: [{
    relpath,
    language,
    size_bytes,
    truncated,
    code_map: {
      parse_status: 'clean' | 'partial' | 'unsupported' | 'oversized',
      symbols: [{ kind, name, start_line, end_line, decorators?, parent? }],
      imports: [{ source, line }],
      entry_candidates: [{ symbol, line, decorators }]   // weak signal, structural only
    }
  }],
  skipped, backend, backend_reason   // backend: 'tree-sitter' | 'tree-sitter+codegraph'
}
```

**Field-level decisions**:

- `content` is **removed** from the default response. AI requests specific slices via the new `cdr.entries.expand` capability.
- `apisurface_hint` is **removed** from the candidate response. It returns to the `cdr.entries.propose` input shape (where the AI declares `method` / `path` on a confirmed entry). CodeGraph's file-level route metadata — if present — is merged into `code_map.entry_candidates` as additional `decorators` strings, not as a route claim.
- `entry_candidates` is a **weak structural signal** — list of `public method + has decorator` from tree-sitter, optionally augmented with CodeGraph route metadata. It is NOT a "route claim".
- `backend` becomes `'tree-sitter' | 'tree-sitter+codegraph'`. There is no `'fallback'` in the new contract — tree-sitter parse failure degrades to `code_map.parse_status = 'partial' | 'unsupported' | 'oversized'`, never to "no code_map".
- `max_bytes` is removed (no content to cap). `max_files` remains as a list cap.

### 3. New capability: `cdr.entries.expand`

```ts
input: {
  repo: string,
  file: string,
  line_range?: [number, number],
  symbol_handle?: string   // e.g. "OrderController#create"
}
output: {
  content: string,         // bounded by line_range or symbol subtree
  truncated: boolean,
  line_count: number
}
```

Resolves a `symbol_handle` (from `code_map.symbols[].name` + parent) to its line range and returns the bounded content. Or returns arbitrary `line_range` content. Engine validates the file exists and the line range is in-bounds.

### 4. `cdr.profile` adds a `tree_sitter` block

In parallel with the existing `codegraph` block:

```yaml
tree_sitter:
  backend: native
  languages: [typescript, javascript, python, java]
  files_parsed: 150
  files_partial: 12     # parse had ERROR nodes; partial symbols emitted
  files_unsupported: 3  # extension not in registry
  files_oversized: 2    # > 32 MB; skipped
codegraph:
  available: true|false
  version: ...
  backend: "native" | "fallback"
```

Both blocks are **substrate metadata**, not framework claims (mirrors v0.7's existing convention).

### 5. Failure model

Tree-sitter and CodeGraph have distinct failure semantics. They are not abstracted behind a common selector.

| Layer | Failure mode | Behavior |
|---|---|---|
| **tree-sitter** | Parse error in file | `code_map.parse_status = 'partial'`, emit symbols outside `ERROR` nodes, mark intersecting entries `partial: true` |
| **tree-sitter** | File > 32 MB | `code_map.parse_status = 'oversized'`, emit empty `code_map`, surface in profile's `tree_sitter.files_oversized` |
| **tree-sitter** | Language unsupported | `code_map.parse_status = 'unsupported'`, emit empty `code_map`, surface in profile |
| **tree-sitter** | Cold start | 150–300 ms one-time per worker; amortized across calls |
| **CodeGraph** | CLI missing | `codegraph.available: false`, profile writes fallback block; candidate backend becomes `'tree-sitter'` only |
| **CodeGraph** | Index stale | CodeGraph's own concern; dapei surfaces pending_sync in profile |
| **CodeGraph** | refs/impact call fails | `refs.available: false` + reason; behavior upsert skips the cross-check (v0.7 behavior preserved) |

### 6. Out of scope (explicit)

- **Full call graph / control flow / business rule auto-extraction** — CodeGraph remains the path for those, when present.
- **Tree-sitter query language for finding routes** — `entry_candidates` is computed from `(method kind == 'method' && access modifier == 'public' && decorators.length > 0)`. It is not a route query; it is a heuristic on the structural AST.
- **WASM escape hatch for Bun** — documented as a future option in `runtime-adapters/treesitter/README.md`; not implemented in v1.
- **Tree-sitter as the source of `apisurface_hint` for entries** — `apisurface_hint` is removed from candidate responses. AI declares it in `propose` / `confirm` input.

## Alternatives Considered

### Option A: Keep raw content in candidate response (status quo)
- **Pros**: zero engine work; AI already knows what to do
- **Cons**: 40 MB raw text per call bypasses SKILL.md sub-agent ceiling; token cost remains the documented negative consequence of ADR-0003; no deterministic structural signal
- **Estimated cost**: persists ADR-0003 negative consequences; grows linearly with repo size

### Option B: Push tree-sitter parsing into the Agent (sub-agent does the parse)
- **Pros**: engine stays thin; matches "AI is scanner" more literally
- **Cons**: sub-agent has the same token problem the engine was meant to solve; no shared parse cache across sessions; per-call cold start paid by every sub-agent
- **Estimated cost**: re-pays ADR-0003 negative consequence at the sub-agent layer

### Option C: Abstract tree-sitter and CodeGraph behind a common backend selector
- **Pros**: clean abstraction; one place to swap backends
- **Cons**: the two layers have fundamentally different failure models (parse degradation vs. CLI availability); a common selector forces them to compromise; loses the explicit `tree-sitter+codegraph` backend label that tells callers what was actually consulted
- **Estimated cost**: ongoing design overhead; risk of forcing CodeGraph semantics into tree-sitter responses (or vice versa)

### Option D: Generate `apisurface_hint` directly from tree-sitter decorator capture
- **Pros**: a single field for entry hint; engine does more work; AI gets less to read
- **Cons**: violates ADR-0003 spirit — engine decides "this is a route" without Agent consensus; reintroduces the framework-prescription problem v0.3 explicitly removed
- **Estimated cost**: silent regression of v0.3; test surface would need to express "engine asserts route" again

## Consequences

### Positive

- **Closes ADR-0003 negative consequence**: "Higher token usage per propose call (AI reads more content)" is mitigated by structured code map + on-demand content via `cdr.entries.expand`. Worst-case candidate response drops from 40 MB to ~200 KB × N (a 200× reduction for typical repos).
- **Built-in default**: every dapei workspace gets structural finding without installing an external CLI. Aligns with the v0.7 "CodeGraph is an upgrade, not a dependency" principle — tree-sitter is the floor, CodeGraph is the ceiling.
- **Clear contract**: `code_map.parse_status` distinguishes "I parsed this fully" from "I parsed this partially" from "I skipped this". `backend: 'tree-sitter' | 'tree-sitter+codegraph'` is explicit.
- **`apisurface_hint` discipline restored**: the field stops being an engine-generated "route claim" and goes back to being an Agent declaration on a proposed entry. Mirrors the v0.7 "CodeGraph static topology never auto-promoted to fact" rule.
- **Coexistence with CodeGraph**: tree-sitter handles structural finding; CodeGraph handles graph finding. Neither replaces the other. Profile YAML has both blocks.

### Negative

- **Native binding distribution**: tree-sitter native modules add ~12 MB runtime per platform. Acceptable, but documented.
- **Decorator post-processing is per-language**: TS decorator attach logic differs from Python's. Cannot write a single "get decorators for this method" function. Maintenance burden is per-grammar, not per-framework.
- **Bun not supported in v1**: native binding doesn't load under Bun. Documented limitation; WASM escape hatch is v1.1+.
- **Schema change to `cdr.entries.candidate`**: AI skill protocol text must update (`skills/cdr/SKILL.md` Phase 1). Migration guide entry required.
- **Cognitive index does NOT gain a `code_map` field**: code maps are workspace-dimension temporary structures, not durable artifacts. AI sees them in candidate responses but they are not persisted into `.dapei/cognitive/index.yaml`. (If a future iteration wants to persist, that is a separate ADR.)

### Neutral

- **Phase 4 cleanup deferred**: the plan's Phase 4 "unify backend selector" is dropped. Tree-sitter and CodeGraph stay as two explicit finding layers; profile YAML has two parallel blocks.
- **No `route_hint?` field in candidate response**: the original plan suggested this; it is removed in favor of `code_map.entry_candidates[].decorators` (raw capture, not semantic).

## References

- [ADR-0003: AI is the scanner; engine is the validator](ADR-0003-ai-as-scanner-engine-as-validator.md)
- [ADR-0005: The engine never calls LLMs](ADR-0005-deterministic-engine-no-llm.md)
- [docs/cdr-architecture.md §2.1 Three roles](../cdr-architecture.md#21-execution-model-three-roles)
- [docs/cdr-architecture.md §7.4 Degradation](../cdr-architecture.md#74-degradation)
- [docs/features/cdr-v0.7-codegraph.md](../features/cdr-v0.7-codegraph.md) — CodeGraph integration that established "finding only, never auto-promoted"
- [docs/features/cdr-v0.3-ai-as-scanner.md](../features/cdr-v0.3-ai-as-scanner.md) — the v0.3 contract this ADR amends
- [docs/plantuml/](../plantuml/) — architecture diagrams that show the Finding / Agent / Platform split
- [Tree-sitter performance docs](https://tree-sitter-tree-sitter.mintlify.app/advanced/performance) — 100 MB/s parse throughput target
- [Tree-sitter Code Navigation (tags convention)](https://tree-sitter.github.io/tree-sitter/4-code-navigation.html) — `@definition.*` / `@reference.*` capture naming

## Implementation epic

`feature/cdr-treesitter-finding-layer` — the feature workspace that owns this implementation. All implementation lives under `features/cdr-treesitter-finding-layer/` per AGENTS.md Feature Dimension rules; durable doc updates backfill to `docs/decisions/` (this ADR), `docs/cdr-architecture.md`, `docs/features/cdr-treesitter-finding-layer.md`, and `CHANGELOG.md` only on feature close.