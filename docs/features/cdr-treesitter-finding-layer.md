# CDR v1.0 — Tree-sitter as Default Finding Layer

| Field | Value |
| --- | --- |
| Status | proposed |
| Target version | CDR v1.0 |
| ADR | [ADR-0006](../decisions/ADR-0006-treesitter-default-finding-layer.md) |
| Branch | `feature/cdr-treesitter-finding-layer` |
| Baseline | dapei.skill v3.2.x + CDR v0.7 (CodeGraph substrate shipped) |
| Owner | ygwa |
| User entry | `@dapei …` (no new shell commands for end users) |

## What this PR delivers

1. A **built-in, deterministic, low-cost structural finding layer** (`TreeSitterCodeMapAdapter`) that replaces the v0.7 "raw content inline" path for `cdr.entries.candidate`.
2. A **strict separation** between finding (tree-sitter / CodeGraph), semantic claim (Agent), and validation (engine), enforced at the contract level.
3. A new capability **`cdr.entries.expand`** that gives the Agent explicit, bounded access to source content — making "content on demand" a contract instead of a default.
4. **Coexistence with CodeGraph**: tree-sitter handles structural finding (built-in); CodeGraph handles graph finding (optional upgrade). Neither replaces the other.
5. A new `tree_sitter` block in the `cdr.profile` YAML in parallel with the existing `codegraph` block — both substrate metadata, never framework claims.

## What this PR does NOT do

- **No** full call-graph / control-flow extraction from tree-sitter. CodeGraph retains that role when present.
- **No** engine-side "this is a route" classification. Tree-sitter captures decorators; the Agent decides whether a decorated method is an entry point.
- **No** new end-user shell workflow. User-facing entry stays `@dapei discover entries for <repo>`.
- **No** backend selector abstraction unifying tree-sitter and CodeGraph. Their failure models are different; merging them would force semantic compromise.
- **No** WASM / Bun support in v1. Native bindings on Node ≥ 22.6 only. WASM escape hatch is v1.1+ if needed.

---

## Design decisions (resolved against review of v0 / v1 plan)

| Question (from prior plan) | Decision |
|---|---|
| Should tree-sitter replace CodeGraph? | **No**. Tree-sitter = structural code map (built-in default). CodeGraph = graph finding (optional upgrade). Both kept. |
| Should `apisurface_hint` have a "priority" of tree-sitter > CodeGraph > fallback? | **No**. `apisurface_hint` is **removed** from `cdr.entries.candidate` response. It returns to being an Agent declaration in `cdr.entries.propose` / `cdr.entries.confirm` input. |
| Should `route_hint?` appear in candidate response? | **No**. The closest structural signal is `code_map.entry_candidates[].decorators` — raw capture, no semantic interpretation. |
| Should `cdr.entries.candidate` keep returning `content` by default? | **No**. `content` is moved to a new `cdr.entries.expand` capability. Default candidate response carries `code_map` only. |
| Should there be a unified "backend selector"? | **No**. Two parallel layers with explicit `backend: 'tree-sitter' \| 'tree-sitter+codegraph'`. Profile YAML has two parallel blocks. |
| Should we update ADR-0003 or write a new ADR? | **New ADR-0006**. ADR-0003 is preserved verbatim; this ADR amends its finding layer while keeping its "AI is scanner, engine is validator" principle intact. |

---

## Contract changes (engine-visible)

### `cdr.entries.candidate` (input unchanged; response updated)

**Before (v0.7)**:
```ts
{
  repo, file_count,
  files: [{
    relpath, language, size_bytes, truncated,
    content,                    // ≤ 200 KB per file
    apisurface_hint?            // from CodeGraph route metadata
  }],
  skipped, max_bytes,
  backend: 'native' | 'fallback',
  backend_reason?
}
```

**After (this PR)**:
```ts
{
  repo, file_count,
  files: [{
    relpath, language, size_bytes, truncated,
    code_map: {
      parse_status: 'clean' | 'partial' | 'unsupported' | 'oversized',
      symbols: [{
        kind: 'class' | 'function' | 'method' | 'interface' | 'module',
        name: string,
        start_line: number,
        end_line: number,
        decorators?: string[],      // raw capture, no semantic
        parent?: string             // enclosing class for methods
      }],
      imports: [{ source: string, line: number }],
      entry_candidates?: [{         // weak structural signal only
        symbol: string,
        line: number,
        decorators: string[]
      }]
    }
  }],
  skipped: [{ relpath, reason }],
  backend: 'tree-sitter' | 'tree-sitter+codegraph',
  backend_reason?
}
```

