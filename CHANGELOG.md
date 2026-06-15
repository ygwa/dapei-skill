# Changelog

All notable changes to `dapei.skill` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## How to record changes

Add entries to the `[Unreleased]` section below as you land PRs.
When cutting a release, `scripts/release.sh` will move the accumulated
entries into a dated version section and reset `[Unreleased]` to empty.

Use the `Added / Changed / Fixed / Removed` subsections as needed.
Match the language and detail level of the existing release entries.

## [Unreleased]

### Added
- **CDR Reading/Writing Loop Closure** (on `feature/cdr-reading-writing-loop`).
  Four commits land together; they ship one user story: the AI can
  both read and write the engineering knowledge graph, and feature
  close knows what it produced.
  - `cdr.query` capability (v1.0.0): read-only cross-cut search across
    behaviors / state-machines / business-rules / domains /
    capability-maps. Filters: `target` (kind selector), `entity`,
    `id_contains`, `event`, `writes_table`, `calls_target`,
    `target_repo`, `created_by_feature`, `repo`, `limit` (clamped
    1–500). Behavior-shaped filters suppress state-machines from
    results to avoid semantic false positives. Hard contract: never
    writes to the cognitive index or any `docs/as-is/` file.
  - `cdr.index.list` gains three additive filters: `entity`,
    `id_contains`, `created_by_feature`. Existing `repo` and `kind`
    filters unchanged; capability version bumped 1.0.0 → 1.1.0.
  - `cdr.pipeline.status` capability (v1.0.0): per-phase status
    report for the 9-phase repos→docs pipeline. Returns 8 phases
    (`profile | entries | behavior | state | domain | rule |
    capability-map | doc`) with `status` (`done | blocked |
    skipped`), `artifacts_count`, and `next_action` carrying the
    exact capability the AI should call next plus
    `input_template.required_fields`. `up_to_phase` truncates the
    report. `overall_status` is `empty | partial | complete`
    (skipping counts as complete). Closes the loop on phase 2–6
    orchestration: the engine now tells the AI what to call next
    instead of the AI guessing.
  - `cdr.feature.link` capability (v1.0.0): tags every CDR asset
    touched by a feature with `created_by_feature: <feature>` and
    `created_at: <iso-timestamp>`. Scans the cognitive index plus
    `docs/as-is/domains/` and `docs/as-is/capabilities/` on disk.
    Idempotent: re-running on the same feature is a no-op. Expected
    callers: `feature.close` (auto-invoked) and `feature.review`.
  - 5 `IndexEntryType` interfaces (`IndexBehaviorEntry`,
    `IndexStateMachineEntry`, `IndexDomainEntry`,
    `IndexCapabilityMapEntry`, `IndexBusinessRuleEntry`) gain
    additive optional `created_by_feature?: string` and
    `created_at?: string` fields. Pre-v0.10 entries that lack the
    field keep loading without error and yield empty (not error)
    when filtered on `created_by_feature`.
  - 31 new unit tests (`cdr-query`, `cdr-pipeline-status`,
    `feature-close-cdr-link`), 1 new integration test
    (`cdr-reading-writing-loop`).

### Changed (BREAKING)
- `feature.close` version bumped 1.0.0 → 2.0.0. The capability now
  auto-invokes `cdr.feature.link` on the way out, before tearing
  down the worktree. The result data gains `cdr_assets_tagged: <n>`
  and a new `reportFragment` reports the link count. The input
  schema is unchanged; the new side effect is purely additive. To
  bypass the link (e.g. dry-run closes during testing), pass
  `feature.close` directly without a feature; an unparameterized
  close will skip the link step.
- The `cdr.doc.generate` portal's behavior page now omits
  state-machine cards when the behavior filter is engaged
  (carried over from the v0.6 structured-calls cleanup, but
  `cdr.query` is the first user-facing capability to take advantage
  of it).

### Fixed
### Removed

## [3.1.0] - 2026-06-12


