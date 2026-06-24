# 01. Current State

Date: 2026-06-22

## Objective

Identify why the CDR documentation portal (`cdr.doc.generate` output) "feels sparse and doesn't form a business-module abstraction", and lay the foundation for an iterative fix that turns the portal from a yaml-per-page mirror into an aggregated, navigable knowledge surface.

## Touched Repositories

This is a `dapei-skill` self-host change. Only the `dapei-skill` repo is in scope; no `repos/<external>` checkout.

| Repo | Path in workspace | Branch |
|---|---|---|
| dapei-skill | `repos/dapei-skill` (symlink of `../dapei-skill`) | `feature/cdr-portal-aggregation` |

## Current Module Structure

What the portal looks like today is determined by `packages/doc-gen/src/doc-gen.ts` (the only file in the doc-gen pipeline). It produces a flat set of pages under `<workspace>/.dapei/docs-portal/`:

```
.dapei/docs-portal/
├── index.md                       (home — just section counts)
├── capabilities/index.md + 1 page per capability
├── domains/index.md + 1 page per domain (per-repo namespaced since v0.4)
├── behaviors/index.md + 1 page per behavior (per-repo namespaced since v0.4)
├── states/index.md + 1 page per state machine (per-repo namespaced)
├── profiles/index.md + 1 page per profile
├── business-rules/index.md + 1 page per rule (added in v0.2)
└── .vitepress/                    (config + Vue 3 theme with BehaviorFlow / StateMachine / CodeLink)
```

Two related **separate** capabilities also render into the same portal root:

- `cdr.crossrepo.doc.generate` (v0.5) → renders `/cross-repo/` (cross-repo business rules)
- `cdr.reversecluster.doc.generate` (v0.8) → renders `/l1/` (L1 capability map + cluster suggestions)

These two sections are **not picked up by `cdr.doc.generate`**: there is no sidebar entry, no `pages` registration in `config.mts`, no link from `/index.md`. They are reachable only by manually knowing the URL.

The 17 `cdr.*` capabilities under `packages/core/src/capabilities/domains/cdr.ts` (profile / entries / behaviors / state / business-rule / domain / capability-map / etc.) all emit YAML artifacts under `docs/as-is/...` plus a unified `index.yaml` under `.dapei/cognitive/`. `doc-gen.ts` reads 7 of those artifact directories:

| Read by doc-gen | Path | P1 red line |
|---|---|---|
| Capabilities | `docs/as-is/capabilities/` | none |
| Domains | `docs/as-is/domains/<repo or global>/` | `derived_from` required |
| Behaviors | `docs/as-is/behavior/<repo or global>/` | fact needs `sources[]` |
| State Machines | `docs/as-is/state-machines/<repo or global>/` | fact needs `sources[]` |
| Profiles | `docs/as-is/profiles/` | none |
| Business Rules | `docs/as-is/business-rules/<repo or global>/` | fact needs `sources[]` |
| Entries | `docs/as-is/entries/<repo>.yaml` | **loaded but never rendered** |

The Vue components emitted into `.vitepress/theme/components/`:

| Component | Renders |
|---|---|
| `BehaviorFlow.vue` | behavior.steps array as a Mermaid flowchart |
| `StateMachine.vue` | state-machine.states + transitions as a Mermaid `stateDiagram-v2` |
| `CodeLink.vue` | `sources[]` / `evidence.file:line` as clickable `vscode://` or `https://github.com/...` links |

## Dependencies

| Dependency | Used for |
|---|---|
| VitePress 1.6 | static-site generator |
| Vue 3.5 | custom components |
| Mermaid (via VitePress) | `BehaviorFlow`, `StateMachine` diagrams |
| Node ≥ 22.6 (`--experimental-strip-types`) | run `packages/core` + `packages/doc-gen` without a build step |
| (Optional) `codegraph` CLI | upstream of `cdr.profile` / `cdr.entries.*`, not consumed by doc-gen |

## Existing Tests

`tests/integration/cdr-vitepress-build.test.mjs` (176 lines, three tests):

1. **`cdr e2e: doc.gen emits theme + Vue components`** — happy path, asserts `package.json`, `config.mts`, `theme/index.ts`, `BehaviorFlow.vue`, `StateMachine.vue`, `CodeLink.vue` are written.
2. **`cdr e2e: vitepress build produces static HTML with all sections`** — runs `vitepress build` and asserts the built HTML pages, embedded step data, and the three Vue components appear in the JS bundles. Skips silently if `vitepress` is not installed.
3. **`cdr e2e: portal sanitizes angle-bracket text in prose + still builds`** (v0.10) — regression test for `sanitizeMarkdownPage`, ensures raw `<repo>` text doesn't break VitePress build.

`tests/integration/cdr-v0.8-reverse-cluster.test.mjs` covers the v0.8 capability set end-to-end (workspace.init → repos.add × 2 → cdr.profile × 2 → cdr.entries.propose × 2 → cdr.behavior.upsert × 2 → cdr.domain.suggest → cdr.domain.compose × N → cdr.capability.map.synth → cdr.reversecluster.doc.generate → cdr.doc.generate). Asserts the L1 portal coexists with the main portal.