**Removed from response**: `content`, `apisurface_hint`, `max_bytes`. Reason: `content` moved to `cdr.entries.expand`; `apisurface_hint` removed from candidate (Agent declares it on propose); `max_bytes` is no longer relevant (no content to cap).

**No `fallback` backend value**: tree-sitter parse failure degrades `parse_status` per file; it does NOT degrade the overall response to a "no code map" path. CodeGraph absence flips `backend` to `'tree-sitter'`.

### New capability: `cdr.entries.expand`

```ts
// input
{
  repo: string,
  file: string,
  line_range?: [number, number],
  symbol_handle?: string   // e.g. "OrderController#create"
}

// output
{
  content: string,         // bounded by line_range or symbol subtree
  truncated: boolean,
  line_count: number
}
```

Engine validates: file exists under `repos/<repo>/<file>`; if `symbol_handle` is given, resolves to `code_map.symbols[]` line range (must match exactly one symbol); if `line_range` is given, both bounds in `[1, file line_count]`. P1 evidence red line applies (`file must exist`).

### `cdr.entries.propose` (input shape unchanged; semantic field re-emphasized)

The `method` and `path` fields on `cdr.entries.propose` input are **Agent declarations**, not engine-generated. They are the only place `apisurface_hint`-shaped data lives at the entry level. The `codegraph.apisurface_hint` field on a file response (if present) is replaced by `code_map.entry_candidates[].decorators` — pure capture.

### `cdr.profile` (output gains a `tree_sitter` block)

```yaml
repo: mall-order
generated_at: 2026-06-25T...
language: java
manifest_files: [pom.xml]
directory_tree: ...
test_commands: [mvn test]
tree_sitter:                        # NEW — built-in, always present
  backend: native
  languages: [java]
  files_parsed: 150
  files_partial: 12                # parse had ERROR nodes; partial symbols emitted
  files_unsupported: 3             # extension not in registry
  files_oversized: 2               # > 32 MB; skipped
codegraph:                         # EXISTING — optional, may be unavailable
  available: true|false
  version: ...
  backend: "native" | "fallback"
  files_total: 842
  apisurface_count: 12
```

Both blocks are **substrate metadata**, not framework claims. Pattern matches the v0.7 `codegraph` block convention.

---

## Implementation Plan

### Phase 1 — Adapter, schema, fixture baseline

**Goal**: a tree-sitter adapter that parses the four target languages and emits the `code_map` shape; baseline fixtures that exercise every sharp edge.

#### 1.1 Package layout

New files (all under `packages/runtime-adapters/src/treesitter/`):

| File | Purpose |
|---|---|
| `index.ts` | Public entry: `TreeSitterCodeMapAdapter` class with `parseFile(path): Promise<CodeMapFile>` and `parseDirectory(path, opts): AsyncIterable<CodeMapFile>` |
| `registry.ts` | Lazy parser registry: extension → grammar package. Cold-start once per worker; cached `Language` instances |
| `scm/tags-typescript.scm` | Copied from upstream `tree-sitter-typescript/queries/tags.scm`, with `; inherits: javascript` modeline |
| `scm/tags-javascript.scm` | Copied from upstream `tree-sitter-javascript/queries/tags.scm` |
| `scm/tags-python.scm` | Copied from upstream `tree-sitter-python/queries/tags.scm` |
| `scm/tags-java.scm` | Copied from upstream `tree-sitter-java/queries/tags.scm` |
| `scm/decorators-typescript.scm` | Custom: captures `(decorator)` nodes inside `class_body` to be attached as siblings of `(method_definition)` |
| `scm/decorators-python.scm` | Custom: captures `(decorator)` nodes preceding `(function_definition)` / `(class_definition)` |
| `scm/decorators-java.scm` | Custom: captures `(annotation)` nodes attached to `(method_declaration)` / `(class_declaration)` |
| `attach/decorators.ts` | TS decorator attach: walks `class_body`, attaches preceding sibling decorators to next `method_definition` / `public_field_definition` |
| `attach/decorators.py.ts` | Python decorator attach: directly preceding sibling (already correct in CST) |
| `attach/decorators.java.ts` | Java annotation attach: annotations are children of the decorated declaration (already correct in CST) |
| `parser.ts` | Wraps `tree-sitter` native `Parser` with `bufferSize: Math.max(1024*1024, src.length + 3)` and 32 MB size cap |
| `README.md` | Binding selection rationale, cold-start profile, Bun caveat, bufferSize note |