### Added
- **CDR v0.8 — Reverse-cluster to L1** (on `feature/cdr-v0.8-reverse-cluster`)
- New `cdr.domain.suggest` capability: read-only reverse-cluster of behaviors into suggested domain candidates. Output `docs/as-is/cross-repo/domain-suggestions.yaml`. Edge types: shared-events (weight 4), shared-writes (weight 3), cross-repo-calls (weight 2), business-rule co-apply (weight 1). Naming heuristic takes the most-frequent event-name subject across the cluster and prefixes `Cross-Repo:` when the cluster spans more than one repo. Confidence is `high` (shared-events + cross-repo), `medium` (shared-events OR shared-writes), or `low` (everything else). Hard contract: never calls `cdr.domain.compose`; suggest and commit stay two separate steps.
- New `cdr.capability.map.synth` capability: engine-driven clustering of *domains* into the L1 capability map. Domain sources in priority order: `input.manual_domains[]` → composed domains → suggestions (only when `use_suggested_domains: true`). Back-fills `spans_repos` / `behavior_count` / `fact_ratio` from the cognitive index for each capability. Two modes: auto-synthesize (one capability per domain, id = `domain.<slug>`) or AI-curated (`capabilities[]` passed; ids validated against the v0.5 multi-segment regex). Empty workspace is a legitimate state and writes `status: empty` plus a clear pointer at the next step.
- New `cdr.reversecluster.doc.generate` capability: renders the L1 capability map and the cluster-suggestions report to the VitePress portal at `<output>/l1/`. Peer of v0.5's `cdr.crossrepo.doc.generate`. Page set: `l1/index.md` (overview + Mermaid total graph), `l1/<capability-id>.md` (one page per capability), `l1/cluster-suggestions.md`. Pure read — never re-runs upstream capabilities. Fails fast with a clear pointer at `cdr.capability.map.synth` if the product-map is missing.
- Cognitive index now tracks `events[]` and `writes[]` on behavior index entries. Both fields are optional and pre-v0.8 index entries without them keep working. The `writes[]` projection reads `{ table | target }` from each entry so the shared-writes edge can actually fire (previously the index filtered writes entries as strings, making shared-writes unreachable in practice).
- Six new v0.8 router intent patterns (English + 中文): `suggest domains` / `cluster domains` / `reverse-cluster domains` → `cdr.domain.suggest`; `synth capability map` / `synthesize capability map` → `cdr.capability.map.synth`; `render L1 portal` / `generate capability map portal` → `cdr.reversecluster.doc.generate`. Pattern ordering is load-bearing: v0.8 patterns precede the v0.3 init / doc.generate catch-alls, and the v0.5 cross-repo portal pattern is hoisted above the catch-all. The "Order matters" comment in `packages/router/src/index.ts` documents this so future contributors do not silently break the disambiguation.
- `skills/cdr/SKILL.md` Phase 5.7 documents the two-stage pipeline and explicitly teaches the AI to **never** expect `cdr.domain.suggest` to commit a domain for it. The three v0.8 capabilities are added to the routing table.
- 25 new unit tests (`cdr-domain-suggest.test.mjs`, `cdr-capability-synth.test.mjs`, `cdr-reverse-cluster-doc.test.mjs`, plus 12 router-intent tests in `cdr.test.mjs`) and 3 new integration tests in `cdr-v0.8-reverse-cluster.test.mjs` exercising the full pipeline end-to-end across `mall-order` + `mall-payment`.

### Changed
- `cdr.domain.compose` input schema now allows optional `confidence:{}`. Existing callers (which never passed it) keep working; the default `medium / inference / composed_from_behaviors` block is used when the AI does not pass one.

### Fixed
- `cognitive-index.ts:upsertIndexEntry` previously threw "confidence must be an object" on every capability-map write because `parseConfidence` was unconditional. Capability-map artifacts do not carry a confidence block (their validity is decided from product+capabilities alone). Now bypassed for `type=capability-map`.
- `loadComposedDomains` previously preferred `doc.domain` (the kebab slug used for the filesystem name) over `doc.name` (the human label). AI capability `domains[]` entries write the human label, so the back-fill metrics step failed to find composed domains by name. Now prefers `doc.name`.

