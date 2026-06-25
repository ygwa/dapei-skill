# Tree-sitter Code Map Adapter

> Built-in, deterministic structural code map for CDR (Cognitive Discovery Runtime).
> See [ADR-0006](../../../docs/decisions/ADR-0006-treesitter-default-finding-layer.md) for the architectural decision and layering rationale.

This package is the default **finding** layer for `cdr.entries.candidate`. It parses TypeScript / JavaScript / Python / Java source files into a structured `code_map` (imports, classes, functions, methods, interfaces, decorators, line ranges). The engine emits structural signals only — it never decides whether a decorated method is a route, an entry point, or a behavior. Those are Agent decisions (ADR-0003).

## Public surface

```ts
import {
  TreeSitterCodeMapAdapter,
  parseFile,
  parseDirectory,
  type CodeMapFile,
  type CodeMapSymbol,
  type CodeMapEntryCandidate,
  type ParseStatus,
  type SupportedLanguage,
} from "@dapei/runtime-adapters/treesitter";
```

| Export | Purpose |
|---|---|
| `TreeSitterCodeMapAdapter` | Class wrapping the registry + cold-start budget. `isAvailable()` always returns true on Node ≥ 22 (built-in). |
| `parseFile(repoPath, relpath)` | Parse a single file. Returns `CodeMapFile` with `parse_status`, `symbols`, `imports`, optional `entry_candidates`. |
| `parseDirectory(repoPath, { maxFiles })` | Walk a repo directory and yield `CodeMapFile` for every supported file. |

## Supported languages

| Language | Extensions | Grammar | Decorator attach |
|---|---|---|---|
| TypeScript | `.ts`, `.tsx` | `tree-sitter-typescript` | TS sibling — class-level (in `export_statement`) and method-level (in `class_body`) |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | `tree-sitter-javascript` | None (no first-class decorator support) |
| Python | `.py` | `tree-sitter-python` | Preceding sibling of `function_definition` / `class_definition` |
| Java | `.java` | `tree-sitter-java` | `modifiers` (positional child[0]) of `method_declaration` / `class_declaration` / `record_declaration` / `annotation_type_declaration` |

## Failure model

| Status | Cause | What the engine emits |
|---|---|---|
| `clean` | Parse succeeded with zero `ERROR` / `MISSING` nodes | Full `symbols`, `imports`, `entry_candidates` |
| `partial` | Parse produced `ERROR` / `MISSING` nodes (syntax error, incomplete file) | Symbols **outside** the error nodes; `parse_diagnostic` populated |
| `unsupported` | File extension not in the registry | Empty `symbols` and `imports`; `parse_diagnostic` populated |
| `oversized` | File > 32 MB (size cap before parse) | Empty `symbols` and `imports`; `parse_diagnostic` populated |

These are **per-file** statuses. The `cdr.entries.candidate` aggregate response is `backend: 'tree-sitter'` whenever tree-sitter ran (even if some individual files are `partial` / `unsupported` / `oversized`). There is no global `fallback` value — see ADR-0006 for why.

## Cold-start profile

- All four grammars load once on first `new TreeSitterCodeMapAdapter()`.
- Measured budget: **≤ 500 ms** on Apple M1 (asserted by `treesitter-smoke.test.mjs`).
- Subsequent calls reuse the cached `Language` objects — no per-call grammar load.

```ts
const adapter = new TreeSitterCodeMapAdapter();
const doctor = adapter.fullDoctor();
// { backend: 'native', languages: ['typescript', 'javascript', 'python', 'java'], cold_start_ms: 287 }
```

## `bufferSize` defensive setting

Tree-sitter throws `Error: Invalid argument` at exactly **32768 bytes** without an explicit `bufferSize` (node-tree-sitter#222). The adapter always passes:

```ts
const bufferSize = Math.max(1024 * 1024, source.length + 3);
```

This is tested by `treesitter-smoke.test.mjs` (the broken-fixture parse tests indirectly exercise the boundary).

## 32 MB size cap

Tree-sitter parses in memory; files above ~32 MB cause memory pressure. The adapter rejects oversized files **before** invoking `parser.parse()`, emitting `parse_status: 'oversized'`. Adopted from Aura's pattern.

## Per-language decorator attach asymmetry

Tree-sitter's CST puts decorator/annotation nodes in different positions depending on the language. The attach logic lives in [`attach/decorators.ts`](./attach/decorators.ts).

| Language | Decorator node | Position | Attach logic |
|---|---|---|---|
| TypeScript | `(decorator)` | Sibling in `class_body` for methods; sibling of `class_declaration` in `export_statement` for classes | Walk `class_body` for methods; walk to parent of `class_declaration` for class-level |
| Python | `(decorator)` | Preceding sibling of `function_definition` / `class_definition` | Walk preceding `previousNamedSibling` chain |
| Java | `(marker_annotation)` / `(annotation)` | Child of `modifiers` (positional child[0]) | Iterate positional children looking for `modifiers`; `childForFieldName("modifiers")` returns undefined |
| JavaScript | n/a | No first-class decorator support | No-op |

## Bun compatibility (NOT supported in v1)

The native `tree-sitter` binding does **not** load under Bun (known limitation; `kcosr/codemap` README confirms). WASM via `web-tree-sitter` is the documented escape hatch but is not implemented in v1. Users running CDR under Bun must use Node ≥ 22.

## What this adapter does NOT do

- **No full call-graph extraction** — CodeGraph retains that role (refs / impact).
- **No "this is a route" classification** — engine emits raw `decorators` strings; Agent decides semantic meaning.
- **No `.wasm` / Bun support** — native binding only in v1.
- **No persistent code-map cache** — parse on demand, in-memory LRU only (cold-start budget covers most workloads).

## Testing

```bash
# Three test files, 25 tests total
node --experimental-strip-types --test tests/unit/treesitter-smoke.test.mjs
node --experimental-strip-types --test tests/unit/treesitter-decorators.test.mjs
node --experimental-strip-types --test tests/unit/treesitter-types.test.mjs
```

Fixtures live under `tests/fixtures/treesitter/{typescript,javascript,python,java}/`. See [`docs/features/cdr-treesitter-fixture-baseline.md`](../../../docs/features/cdr-treesitter-fixture-baseline.md) for the per-language sharp edges covered.

## CI matrix

A dedicated `treesitter-platform-matrix` job runs on PRs touching this package or its fixtures, exercising darwin-arm64 / linux-x64 / linux-arm64. See [`.github/workflows/ci.yml`](../../../../.github/workflows/ci.yml) and [`docs/features/cdr-treesitter-ci-matrix.md`](../../../docs/features/cdr-treesitter-ci-matrix.md).