#### 1.2 Public types (exported from `runtime-adapters/src/treesitter/index.ts`)

```ts
export type ParseStatus = 'clean' | 'partial' | 'unsupported' | 'oversized';

export interface CodeMapSymbol {
  kind: 'class' | 'function' | 'method' | 'interface' | 'module';
  name: string;
  start_line: number;
  end_line: number;
  decorators?: string[];
  parent?: string;
}

export interface CodeMapEntryCandidate {
  symbol: string;          // "ClassName#methodName" or "functionName"
  line: number;
  decorators: string[];
}

export interface CodeMapFile {
  relpath: string;
  language: 'typescript' | 'javascript' | 'python' | 'java' | 'unsupported';
  parse_status: ParseStatus;
  symbols: CodeMapSymbol[];
  imports: Array<{ source: string; line: number }>;
  entry_candidates?: CodeMapEntryCandidate[];
  parse_diagnostic?: string;   // populated when parse_status !== 'clean'
}

export interface TreeSitterDoctor {
  backend: 'native';
  languages: Array<'typescript' | 'javascript' | 'python' | 'java'>;
  files_parsed: number;
  files_partial: number;
  files_unsupported: number;
  files_oversized: number;
}

export class TreeSitterCodeMapAdapter {
  constructor();
  isAvailable(): boolean;          // always true on supported platforms
  fullDoctor(): TreeSitterDoctor;
  parseFile(repoPath: string, relpath: string): Promise<CodeMapFile>;
  parseDirectory(repoPath: string, opts: { maxFiles?: number }): AsyncIterable<CodeMapFile>;
}
```

#### 1.3 Fixture baseline (Phase 1 deliverable)

Each language gets a fixture file that covers its sharp edges. These become the regression baseline for the adapter.

| Language | Fixture path | Required edges |
|---|---|---|
| TypeScript | `tests/fixtures/treesitter/typescript/sample.ts` | class with method, `@decorator` on method (TS decorator as sibling of method_definition), TSX component, interface, type alias, generic method |
| TypeScript | `tests/fixtures/treesitter/typescript/sample.tsx` | JSX self-closing element `<Foo />`, JSX child element `<Foo><Bar /></Foo>`, TS Stage-3 decorator |
| JavaScript | `tests/fixtures/treesitter/javascript/sample.js` | class with method, class field, CommonJS export, ESM import, async function |
| Python | `tests/fixtures/treesitter/python/sample.py` | class with method, `@decorator` (Python preceding sibling), `async def`, type alias (PEP 695 `type X = ...`), `@dataclass` |
| Java | `tests/fixtures/treesitter/java/Sample.java` | class with method, `@Annotation` (Java child of declaration), `record` declaration (Java 16+), generic method, `@interface` annotation type |

A "broken" fixture (deliberate syntax error) for each language exercises the `partial` parse_status path.

#### 1.4 CI matrix baseline (Phase 1 deliverable)

A new `tests/unit/treesitter-smoke.test.mjs` that:

- Loads each of the four grammars on the current platform.
- Parses each baseline fixture and snapshots the resulting `code_map`.
- Verifies `bufferSize` is set defensively (rejects a 100 KB file without the option).
- Verifies `partial` parse_status is emitted for the broken fixture.
- Verifies `unsupported` parse_status is emitted for an unknown extension (`.xyz`).

#### 1.5 Phase 1 acceptance

- [ ] All four grammars parse their baseline fixture with `parse_status: 'clean'`.
- [ ] TS decorator appears in `symbols[].decorators` despite being a `class_body` sibling (not a `method_definition` child).
- [ ] Python `@decorator` attaches to the next `function_definition`.
- [ ] Java `@Annotation` appears as a decorator on its enclosing method.
- [ ] Java `record` declaration is captured as a `class` symbol with name `record_name`.
- [ ] Broken fixture emits `parse_status: 'partial'` with symbols outside `ERROR` nodes.
- [ ] A 50 MB synthetic fixture emits `parse_status: 'oversized'` and empty symbols.
- [ ] `.xyz` file emits `parse_status: 'unsupported'` and empty symbols.
- [ ] All four adapters' cold start completes in < 500 ms total on the test platform.