### Added
- **CDR v0.9 — CodeGraph real-CLI rewrite** (on `feature/cdr-v0.9-codegraph-real-cli`)
- `packages/runtime-adapters/src/codegraph.ts` rewritten against the real [colbymchenry/codegraph] CLI surface (`files --format=json`, `query --kind=function`, `node`, `callers`, `callees`, `status`). The v0.7 / v0.8 adapter called fictional subcommands (`orient` / `refs` / `impact` / `doctor`) that the real binary never shipped; those calls would have silently no-oped. CDR-facing public API (`orient`, `refs`, `impact`, `fullDoctor`) is preserved so callers in `packages/cdr/src/capabilities.ts` don't need to change.
- `tests/fixtures/fake-codegraph/codegraph` updated to a shell-script test double that speaks the real CLI subcommand set; existing v0.7 unit tests still pass against it.
- `docs/cdr-architecture.md` §7 rewritten with the real subcommand mapping, three integration modes (CLI subprocess / MCP server / Node library), zero-config documentation, and the full degradation matrix.
- `docs/dapei-skill-architecture.svg` added — system-level architecture diagram covering the skill router, engine, cognitive runtime, doc-gen, and runtime adapters.
- **CDR v0.7 — CodeGraph integration** (on `feature/cdr-v0.7-codegraph`)
- `packages/runtime-adapters/src/codegraph.ts` ships a `CodeGraphAdapter` class wrapping the [lzehrung/codegraph] CLI. Three operations: `orient` (code file listing), `refs` (call-graph neighbourhood), `impact` (blast radius between two refs). A one-shot `which codegraph` probe at construction; an optional `DAPEI_CODEGRAPH_BIN` env var lets tests inject a fake. When the probe fails, the adapter marks the workspace with `.dapei/graph/.no-codegraph`.
- `cdr.profile` populates a new `codegraph` block (available / version / backend / files_total / apisurface_count / reason). The dangling `data.codegraph.files_total` reference in `runtime/templates/docs/scripts/build-cognitive-pages.ts` is finally wired.
- `cdr.entries.candidate` tries `codegraph orient` first; on success returns `backend='native'` and per-file `apisurface_hint`. On failure falls back to the v0.3 tree walk with `backend='fallback'`.
- `cdr.behavior.upsert` cross-checks every structured call with an `evidence` SourceRef against the call graph (`adapter.refs`). Strict rejection when the CLI is present; graceful skip when missing.
- New `cdr.stale.scan` capability: walks every behavior / state-machine / business-rule in the cognitive index, reads each YAML off disk, and marks entries whose `sources[]` intersect a `codegraph impact` change set with `stale=true / stale_reason / stale_at / stale_base`. Pre-v0.7 assets keep working; `stale` fields are purely additive.
- `tests/fixtures/fake-codegraph/codegraph` is a shell-script test double for the real codegraph CLI. `PATH` is prepended with this directory per-test so the adapter picks it up. Used by 9 new unit tests.

### Changed
- **CDR v0.6 — Structured calls** (on `feature/cdr-v0.6-structured-calls`)
- `behavior.calls[]` schema evolution: accepts a mix of legacy strings and structured objects `{ target, protocol?, target_repo?, evidence? }`. Per-entry validation in `evidence.ts`.
- `IndexBehaviorEntry.target_repos` optional field. `upsertIndexEntry` extracts `target_repo` from structured calls. Pre-v0.6 index entries keep loading without the field.
- `cdr.doc.generate` renders structured calls with a per-entry upgrade and a new "Cross-service calls" section that lists target / protocol / target_repo / evidence.
- `skills/cdr/SKILL.md` Phase 2 documents the structured calls form and the field semantics (target / protocol / target_repo / evidence).

### Fixed
- `cdr.behavior.upsert` previously stringified every call entry via `input.calls.map(String)`, silently turning any object call into the literal `"[object Object]"` on disk. v0.6 preserves structure. A unit test pins this down by asserting the literal `"[object Object]"` never appears in a v0.6-written behavior YAML.

