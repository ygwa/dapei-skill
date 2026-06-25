# 05. Task Breakdown

Date: 2026-06-25

> Task breakdown for `feature/cdr-treesitter-finding-layer`. Aligned with the four phases in [`docs/features/cdr-treesitter-finding-layer.md`](../../../docs/features/cdr-treesitter-finding-layer.md). Each task is sized to complete in 1–3 hours by a single engineer; most are parallelizable across worktree agents.

## Phase 1 — Adapter, schema, fixture baseline (~12 hours)

### T1.1 — Add tree-sitter dependencies to `packages/runtime-adapters/package.json`

**File**: `packages/runtime-adapters/package.json`
**Acceptance**: package.json lists `tree-sitter@^0.25.0`, `tree-sitter-typescript@^0.23.2`, `tree-sitter-javascript@^0.25.0`, `tree-sitter-python@^0.25.0`, `tree-sitter-java@latest from @tree-sitter-grammars if npm lags`. `pnpm install --frozen-lockfile` succeeds on linux-x64 + darwin-arm64 (verified by CI matrix).
**Effort**: 30 min
**Depends on**: nothing
**Parallelizable with**: T1.2, T1.3, T1.4 (independent file additions)

### T1.2 — Create `packages/runtime-adapters/src/treesitter/` package directory

**Files**: 8 new files (see plan §1.1 for the file list)
**Acceptance**: All 8 files exist with the structure described in plan §1.1. `index.ts` exports `TreeSitterCodeMapAdapter`, `CodeMapFile`, `CodeMapSymbol`, `CodeMapEntryCandidate`, `ParseStatus`, `TreeSitterDoctor` types.
**Effort**: 4 hours (mostly mechanical)
**Depends on**: T1.1
**Parallelizable with**: T1.3, T1.4 (independent file creation)

### T1.3 — Copy upstream `.scm` query files

**Files**: `packages/runtime-adapters/src/treesitter/scm/tags-{typescript,javascript,python,java}.scm`
**Acceptance**: Files match upstream `tree-sitter-*/queries/tags.scm` byte-for-byte (verified by checksum in fixture test). TypeScript file has `; inherits: javascript` modeline.
**Effort**: 30 min
**Depends on**: T1.1
**Parallelizable with**: T1.2, T1.4

### T1.4 — Author per-language decorator attach logic

**Files**:
- `packages/runtime-adapters/src/treesitter/scm/decorators-typescript.scm` — captures `(decorator)` nodes inside `class_body`
- `packages/runtime-adapters/src/treesitter/scm/decorators-python.scm` — captures `(decorator)` preceding `(function_definition)`
- `packages/runtime-adapters/src/treesitter/scm/decorators-java.scm` — captures `(annotation)` on declarations
- `packages/runtime-adapters/src/treesitter/attach/decorators.ts` — TS post-processor (sibling attach)
- `packages/runtime-adapters/src/treesitter/attach/decorators.py.ts` — Python post-processor (no-op; CST already correct)
- `packages/runtime-adapters/src/treesitter/attach/decorators.java.ts` — Java post-processor (no-op; CST already correct)

**Acceptance**: Each per-language fixture (T1.5) parses with decorators correctly attached to the right symbol.
**Effort**: 3 hours
**Depends on**: T1.2, T1.3
**Parallelizable with**: T1.5

### T1.5 — Author baseline fixtures per language

**Files**: `tests/fixtures/treesitter/{typescript,javascript,python,java}/` per the baseline spec ([fixture baseline doc](../../../docs/features/cdr-treesitter-fixture-baseline.md))

**Acceptance**: All 9 fixture files exist and pass `tests/unit/treesitter-smoke.test.mjs`.
**Effort**: 4 hours
**Depends on**: T1.2
**Parallelizable with**: T1.4

### T1.6 — Author `tests/unit/treesitter-smoke.test.mjs`