---

### Phase 2 — `cdr.entries.candidate` integration

**Goal**: tree-sitter becomes the default finding layer for `cdr.entries.candidate`. CodeGraph's `apisurface_hint` augmentation stays optional.

#### 2.1 Refactor `cdr.entries.candidate`

In `packages/core/src/capabilities/domains/cdr.ts`:

1. **Always invoke tree-sitter first** (`TreeSitterCodeMapAdapter.parseDirectory`).
2. **Optional CodeGraph augmentation**: if `CodeGraphAdapter.isAvailable()`, query its `orient` for `apisurface_hint` per file and merge into `code_map.entry_candidates[].decorators` (raw capture only — no semantic).
3. **Remove `content` from the response**: candidate returns only `code_map`. Content access moves to `cdr.entries.expand`.
4. **Remove `apisurface_hint` field**: replaced by `code_map.entry_candidates[].decorators` (raw string array, no route interpretation).
5. **Update `backend` field**: values are now `'tree-sitter' | 'tree-sitter+codegraph'`. No `'fallback'` value.
6. **Update `workflow` block**: AI's next action is now "expand a symbol, then propose", not "read content and propose".

#### 2.2 New `cdr.entries.expand` capability

In `packages/core/src/capabilities/domains/cdr.ts`:

```ts
export const cdrEntriesExpand: AnyCap = {
  id: "cdr.entries.expand",
  version: "1.0.0",
  inputSchema: {
    required: ["repo", "file"],
    properties: {
      repo: { type: "string", minLength: 1 },
      file: { type: "string", minLength: 1 },
      line_range: {
        type: "array",
        items: { type: "number" },
        minItems: 2,
        maxItems: 2
      },
      symbol_handle: { type: "string", minLength: 1 }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    // 1. Validate file exists
    // 2. If symbol_handle: load code_map, find symbol, resolve line range
    // 3. If line_range: validate bounds
    // 4. Read file, slice content
    // 5. Return bounded content + truncated flag + line_count
  }
};
```

Symbol handle resolution reads the file's cached code map (per-process LRU keyed by `repo + file + mtime`) so the expand doesn't re-parse.

#### 2.3 `cdr.profile` adds `tree_sitter` block

In `packages/core/src/capabilities/domains/cdr.ts`, alongside the existing `codegraphBlock`:

```ts
const tsAdapter = new TreeSitterCodeMapAdapter();
const tsDoctor = tsAdapter.fullDoctor();
// Iterate repos/<repo>/ files, call parseFile, accumulate counts
profileData.tree_sitter = {
  backend: tsDoctor.backend,
  languages: tsDoctor.languages,
  files_parsed: tsDoctor.files_parsed,
  files_partial: tsDoctor.files_partial,
  files_unsupported: tsDoctor.files_unsupported,
  files_oversized: tsDoctor.files_oversized
};
```

#### 2.4 Migration guide entry in `skills/cdr/SKILL.md`

Add to the existing v0.3 migration guide (lines 472-483):

```markdown
### v0.3 → v1.0 migration (tree-sitter finding layer)

| v0.3 | v1.0 |
|------|------|
| `cdr.entries.candidate` returns `files[].content` (≤ 200 KB per file, ≤ 40 MB total) | `cdr.entries.candidate` returns `files[].code_map` (no content) |
| AI reads content inline to find entry points | AI reads `code_map.entry_candidates`, calls `cdr.entries.expand` for selected symbols |
| `apisurface_hint` on file is engine-generated from CodeGraph route metadata | `apisurface_hint` removed from candidate; Agent declares `method`/`path` on `cdr.entries.propose` input |
| `backend: 'native' \| 'fallback'` | `backend: 'tree-sitter' \| 'tree-sitter+codegraph'` |
| CodeGraph absence → raw content fallback | CodeGraph absence → tree-sitter only (still no raw content fallback) |
```

#### 2.5 Phase 2 acceptance

