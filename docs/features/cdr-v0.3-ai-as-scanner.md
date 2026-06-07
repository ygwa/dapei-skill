# CDR v0.3 — AI as Scanner (feature/cdr-v0.3-ai-as-scanner)

## What landed

### 1. Removed: 150 lines of framework-specific regex from the engine

v0.2 had four hardcoded scanners in `packages/core/src/capabilities/domains/cdr.ts`:

```
ENTRY_PATTERNS       — 8 filename regex (controller/route/handler/listener/…)
CLASS_LEVEL_PATTERNS — Spring @RequestMapping / NestJS @Controller
ANNOTATION_PATTERNS  — Spring / NestJS / FastAPI / Express (4 framework × 1-2 regex each)
extractClassLevelPath
scanFileForAnnotations
detectFrameworkHints
FILE_CONTENT_SCAN_BYTES
```

All deleted. The engine no longer has any framework-specific knowledge. Adding Quarkus / Ktor / Hapi / Actix / Axum / Django / Fastify / gRPC / GraphQL now requires **zero** code changes.

### 2. Added: `cdr.entries.candidate`

A new capability that returns a code file listing for the AI to read:

```yaml
files:
  - relpath: src/routes/orders.ts
    language: typescript
    size_bytes: 234
    truncated: false
    content: |
      import { Router } from 'express';
      ...
```

- `relpath` — repo-relative path
- `language` — extension-derived hint (`typescript` / `python` / `java` / `go` / `csharp` / `ruby` / `rust` / `php` / `kotlin` / `scala` / `swift` / `dart` / `objc` / `objcpp` / `unknown`)
- `content` — the file's text inlined (capped at 200 KB by default, configurable via `max_bytes`)
- `truncated` — `true` if the file was over the cap
- `framework` — **not** present. The engine doesn't opine on framework.

The capability is cheap: no regex, no AST parsing, no annotation matching. Just a recursive `listFilesRecursively` + read each file under 200 KB.

### 3. Added: `cdr.entries.propose`

The AI submits a single entry point. The engine validates evidence before accepting:

```ts
runCapability('cdr.entries.propose', {
  repo: 'sample-app',
  id: 'order-create',
  type: 'api',  // api | mq | cron | rpc | cache | search | other
  file: 'src/routes/orders.ts',
  line: 6,
  method: 'POST',
  path: '/orders',
  summary: 'POST /orders — create order',
  sources: [
    { file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }
  ]
})
```

Validation (engine rejects on any failure):
- `id` must match `^[a-z0-9-]+$`
- `sources[]` must be non-empty
- Each `sources[].file` must exist at `repos/<repo>/<file>` (file existence check)
- Each `sources[].line` (when present) must be in the file's line range

This is the P1 red line: **AI can never write an entry to the engine without pointing at real code**.

### 4. Refactored: `cdr.entries.prepare` → thin orchestrator

Old v0.2 behavior: ran regex, returned `entries[]` with framework-classified candidates.
New v0.3 behavior: delegates to `cdr.entries.candidate`, returns the file list with a `workflow` field describing the next step.

Marked `deprecated: true` in its return data with `workflow.prefer: "cdr.entries.candidate"`. Router patterns still route to it for backward compat (so existing `@dapei discover entries for X` continues to work), but new code should call `cdr.entries.candidate` directly.

### 5. Refactored: `cdr.entries.confirm` now requires `sources[]`

Old v0.2 behavior: only needed `entry_id` + `summary`.
New v0.3 behavior: **requires** `sources[]`. The engine validates the same way as `cdr.entries.propose`. This prevents the AI from "fast-confirming" entries without evidence.

### 6. New shared helper: `validateEvidencePoints(ctx, doc, options?)`

Used by `cdr.entries.propose`, `cdr.entries.confirm`, `cdr.behavior.upsert`, `cdr.state.derive`, `cdr.domain.compose`, `cdr.business.compose`. Single source of truth for "does this artifact's `sources[]` point at real code?".

```ts
function validateEvidencePoints(
  ctx: { rootDir: string },
  doc: Record<string, unknown>,
  options: { strictRepo?: boolean } = {}
): string[]
```

Validation semantics:

| `confidence.kind` | `sources[]` | `repo` per source | Behavior |
| --- | --- | --- | --- |
| `fact` | required | required (or default from artifact) | full validation; reject on any bad file/line |
| `inference` | optional | optional | if any source has explicit `repo`, validate those (defense against typos); skip the rest |
| `unknown` | optional | optional | same as `inference` |

This is the unified rule. Previously each capability had its own ad-hoc validation, often incomplete. Now they all share one.

### 7. `cdr.profile` v2: removed `frameworks` field

`detectFrameworkHints` was the only thing populating `frameworks: [next.js, typescript, ...]` in the profile YAML. The engine doesn't actually know what these hints *mean* — it just counts file-presence markers. The AI can read `manifest_files` (which is still there) and `directory_tree` and figure out the framework itself. So the field is gone.

### 8. New L4 ai-behavior transcript fixture

`tests/ai-behavior/fixtures/conversations/cdr-ai-as-scanner.yaml` covers the full `candidate → propose → confirm` flow. The mock-LLM harness executes each tool call against the real engine; the test asserts:

- All 6 capabilities were called in order
- The Agent pauses to confirm after `cdr.entries.confirm`
- The `docs/as-is/entries/sample-app.yaml` file was produced
- The 4-section output format was respected

This is the first L4 fixture that exercises a multi-step capability flow end-to-end.

## Why this matters

### Before v0.3 (regex-bound)

