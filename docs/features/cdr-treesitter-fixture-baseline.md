# Fixture upgrade requirements — `feature/cdr-treesitter-finding-layer`

> Companion to `docs/features/cdr-treesitter-finding-layer.md` §1.3.
> Each language adapter needs a baseline fixture that exercises its sharp edges.

## Why this matters

Tree-sitter grammars have **per-language AST asymmetries** that bite naive extractors. Without a fixture that exercises each sharp edge in CI, regressions only surface when a real repository hits them — which is exactly the late-failure mode dapei tries to avoid.

The fixtures below are the **canonical regression baseline** for the `TreeSitterCodeMapAdapter`. Any change to a `.scm` query or a decorator attach post-processor must keep these fixtures producing the asserted `code_map` shape.

## Fixture layout

```
tests/fixtures/treesitter/
├── typescript/
│   ├── sample.ts              # class + method + decorator + interface + generic
│   ├── sample.tsx             # JSX + TSX component
│   └── broken.ts              # deliberate syntax error → partial parse_status
├── javascript/
│   ├── sample.js              # class + ESM + async
│   └── broken.js              # partial parse_status
├── python/
│   ├── sample.py              # class + @decorator + async + PEP 695 type alias
│   └── broken.py              # partial parse_status
├── java/
│   ├── Sample.java            # class + @Annotation + record + @interface
│   └── Broken.java            # partial parse_status
└── oversized/
    └── synthetic-50mb.bin     # 50 MB synthetic content → oversized parse_status
```

## Per-language requirements

### TypeScript (`tests/fixtures/treesitter/typescript/sample.ts`)

| Construct | Why | Expected capture |
|---|---|---|
| `class OrderController { @Get('/orders') getOrder() {} }` | TS decorator as `class_body` sibling, not `method_definition` child | `symbols[].decorators: ['Get']` on `getOrder` |
| `interface PaymentRepo { find(): Promise<Payment> }` | Interface capture | `symbols[].kind: 'interface'`, `name: 'PaymentRepo'` |
| `type OrderId = string & { __brand: 'OrderId' }` | Type alias | `symbols[].kind: 'module'` (TS tag queries put type aliases under module) |
| `function generic<T extends object>(x: T): T { ... }` | Generic function | `symbols[].kind: 'function'`, `name: 'generic'` |
| `import { foo } from './bar'` | Import capture | `imports: [{ source: './bar', line: N }]` |
| `export default class Foo {}` | Default export | `symbols[].kind: 'class'`, `name: 'Foo'` |

### TypeScript JSX (`tests/fixtures/treesitter/typescript/sample.tsx`)

| Construct | Why | Expected capture |
|---|---|---|
| `const el = <Foo />` | JSX self-closing element (only `tsx` grammar handles this) | File parses with `parse_status: 'clean'`; no `<Foo />` becomes a comparison expression |
| `const el = <Foo><Bar /></Foo>` | Nested JSX | `parse_status: 'clean'` |
| `interface Props { children: React.ReactNode }` | Type used in JSX | `symbols[].kind: 'interface'`, `name: 'Props'` |

> **Why a separate `.tsx` fixture**: the upstream `tree-sitter-typescript` package exports two grammars (`typescript` and `tsx`); only `tsx` knows `<Foo />` is a self-closing element. Picking the wrong one produces parse errors on every JSX construct.

### JavaScript (`tests/fixtures/treesitter/javascript/sample.js`)

| Construct | Why | Expected capture |
|---|---|---|
| `class UserService { async findById(id) { ... } }` | Class + method + async | `symbols[].kind: 'method'`, `name: 'findById'` |
| `import { foo } from 'bar'` | ESM import | `imports[]` populated |
| `module.exports = { createUser }` | CommonJS export | `symbols[].kind: 'module'`, `name: 'createUser'` (via tag query) |

### Python (`tests/fixtures/treesitter/python/sample.py`)

| Construct | Why | Expected capture |
|---|---|---|
| `@app.get('/orders')\nasync def get_orders(): ...` | Python decorator as preceding sibling of `function_definition` | `symbols[].decorators: ['app.get']`, `name: 'get_orders'` |
| `@dataclass\nclass Order: ...` | Class-level decorator | `symbols[].kind: 'class'`, `name: 'Order'`, `decorators: ['dataclass']` |
| `type OrderId = str` (PEP 695, Python 3.12+) | New type alias syntax | `symbols[].kind: 'module'`, `name: 'OrderId'` |
| `from typing import Optional` | Import capture | `imports: [{ source: 'typing', line: N }]` |
| `class OrderService:\n    def create(self, ...): ...` | Method inside class | `symbols[].kind: 'method'`, `name: 'create'`, `parent: 'OrderService'` |