### Changed
- **CDR v0.5 — Cross-repo business rules** (on `feature/cdr-v0.5-cross-repo-rules`)
- `cdr.business.crosslink` — read-only computation that walks every business-rule artifact, resolves `applies_to[]` against the cognitive index, groups by `kind`, and emits a cross-repo view at `docs/as-is/cross-repo/cross-links.yaml`. Empty workspace is a legitimate state and produces an empty view rather than an error.
- `cdr.crossrepo.doc.generate` — renders the cross-link view to a VitePress section at `<output>/cross-repo/` with an index page, per-rule pages, and Mermaid diagrams. Does not touch the existing `cdr.doc.generate` capability.
- Two new router intent groups (English + Chinese): `build cross-repo rules` → `cdr.business.crosslink`; `build cross-repo portal` → `cdr.crossrepo.doc.generate`.
- `skills/cdr/SKILL.md` Phase 5.5: the cross-repo rules workflow. AI is taught to recognise five recurring cross-repo relationship patterns (sync call, async compensation, SLA, shared-DB invariant, cross-service state machine) and write the appropriate business rule for each.
- `tests/unit/cdr-crosslink.test.mjs` (9 cases) and `tests/integration/cdr-v0.5-cross-repo.test.mjs` (end-to-end against the v0.4 mall-order + mall-payment fixtures).
- Capability ids use no underscores (`cdr.business.crosslink`, `cdr.crossrepo.doc.generate`) to satisfy the existing `domain.name` ID regex, matching the v0.2 precedent for `cdr.business.compose`.

### Changed
- **CDR v0.4 — Multi-repo merge** (on `feature/cdr-v0.4-multi-repo-merge`)
- Per-repo namespace for `behavior` / `state-machine` / `domain` / `business-rule` artifacts. New writes go to `docs/as-is/<section>/<repo>/<id>.yaml`. Two repos can now both produce an `order-create` behavior without overwriting each other.
- `StaleFields` (`stale` / `stale_reason` / `stale_at` / `stale_base`) reserved on every cognitive index entry. Implementation of `cdr.stale.scan` lands in a follow-up PR.
- Two new fixtures: `tests/fixtures/mall-order` and `tests/fixtures/mall-payment` (sibling services sharing an `Order` entity).
- `tests/integration/cdr-v0.4-multi-repo.test.mjs`: cross-repo behavior / state / domain / business-rule merge plus a backward-compat fallback for legacy flat-file reads.

### Changed
- `packages/core/src/cognitive-index.ts` — `artifactRelativePath` produces per-repo paths when `repo` is set; `upsertIndexEntry` dedupes on `(id, repo)` for per-repo entry types.
- `packages/core/src/capabilities/domains/cdr.ts` — `cdr.state.derive` resolves behavior paths via the cognitive index (legacy fallback retained). `cdr.domain.compose` writes through `artifactRelativePath` instead of hand-rolling the path.
- `packages/core/src/capabilities/domains/cognitive.ts` — `cognitive.state.suggest` resolves behavior paths via the index with the same legacy fallback.
- `packages/doc-gen/src/doc-gen.ts` — `ParsedDoc` carries an inferred `repo` field; per-repo portal pages land at `behaviors/<repo>/<id>.md` etc.; sidebar items carry `(repo)` annotations when the source is namespaced.
- Existing test assertions updated from the legacy flat paths to the per-repo layout. `scripts/smoke-test.sh` test 9 expects `docs/as-is/behavior/sample-app/order-create.yaml`.

### Fixed
- Cross-repo workspaces no longer silently overwrite a behavior / state-machine / domain / business-rule written by an earlier repo. (Pre-v0.4 the global `id`-only dedup in the cognitive index dropped earlier entries.)

## [3.0.0] - 2026-06-08

## [3.0.0] - 2026-06-08