**Acceptance**: Test loads all four grammars on the current platform, parses each baseline fixture, snapshots the resulting `code_map`, verifies `bufferSize` defensive behavior, verifies `partial` / `unsupported` / `oversized` paths, asserts cold-start ≤ 500 ms.
**Effort**: 2 hours
**Depends on**: T1.2, T1.5
**Parallelizable with**: T1.7

### T1.7 — Author `tests/unit/treesitter-decorators.test.mjs` + `tests/unit/treesitter-types.test.mjs`

**Acceptance**: Decorator test verifies TS sibling attach, Python preceding sibling, Java child attach, Stage-3 vs legacy decorator discrimination. Types test verifies `CodeMapFile` shape, `parse_status` enum, `entry_candidates` shape, `imports` shape.
**Effort**: 2 hours
**Depends on**: T1.2, T1.5
**Parallelizable with**: T1.6

### T1.8 — Write `packages/runtime-adapters/src/treesitter/README.md`

**Acceptance**: README covers binding selection rationale (native vs WASM), cold-start profile (150–300 ms), Bun compatibility caveat, bufferSize note, the per-language decorator attach asymmetry, size cap rationale (32 MB before parse).
**Effort**: 1 hour
**Depends on**: T1.2
**Parallelizable with**: T1.6, T1.7

### T1.9 — CI matrix workflow job (CI infra, not engine code)

**File**: `.github/workflows/ci.yml` — add `treesitter-platform-matrix` job per [CI matrix doc](../../../docs/features/cdr-treesitter-ci-matrix.md)
**Acceptance**: Workflow has the new job with linux-x64 + darwin-arm64 + linux-arm64 matrix. Path filter restricts to tree-sitter-related changes. Cold-start budget check is part of the job.
**Effort**: 1 hour
**Depends on**: nothing (CI infra is independent of engine code)
**Parallelizable with**: everything in Phase 1

## Phase 2 — `cdr.entries.candidate` integration (~6 hours)

### T2.1 — Refactor `cdr.entries.candidate`

**File**: `packages/core/src/capabilities/domains/cdr.ts`
**Acceptance**: Function returns `code_map` per file; `content` removed from response; `apisurface_hint` removed; `backend` is `'tree-sitter' | 'tree-sitter+codegraph'`; `workflow.next` updated to point to `cdr.entries.expand`.
**Effort**: 3 hours
**Depends on**: T1.2 (TreeSitterCodeMapAdapter exists)
**Parallelizable with**: T2.2 (different file)

### T2.2 — Implement `cdr.entries.expand` capability

**File**: `packages/core/src/capabilities/domains/cdr.ts` (new export) + `packages/core/src/capabilities/index.ts` (register)
**Acceptance**: New capability exports `cdrEntriesExpand`. Validates `symbol_handle` resolves to exactly one symbol. Validates `line_range` bounds. Reads file, slices content. Returns `{ content, truncated, line_count }`.
**Effort**: 2 hours
**Depends on**: T1.2 (code_map symbols needed for handle resolution)
**Parallelizable with**: T2.1

### T2.3 — Add `tree_sitter` block to `cdr.profile`

**File**: `packages/core/src/capabilities/domains/cdr.ts`
**Acceptance**: `profileData.tree_sitter` block populated alongside `codegraphBlock`. Five count fields present.
**Effort**: 30 min
**Depends on**: T1.2
**Parallelizable with**: T2.1, T2.2

### T2.4 — Update unit tests for new candidate response shape

**Files**: 2 existing test files updated, 3 new test files added (see plan §"Test Plan → Unit tests")
**Acceptance**: All 5 test files pass. The 35 framework-assertion tests (replaced in v0.3) remain absent. Evidence-validation tests still cover the three required categories.
**Effort**: 1 hour
**Depends on**: T2.1, T2.2, T2.3
**Parallelizable with**: nothing in Phase 2

### T2.5 — AI behavior transcript fixture

**File**: `tests/ai-behavior/fixtures/conversations/cdr-treesitter-finding-layer.yaml`
**Acceptance**: L4 transcript covers full candidate → expand → propose flow on `sample-node-repo`. Mirrors v0.3's `cdr-ai-as-scanner.yaml` structure.
**Effort**: 30 min
**Depends on**: T2.1, T2.2
**Parallelizable with**: nothing in Phase 2