`tests/integration/cdr-v0.4-multi-repo.test.mjs`, `cdr-v0.5-cross-repo.test.mjs`, `cdr-v0.6-structured-calls.test.mjs`, `cdr-reading-writing-loop.test.mjs`, `cdr-e2e.test.mjs` exercise other cdr.* capabilities and would catch regressions in the schema / evidence pipeline that doc-gen reads.

## Current Module Issues (high signal)

These are the issues this feature is meant to fix. Each is grounded in a concrete file/line and reproducible against the current `main`.

### Issue 1 — Materialization layer has no business-module abstraction (`packages/doc-gen/src/doc-gen.ts`)

Every page is "one yaml → one page". The 6 schema-backed sections (`generateBehaviorPage`, `generateStatePage`, `generateDomainPage`, `generateCapabilityPage`, `generateProfilePage`, `generateBusinessRulePage`) each render a single artifact's fields with no cross-artifact rollup:

- **Domain page** (`generateDomainPage`, line 358-392): renders modules + module-relationship Mermaid. **Does not render** the behaviors and business rules that carry `derived_from: [<domain>]`. The schema's `derived_from` field is loaded but never projected to a "members" list.
- **Capability page** (`generateCapabilityPage`, line 314-334): renders id/description/sub_capabilities. **Does not render** the domains that the capability maps to. The L1 capability-map schema has `domains: [name…]` and `spans_repos: [repo…]`; neither is read.
- **Behavior page** (`generateBehaviorPage`, line 421-539): the most complete page. Includes entry, steps, writes, events, calls (string + structured in v0.6), cross-service calls table. **Does not link** to state machines whose `transitions[].behavior_id == behavior.id`, nor to business rules whose `applies_to` contains the behavior id.
- **State machine page** (`generateStatePage`, line 566-611): renders states + transitions + Mermaid. **Does not link** each transition's `behavior_id` to the corresponding behavior page (the field is loaded but never rendered).
- **Business rule page** (`generateBusinessRulePage`, line 693-734): renders id/kind/expr/applies_to/derived_from/sources. **Does not cross-link** to behaviors via `applies_to` or to domains via `derived_from`.

There is **no entry-type grouping page** (`/behaviors/by-entry-type/`), **no repo grouping page** (only a sidebar fold), **no business-rule grouping by `kind`** (`invariant / constraint / authorization / sla / compensation`).

### Issue 2 — Home page lacks a business-perspective entry point (`generateHomepage`, line 250-290)

`generateHomepage` emits:

```
| Section | Count |
| Capabilities | X |
| Domains | X |
| Behaviors | X |
| State Machines | X |
| Profiles | X |
```

plus a flat `## Quick Links` list pointing at each section. There is **no "Business Modules" landing**, no grouping by domain, no "this product has N business capabilities spanning M domains across K repos" headline. From the homepage a user has to drill into 6 separate indexes and mentally stitch them together.

### Issue 3 — `cdr.doc.generate` does not pick up v0.5 / v0.8 portal sections

- `cdr.crossrepo.doc.generate` (v0.5, line 1701 of `cdr.ts`) writes `<portal>/cross-repo/index.md` + per-page.
- `cdr.reversecluster.doc.generate` (v0.8, line 2836 of `cdr.ts`) writes `<portal>/l1/index.md` + `<portal>/l1/<capability-id>.md` + `<portal>/l1/cluster-suggestions.md`.
- `cdr.doc.generate` (the main pipeline in `doc-gen.ts`) **never registers these pages in `pages: []`** (line 1021) **nor in `sidebarConfig`** (line 880). They exist as `.md` files but VitePress will not build HTML for them.

### Issue 4 — `entries` are loaded but never rendered

`doc-gen.ts` line 865 loads `entries` from `docs/as-is/entries/<repo>.yaml` into `entryDocs: ParsedDoc[]` and never references it again. There is no `entries/` section in the portal, no `/entries/<repo>/index.md`, no link from a behavior's `entry.type` / `entry.method` / `entry.path` to a confirmation page.

### Issue 5 — No quality signals on the portal

`docs/cdr-architecture.md` section 8 lists four v1 quality metrics:

- Entry coverage = confirmed_entries / apisurface candidates
- Behavior coverage = fact_behaviors / confirmed_entries
- Fact ratio = fact / (fact + inference + unknown)
- Stale queue = index entries with `stale: true`

None of these is rendered anywhere on the portal. A user who runs `cdr.doc.generate` cannot tell from the portal whether their workspace is 30% or 90% mapped.

### Issue 6 — Fixtures are stuck on v2.2 schema, masking the problem

`tests/fixtures/sample-node-repo/docs/as-is/behavior/sample-repo-analysis.yaml` uses the pre-CDR schema:

```yaml
behavior:
  entry_points: [...]
  core_flow:
    name: order-create
    steps: [string...]
```

instead of the current CDR schema:

```yaml
id: order-create
entry:
  type: api
  method: POST
  path: /orders
steps:
  - name: validate
    action: check stock
```