### Added
- **CDR v0.3 — AI as scanner** (on `feature/cdr-v0.3-ai-as-scanner`)
  - `cdr.entries.candidate` — new capability that returns a code file listing (`files[]` with `relpath` / `language` / `content` slices) for the AI to read. **No pattern matching** — language-agnostic, framework-agnostic.
  - `cdr.entries.propose` — new capability for the AI to submit a single entry point with `sources[]`; the engine validates every `sources[].file` exists under `repos/<repo>/<file>` and every `line` is in range (P1 red line).
  - `cdr.entries.prepare` — reduced to a thin orchestrator that delegates to `cdr.entries.candidate` and returns a workflow description. Marked `deprecated: true` in its return data; new code should call `cdr.entries.candidate` directly.
  - `cdr.entries.confirm` — now requires `sources[]`; the engine rejects confirmation without evidence.
  - `validateEvidencePoints(ctx, doc)` — single shared helper used by `cdr.entries.propose`, `cdr.entries.confirm`, `cdr.behavior.upsert`, `cdr.state.derive`, `cdr.domain.compose`, `cdr.business.compose`. Enforces: `kind=fact` requires `sources[].file` to exist in repo; `line` (when present) must be in range; `kind=inference` skips strict validation but still validates sources that carry an explicit `repo` field.
  - `cdr.profile` — removed `frameworks` field. The engine no longer prescribes which frameworks a repo uses; the AI reads `manifest_files` + `directory_tree` to decide.
  - New L4 transcript fixture `tests/ai-behavior/fixtures/conversations/cdr-ai-as-scanner.yaml` covers the full `candidate → propose → confirm` flow.
  - 35 framework-assertion tests in `tests/unit/cdr.test.mjs` replaced with evidence-validation tests (line out of range, file missing, kind=fact without sources, idempotent propose, etc.).
  - `docs/features/cdr-v0.3-ai-as-scanner.md` — feature delivery doc.
  - **Net code change**: cdr.ts went from 1139 lines to 1100 lines despite adding 2 new capabilities — 150 lines of framework-specific regex deleted.
- **CDR v0.2 — annotation-aware entry detection + business-rule artifacts** (on `feature/cdr-mining`)
- `cdr.entries.prepare` v2: reads file content (up to 200KB per file) and applies per-framework annotation regexes for **Spring** (`@RestController` + `@GetMapping`/`@PostMapping`/etc., with class-level `@RequestMapping` concatenation; supports no-paren variants like `@PostMapping`), **NestJS** (`@Controller('...')` + `@Get`/`@Post`/etc.), **FastAPI** (`@app.get`/`@router.post`), and **Express** (`app.get`/`router.post`). Annotation-discovered entries replace filename-discovered entries for the same file; they carry `method` / `path` / `line` / `framework` fields so the Agent doesn't have to re-derive them. Class-level base paths (`@RequestMapping`, `@Controller`) are auto-prepended when method-level paths are relative.
- `cdr.entries.confirm`: now accepts optional `framework` / `method` / `path` / `line` inputs that get persisted onto the entry YAML.
- New artifact type **`business-rule`** + `cdr.business.compose` capability (5 kinds: `invariant` / `constraint` / `authorization` / `sla` / `compensation`). Evidence rules enforced: `kind=fact` requires `sources[]`; `kind=inference` requires `derived_from[]`; `kind=unknown` requires `reason`. Storage: `docs/as-is/business-rules/<id>.yaml`; new `business_rules[]` section in `.dapei/cognitive/index.yaml`; new sidebar in VitePress portal.
- Schema: `.dapei/schemas/business-rule.schema.yaml` (Ajv-validated alongside the other schemas).
- 9th Chinese router pattern: `组合业务规则` / `compose business` → `cdr.business.compose`.
- 3 new fixture repos: `tests/fixtures/sample-spring/` (Java + `pom.xml`), `tests/fixtures/sample-nestjs/` (TS + `package.json`), `tests/fixtures/sample-fastapi/` (Python + `package.json`).
- Test coverage grew to **235/235** (was 219):
  - `tests/unit/cdr.test.mjs` — 52 cases (added 5 cross-framework + 1 Express-wins + 1 confirm-persists + 8 business-compose: write / 5 kinds / unknown-kind / no-sources / bad-id / list-includes-rule + 1 Chinese router)
  - `tests/integration/cdr-e2e.test.mjs` — extended to step 7b (business-rule) and asserts portal renders 1 business-rule page
- `docs/features/cdr-mining.md` — feature delivery doc (what landed, ADRs, verification matrix, OOO, local verify)

