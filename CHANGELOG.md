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
- **CDR v0.10 — portal builds end-to-end on real cognitive output**
  (on `feature/cdr-v0.10-portal-sanitize`). Three commits land together; they
  ship one user story: a CDR-generated portal is now buildable via
  `vitepress build`, not just write-only markdown.
  - `sanitizeMarkdownPage` post-pass in `cdr.doc.generate` (v1.0.0 → v1.1.0):
    walks every generated page, escapes `<` / `>` in non-Vue-component lines
    (and skips lines already escaped by `mdCell` to avoid double-escape),
    preserves fenced code blocks and the three custom Vue tags
    (`<BehaviorFlow>` / `<CodeLink>` / `<StateMachine>`). The Vue SFC
    compiler was previously latching onto raw `<feature>` /
    `<repo>` / `<table>` text in free-form descriptions and writes.target
    and refusing to recover, producing the misleading error "Element is
    missing end tag" on every page that had both prose and a component tag.
  - `mdCell` helper now applied to the `behavior.doc.writes` table and the
    cross-service-calls table. Pipe (`|`) and newline are table-cell-safe
    escapes; `<` / `>` are now redundant with the sanitize pass but are kept
    because they run before the post-pass and guarantee first-paint safety
    if a reader bypasses `vitepress build`.
  - Business-rules index page (`/business-rules/index.md`) now links to
    `/business-rules/<repo>/<slug>` instead of the flat
    `/business-rules/<slug>`. The sidebar was already on the nested path
    (added in v0.4) but the index table wasn't, producing 2 dead links per
    build when business rules existed for any repo.
  - 1 new integration test: `cdr e2e: portal sanitizes angle-bracket text
    in prose + still builds`. Asserts (a) `<repo>` in writes.target ends
    up as `&lt;repo&gt;` in the generated markdown, (b) `<CodeLink>` tags
    remain un-escaped, and (c) `vitepress build` exits 0.
- `docs/features/cdr-self-bootstrap.md` — feature delivery doc for the
  dogfooding exercise that surfaced the portal bug. Records the 9-phase
  pipeline run against `dapei-skill` itself (profile + 12 entries + 4
  behaviors + 2 rules + 2 domains + L1 map + portal generation) and
  documents three issues found by dogfooding (the vitepress bug above, a
  parallel-call race in `cdr.entries.propose`, and a `WRITE_OPS` doc gap).
- **SKILL Router — Tool Delegation Protocol**. Two skill documents now
  teach AI clients how to invoke their native sub-agent and todo
  primitives for context-budget control on multi-repo workspaces:
  - `SKILL.md` (Router) gains a `## Tool Delegation Protocol` section
    with a sub-agent pattern table mapping each read-heavy capability
    (`repos.analyze --all`, `context.build`, `cdr.doc.generate`,
    `validate feature`) to the structured summary the main agent
    should expect back (≤ 1KB), a native-todo convention for stage
    tracking, and a `## Tool Support Matrix` documenting per-client
    coverage (OpenCode / Claude Code / Cursor / Copilot / Windsurf).
  - `skills/cognitive/SKILL.md` gains a new Phase 1.5 — Sub-agent
    Delegation that fires whenever a workspace has ≥ 3 repos or any
    single repo > 1000 files. Phase 1-3 then run inside an Explore
    sub-agent's context; main agent only ever sees a structured
    candidate summary and writes the schema-validated artifacts
    itself. 80-repo workspaces fan-out Phase 4 (deep-dive) across N
    parallel sub-agents.
  - No engine code change. No new capabilities. No new schema.
    dapei intentionally does not grow a sub-agent scheduler or a
    todo capability; clients use their native primitives and the
    main agent's context only ever holds the structured summaries
    sub-agents return.