```
@agent:  @dapei discover entries for mall-order
  ↓
router:  cdr.entries.prepare
  ↓
engine:  ┌─ ENTRY_PATTERNS (filename heuristic)
         │   - controller/route/handler/... 
         ├─ ANNOTATION_PATTERNS (framework regex)
         │   - Spring @RequestMapping, @GetMapping, ...
         │   - NestJS @Controller, @Get, ...
         │   - FastAPI @app.get, @router.get, ...
         │   - Express app.get, router.get, ...
         ├─ detectFrameworkHints (next.config.js etc.)
         └─ emit entries[] with framework classification
  ↓
@agent:  reads entries[], picks top 3, calls cdr.behavior.upsert
```

Cost: 150 lines of framework code. Risk: any new framework = new regex. AI is bypassed.

### After v0.3 (AI as scanner)

```
@agent:  @dapei discover entries for mall-order
  ↓
router:  cdr.entries.prepare
  ↓
engine:  cdr.entries.candidate  →  returns files[] with content
  ↓
@agent:  reads content (any framework, any language, custom routes, ...)
         calls cdr.entries.propose × N with sources[]
  ↓
engine:  validateEvidencePoints
         - file exists at repos/<repo>/<file>?
         - line in range?
         - sources[] non-empty?
  ↓
         writes docs/as-is/entries/<repo>.yaml
```

Cost: 0 lines of framework code. Risk: any new framework = AI already knows it. AI is the scanner.

## Test strategy migration

The 35 framework-assertion tests in `tests/unit/cdr.test.mjs` (e.g., "detects Spring @GetMapping") were replaced with three classes of evidence-validation tests:

| Test class | Examples | Catches |
| --- | --- | --- |
| **File existence** | `cdr.entries.propose` rejects file not in repo; `cdr.behavior.upsert` rejects fact with non-existent source file | AI inventing evidence |
| **Line in range** | `cdr.entries.propose` rejects `line: 9999`; `cdr.behavior.upsert` rejects fact with line beyond file's lines | AI pointing at wrong location |
| **Required evidence** | `cdr.entries.confirm` rejects without `sources[]`; `cdr.behavior.upsert` rejects fact without `sources[]` | AI skipping evidence |

Plus:
- `cdr.entries.candidate` tests assert that Spring / NestJS / FastAPI files are returned as **plain code files** (no `framework` field on the file entry — the engine doesn't opine).
- L4 transcript fixture exercises the full multi-capability flow.

The test count went from 235 → 252 (unit + integration + scenarios + ai-behavior), with 35 of those being new evidence-validation tests and 1 new L4 fixture.

## Out of scope / future work

- **CodeGraph substrate integration** (P2 / v1.0): the `symbol_handle` field on `SourceRef` is still an opaque string. When CodeGraph is wired in, sources[] can carry real symbol IDs and the engine can resolve them.
- **Entry dedup heuristics** (cheap dedup, no semantics): if two proposed entries point at the same `file:line`, the engine could warn. Not implemented — AI is expected to dedup.
- **Evidence auto-promotion**: when the AI later writes a `behavior` artifact that reuses the same `file:line` as a confirmed entry, the engine could auto-add the entry as a `source` on the behavior. Not implemented — the AI can do this explicitly.
- **Streaming candidate** for very large repos: `cdr.entries.candidate` returns up to 200 files in one call. If a repo has 5000+ code files, the AI needs to chunk. A `cdr.entries.candidate.page=N` API could come later.

## Verification matrix (local run)

```
$ pnpm run typecheck             → clean
$ pnpm run test:unit             → 205/205 pass (was 196)
$ pnpm run test:integration      → 26/26 pass (was 26)
$ pnpm run test:scenarios        → 13/13 pass
$ pnpm run test:ai-behavior      → 8/8 pass (was 7; added cdr-ai-as-scanner fixture)
$ bash scripts/smoke-test.sh     → PASS
$ Total: 252 tests pass, 0 fail
```

## Feature branch

- Branch: `feature/cdr-v0.3-ai-as-scanner`
- Base: `main` (at `23930cb`, the v0.2 merge)
- PR: #4
- Delivery: linear history, 1 squash merge of 8 commits

## ADRs

1. **Why not just use ripgrep from the Agent's side?** We could, but then every Agent would reimplement the "list code files" logic. Centralizing in the engine means Agent and Agent get the same listing, with the same truncation rules, the same language hints. Plus, the LLM context window doesn't need to hold 200 KB files at once — the Agent can ask `max_bytes=50000` for triage and `max_bytes=500000` for deep-dive on a single file.

2. **Why not just delete `cdr.entries.prepare`?** Router patterns and downstream tooling already call it. The thin-orchestrator path keeps those working while making `cdr.entries.candidate` the recommended primitive. Marked `deprecated: true` in return data; future versions can remove it.

3. **Why share `validateEvidencePoints` across capabilities?** Because the P1 red line is "evidence points at real code" — that's one rule, not five. Five separate validators = five chances to drift. One shared helper = the engine owns the rule uniformly.

4. **Why drop `frameworks` from `cdr.profile`?** It was a side-effect of `detectFrameworkHints`, which was just `existsSync(join(repoPath, "next.config.js"))` etc. The AI can read `manifest_files` and `directory_tree` itself; the engine doesn't add value here. The hint was, at best, redundant and, at worst, prescriptive (the engine was telling the AI "this is a next.js project" before the AI had read the manifest).

5. **Why is `cdr.entries.confirm` strict but `cdr.state.derive` lenient?** Because `confirm` represents a human-or-AI commitment to deep-dive a specific entry. The evidence must exist — there's no chain of reasoning that justifies skipping it. `state.derive` is an inference draft that may or may not have direct evidence; its evidence chain is `derived_from[]` (the behavior IDs that informed it), and any `sources[]` it carries are supplementary. So strict-for-fact, lenient-for-inference is the right shape.
