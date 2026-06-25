# Memory — cdr-treesitter-finding-layer

> Local design notes, decisions made during planning, and references. Per AGENTS.md "Knowledge Boundary & Dimension Rules", this file is **feature-dimension only**. It does not migrate to `docs/`.

## Key decisions

### Why a new ADR (0006) instead of amending ADR-0003

ADR-0003 is the cornerstone of v0.3's "AI is scanner, engine is validator" principle. Amending it would weaken its standalone clarity — the next engineer reading ADR-0003 would have to also read 0006 to understand the current contract.

Instead, ADR-0006 **complements** ADR-0003:
- ADR-0003 says "engine returns file listing, AI reads content". (v0.3 contract)
- ADR-0006 says "engine returns code map (structured), AI reads code map + on-demand content". (v1.0 contract, layered on top)

Both stand alone. The lineage is clear from the references section of ADR-0006.

### Why we removed `apisurface_hint` from candidate response (not just renamed it)

Three options were on the table:

| Option | Pros | Cons |
|---|---|---|
| Rename to `route_candidates` (keep in candidate) | Smaller change | Still engine-generated semantic claim |
| Move to `code_map.entry_candidates[].decorators` | Raw capture, no semantic | Breaks v0.7 consumers |
| **Remove entirely from candidate; AI declares on propose input** | Clean contract; AI is the only place semantic claims live | Slightly more typing for AI |

Chose **option 3** because it best matches v0.3's spirit. The v0.7 field was a contract drift; removing it is the cleanest fix.

### Why a new `cdr.entries.expand` capability (not just "make `content` optional")

Three options considered:

| Option | Pros | Cons |
|---|---|---|
| Make `content` field optional, AI can skip it | Smallest change | Implicit contract drift |
| Add `include_content: false` flag to candidate input | Single round-trip | AI still has to know which files to flag |
| **New `cdr.entries.expand` capability** | Explicit next step; per-symbol resolution; engine-validated bounds | One more capability in the registry |

Chose **option 3** because making "content on demand" a named capability:
1. Shows up in `cdr.index.list` and capability routers.
2. Can have its own evidence validation.
3. Mirrors the v0.3 pattern of "candidate lists; propose writes; expand reads".

### Why no backend selector abstraction

The original plan's Phase 4 ("unify backend selector") was tempting. Three reasons to drop it:

1. **Different failure models**: tree-sitter parse degradation vs. CodeGraph CLI availability. A common selector forces a least-common-denominator abstraction that drops the nuance.
2. **Different data shapes**: tree-sitter returns `code_map` (imports / symbols / line ranges). CodeGraph returns `apisurface_hint` (route metadata). They don't compose cleanly into a single object.
3. **Honest signaling**: `backend: 'tree-sitter' | 'tree-sitter+codegraph'` tells the AI exactly what was consulted. A `'native' | 'fallback'` binary label hides nuance.

If a future iteration needs cross-backend routing logic, that's a separate ADR. Not in v1.

### Why TS decorator attach is custom (not just upstream tag query)

The upstream `tree-sitter-typescript/queries/tags.scm` captures `@definition.method` from `(method_definition)`, but TS decorators are **siblings** of `method_definition` inside `class_body` — they're not children. The tag query misses them.

This is open upstream issue #309. Two options:
- Wait for upstream fix (probably years).
- Custom attach: walk `class_body` in `attach/decorators.ts`, attach preceding sibling `(decorator)` to next `(method_definition)`.

Chose the custom attach. Same pattern as `jcodemunch-mcp` and `dora` (referenced in the librarian research).

### Why Python `@dataclass` decorator capture works without custom attach

Python's CST already has `(decorator)` as a **preceding sibling** of `(function_definition)` / `(class_definition)`. The upstream `tags.scm` can capture both in order via positional matching. No custom attach needed.

### Why Java annotations work without custom attach

Java annotations are **children** of the annotated declaration (`method_declaration`, `class_declaration`). The upstream `tags.scm` captures them directly.

### Why no doc portal code map page

Three reasons:
1. **Cognitive assets are durable artifacts**. Portal units are behaviors / state machines / domains / business rules. Code maps are temporary finding structures.
2. **Render cost**: a per-repo code map page would regenerate on every `cdr.entries.candidate` call. Portal is rebuilt less often.
3. **No precedent**: the existing portal sections (L1 capability map, L2 domains, L3 behaviors / state / rules, business-rules, cross-repo) all map to durable artifacts. Adding a code map section breaks that consistency.

If a future iteration wants a "structure explorer" portal section, that's a separate ADR with its own scope.

### Why no cognitive index code map field

Same reason as portal — code maps are temporary structures, not durable artifacts. Persisting them in the cognitive index would inflate the index for no durable benefit.

If future iterations want to persist code maps for, e.g., diff-based staleness detection, that's a separate ADR.

## Open questions (not blocking)

### Q1: Should we expose `entry_candidates` heuristic as a configurable query?

Currently: `(method kind == 'method' && access modifier == 'public' && decorators.length > 0)`.

Options:
- Hardcode (current): simpler; per-language.
- Configurable per-repo (in profile YAML): more flexible but adds a config surface.
- Configurable per-workspace: probably overkill for v1.

**Decision**: hardcode for v1. The heuristic is conservative (public + has decorator); adding more would risk false positives. Configurability deferred.

### Q2: Should we cache parsed code maps across calls?

Current proposal: per-process LRU keyed by `(repo, file, mtime)`.

Options:
- No cache (re-parse every time): simpler; cold-start cost paid per call.
- In-memory LRU (current): amortizes across calls; lost on process restart.
- Persistent cache at `.dapei/cdr/tree-sitter-cache/`: amortizes across runs; mtime-based invalidation.

**Decision**: in-memory LRU for v1. Persistent cache is v1.1+ if needed.

### Q3: What happens if a file is edited mid-scan?

Tree-sitter supports incremental parse via `tree.edit()`. Should we use it?

**Decision**: not in v1. Re-parse from scratch is 1–3 ms per file; the optimization is not worth the complexity.

## References

- [ADR-0003](../../../../docs/decisions/ADR-0003-ai-as-scanner-engine-as-validator.md)
- [ADR-0005](../../../../docs/decisions/ADR-0005-deterministic-engine-no-llm.md)
- [ADR-0006](../../../../docs/decisions/ADR-0006-treesitter-default-finding-layer.md)
- [Plan v2](../../../../docs/features/cdr-treesitter-finding-layer.md)
- [Fixture baseline](../../../../docs/features/cdr-treesitter-fixture-baseline.md)
- [CI matrix](../../../../docs/features/cdr-treesitter-ci-matrix.md)
- [cdr-architecture §2.1](../../../../docs/cdr-architecture.md#21-execution-model-three-roles)
- [cdr-v0.7-codegraph](../../../../docs/features/cdr-v0.7-codegraph.md) — CodeGraph integration precedent

## Change log

- 2026-06-25: Initial memory created with planning decisions for v1.0.