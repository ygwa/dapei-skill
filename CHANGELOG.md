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
- **Cognitive Discovery Runtime (CDR) v0.1** — L3 process-asset layer (profile → entries → behavior → state → domain → capability map → doc portal)
- CDR capabilities: `cdr.profile`, `cdr.entries.prepare`, `cdr.entries.confirm`, `cdr.behavior.upsert`, `cdr.state.derive`, `cdr.domain.compose`, `cdr.capability.map.init`, `cdr.index.list`, `cdr.doc.generate` (registered in `packages/core/src/capabilities/index.ts`)
- Evidence validators for `domain` and `capability-map` artifact types in `packages/core/src/evidence.ts`; P1 red lines enforced (derived_from, sources, reason)
- TS type aliases `BehaviorSpec` / `DomainSpec` / `CapabilityMapSpec` in `packages/core/src/schema.ts` for IDE aid; runtime validation still goes through `evidence.ts`
- `@dapei` router patterns for all 8 CDR capabilities in English plus 8 Chinese (中文) variants: `分析` / `扫描入口` / `确认入口` / `推导状态` / `组合领域` / `初始化功能地图` / `生成文档门户` / `列出资产`
- `skills/cdr/SKILL.md` — user entry section with 8 `@dapei` examples, 4 red lines, 3 product principles, 6-stage workflow
- `.dapei/commands.yaml` — 8 CDR command entries (cli / purpose / inputs / workflow / outputs)
- `SKILL.md` — cdr line in module routing section
- `packages/doc-gen/` — independent workspace package for VitePress portal generation (`type: "module"`, vitepress@^1.6.0 + vue@^3.5.0)
- 3 Vue 3 components in `packages/doc-gen/templates/components/`: `BehaviorFlow.vue` (step timeline + Mermaid flowchart), `StateMachine.vue` (state chips + stateDiagram), `CodeLink.vue` (vscode:// + GitHub remote links with `symbol_handle` tooltip)
- VitePress theme scaffold in `packages/doc-gen/templates/theme/index.ts` registering the 3 components globally
- Generated portal structure: `package.json` (type:module) + `.vitepress/config.mts` + `.vitepress/theme/{index.ts,components/*.vue}` + per-section markdown
- Test coverage:
  - `tests/unit/cdr.test.mjs` — 36 cases (28 unit + 8 Chinese router, covering all 8 CDR capabilities + evidence P1/P3 rules)
  - `tests/integration/cdr-e2e.test.mjs` — full pipeline E2E (profile → entries → behavior × 2 → state → domain → capability map → doc.generate)
  - `tests/integration/cdr-vitepress-build.test.mjs` — runs real `vitepress build` against a generated portal (1.4s, verifies Vue components in built bundle)
- `docs/cdr-architecture.md` — promoted from "Proposed v1.0" to "Implemented v0.1" with status table
- `docs/features/cdr-runtime.md` — feature delivery document (split / verification matrix / exit criteria)

### Changed
- `packages/router/src/index.ts` — extracted 5 new helpers (`extractCdrRepoName` / `EntityName` / `EntryId` / `DomainName` / `ProductName`) with case-sensitive entity stripping to prevent `\border\b` in `mall-order` from also being removed
- `packages/router/src/index.ts` — fixed pre-existing bug: `cognitive.discover` pattern verb set tightened from `(analyze|discover|list)` to `(analyze|discover)` so `list behaviors` cleanly routes to `cognitive.artifact.list`
- `packages/core/src/cognitive-index.ts` — index now carries `domains[]` and `capability_maps[]` entries (previously only behaviors + state_machines + unknowns)
- `packages/core/src/capabilities/domains/cognitive.ts` — `cognitive.artifact.list` surfaces `domains` and `capability_maps` sections in the rendered summary
- `tsconfig.json` — exclude `packages/doc-gen/templates/**` (Vue templates are runtime assets, not TS source)
- `packages/doc-gen/package.json` — added `"type": "module"` to enable `import.meta.dirname` resolution

### Fixed
- `cdr.doc.generate` `sourcesSection` previously rendered object sources as `[object Object]`; now formats `{file:line:...}` and emits a `<CodeLink>` component for each
- `cdr.domain.compose` previously stored behaviors in `modules[]` as `{id, summary, kind, level}` which failed `validateDomainArtifact`'s `name` requirement; now also includes `name` field

### Removed
- `packages/core/src/capabilities/domains/doc-gen.ts` — moved to `packages/doc-gen/src/doc-gen.ts` (engine no longer owns the VitePress generator)

### Verification
- 219/219 unit + integration + scenario tests pass
- 16/16 smoke tests pass (engine + skill contracts + L1/L2 router coverage + L3 negative paths + L3-narrative scenarios + L4 AI compliance)
- `tsc -p tsconfig.json` clean
- `vitepress build` against a generated portal completes in ~1.2s, all 3 Vue components appear in the built bundle (`behavior-flow`, `state-machine`, `code-link`)

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
