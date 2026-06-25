# 04. Technical Design

> This document details the design decisions and rationale. The **canonical** plan with file-by-file deliverables is [`docs/features/cdr-treesitter-finding-layer.md`](../../../docs/features/cdr-treesitter-finding-layer.md). This document explains the *why* behind the schema and module structure.

Date: 2026-06-25

## Design 1: Layering — two finding layers, no abstraction

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
│  Finding layer (ADR-0006):                              │
│                                                        │
│  tree-sitter  ─── built-in, default, structural code map│
│  CodeGraph    ─── optional upgrade, cross-file graph    │
│                  (refs / impact / call graph)           │
│                                                        │
│  Both return structural signals. Neither auto-promotes  │
│  structural signals into kind=fact business artifacts.  │
└─────────────────────────────────────────────────────────┘
```

### Why two layers, not one

| Question | Answer |
|---|---|
| Can tree-sitter replace CodeGraph? | **No**. Tree-sitter is single-file structural (imports / classes / functions / line ranges). CodeGraph has cross-file call graph (`refs` / `impact` / `callees`). Different problems. |
| Can CodeGraph replace tree-sitter? | **No**. CodeGraph is an external CLI requiring install + index init. Tree-sitter is built-in, no init, no CLI. The fallback when CodeGraph is absent should not be "no structural finding" — that defeats the purpose. |
| Can a common selector abstract both? | **No**. Tree-sitter failure = parse degradation (clean / partial / unsupported / oversized). CodeGraph failure = CLI availability (available / unavailable with reason). Different worlds. A common selector forces compromise on one of them. |

### Why the layering stays explicit (no abstraction)

Two explicit layers in the candidate response:

```ts
backend: 'tree-sitter' | 'tree-sitter+codegraph'
```

- `'tree-sitter'`: tree-sitter parsed; CodeGraph CLI absent.
- `'tree-sitter+codegraph'`: both ran; CodeGraph's route metadata merged into `code_map.entry_candidates[].decorators` (raw capture, no semantic interpretation).

The AI can read `backend` to know what signals were actually consulted. No hidden abstraction.

## Design 2: `apisurface_hint` removal — the contract discipline

### Before (v0.7)

`cdr.entries.candidate` response shape:
```ts
{ files: [{ ..., apisurface_hint?: { type: 'api', method: 'GET', path: '/orders' } }] }
```

Where `apisurface_hint` came from:
- `codegraph.ts:73-74` — interface declares the shape
- `codegraph.ts:337-344` — populated from CodeGraph's `query --kind=function` route metadata

### Problem

`apisurface_hint` carries `method` + `path` — these are **route metadata**, semantic claims. The engine writes them into the candidate response, which is the finding layer. This is the spirit of v0.3 (engine doesn't opine on framework) slipping.

### After (this PR)

`apisurface_hint` is **removed from `cdr.entries.candidate` response**. It returns to the `cdr.entries.propose` input shape — where the **Agent declares** `method` and `path` on a confirmed entry:

```ts
// cdr.entries.propose input
{ repo, id, type, file, line, method?, path?, sources: [...] }
```

The closest structural signal in the candidate response becomes `code_map.entry_candidates[].decorators` — an **array of raw decorator/annotation strings**, no semantic interpretation.

| Field | Before | After |
|---|---|---|
| `apisurface_hint` on file | Engine-generated from CodeGraph route metadata | **Removed** |
| `code_map.entry_candidates[].decorators` | (does not exist) | Tree-sitter capture + optional CodeGraph route decorator strings |
| `apisurface_hint` on entry proposal | (was always here) | **Unchanged** — Agent declares `method` / `path` on propose input |

### Why this matters

It restores the v0.3 contract: **finding layer returns structural data, not semantic claims**. The Agent reads structural data and decides what's a route. The engine validates evidence and never prescribes business meaning.

## Design 3: `content` removal + `cdr.entries.expand` — making on-demand explicit

### Before (v0.7)

```ts
files: [{ ..., content: string }]   // up to 200 KB inline per file, 40 MB total
```

The AI's workflow was "read content inline, find entry points". This is what ADR-0003 §Negative flagged as high-token-cost.

### After (this PR)

```ts
files: [{ ..., code_map: { symbols, imports, entry_candidates } }]   // no content

// New capability:
runCapability('cdr.entries.expand', {
  repo, file,
  line_range?: [start, end],
  symbol_handle?: 'ClassName#methodName'
})
// → { content, truncated, line_count }
```

### Why a new capability, not just "smaller content slice"

"content on demand" cannot be implicit. If the candidate response silently shrinks from 200 KB to 10 KB per file, the AI workflow contract changes without a name. Making it a new capability:

1. **Gives the AI an explicit next step**: read `code_map`, call `expand` for selected symbols, then propose.
2. **Enables per-symbol resolution**: `symbol_handle` resolves to exact line range without AI guesswork.
3. **Bounds content access at the engine level**: P1 red line applies (`file must exist`, `line in range`).
4. **Preserves evidence discipline**: the expanded content is read by the Agent for understanding, but evidence in `propose` still cites file:line from the code_map, not the expanded content.

## Design 4: `cdr.profile` adds a `tree_sitter` block — substrate metadata

In parallel with the existing `codegraph` block:

```yaml
tree_sitter:                          # NEW — built-in, always present
  backend: native
  languages: [typescript, javascript, python, java]
  files_parsed: 150
  files_partial: 12                   # parse had ERROR nodes; partial symbols emitted
  files_unsupported: 3                # extension not in registry
  files_oversized: 2                  # > 32 MB; skipped
