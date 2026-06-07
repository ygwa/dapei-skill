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