- **CDR portal aggregation — business-module abstraction**
  (on `feature/cdr-portal-aggregation`). `cdr.doc.generate` (still
  v1.1.0; additive) now emits cross-artifact aggregation pages and
  cross-link sections so the portal stops being a 1-yaml-per-page
  mirror and starts forming a navigable business view:
  - New `buildCrossArtifactIndex` helper joins behaviors, domains,
    state machines, business rules, and capability-map entries into
    9 Map-based indexes (4 forward + 5 inverted) built once per
    invocation. D1: behavior → domain join reuses the existing
    `behavior.derived_from[]` field — no schema change, no validator
    change. D2: state-machine transitions whose `behavior_id` does
    not resolve in the index render as `~~id~~ (no behavior
    document)` instead of silently hiding.
  - 5 existing page generators gain cross-link sections from the
    index: `generateDomainPage` (Behaviors in this domain / State
    machines driven by these behaviors / Business rules applying to
    this domain — BG-2), `generateCapabilityPage` (Contributing
    domains / Spans repos — BG-3), `generateBehaviorPage` (Drives
    transitions — BG-4), `generateStatePage` (Behavior column in
    transitions table with D2 strikethrough — BG-4), and
    `generateBusinessRulePage` (Applies to behaviors / Derived from
    — BG-5). Backward-compatible: ctx is optional, legacy callers
    without ctx get the legacy page with fields only.
  - 4 new aggregation page sets: `/business-modules/index.md` rolls
    up domains + their behaviors + rules + state machines + repos
    (BG-1, D4); `/behaviors/by-entry-type/<type>.md` (7 type pages
    + index) groups behaviors by entry surface api/mq/cron/rpc/
    cache/search/other (BG-7, D5); `/business-rules/by-kind/<kind>.md`
    (5 kind pages + index) groups rules by invariant/constraint/
    authorization/sla/compensation (BG-6); `/entries/<repo>/index.md`
    renders each repo's confirmed entries catalog (BG-9), and
    behavior pages gain a back-link to the entry page when a
    matching entry exists. Empty kinds / entry-types / no entries
    produce no page (zero-noise).
  - v0.5 (`/cross-repo/`) and v0.8 (`/l1/`) portal sections are no
    longer orphaned. `detectExistingPortalSections` scans the
    portal dir on disk and folds them into `pages[]`, the sidebar,
    and the top nav whenever `cdr.reversecluster.doc.generate` /
    `cdr.crossrepo.doc.generate` ran first (D3 default-on, opt-out
    via `fold_v08_sections: false`). Replaces the hand-written
    page-list in `generateVitepressConfig` with a
    `listFilesRecursively`-based enumeration (T1.2) so any future
    capability that writes `.md` under the portal root is
    auto-registered.
  - `inputSchema` of `cdr.doc.generate` gains one optional field:
    `fold_v08_sections: { type: "boolean" }`. Default behavior
    identical to v1.1.0 for callers that don't pass it.
  - 1 new integration test: `tests/integration/cdr-portal-aggregation.test.mjs`
    (D7, ~325 lines, 10 assertions covering BG-1 through BG-9 plus
    TstG-2 and a BG-8 opt-out subtest). All 10 pass; 7 P1 red-line
    + schema-evolution fixes were applied during the test loop
    (see commits on the feature branch). Existing
    `cdr-vitepress-build.test.mjs` (3 tests) and
    `cdr-v0.8-reverse-cluster.test.mjs` continue to pass.

### Changed
### Fixed
- `vitepress build` now exits 0 on any portal generated by
  `cdr.doc.generate`. Previously it failed with "Element is missing end
  tag" whenever a generated page contained raw `<name>` text in a
  description or table cell alongside a `<CodeLink>` / `<BehaviorFlow>` /
  `<StateMachine>` tag. The README's "v2.3 architecture" section has
  claimed this works since v2.3; it actually only worked for behaviors
  with `steps` and no `<name>`-bearing text.
- `/business-rules/index.md` no longer produces dead-link errors when
  any repo has business rules.

### Removed

## Desktop (M2) — 2026-06-26

M2 lands on top of M1. P3 Knowledge is real (portal + asset
tree), P5 Inspector gets evidence and tool-call cards, and
the Plugin L1 surface is live (Zod allowlist + sample plugin).
M2 keeps the `0.2.0-canary.0` version (no version bump —
internal canary, no npm publish per ADR-0007).

### Added

### Added

- **M2-1 P3 Knowledge** (ADR-0012): local static-file server
  on `127.0.0.1` + iframe-based portal embed. CSP and
  X-Content-Type-Options headers; path-traversal blocked.
  Asset tree walks `docs/as-is/` and surfaces
  behavior / state-machine / domain / profile / entry /
  business-rule / capability-map directories plus the
  cognitive index. `KnowledgeView` has two tabs (portal +
  assets); "Generate Portal" calls `cdr.doc.generate`.
- **M2-2 Inspector cards**: `EvidenceCard` (sources[]
  from cognitive artifacts, with fact / inference /
  unknown badges) and `ToolCallCard` (collapsible
  tool:call + tool:result pair with input + output JSON,
  ok/err indicator). P5 chat panel renders tool messages
  as `ToolCallCard`; the Inspector right rail shows sample
  `EvidenceCard`s (real evidence loading is M3+).
- **M2-3 PluginHost L1** (ADR-0013): the stub is replaced
  with a real implementation. Discovers
  `~/.dapei/plugins/*/dapei-desktop-plugin.json` and
  `<workspace>/.dapei/plugins/*/dapei-desktop-plugin.json`;
  validates with a strict Zod schema (regex for id, enum
  for slot, `pipelineSteps` accepted but flagged for L1
  rejection); catches duplicate plugin ids AND duplicate
  contribution ids. `enable` / `disable` toggles
  `LoadedPlugin.enabled`. Ships a sample plugin
  (`apps/sample-plugin/`) with one sidebar item + one
  route contribution.
- **2 ADRs** (0012, 0013) under `docs/decisions/`.
- **6 new node:test cases** (54 total): plugin host
  contract tests for invalid id, pipelineSteps
  rejection, duplicate contributions, sample plugin
  shape, enable/disable, empty init.