codegraph:                            # EXISTING — optional, may be unavailable
  available: true|false
  version: ...
  backend: "native" | "fallback"
  files_total: 842
  apisurface_count: 12
```

Both blocks are **substrate metadata**, never framework claims. Mirrors v0.7's `codegraph` block convention.

### Why expose parse counts

The `tree_sitter` block surfaces what the engine actually did. AI and humans reading the profile YAML can see "12 files had parse errors" and know to manually verify those entries, instead of trusting a silent fallback.

## Design 5: Failure model — distinct from CodeGraph's CLI-availability model

| Layer | Failure | Response shape | Caller action |
|---|---|---|---|
| **tree-sitter** | Parse error in file | `code_map.parse_status: 'partial'`, emit symbols outside ERROR nodes, mark intersecting entries `partial: true` | Caller reads `parse_status`; decides whether to expand symbol for manual review |
| **tree-sitter** | File > 32 MB | `code_map.parse_status: 'oversized'`, empty code_map | Caller reads `parse_status`; AI skips entry proposal for this file unless manually expanded |
| **tree-sitter** | Language unsupported | `code_map.parse_status: 'unsupported'`, empty code_map | Caller reads `parse_status`; AI may still attempt to expand raw content if file is small enough |
| **tree-sitter** | Cold start | 150–300 ms one-time per worker | Amortized across calls; measured by CI smoke test |
| **CodeGraph** | CLI missing | `codegraph.available: false`, candidate `backend: 'tree-sitter'` | Caller (engine) gracefully degrades; no AI action needed |
| **CodeGraph** | refs/impact call fails | `refs.available: false` + reason | Caller (engine) skips the call-graph cross-check in `cdr.behavior.upsert` (v0.7 behavior preserved) |

**No common failure model.** Tree-sitter and CodeGraph are not abstracted; each carries its own failure semantics.

## Design 6: Decorator attach is per-language

Tree-sitter's CST puts decorators in different positions depending on language:

| Language | Decorator node | Position vs target | Attach logic |
|---|---|---|---|
| **TypeScript** | `(decorator (identifier))` | Sibling in `class_body`, NOT child of `method_definition` (open upstream issue #309) | Post-process: walk `class_body`, attach preceding decorator to next `method_definition` / `public_field_definition` |
| **Python** | `(decorator (identifier))` | Preceding sibling of `function_definition` | Tag query captures both in order; no post-process needed |
| **Java** | `(annotation)` | Child of the annotated declaration (`method_declaration`, `class_declaration`) | Tag query captures annotations as decorators; no post-process needed |
| **JavaScript** | (no first-class decorator support; legacy TS-only) | n/a | Adapter reports `no decorator capture` in adapter metadata |

Each language adapter ships its own `decorators-<lang>.scm` and (for TS only) `attach/decorators.ts` post-processor.

## Design 7: Cold-start budget

**Per verified 2025 benchmark data**:

| Operation | Cost |
|---|---|
| `require('tree-sitter')` (N-API load) | ~50–100 ms |
| `require('tree-sitter-{typescript,javascript,python,java}')` × 4 | ~30–60 ms each = ~120–240 ms total |
| **Total cold start (one-time per worker)** | **~150–300 ms** |

This is paid **once per process**. For a long-lived CLI (which is how the engine runs), it's invisible. For per-request serverless use, it's the first-request penalty.

**Phase 1 acceptance criterion**: cold start ≤ 500 ms on Apple M1 (measured by `tests/unit/treesitter-smoke.test.mjs`).

## Design 8: Buffer-size defensive setting

`node-tree-sitter#222` documents that `parser.parse(src, undefined, { bufferSize })` throws `Error: Invalid argument` at exactly **32768 bytes** without setting the option.

**Fix**: every parse call passes `{ bufferSize: Math.max(1024 * 1024, source.length + 3) }`.

**Phase 1 test**: `tests/unit/treesitter-smoke.test.mjs` asserts (a) without the option, a 50 KB file throws the boundary error, (b) with the option, it parses cleanly. This locks in the contract so a future refactor doesn't accidentally remove the option.

## Design 9: 32 MB size cap before parse

Per `tree-sitter#222` (marijnh): "for the time being, the recommendation is to disable parsing altogether for files above some size threshold". Adopted from Aura's pattern:

```ts
const SIZE_CAP_BYTES = 32 * 1024 * 1024;  // 32 MB

if (source.length > SIZE_CAP_BYTES) {
  return { parse_status: 'oversized', symbols: [], imports: [], parse_diagnostic: `file exceeds ${SIZE_CAP_BYTES} bytes; skipped before parse` };
}
```

**Phase 1 test**: synthetic 50 MB fixture emits `parse_status: 'oversized'`.

## Reference

- Canonical plan: [`docs/features/cdr-treesitter-finding-layer.md`](../../../docs/features/cdr-treesitter-finding-layer.md)
- ADR: [`docs/decisions/ADR-0006-treesitter-default-finding-layer.md`](../../../docs/decisions/ADR-0006-treesitter-default-finding-layer.md)
- Fixture baseline: [`docs/features/cdr-treesitter-fixture-baseline.md`](../../../docs/features/cdr-treesitter-fixture-baseline.md)
- CI matrix: [`docs/features/cdr-treesitter-ci-matrix.md`](../../../docs/features/cdr-treesitter-ci-matrix.md)