## Phase 3 — Skill, doc, ADR land (~4 hours)

### T3.1 — Rewrite `skills/cdr/SKILL.md` Phase 1 workflow

**File**: `skills/cdr/SKILL.md` lines 128-152 + migration table (lines 472-483)
**Acceptance**: Phase 1 text reads "expand → propose". v0.3→v1.0 migration table added with the four contract changes documented.
**Effort**: 1 hour
**Depends on**: T2.1, T2.2 (final contract shapes)
**Parallelizable with**: T3.2, T3.3

### T3.2 — Amend `docs/cdr-architecture.md`

**File**: `docs/cdr-architecture.md` §2.1, §3, §7.4
**Acceptance**: §2.1 diagram shows both finding layers. §3 layout shows `.dapei/cdr/tree-sitter-cache/`. §7.4 has tree-sitter degradation row.
**Effort**: 1 hour
**Depends on**: nothing (docs only)
**Parallelizable with**: T3.1, T3.3

### T3.3 — Update `CHANGELOG.md` and `.changeset/`

**Files**: `CHANGELOG.md` Unreleased section + `.changeset/cdr-treesitter-finding-layer.md`
**Acceptance**: Changeset declares minor version bump. CHANGELOG entry mirrors the changeset text.
**Effort**: 30 min
**Depends on**: nothing
**Parallelizable with**: T3.1, T3.2

### T3.4 — Verify ADR-0006 is accepted

**File**: `docs/decisions/ADR-0006-treesitter-default-finding-layer.md`
**Acceptance**: Status field changes from `proposed` to `accepted` after merge.
**Effort**: 5 min
**Depends on**: code review pass
**Sequential after**: T3.1, T3.2, T3.3 + merge

### T3.5 — Update `README.md` if needed

**File**: `README.md` "References" table (lines around 162-180 in current README)
**Acceptance**: Adds a row pointing to `docs/features/cdr-treesitter-finding-layer.md`.
**Effort**: 10 min
**Depends on**: nothing
**Parallelizable with**: T3.1, T3.2, T3.3

## Phase 4 — Cleanup (deferred; possibly cancelled)

Per the plan, Phase 4 is removed. Possible future work (deferred to separate ADR):

- Cold-start re-benchmark on 100+ repo workspace
- WASM escape hatch for Bun
- Per-language query abstraction

These are not in scope for this PR.

## Acceptance gate (final)

The PR is mergeable when:

- All Phase 1, 2, 3 acceptance criteria from the canonical plan are checked.
- `npm run verify` passes (typecheck + validate:skills + build + 4 test layers + smoke).
- ADR-0006 reviewed and `accepted`.
- Code review pass via `code-review-workflow` OR `superpowers:code-reviewer`.

## Suggested execution order (with parallelization hints)

```
T1.1 (deps) ─────────────┐
                         ├─→ T1.2 (dir + 8 files) ─┬─→ T1.4 (decorators)
                         │                          ├─→ T1.5 (fixtures)
                         │                          ├─→ T1.6 (smoke test)
T1.3 (scm files) ────────│                          └─→ T1.7 (decorator + types tests)
                         │
T1.8 (README) ───────────┴─ (any time after T1.2)

T1.9 (CI matrix) ──────────────────────────────────────── (independent)

After T1.2:
  T2.1 (candidate refactor) ─┐
  T2.2 (expand capability)   ├─→ T2.4 (test updates) ─→ T2.5 (AI transcript)
  T2.3 (profile tree_sitter) ┘

After T2.4:
  T3.1 (skill text)
  T3.2 (arch doc) ───────┐
  T3.3 (changeset) ──────┼─→ T3.4 (ADR accept)
  T3.5 (README ref) ─────┘
```

Wall-clock estimate: 22 hours of engineer time, with parallelization bringing it to ~12 hours of calendar time when 2 engineers are available.