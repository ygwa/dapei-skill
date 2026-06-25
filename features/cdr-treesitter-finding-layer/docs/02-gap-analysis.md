# 02. Gap Analysis

Date: 2026-06-25

## Where current state falls short

### Gap 1: candidate response is too large (the core problem)

| Metric | Current (v0.7) | Target (this PR) |
|---|---|---|
| Worst-case candidate response size | **40 MB** (200 files × 200 KB) | ~200 KB × N (where N = symbol count, not file count) — typically < 5 MB |
| Token cost per `cdr.entries.propose` cycle | High (AI re-reads content to find symbols) | Low (AI reads code_map, expands only selected symbols) |
| SKILL.md 1 KB sub-agent ceiling | **Violated** for > 5-file repos | Compliant (code_map is structured, smaller per-symbol) |
| First-time AI reading of a 500-file repo | 40 MB raw text | ~5 MB structured code_map + ~50 KB targeted expand calls |

### Gap 2: no semantic separation between finding and semantic claim

The v0.7 `apisurface_hint` field on candidate response is **engine-generated from CodeGraph's web-framework detection**. This conflates two roles:

- **Finding** (where code lives, who calls whom) — belongs to the engine, deterministic
- **Semantic claim** (this is a route, this is an entry point) — belongs to the Agent, requires reading

`codegraph.ts:73` defines `apisurface_hint: { type, method?, path?, topic? }` and `cdr.ts:388` writes it into the candidate response. **The engine is making a "this is a route" claim.** This is the spirit of v0.3 — `entries[].framework` removal, `discovered_by: "ai"` everywhere — slipping.

### Gap 3: ADR-0003's documented negative consequence is not mitigated

ADR-0003 §Negative explicitly lists "Higher token usage per propose call" as a known cost. v0.3 accepted it because the alternative was re-introducing framework regex parsers. **Tree-sitter gives a third option**: deterministic structural finding (cheap) without framework prescription (semantic freedom preserved). This PR closes the gap.

### Gap 4: CodeGraph "is an upgrade, not a dependency" only protects against absence, not against coarse fallback

`codegraph.ts:46-48`:
> The dapei platform ships with a working tree-walk + manifest fallback at every level; CodeGraph is an upgrade, not a dependency.

But when CodeGraph is absent, the fallback (tree-walk + manifest) hands **40 MB raw content** to the AI. That's still better than nothing, but it's a coarse fallback — the worst of both worlds (no structure, high token cost). Tree-sitter is the built-in default that makes the fallback **structured** without depending on an external CLI.

## What tree-sitter gives us

Per the verified 2025 library research:

| Capability | Per-file cost | Cold-start cost | Failure model |
|---|---|---|---|
| Tree-sitter native parse (500–2000 LOC) | **1–3 ms** (per medium file) | 150–300 ms / worker (one-time, all four grammars) | **Deterministic**: parse succeeds with `clean` / `partial` / `oversized` / `unsupported` status |
| AI raw content read (current) | 5–50 KB tokens per file | 0 (no parser) | No degradation; AI sees whatever content is inlined |
| Tree-sitter + `tags.scm` queries | 1–3 ms parse + ~1 ms query | (same as parse) | (same as parse) |

**Tree-sitter is roughly 1000× cheaper per file than AI reading**, and gives deterministic structural data the AI can use directly.

## Why now (not later)

Three convergent reasons:

1. **The negative consequence is documented.** ADR-0003 acknowledged the cost in 2026-06; the team has lived with it for one release cycle. Closing it now is natural.
2. **Tree-sitter library state is mature in 2025–2026.** All four target languages ship native prebuilds for all six major platforms. Decorator / annotation AST asymmetries are documented and have workarounds. The known sharp edges (32768-byte boundary, TS decorator sibling location) are well-understood.
3. **The codebase already has the right structure.** `runtime-adapters/src/codegraph.ts` already separates "finding substrate" from "engine core". `cdr-architecture.md §2.1` already defines the three-role split. Adding tree-sitter to `runtime-adapters/` is the natural extension.

## What we are NOT doing (explicit non-goals)

| Non-goal | Reason |
|---|---|
| Full call-graph extraction from tree-sitter | CodeGraph retains that role (optional). Tree-sitter's `tags.scm` produces structural data, not call edges. |
| Engine-side "this is a route" classification | Violates ADR-0003 spirit. AI owns semantic claim. |
| New user-facing shell workflow | AGENTS.md rule: user entry stays `@dapei ...`. |
| Backend selector abstracting tree-sitter + CodeGraph | Different failure models; abstraction forces semantic compromise. |
| WASM / Bun support in v1 | Native binding limitation; documented as v1.1+ future work. |
| Code map rendered in doc portal | Cognitive assets are durable artifacts; code_map is a temporary finding structure. |
| Code map persisted in cognitive index | Same reason as above. |
| Migrating CodeGraph to be tree-sitter-derived | Out of scope. CodeGraph remains the optional upgrade for refs / impact. |

## Risk register (carried into plan v2)

| Risk | Severity | Mitigation |
|---|---|---|
| TS decorator attach regression | medium | Snapshot tests on baseline fixtures |
| `tree-sitter-java` npm lags on record / @interface | medium | Fixture exercises records; fallback to `@tree-sitter-grammars/tree-sitter-java` |
| Buffer-size bug bites a large file in CI | high | Synthetic 50 MB fixture; production size cap of 32 MB before parse |
| Doc portal scope creep | medium | Plan §3.5 explicitly forbids code map page in portal |
| Schema change to candidate response breaks a downstream consumer | medium | ADR-0006 documents the contract change; minor semver bump |
| Bun runtime surprise | low | README documents native-only; v1.1+ if needed |
| Per-language decorator attach logic maintenance | low | One `.scm` per language; standard upstream tags.scm pattern |

## Reference docs

- [ADR-0003 §Negative](../decisions/ADR-0003-ai-as-scanner-engine-as-validator.md) — the negative consequence this gap analysis closes
- [ADR-0005](../decisions/ADR-0005-deterministic-engine-no-llm.md) — tree-sitter is deterministic; satisfies this ADR
- [docs/cdr-architecture.md §2.1](../cdr-architecture.md#21-execution-model-three-roles) — the three-role split that frames this gap
- [docs/features/cdr-v0.7-codegraph.md](../features/cdr-v0.7-codegraph.md) — the precedent for "optional upgrade, not a dependency"
- [packages/core/src/capabilities/domains/cdr.ts:38-42](../core/src/capabilities/domains/cdr.ts) — the 200 file × 200 KB = 40 MB worst case (verified)