- [ ] `cdr.entries.candidate` returns `code_map` for every supported file in `repos/<repo>/`.
- [ ] `content` is no longer present in the response shape.
- [ ] `backend` is `'tree-sitter'` when CodeGraph CLI is missing; `'tree-sitter+codegraph'` when present.
- [ ] `cdr.entries.expand` returns the exact lines for a `symbol_handle` lookup.
- [ ] `cdr.entries.expand` rejects `symbol_handle` that doesn't resolve to exactly one symbol.
- [ ] `cdr.entries.expand` rejects `line_range` out of file bounds.
- [ ] `cdr.profile` output includes a `tree_sitter` block with all five counts.
- [ ] Existing fixture tests for `cdr.entries.candidate` are updated to assert the new shape; the 35 framework-assertion tests (replaced in v0.3) are still replaced by evidence-validation tests.

---

### Phase 3 — Skill, doc portal, profile updates

**Goal**: AI workflow text reflects the new finding layer; ADR-0006 lands; portal updates are scoped (NOT rendered on code map, only on artifacts).

#### 3.1 `skills/cdr/SKILL.md` Phase 1 workflow update

Rewrite lines 128-152 (current Phase 1 — Entry Discovery section) to:

1. Engine: `runCapability('cdr.entries.candidate', {repo})` → `files[].code_map`
2. AI: reads `code_map.entry_candidates` to spot likely entry symbols
3. AI (per selected symbol): `runCapability('cdr.entries.expand', {repo, file, symbol_handle})` → bounded content
4. AI: reads content, decides if it is an entry point
5. AI: `runCapability('cdr.entries.propose', {repo, id, type, file, line, method?, path?, sources: [{file, line, repo}]})` → engine validates
6. (Confirm step unchanged)

#### 3.2 `SKILL.md` (root) router table

No change. `cdr` routing already points to `skills/cdr/SKILL.md`.

#### 3.3 `docs/cdr-architecture.md` amendment

In §7.4 (Degradation), add a row:

```markdown
| tree-sitter parse error | `cdr.entries.candidate` sets `code_map.parse_status = 'partial'`; emits symbols outside ERROR nodes; marks intersecting entries `partial: true`. Profile surfaces `tree_sitter.files_partial` count. |
```

In §2.1 (Three roles diagram), add a second finding layer block under the existing CodeGraph block:

```
│  tree-sitter substrate (Finding — built-in default)        │
│  code_map: imports / classes / functions / methods /        │
│  decorators / annotations / line ranges / symbol handles    │
│  Never auto-promoted to kind=fact business artifacts       │
```

In §3 (Target layout), update `.dapei/cdr/` to mention the new `tree-sitter-cache/` directory (per-process LRU, gitignored):

```
.dapei/cdr/
├── index.yaml          ← unified artifact index
├── graph/<repo>/       ← CodeGraph cache/SQLite (gitignored by default)
├── tree-sitter-cache/  ← parsed code_map LRU (gitignored; rebuilt on demand)
└── sessions/<id>/      ← optional per-discover trace metadata
```

#### 3.4 `docs/features/cdr-treesitter-finding-layer.md`

This document — the public feature delivery doc, mirrors `cdr-v0.7-codegraph.md` shape. Sections:

1. What this PR delivers (summary above).
2. Engine-side changes (file paths + LOC counts).
3. Skill-side changes (`skills/cdr/SKILL.md` Phase 1 rewrite + new workflow diagram).
4. Migration guide (mirrors v0.3 migration table).
5. Files changed.
6. Breaking changes (semver: minor — but schema change to candidate response warrants ADR).
7. ADR-style rationale (link to ADR-0006).
8. Verification commands (`npm run verify`).

#### 3.5 Doc portal scope

**Code maps are NOT rendered in the doc portal.** The portal's atomic units are behaviors / state machines / domains / business rules / capability maps — durable cognitive assets. `code_map` is a workspace-dimension temporary finding structure, not a durable artifact, and is regenerated on demand.

If a future iteration wants to render code maps (e.g., a per-repo "structure explorer" page), that is a separate ADR. **Do NOT scope-creep this into Phase 3.**

#### 3.6 Cognitive index scope

**Code maps are NOT persisted in `.dapei/cognitive/index.yaml`.** Same reason as portal — they are temporary finding structures. `cdr.index.list` output is unchanged.

#### 3.7 Phase 3 acceptance

- [ ] `skills/cdr/SKILL.md` Phase 1 text reads "expand → propose" not "read content → propose".
- [ ] `docs/cdr-architecture.md` §2.1 diagram shows both finding layers.
- [ ] `docs/cdr-architecture.md` §7.4 has the new tree-sitter degradation row.
- [ ] `docs/features/cdr-treesitter-finding-layer.md` exists with all 8 sections.
- [ ] `docs/decisions/ADR-0006-treesitter-default-finding-layer.md` is `accepted` (after merge).
- [ ] Doc portal does NOT gain a code map page (intentional non-goal).
- [ ] Cognitive index does NOT gain a code map field (intentional non-goal).