### Changed
- `packages/core/src/evidence.ts` — `ArtifactType` union extended with `"business-rule"`; new `validateBusinessRuleArtifact` (kind enum + ID pattern + P2 evidence block rules)
- `packages/core/src/cognitive-index.ts` — `CognitiveIndex` carries `business_rules[]`; `upsertIndexEntry` handles `"business-rule"`; `artifactRelativePath` resolves the new path
- `packages/core/src/capabilities/domains/cdr.ts` — `cdr.index.list` now emits a `## Business Rules` section (separate from domains/behaviors/states) with count + per-row detail
- `packages/doc-gen/src/doc-gen.ts` — adds a 6th section `business-rules/` with `index.md` + per-rule pages, with Kind / Confidence / Description / Expression / Applies To / Derived From sections + VitePress sidebar entry
- `tests/unit/documentation-contract.test.mjs` — known-capability prefix set extended with `cdr.business`
- `tests/unit/capability-registry.test.mjs` — `cdr.business` now passes the `domain.name` ID regex (underscore was rejected; renamed from `cdr.business_rules.compose`)
- `.dapei/commands.yaml` — new `cdr-business-compose` entry

### Verification
- `npm run typecheck` — clean
- `npm run test` — 235/235 pass
- `bash scripts/smoke-test.sh` — 16/16 + 4 L-levels PASS
- `vitepress build` on a generated portal (with business-rule section) — completes in ~1.3s

### Backwards compat
- The filename-based entry scan is preserved as a fallback; annotation scan only fires when the file content matches a known framework's `require` regex. Repos with no annotations (e.g., a pure-utility library) still get filename-discovered entries.
- `cdr.doc.generate` output is backward compatible: existing portals regenerate identically; the new `business-rules/` subdir only appears when at least one rule exists.

## [2.2.0] - 2026-05-23

## [2.2.0] - 2026-05-23

### Added
- **Engineering Cognitive Runtime Phase 1**
- Cognitive capabilities: `cognitive.discover` (v2: Agent-reads-code scaffold, no grep pre-scan), `cognitive.artifact.validate`, `cognitive.artifact.upsert`, `cognitive.artifact.list`, `cognitive.state.suggest`
- Evidence system with `fact | inference | unknown` validation (`packages/core/src/evidence.ts`)
- Cognitive artifact schemas under `.dapei/schemas/`
- Cognitive index manifest at `.dapei/cognitive/index.yaml`
- `skills/cognitive/SKILL.md` — Agent discover → deep-dive protocol
- Extended `context.build` v2 with behavior/state machine summaries
- Guardrail rule `cognitive-artifact-required` (report mode)
- Synthetic fixture: mini e-commerce sample-node-repo with expected YAML
- Unit and integration tests for cognitive runtime
- Maintainer roadmap: `docs/plans/cognitive-runtime-roadmap.md`

### Changed
- `workspace.init` creates `docs/as-is/behavior/`, `docs/as-is/state-machines/`, `docs/as-is/domains/`
- `repos.analyze` appends Cognitive Next Steps section
- Router supports behavior analysis and Chinese feature create intents
- SKILL.md version bumped to 2.2.0

---

## [1.2.0] - 2026-05-20

### Added
- Complete rewrite of README in English with improved structure
- Version frontmatter in SKILL.md: `version`, `min_claude_version`, `changelog`
- `CHANGELOG.md` with semantic versioning format
- Vercel Skills installation instructions in README

### Changed
- Updated SKILL.md frontmatter with version metadata
- Agent workflow instructions aligned to English-first terminology
- Skill path conventions updated during installation flow

### Documentation
- README now supports global audience with English examples
- agents.md updated to reference the root `SKILL.md`

---

## [1.1.0] - 2026-05-17

### Added
- Enhanced repos analysis capabilities
- New `context build` command
- New guardrail engine
- Feature command enhancements

### Changed
- Improved smoke test coverage

---

## [1.0.0] - 2026-05-13

### Added
- Initial stable release
- Workspace initialization
- Codebase import and analysis
- Feature lifecycle management (8-stage DAG)
- Current state analysis, gap analysis, solution design, task breakdown
- Implementation, validation, architecture review, acceptance
- Layered context loading
- Evidence-first analysis conventions