> **Python 3.12 syntax**: PEP 695 `type X = ...` requires the upstream grammar to be recent enough. If the pinned `tree-sitter-python` lags, the fixture file's syntax must remain Python 3.11 compatible. Test passes when `parse_status: 'clean'` regardless.

### Java (`tests/fixtures/treesitter/java/Sample.java`)

| Construct | Why | Expected capture |
|---|---|---|
| `@RestController\npublic class OrderController { ... }` | Annotation on class | `symbols[].kind: 'class'`, `name: 'OrderController'`, `decorators: ['RestController']` |
| `@GetMapping("/orders")\npublic Order getOrder() { ... }` | Annotation on method | `symbols[].kind: 'method'`, `name: 'getOrder'`, `decorators: ['GetMapping']` |
| `public record OrderRecord(String id) { ... }` (Java 16+) | Record declaration | `symbols[].kind: 'class'`, `name: 'OrderRecord'` (records captured as class-shape in upstream tag queries) |
| `public @interface Validated { ... }` | Annotation type declaration | `symbols[].kind: 'interface'`, `name: 'Validated'` |
| `import org.springframework.web.bind.annotation.GetMapping;` | Import capture | `imports[]` populated |
| `public <T> List<T> findAll(Class<T> type) { ... }` | Generic method | `symbols[].kind: 'method'`, `name: 'findAll'` |

> **Java record support caveat**: the standalone `tree-sitter-java` npm package lags on record / `@interface` capture. If the fixture fails with `parse_status: 'partial'` on these constructs, Phase 1 must switch to `@tree-sitter-grammars/tree-sitter-java` or consume via `tree-sitter-wasms`.

### Broken fixtures (one per language)

Each language gets a `broken.<ext>` fixture with a deliberate syntax error:

```ts
// broken.ts — unclosed class
class Foo {
  method() {
    return "x"
  // missing closing brace
```

Expected:
- `parse_status: 'partial'`
- `symbols[]` contains the outer-class `Foo` if it parses outside the `ERROR` node
- `parse_diagnostic: 'ERROR node at line N: unexpected token'`

These fixtures prove the **partial degradation path** — the engine still emits structural data for the parts of the file that parse, rather than failing the whole file.

### Oversized fixture

`synthetic-50mb.bin` — 50 MB of pseudo-random text content with a `.ts` extension. Expected:

- `parse_status: 'oversized'`
- `symbols: []`
- `imports: []`
- `parse_diagnostic: 'file exceeds 32 MB size cap'`

This proves the **size cap path** — the engine never attempts to parse files above the cap, regardless of the 32 KB `bufferSize` boundary bug.

## CI smoke test

`tests/unit/treesitter-smoke.test.mjs` exercises:

1. All four grammars load on the current platform.
2. Each baseline fixture parses with `parse_status: 'clean'` and the asserted `code_map` shape (snapshot test).
3. Each broken fixture parses with `parse_status: 'partial'`.
4. The oversized fixture emits `parse_status: 'oversized'`.
5. A `.xyz` file emits `parse_status: 'unsupported'`.
6. Total cold-start across all four grammars ≤ 500 ms on the test platform.
7. `bufferSize: Math.max(1024*1024, src.length + 3)` is set (verified via `parser.parse(src, undefined, { bufferSize })`); a defensive test that **without** this option, a 50 KB file throws `Error: Invalid argument` at the 32768-byte boundary.

## CI matrix consideration

> **Tree-sitter native prebuilds differ per platform.** A failure on linux-arm64 (AWS Graviton, common CI host) is silent until someone runs there. The fixture smoke test must run on at least:
> - `ubuntu-latest` (linux-x64 — current CI default)
> - `macos-latest` (darwin-arm64 — Apple Silicon, dev hosts)
> - `ubuntu-24.04-arm` (linux-arm64 — AWS Graviton)
>
> See `docs/features/cdr-treesitter-finding-layer.md` §"Phase 1 — CI matrix baseline" for the workflow change.

## Adding new fixtures

When a new language adapter is added (e.g., Go, Rust):

1. Add a directory `tests/fixtures/treesitter/<language>/` with at least: `sample.<ext>`, `broken.<ext>`.
2. Update the smoke test's baseline list.
3. Update `TreeSitterCodeMapAdapter` registry with the extension → grammar package mapping.
4. Document the language's sharp edges in this file (mirror the per-language tables above).
5. The cold-start budget in §1.3 of the feature doc must accommodate the new grammar (~50–80 ms each).

## Maintenance

These fixtures are **canonical and stable**. Changes require:

- Updating the `.scm` query that drives capture (visible diff in PR).
- Updating the smoke test's snapshot (visible diff in PR).
- Updating the ADR-0006 "Consequences" section if the contract shape changes.

Treat changes to these fixtures as the equivalent of changing a public API: review carefully, document the regression target explicitly.