---

### Phase 4 — Cleanup (deferred; possible cancellation)

**This phase was originally proposed as "unify backend selector". Per the layering decision in this plan, it is removed.**

The two finding layers stay separate:
- **tree-sitter** = structural code map (built-in default)
- **CodeGraph** = graph finding (optional upgrade)

Neither is abstracted behind a common selector. Profile YAML keeps two parallel blocks. `cdr.entries.candidate` returns an explicit `backend` label that names both layers when present.

**What Phase 4 *might* still do** (deferred to a future ADR if requested):
- Re-benchmark cold-start cost on a 100+ repo workspace
- WASM escape hatch for Bun (`web-tree-sitter` adapter behind a `TreeSitterBinding` interface)
- Refactor the per-language `.scm` queries into a shared query language abstraction

**None of these are commitments in this PR.** They are listed here only so reviewers know they were considered and intentionally deferred.

---

## Test Plan

### Unit tests (Phase 1 + Phase 2)

| File | Coverage |
|---|---|
| `tests/unit/treesitter-smoke.test.mjs` | Four grammars load; baseline fixtures parse; `bufferSize` defensive; partial / unsupported / oversized paths; cold-start budget |
| `tests/unit/treesitter-decorators.test.mjs` | TS decorator attach (sibling in class_body); Python decorator attach (preceding sibling); Java annotation attach (child of declaration); Stage-3 vs legacy decorator discrimination |
| `tests/unit/treesitter-types.test.mjs` | `CodeMapFile` shape; `parse_status` enum; `entry_candidates` shape; `imports` shape |
| `tests/unit/cdr-entries-candidate-tree-sitter.test.mjs` | `cdr.entries.candidate` returns `code_map`; no `content`; `backend` is `'tree-sitter'` when CodeGraph absent |
| `tests/unit/cdr-entries-candidate-tree-sitter-plus-codegraph.test.mjs` | When fake-codegraph is on PATH, `backend` is `'tree-sitter+codegraph'` and route decorators are merged into `entry_candidates[].decorators` (raw capture) |
| `tests/unit/cdr-entries-expand.test.mjs` | `symbol_handle` resolution; `line_range` validation; bounds rejection; file-missing rejection |

### Integration tests (Phase 2 + Phase 3)

| Fixture | Coverage |
|---|---|
| `sample-node-repo` | TS code_map covers `src/`, decorator attach on Express handlers |
| `sample-nestjs` | TS code_map covers controllers, NestJS decorators appear in `entry_candidates` |
| `sample-fastapi` | Python code_map covers routes, `@app.get` decorator captured |
| `sample-spring` | Java code_map covers `@RestController`, `@GetMapping` annotations captured |
| `fake-codegraph` on PATH | Backend label is `'tree-sitter+codegraph'`; route metadata merged into entry_candidates |
| `fake-codegraph` off PATH | Backend label is `'tree-sitter'`; behavior matches pre-CodeGraph era minus content |

### Contract tests (Phase 2)

- `cdr.entries.propose` still rejects missing `sources[]`, non-existent file, out-of-range line.
- `cdr.entries.confirm` still requires `sources[]`.
- `cdr.entries.expand` rejects `symbol_handle` resolving to zero or multiple symbols.
- `cdr.entries.expand` rejects `line_range` with `start > end` or `start < 1` or `end > line_count`.
- `cdr.profile` includes a `tree_sitter` block with the five expected count fields.

### AI-behavior transcripts (Phase 3)

- `tests/ai-behavior/fixtures/conversations/cdr-treesitter-finding-layer.yaml` — covers full candidate → expand → propose flow on `sample-node-repo`. Mirrors v0.3's `cdr-ai-as-scanner.yaml` fixture structure.

### Verification commands

```bash
npm run typecheck          # clean
npm run validate:skills    # clean
npm run test:unit          # all green; 35 framework-assertion tests still absent
npm run verify             # merge gate
```

---

## Dependencies

