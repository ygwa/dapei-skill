# Architecture Review — Round 1 cdr-portal-aggregation

Date: 2026-06-22

## Conclusion

Round 1 implementation for `cdr-portal-aggregation` is **architecture-clean per `AGENTS.md` boundaries**. All three T6.2 sub-checks pass empirically. The change is purely additive to the public schema and validators, contained entirely within `feature.yaml.scope.in`.

## T6.2.1 — Scope Check (out-of-scope paths untouched)

`git diff --stat HEAD -- docs/ .dapei/cognitive/ .dapei/docs-portal/ packages/core/ packages/router/ packages/runtime-adapters/ runtime/templates/`

**Result: empty.**

Verified `git status --short` shows only:
- `M  CHANGELOG.md`
- `M  packages/doc-gen/src/doc-gen.ts`
- `?? .changeset/cdr-portal-aggregation.md`
- `?? features/`
- `?? node_modules` (symlink added early in T1.1 to make `cdr-vitepress-build.test.mjs` resolve `js-yaml`)
- `?? tests/integration/cdr-portal-aggregation.test.mjs`

No edits crossed out of `feature.yaml.scope.in` (= `packages/doc-gen/**` + 4 test/config paths).

## T6.2.2 — In-scope files diff

`git diff --stat HEAD -- packages/doc-gen/ CHANGELOG.md .changeset/`

| File | Net delta |
|---|---|
| `CHANGELOG.md` | +54 (Round 1 entry under `[Unreleased] → ### Added`) |
| `packages/doc-gen/src/doc-gen.ts` | +795 / -54 (net +741) |

Net `packages/doc-gen/src/doc-gen.ts` growth: **+741 lines** across:
- `interface CrossArtifactIndex` (10 forward + inverted index fields)
- `buildCrossArtifactIndex(behaviorDocs, domainDocs, stateDocs, ruleDocs, capabilityDocs, entryDocs?)` (~120 lines)
- 5 existing page generator signature updates to accept optional `ctx: CrossArtifactIndex` (T2.1–T2.5)
- 4 new aggregation page generators (T3.1–T3.4)
- `detectExistingPortalSections(portalDir)` helper (T4.1)
- `generateVitepressConfig` accepts optional `nav` parameter (T4.1)
- Cross-link sections inside `generateDomainPage`, `generateCapabilityPage`, `generateBehaviorPage`, `generateStatePage` (D2 strikethrough), `generateBusinessRulePage`
- `cdr.doc.generate` inputSchema adds `fold_v08_sections: { type: "boolean" }`
- Orchestrator: `crossArtifactIndex` build + 6 generator caller updates + 4 new page-write loops + detectExistingPortalSections fold-in

## T6.2.3 — Evidence validator unchanged

`git diff --stat HEAD -- packages/core/src/evidence.ts`

**Result: empty.**

`packages/core/src/evidence.ts` (the file that enforces P1 red lines — `kind=fact` requires `sources[]`, `domain` requires `derived_from`, etc.) is **completely untouched**. Round 1 does not weaken, broaden, or narrow any P1 red line.

## D1–D7 Decision Audit (cross-reference with stage-5-implementation-report.md)

All 7 decisions locked by the user (2026-06-22 via `question` tool, all option A "recommended") are honored in code. Audit details in `reports/stage-5-implementation-report.md` § "Spec Drift Audit":

- **D1** behavior → domain join via `behavior.derived_from` → `buildCrossArtifactIndex.behaviorsByDomain`
- **D2** missing `behavior_id` renders as `~~id~~ (no behavior document)` → `generateStatePage` transitions cell
- **D3** auto-fold `/l1/` and `/cross-repo/` default-on, opt-out via `fold_v08_sections: false` → `detectExistingPortalSections` + `inputSchema.fold_v08_sections`
- **D4** new top-level `/business-modules/` peer of `/domains/` → `generateBusinessModulesPage` + `subDirs` includes `"business-modules"` + orchestrator write
- **D5** `/behaviors/by-entry-type/<type>.md` (7 pages + index) → `generateBehaviorByEntryTypeIndex/Page` + orchestrator iterates
- **D6** version stays `1.1.0` (pure additive) → `docGenerate.version = "1.1.0"` unchanged + `.changeset/cdr-portal-aggregation.md` patch bump
- **D7** tests in one new file `cdr-portal-aggregation.test.mjs` → Single new file, 10 tests, all green

## AGENTS.md Boundary Compliance

| Boundary | Status |
|---|---|
| Feature dimension edits stay inside `features/<feature>/**` and the mapped repo's `scope.in` paths | ✅ verified by T6.2.1 |
| No edit to workspace-dimension files (`docs/as-is/**`, `.dapei/cognitive/**`, `.dapei/docs-portal/**`) during feature stages | ✅ verified by T6.2.1 |
| No commit / push / merge / PR creation without explicit user request | ✅ no git mutations beyond working tree edits; AGENTS.md line 1 honored |
| Schema/validator changes go through `validateArtifact` P1 red lines | ✅ no `evidence.ts` edits; existing P1 red lines continue to fire on test data (e.g., `cdr-portal-aggregation.test.mjs` setup had to add `sources: [{...}]` to fact rules during T5.1 development — a real-world validation of the red line, not a workaround) |
| Sub-agent / todo coordination per `SKILL.md` Tool Delegation Protocol | ✅ used native todowrite + on-disk `tasks/backlog.md` mirror per SKILL.md line 78 |

## Out-of-scope Confirmation (explicit non-claims)

- ❌ `packages/core/src/capabilities/**` — out of scope per `feature.yaml.scope.out`, untouched
- ❌ `packages/router/**` — out of scope, untouched
- ❌ `packages/runtime-adapters/**` — out of scope, untouched
- ❌ `runtime/templates/**` — out of scope, untouched
- ❌ `docs/cdr-architecture.md` — Round 2 will extend it; Round 1 leaves it alone
- ❌ `tests/integration/cdr-vitepress-build.test.mjs` — must pass unchanged (verified: 3/3 pass, zero source edits)
- ❌ `tests/integration/cdr-v0.8-reverse-cluster.test.mjs` — must pass unchanged (verified: 3/3 pass, zero source edits)
- ❌ Round 2 (quality signals on home + capability pages) — not started
- ❌ Round 3 (fixture modernization) — not started

## Verdict

**PASS.** Round 1 is architecture-clean, purely additive, contained within scope, honors all 7 user-locked decisions, does not weaken any P1 red line. Stage 6 acceptance criteria are met empirically (T6.1: 12/12 tests pass; T6.2: 3/3 self-checks pass). The final acceptance report (`acceptance-report.md`) can be written.

No discrepancies, no findings, no follow-up actions required for Round 1.