This file would fail `validateBehaviorArtifact` (`packages/core/src/evidence.ts` line 97): missing `entry.type`, `steps[]` items are strings not objects. So this fixture exists only as a historical "as-is analysis" artifact and is **not a model a user would land on**. The `__expected__/behavior/order-create.yaml` next to it IS current-schema and IS what `cdr-vitepress-build.test.mjs` upserts inline.

There are **zero committed samples** for:

- `tests/fixtures/sample-node-repo/docs/as-is/domains/`
- `tests/fixtures/sample-node-repo/docs/as-is/capabilities/`
- `tests/fixtures/sample-node-repo/docs/as-is/business-rules/`
- `tests/fixtures/sample-node-repo/docs/as-is/state-machines/`

A new user who runs `cdr.bootstrap` (introduced in v3.x per `feat(repos+cdr)!: repos.analyze bridges to cdr.profile; add cdr.bootstrap one-shot`) on a fresh workspace will see an empty portal and no example to copy.

## Unknowns

- [ ] Should Round 1 add a new top-level nav item (`/business-modules/` or repurpose `/domains/` as the module landing), or only enrich existing pages?
- [ ] For `state-machine → behavior` reverse links, do we want to surface all transitions' `behavior_id` on the behavior page, or all behaviors whose `id` is referenced in transitions on the state-machine page, or both?
- [ ] For `business-rule → behavior` and `business-rule → domain` cross-links, are `applies_to` and `derived_from` the only join keys, or are there other fields we should consult (e.g., `evidence.behavior_id`)?
- [ ] Does the user want the `cdr.doc.generate` invocation to also (idempotently) call `cdr.reversecluster.doc.generate` + `cdr.crossrepo.doc.generate` when their artifacts exist, or keep them as separate invocations?

## Evidence

All file paths and line numbers above are from `repos/dapei-skill` at the `feature/cdr-portal-aggregation` worktree HEAD (== main `8d7e3a7`).

| Claim | File | Lines |
|---|---|---|
| 6 page generators, none aggregate across artifacts | `packages/doc-gen/src/doc-gen.ts` | 314-734 |
| Homepage emits flat section counts only | `packages/doc-gen/src/doc-gen.ts` | 250-290 |
| v0.8 reverse-cluster writes `/l1/` | `packages/core/src/capabilities/domains/cdr.ts` | 2785-2870 |
| v0.5 cross-repo writes `/cross-repo/` | `packages/core/src/capabilities/domains/cdr.ts` | 1701 |
| `entries` loaded but unused | `packages/doc-gen/src/doc-gen.ts` | 865 |
| Behavior artifact schema validator | `packages/core/src/evidence.ts` | 97-186 |
| Quality metrics spec (not implemented in portal) | `docs/cdr-architecture.md` | section 8 (line 437-447) |
| Fixture stuck on v2.2 schema | `tests/fixtures/sample-node-repo/docs/as-is/behavior/sample-repo-analysis.yaml` | full file |
| `cdr-vitepress-build.test.mjs` exercises doc-gen + Vue components | `tests/integration/cdr-vitepress-build.test.mjs` | full file |
| `cdr-v0.8-reverse-cluster.test.mjs` exercises full L1 pipeline | `tests/integration/cdr-v0.8-reverse-cluster.test.mjs` | full file |

## Related Context

Per `AGENTS.md` § "How Context Injection Works":

- [`../context/repo-context.md`](../context/repo-context.md) — links to cognitive index entries relevant to this feature's `repos[]` and `objective`. **Empty for this feature** because the only mapped repo is `dapei-skill` itself (self-host change), and there are no upstream product repos with cognitive artifacts to inject.
- [`../context/related-cognitive-context.md`](../context/related-cognitive-context.md) — explains why upstream context is empty and what to do if a future Stage 5 / Stage 6 session finds itself looking for "related" behaviors or rules.
- [`../context/runtime-context.md`](../context/runtime-context.md) — dimension guard header (per AGENTS.md line 53-58) and Stage 5 entry checklist. **MUST be read at the start of every Stage 5 / Stage 6 session.**
- [`../memory/handoff.md`](../memory/handoff.md) — full handoff package including task-by-task resume instructions, decision record, files-to-touch list, and resume checklist. **Read this first when resuming Round 1 Stage 5 / Stage 6.**
- [`../tasks/backlog.md`](../tasks/backlog.md) — on-disk mirror of the todo list per SKILL.md line 78. The source of truth for scope/acceptance/dependencies is `../docs/05-task-breakdown.md`; this file is the persistence layer.

## Handoff Status

| Field | Value |
|---|---|
| Stages completed | 1 (analyze-current-state), 2 (gap-analysis), 3 (solution-design), 4 (task-breakdown) |
| Stages pending | 5 (implementation), 6 (acceptance) |
| Next stage gate | `SKILL.md` § 阶段确认点 — user must explicitly say "continue implementation" before Stage 5 begins |
| Required next-session tools | `edit`, `write`, `read` (this session had only `bash` + `question` + `write`) |
| Locked decisions | D1..D7 — all option A "recommended"; recorded in `04-technical-design.md` § Decision Record |