| Package | Version | Purpose | Native binding |
|---|---|---|---|
| `tree-sitter` | ^0.25.0 | Native N-API binding | yes |
| `tree-sitter-typescript` | ^0.23.2 | TS + TSX grammars | yes |
| `tree-sitter-javascript` | ^0.25.0 | JS + JSX grammar | yes |
| `tree-sitter-python` | ^0.25.0 | Python grammar | yes |
| `tree-sitter-java` | latest from `@tree-sitter-grammars` if npm lags | Java grammar | yes |

**Runtime requirement**: Node ≥ 22.6 (already in `engines`). Native prebuilds cover darwin-x64 / darwin-arm64 / linux-x64 / linux-arm64 / win32-x64 / win32-arm64.

**Cold start budget**: < 500 ms total for all four grammars on Apple M1. Measured in Phase 1 smoke test.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| TS decorator attach regression when upstream grammar changes | medium | Snapshot tests on baseline fixtures; Phase 1 includes a TS-only fixture with decorators as the canonical regression target |
| `tree-sitter-java` npm lag; missing `record_declaration` or `@interface` support | medium | Phase 1 smoke test exercises Java records; fallback to `@tree-sitter-grammars/tree-sitter-java` if upstream npm lags |
| Buffer-size bug bites a large file in CI | high | Phase 1 smoke test includes a synthetic 50 MB fixture that asserts `parse_status: 'oversized'`; production path caps at 32 MB before parse |
| Bun incompatibility surprises a downstream user | low | README documents native-only; WASM escape hatch deferred to v1.1+ |
| Doc portal scope creep adds a "code map explorer" page in Phase 3 | medium | Section 3.5 explicitly forbids it; requires separate ADR |
| Agent confusion: "should I read `entry_candidates` or read everything?" | medium | `skills/cdr/SKILL.md` Phase 1 workflow is rewritten with explicit "expand selected symbols" step; migration guide shows the diff |
| Schema change to `cdr.entries.candidate` breaks a downstream consumer | medium | ADR-0006 documents the contract change; minor semver bump in `.changeset/` |
| `apisurface_hint` removal breaks a downstream user that depended on the v0.7 file-level route metadata | low | Migration guide documents removal; the v0.7 doc explicitly stated the field was "substrate metadata, not a framework claim" so removal should be unsurprising |

---

## Files changed (preview)

| File | Change |
|---|---|
| `packages/runtime-adapters/src/treesitter/` | NEW directory: 8 files (see §1.1) |
| `packages/runtime-adapters/src/treesitter/README.md` | NEW: binding selection, cold-start, Bun caveat, bufferSize |
| `packages/runtime-adapters/package.json` | Add 5 `tree-sitter-*` deps |
| `packages/core/src/capabilities/domains/cdr.ts` | `cdr.entries.candidate` refactor; new `cdr.entries.expand`; `cdr.profile` adds `tree_sitter` block |
| `packages/core/src/capabilities/index.ts` | Register `cdrEntriesExpand` |
| `tests/unit/treesitter-*.test.mjs` | NEW: 3 unit test files |
| `tests/unit/cdr-entries-*.test.mjs` | UPDATE: 2 existing files; NEW: 3 files |
| `tests/fixtures/treesitter/` | NEW directory: 7 baseline fixture files (5 langs + 1 broken + 1 oversized) |
| `tests/ai-behavior/fixtures/conversations/cdr-treesitter-finding-layer.yaml` | NEW: L4 transcript |
| `skills/cdr/SKILL.md` | UPDATE Phase 1 text + v0.3→v1.0 migration entry |
| `docs/cdr-architecture.md` | UPDATE §2.1, §3, §7.4 |
| `docs/decisions/ADR-0006-treesitter-default-finding-layer.md` | NEW (status: accepted after merge) |
| `docs/features/cdr-treesitter-finding-layer.md` | NEW (this document, after merge) |
| `CHANGELOG.md` | Unreleased section: minor version bump |
| `.changeset/cdr-treesitter-finding-layer.md` | NEW: minor version bump |

---

## Acceptance gate

The PR is mergeable when:

- All four Phase 1, 2, 3 acceptance criteria are checked.
- `npm run verify` passes (typecheck, skills validate, all tests, smoke tests).
- The ADR is reviewed and accepted.
- The feature delivery doc (`docs/features/cdr-treesitter-finding-layer.md`) is reviewed.
- At least one of: (a) `code-review-workflow` skill pass, OR (b) `superpowers:code-reviewer` agent pass.