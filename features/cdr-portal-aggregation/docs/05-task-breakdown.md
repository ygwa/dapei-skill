# 05. Task Breakdown — Round 1

Date: 2026-06-22

## Related Documents

- Previous: [04. Technical Design](./04-technical-design.md), [02. Gap Analysis](./02-gap-analysis.md), [01. Current State](./01-current-state.md)
- Decision record locked: [04 § Decision Record](./04-technical-design.md#decision-record-d1d7-confirmed-2026-06-22)

## Status

> **STOPPED before implementation.** This file is the contract between
> solution-design and implementation. Stage 5 (implementation) cannot
> start in a no-tool session; it requires `bash` / `read` / `edit` /
> `write` / `lsp_diagnostics` and a real `node --test` runner. Per
> `SKILL.md` stage confirmation rules, the implementation checkpoint
> must again pause for user confirmation before any code is touched.

## Scope Summary (Round 1)

All work is contained to:

- `packages/doc-gen/src/doc-gen.ts` — only file edited in Round 1
- `packages/doc-gen/src/index.ts` — only if a new helper is exported
- `tests/integration/cdr-portal-aggregation.test.mjs` — new file (D7)
- `docs/cdr-architecture.md` — **NOT touched in Round 1** (Round 2 will extend it)
- `CHANGELOG.md` — additive entry added when Round 1 ships

No change to `packages/core`, `packages/router`, `packages/runtime-adapters`, `runtime/templates`, `tests/integration/cdr-vitepress-build.test.mjs`, `tests/integration/cdr-v0.8-reverse-cluster.test.mjs`.

## Task Backlog

Each task lists: scope, files touched, acceptance signal (verifiable), dependency. Tasks are ordered for incremental PRs; P0 is the smallest shippable slice, P2 is the largest.

### Phase 1 — Foundation (must land before any cross-link)

#### T1.1 · Internal: in-file `buildCrossArtifactIndex` helper

- **Scope:** Pure function. Takes the 7 already-loaded `ParsedDoc[]` arrays (capDocs, domainDocs, behaviorDocs, stateDocs, profileDocs, entryDocs, businessRuleDocs) and returns a `CrossArtifactIndex` with the indexes defined in design § C1.
- **Files:** `packages/doc-gen/src/doc-gen.ts` (new private function, ~80 lines including the 4 inverted indexes).
- **Acceptance signal:** Index built without throwing when all 7 arrays are empty. `behaviorsById.size === behaviorDocs.length`. `statesByBehavior.get(id)` returns the right state machines when at least 1 behavior has a matching `transitions[].behavior_id`.
- **Dependency:** none.
- **D-mapping:** implements D1 (uses `behavior.derived_from`), D2 (lookup is by id, missing id is just absence in the Map — page generator handles the strikethrough rendering).

#### T1.2 · Replace hand-written `allPages` with `listFilesRecursively` enumeration

- **Scope:** Inside `docGenerate.execute`, after the existing 6 sections are written AND after `generateVitepressConfig` would run, replace the literal `allPages: string[]` array (lines 1021-1041 of current `doc-gen.ts`) with a call to `listFilesRecursively(outputDir, [".md"], 500)` and convert each path to a VitePress-relative URL.
- **Files:** `packages/doc-gen/src/doc-gen.ts`.
- **Acceptance signal:** After the run, `pages: []` in `.vitepress/config.mts` contains every `.md` file under `outputDir`. A `.md` placed under `outputDir/foo/bar.md` by a *different* capability (without code change here) gets a VitePress HTML build.
- **Dependency:** T1.1 (none directly, but logically grouped).
- **D-mapping:** implements D3 (auto-fold base mechanism) and TG-2.

### Phase 2 — Existing page cross-link enrichment (BG-2, BG-3, BG-4, BG-5)

#### T2.1 · `generateDomainPage` — gain "Behaviors / State machines / Business rules" sections (BG-2)

- **Scope:** After existing modules section, inject three new sections from `CrossArtifactIndex`:
  - `## Behaviors in this domain` (lookup `behaviorsByDomain.get(domainName)`)
  - `## State machines driven by these behaviors` (follow-up lookup)
  - `## Business rules applying to this domain` (lookup `rulesByDomain`)
- **Files:** `packages/doc-gen/src/doc-gen.ts`.
- **Acceptance signal:** A behavior with `derived_from: ["order-lifecycle"]` appears under `## Behaviors in this domain` on `domains/order-lifecycle.md`. A business rule with `derived_from: ["order-lifecycle"]` appears under the rules section.
- **Dependency:** T1.1.
- **D-mapping:** D1 (uses `behavior.derived_from` reverse map).

#### T2.2 · `generateCapabilityPage` — gain "Contributing domains / Spans repos" (BG-3)

- **Scope:** Read `product-map.yaml` (loaded as `capDocs`) and surface `domains: [...]` and `spans_repos: [...]` per capability. Each contributing domain links to its page; each span_repo links to `/profiles/<repo>/`.
- **Files:** `packages/doc-gen/src/doc-gen.ts`.
- **Acceptance signal:** A capability with `domains: ["checkout"]` and `spans_repos: ["mall-order", "mall-payment"]` shows both lists on its page.
- **Dependency:** T1.1.
- **D-mapping:** none directly.

#### T2.3 · `generateBehaviorPage` — gain "Drives transitions" section (BG-4)

- **Scope:** After the existing `## Cross-service calls` block, inject `## Drives transitions` listing state machines whose `transitions[].behavior_id == behavior.id`. Each row links to the state machine page.
- **Files:** `packages/doc-gen/src/doc-gen.ts`.
- **Acceptance signal:** A behavior with id `order-create` whose transitions are referenced in `state-machines/order.yaml` appears as a transition driver for those transitions.
- **Dependency:** T1.1.
- **D-mapping:** none directly.

#### T2.4 · `generateStatePage` — transitions table gains behavior link column (BG-4, D2)

- **Scope:** Add a `Behavior` column to the transitions table. When `transition.behavior_id` resolves in `behaviorsById`, render as a link. When it does NOT resolve, render as `~~id~~ (no behavior document)` per D2.
- **Files:** `packages/doc-gen/src/doc-gen.ts`.
- **Acceptance signal:** Behavior column renders correctly for both resolved and unresolved ids; never throws on missing id.
- **Dependency:** T1.1.
- **D-mapping:** D2 (strikethrough + tooltip on missing id).

#### T2.5 · `generateBusinessRulePage` — gain "Applies to behaviors" + "Derived from" (BG-5)

- **Scope:** Render `applies_to: [...]` as links to behavior pages (when resolvable); render `derived_from: [...]` entries that match a domain name as a link to the domain page; otherwise keep as code span.
- **Files:** `packages/doc-gen/src/doc-gen.ts`.
- **Acceptance signal:** A rule with `applies_to: ["order-create"]` and `derived_from: ["order-lifecycle"]` shows two link sections.
- **Dependency:** T1.1.
- **D-mapping:** none directly.

### Phase 3 — New aggregation pages (BG-1, BG-6, BG-7, BG-9)

#### T3.1 · `generateBusinessModulesPage` + writing `/business-modules/index.md` (BG-1, D4)

- **Scope:** New generator. Input: domainDocs + CrossArtifactIndex. For each domain, render a section with: domain name, repo, behavior count, bullet list of behaviors with links, bullet list of business rules with links, bullet list of state machines driven by those behaviors. Pages grouped under `/business-modules/`.
- **Files:** `packages/doc-gen/src/doc-gen.ts`.
- **Acceptance signal:** Generated page lists every domain with its full membership roll-up. Each cross-link resolves (clickable).
- **Dependency:** T1.1.
- **D-mapping:** D4.

#### T3.2 · `generateBehaviorByEntryTypeIndex` + per-type pages (BG-7, D5)

- **Scope:** Two new generators. Compute distinct `entry.type` set from behaviorDocs. Index page at `/behaviors/by-entry-type/index.md` lists each type with its count and a card-style link. Per-type page at `/behaviors/by-entry-type/<type>.md` lists the behaviors of that type with id, repo, path, summary.
- **Files:** `packages/doc-gen/src/doc-gen.ts`.
- **Acceptance signal:** Generated pages for each present entry type. Behaviors with `entry.type: "api"` appear only in the api page, not in mq page.
- **Dependency:** T1.1.
- **D-mapping:** D5.

#### T3.3 · `generateBusinessRulesByKindIndex` + per-kind pages (BG-6)

- **Scope:** Two new generators. Same shape as T3.2 but for `businessRule.kind` ∈ `{invariant, constraint, authorization, sla, compensation}`. Only render kinds that are actually present (no empty page).
- **Files:** `packages/doc-gen/src/doc-gen.ts`.
- **Acceptance signal:** A workspace with 1 invariant + 2 constraints produces 3 pages (index + invariant + constraint). Empty kinds produce no page.
- **Dependency:** T1.1.
- **D-mapping:** none directly.

#### T3.4 · `generateEntriesPage` + per-repo `/entries/<repo>/index.md` (BG-9)

- **Scope:** New generator. Reads `entryDocs` (which is currently loaded but unused — TG-1). For each repo with a confirmed entry, produce a table: id, type, method, path, summary, file:line, status. Behavior page gains a link from `Entry:` line to its entry page when the entry exists.
- **Files:** `packages/doc-gen/src/doc-gen.ts`.
- **Acceptance signal:** Empty `entryDocs` produces no `/entries/` directory and no sidebar entry. A non-empty `entryDocs` produces one page per repo.
- **Dependency:** T1.1.
- **D-mapping:** none directly (D9 resolved via "always-fall-through to original render").

### Phase 4 — Auto-fold v0.5/v0.8 + sidebar/nav (BG-8)

#### T4.1 · `detectExistingPortalSections` + fold into sidebar + nav + subDirs (BG-8, D3)

- **Scope:** New helper that returns `{ l1, crossRepo, businessModules }`. Inside `docGenerate.execute`, add `business-modules` to `subDirs` (line 838). After main 6 sections run, scan `outputDir` for `l1/index.md` and `cross-repo/index.md` and conditionally:
  1. Add nav entries `L1 Map` / `Cross-repo`
  2. Add sidebar roots for `/l1/` and `/cross-repo/` enumerating their `.md` files
- **Capability spec:** Add `fold_v08_sections: { type: "boolean" }` to `inputSchema` (D3 default-on, opt-out). Default behavior identical to today's when no caller passes it.
- **Files:** `packages/doc-gen/src/doc-gen.ts`.
- **Acceptance signal:** After running `cdr.doc.generate` in a workspace where `/l1/index.md` and `/cross-repo/index.md` exist on disk (from prior `cdr.reversecluster.doc.generate` and `cdr.crossrepo.doc.generate`), the resulting `config.mts` `pages: []` contains both indices and the nav has both links. With `fold_v08_sections: false`, neither is registered.
- **Dependency:** T1.2.
- **D-mapping:** D3.

### Phase 5 — Test + changelog

#### T5.1 · `tests/integration/cdr-portal-aggregation.test.mjs` (D7, TstG-1/2/3)

- **Scope:** New file. Set up a workspace with:
  - 2 behaviors in repo `demo` with `derived_from: ["checkout"]`
  - 1 state machine `Order` with `transitions[].behavior_id` matching one of the behaviors AND one dangling id (for D2 strikethrough)
  - 1 domain `checkout` with `derived_from: [<both behavior ids>]`
  - 1 product-map capability `Place Order` with `domains: ["checkout"], spans_repos: ["demo"]`
  - 2 business rules: 1 invariant `applies_to: ["order-create"]`, 1 authorization with no `applies_to`
  - 1 entry catalog for `demo`
  - Pre-written `/l1/index.md` and `/cross-repo/index.md` to test BG-8 auto-fold

  Then call `cdr.doc.generate` and assert (one assertion per BG):
  - **BG-1:** `/business-modules/index.md` exists and mentions all 3 behaviors
  - **BG-2:** `/domains/checkout.md` mentions all 3 behaviors in `## Behaviors in this domain`
  - **BG-3:** `/capabilities/place-order.md` mentions `checkout` and `demo`
  - **BG-4:** `/behaviors/order-create.md` mentions `Order` state machine; `/states/order.md` transitions table has `Behavior` column with both a resolved link and `~~dangling-id~~ (no behavior document)`
  - **BG-5:** Business rule pages link to behaviors and domain
  - **BG-6:** `/business-rules/by-kind/invariant.md` exists; `authorization.md` exists; non-present kinds do not produce a page
  - **BG-7:** `/behaviors/by-entry-type/api.md` exists and lists the api-typed behaviors; `mq.md` does not exist (none present)
  - **BG-8:** `.vitepress/config.mts` `pages: []` contains `/l1/index.md` and `/cross-repo/index.md`; nav array contains `L1 Map` and `Cross-repo`. Also assert with `fold_v08_sections: false` that neither is in `pages: []` or nav.
  - **BG-9:** `/entries/demo/index.md` exists and lists the entry; behavior page links to it
  - **TstG-2:** The above BG-8 assertions also pass under `cdr-v0.8-reverse-cluster.test.mjs`-style flow where `cdr.reversecluster.doc.generate` is invoked first.
- **Files:** `tests/integration/cdr-portal-aggregation.test.mjs` (new, ~280 lines).
- **Acceptance signal:** `node --test tests/integration/cdr-portal-aggregation.test.mjs` exits 0. Runs against `tmp` workspace (no fixture dependency, mirrors the pattern in `cdr-vitepress-build.test.mjs`).
- **Dependency:** T1.1, T1.2, T2.1-T2.5, T3.1-T3.4, T4.1.

#### T5.2 · CHANGELOG + changeset

- **Scope:** Add a `## [Unreleased]` entry under Round 1's parent heading describing the additive capability. Add a `.changeset/cdr-portal-aggregation.md` with `patch` bump for `dapei-skill`.
- **Files:** `CHANGELOG.md`, `.changeset/cdr-portal-aggregation.md`.
- **Acceptance signal:** `git status` shows both files modified/added. No version source changed (D6: keep `1.1.0`).
- **Dependency:** T5.1.

### Phase 6 — Acceptance gate

#### T6.1 · Re-run existing CDR integration tests, no regression (acceptance)

- **Scope:** Run all CDR-related integration tests and confirm no regression:
  - `tests/integration/cdr-vitepress-build.test.mjs`
  - `tests/integration/cdr-v0.4-multi-repo.test.mjs`
  - `tests/integration/cdr-v0.5-cross-repo.test.mjs`
  - `tests/integration/cdr-v0.6-structured-calls.test.mjs`
  - `tests/integration/cdr-v0.8-reverse-cluster.test.mjs`
  - `tests/integration/cdr-reading-writing-loop.test.mjs`
  - `tests/integration/cdr-e2e.test.mjs`
- **Acceptance signal:** All 7 test files exit 0. If any pre-existing assertion about `pages: []` size or sidebar keys fails, the implementation patches forward (most likely: change `=== N` to `>= N` in the existing assertion).
- **Dependency:** T5.1.
- **D-mapping:** TstG-2.

#### T6.2 · Architecture review (acceptance)

- **Scope:** Hand-verify the changes against `AGENTS.md` boundaries:
  - No edit to global workspace folders from inside a feature
  - Round 1 is purely additive to the existing schema and validators
  - D1..D7 decisions honored in code
- **Acceptance signal:** Self-check passes; if a discrepancy is found, log it to `features/cdr-portal-aggregation/reports/architecture-review.md` and surface in the final acceptance report.
- **Dependency:** T6.1.

## Dependencies

| External | Used by |
|---|---|
| `listFilesRecursively` from `runtime-adapters/src/system.ts` | T1.2, T4.1 |
| `safeId` (already in `doc-gen.ts`) | T2.3, T2.4, T2.5, T3.1-T3.4 |
| `mdCell` / `mdText` / `sanitizeMarkdownPage` (already in `doc-gen.ts`) | T2.1-T2.5, T3.1-T3.4 |
| `parseYamlDocument` from `packages/core/src/yaml-doc.ts` | T1.1 (if entry docs need parsing) |
| `listFilesRecursively` extension `[".md"]` | T4.1 (cross-repo sections) |

No new package, no new dependency, no new build step.

## Effort Estimate

| Task | Estimate | Notes |
|---|---|---|
| T1.1 — `buildCrossArtifactIndex` | 1.5h | Pure function, easy to test in isolation |
| T1.2 — `allPages` enumeration | 0.5h | One-line replacement + path normalization |
| T2.1 — domain page cross-links | 1h | Mostly templating |
| T2.2 — capability page spans | 0.5h | One section, straightforward |
| T2.3 — behavior page drives transitions | 1h | Needs to compute `statesByBehavior` reverse map |
| T2.4 — state page behavior column + D2 strikethrough | 1.5h | Table cell templating + missing-id handling |
| T2.5 — rule page applies_to/derived_from | 1h | Two link sections |
| T3.1 — business-modules page | 1.5h | Most complex new page; 4 sections per domain |
| T3.2 — entry-type grouping | 1h | Two generators |
| T3.3 — rule-kind grouping | 1h | Two generators, same shape as T3.2 |
| T3.4 — entries page | 1h | Single generator + behavior page back-link |
| T4.1 — auto-fold v0.5/v0.8 | 1.5h | Detection + sidebar/nav wiring + capability spec change |
| T5.1 — aggregation test | 2h | 10 assertions, tmp workspace setup |
| T5.2 — CHANGELOG + changeset | 0.25h | |
| T6.1 — regression sweep | 0.5h | 7 test files |
| T6.2 — architecture self-check | 0.25h | |
| **Total** | **~15.5h** | One focused PR, one working day for a senior eng |

## Timeline

| Day | Tasks | Gate |
|---|---|---|
| Day 1 AM | T1.1, T1.2, T2.1, T2.2 | Internal smoke: cross-links visible on dev portal |
| Day 1 PM | T2.3, T2.4, T2.5, T3.1 | Internal smoke: behavior ↔ state, rule cross-links |
| Day 2 AM | T3.2, T3.3, T3.4, T4.1 | Internal smoke: aggregation pages render |
| Day 2 PM | T5.1, T5.2, T6.1, T6.2 | All tests green; CHANGELOG written; **acceptance checkpoint** |

## Pause points (per SKILL.md § 阶段确认点)

| Pause | Before | Reason |
|---|---|---|
| Already passed | Stage 4 (task-breakdown) — entering this file completes the pre-implementation handoff | D1..D7 decided; scope bounded |
| **NOW** | Stage 5 (implementation) | SKILL.md mandates confirmation before implementation |
| Pending | Stage 6 (acceptance) | SKILL.md mandates confirmation before acceptance |

## Handoff to Implementation

To resume Round 1 in a tooled session:

1. `cd` into `repos/dapei-skill` (the worktree at `../dapei-skill-portal-aggregation`).
2. Read this file end-to-end. The task order is the implementation order.
3. **Before touching `packages/doc-gen/src/doc-gen.ts`, confirm with the user** that implementation should proceed with T1.1. The user has the right to defer, narrow, or expand.
4. After T5.1 passes locally, run `tests/integration/cdr-*.test.mjs` (T6.1) before claiming done.
5. After T6.1 passes, **pause again** for acceptance confirmation (Stage 6) before any merge / PR / commit that touches `main`.

## Open Questions Deferred from Gap Analysis

The following Q1..Q4 from `02-gap-analysis.md` were resolved implicitly by D1..D7:

| Question | Resolved by |
|---|---|
| Q1: `/business-modules/` vs `/domains/` | D4 = (A) new top-level `/business-modules/` |
| Q2: cross-service calls per target repo | **Not addressed in Round 1.** Current single-table render remains. Revisit in Round 2 if signal. |
| Q3: missing behavior_id render | D2 = strikethrough + tooltip |
| Q4: cross-repo behavior-call-graph Mermaid | **Not addressed in Round 1.** Defer to Round 2 alongside quality signals. |