## Desktop (M1) — 2026-06-26

The dapei desktop end-to-end is live on `feature/desktop-m1-m2`
(13 commits, 7720+3612 lines). Per ADR-0007 the desktop carries
its own canary version (`@dapei/desktop-app@0.2.0-canary.0`,
all 9 desktop packages aligned). No npm publish yet — repo-internal
dev only.

### Added

- **M0 scaffold**: pnpm workspace with 9 desktop-* packages
  + 1 Electron app. electron-vite 3, React 19, TanStack Query 5,
  Zustand 5, Tailwind 4, React Router 7.
- **M1-1 EngineClient contract** (ADR-0008, ADR-0009, ADR-0010):
  `run(req, ctx)` is the only public method. WorkspaceContext
  is injected via spawn-env only; the parent `process.env` is
  never mutated. The dimension rule fires inside
  `SubprocessEngineClient.run` against a 32-regex blocklist +
  6-prefix feature allowlist; a self-check script scans
  `packages/core/src/capabilities/` and asserts every
  workspace-dim write is in the blocklist.
- **M1-2 IPC router**: per-namespace handlers (workspace /
  repos / feature / agent). Zod request schema per channel;
  INVALID_PAYLOAD on parse fail; broadcast push on success.
- **M1-3 P0 launcher real**: `~/.dapei/desktop/recent.json`
  registry, native `dialog.showOpenDialog`, real
  `workspace.{init,validate,open}` capability calls, AppContext
  switches on success.
- **M1-4 P1/P2/P4 read-aggregate pages**: real engine calls
  for `workspace.status` / `repos.list` / `repos.add` /
  `repos.sync` / `feature.list` / `feature.create`. Mock data
  is gone from these surfaces.
- **M1-5 P5 workbench**: real feature.yaml + context + backlog
  reads; StageStepper from `feature.status`; confirmation
  gate before `workflow.runStage`; entering P5 auto-switches
  the AppContext dimension to `feature`.
- **M1-6 Agent-Share v1** (ADR-0011): ACP stdio JSON-RPC
  transport, two backends (MockAgentBackend for CI + dev,
  OpenCodeAgentBackend for real `opencode acp` spawn). 7-type
  AgentEvent union; 6 IPC channels. PTY bridge is permanently
  deprecated.
- **5 ADRs** (0007-0011) under `docs/decisions/`.
- **48 node:test cases**: contract (19) + IPC (11) + registry
  (7) + integration (3) + dimension (2) + agent (6).

### Fixed

- Electron macOS Framework extraction (the `ensure-electron`
  helper script, originally a M0 contribution, is now part
  of the documented postinstall flow).

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
- `cdr.bootstrap` capability: one-shot repos→docs bootstrap that runs
  `cdr.profile` + `cdr.entries.candidate` in a single call. The AI still
  owns `cdr.entries.propose` / `confirm` (P3 evidence red line). Router
  patterns: `@dapei bootstrap <repo>` and 中文 `引导 <repo>`.
- `repos.add` accepts `auto_profile: bool` flag. When true, the add
  pipeline calls `cdr.profile` after clone and returns `profile_path`.
- `context.build` now injects a stage-aware Cognitive Assets Summary
  section into `runtime-context.md`. Summary content depends on the
  feature stage:
  - discover stages (`analyze-current-state`, `gap-analysis`): counts
    of profiles, confirmed entries, candidate entries
  - design stages (`solution-design`, `task-breakdown`,
    `implementation`): counts of behaviors, state machines, business
    rules
  - ship stages (`local-validation`, `architecture-review`,
    `acceptance`): counts of domains, capability-map presence,
    docs-portal generation status
  - empty workspace: hint pointing at `@dapei cdr bootstrap <repo>`
  - unknown stage: no summary section is emitted. Capability version
    bumped from `2.0.0` to `2.1.0`.

### Changed (BREAKING)
- `feature.close` version bumped 1.0.0 → 2.0.0. The capability now
  auto-invokes `cdr.feature.link` on the way out, after writing
  `docs/decisions/<feature>-decisions.md` and before tearing
  down the worktree. The result data gains `cdr_assets_tagged: <n>`
  and a new `reportFragment` reports the link count. The input
  schema is unchanged. **The pre-existing `confirmGate: "acceptance"`
  still applies** — callers (including `feature.close` itself in
  tests) must pass `confirmed: true` or the capability throws
  `CONFIRMATION_REQUIRED` *before* the link runs. The new side
  effect is purely additive on top of the existing gate.
- `repos.analyze` now defaults to `use_cdr: true`. The capability
  delegates to `cdr.profile` and writes a structured YAML profile at
  `docs/as-is/profiles/<repo>.yaml` instead of `repo-inventory.md`. To
  keep the legacy grep-style shape, pass `{ use_cdr: false }`. Capability
  version bumped to `2.0.0` to signal the shape change.

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
