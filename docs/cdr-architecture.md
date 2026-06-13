# Dapei Cognitive Discovery Runtime (CDR)

## CodeGraph-Integrated Architecture (Implementable v1.0)

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **Implemented v0.3** (in `feature/cdr-v0.3-ai-as-scanner`; CodeGraph substrate not yet wired) |
| Baseline | dapei.skill v2.2.x |
| External dependency | [lzehrung/codegraph](https://github.com/lzehrung/codegraph) ≥ v1.8 (CLI / library / optional MCP) — **not wired in v0.1 / v0.2 / v0.3** |
| User entry | `@dapei ...` (no new shell commands for end users) |
| Implementation branches | `feature/cdr-runtime` (v0.1), `feature/cdr-mining` (v0.2), `feature/cdr-v0.3-ai-as-scanner` (v0.3) |
| Feature delivery docs | [`docs/features/cdr-runtime.md`](features/cdr-runtime.md), [`docs/features/cdr-mining.md`](features/cdr-mining.md), [`docs/features/cdr-v0.3-ai-as-scanner.md`](features/cdr-v0.3-ai-as-scanner.md) |

## Core Principle (v0.3): AI as scanner, engine as validator

**Why v0.3 exists**: v0.2 hardcoded regex/annotation parsers for Spring / NestJS / FastAPI / Express into the engine (~150 lines of framework-specific code). Every new framework required new code. Worse, the engine was actively *stealing* a job the AI could already do — reading code.

v0.3 inverts the responsibility split:

| v0.2 (regex-bound) | v0.3 (AI as scanner) |
| --- | --- |
| Engine reads every code file, runs 4 framework regexes, emits candidates with `framework: spring` / `nestjs` / `fastapi` / `express` | Engine returns the code file listing (cheap, deterministic). AI reads the content and decides. |
| Quarkus / Ktor / Hapi / Actix / Axum / Django / Fastify / gRPC / GraphQL / dynamic routes = all leak through | Anything the AI can read works. No maintenance. |
| `entries[].framework: "spring"` carries the platform's opinion | `discovered_by: "ai"` — engine doesn't opine on framework |
| `cdr.entries.confirm` only needs `summary` | `cdr.entries.confirm` requires `sources[]` (P1 red line) |
| 35 framework-assertion tests | 35 evidence-validation tests (line out of range, file missing, fact without sources) |

**Non-negotiables** that did not change:

- The engine is still 100% deterministic. No LLM calls in the engine path. The AI is *outside* the engine, in the chat session, driving `runCapability` calls. CI stays fast, tests stay reproducible, cost stays under control.
- The P1 red lines (kind=fact requires sources, domain requires derived_from, etc.) are now actually enforceable because the engine, not the Agent, owns the "evidence exists" check.
- The workflow descriptions from `cognitive.discover` v2.1 still hold: "Agent chooses how to locate behavior entry points for this stack — platform does not prescribe keywords or patterns." v0.3 makes v0.2 actually consistent with that principle.

### v0.3 Implementation Status (on `feature/cdr-v0.3-ai-as-scanner`)

| Capability | Status | Evidence |
| --- | --- | --- |
| `cdr.entries.candidate` (file listing, no pattern) | ✅ implemented | unit test asserts Spring/NestJS/FastAPI files all returned as plain code files (no special framework detection) |
| `cdr.entries.propose` (single entry, evidence-validated) | ✅ implemented | unit tests reject: missing sources, line out of range, file not in repo, invalid id |
| `cdr.entries.prepare` (thin orchestrator delegating to .candidate) | ✅ implemented | unit test asserts `entries[]` field is gone, `workflow.prefer = "cdr.entries.candidate"`, `deprecated: true` |
| `cdr.entries.confirm` requires sources[] + validates evidence | ✅ implemented | unit tests reject: confirm without sources, confirm with non-existent file |
| `validateEvidencePoints(ctx, doc)` shared helper | ✅ implemented | used by 6 capabilities; tests cover fact+strict, inference+loose, explicit-repo-on-inference |
| `cdr.profile` v2 (no `frameworks` field) | ✅ implemented | unit test asserts `frameworks:` no longer in profile yaml |
| Evidence validation in `cdr.behavior.upsert` / `cdr.state.derive` / `cdr.domain.compose` / `cdr.business.compose` | ✅ implemented | unit tests for each |
| L4 ai-behavior transcript for full candidate → propose → confirm | ✅ implemented | `tests/ai-behavior/fixtures/conversations/cdr-ai-as-scanner.yaml` |

### v0.2 Implementation Status (shipped on `feature/cdr-mining`)

| Capability | Status | Evidence |
| --- | --- | --- |
| `cdr.entries.prepare` v2 (annotation-aware) | ✅ implemented | unit tests for Spring / NestJS / FastAPI / Express; class-level base path concatenation; no-paren variants (`@PostMapping`) supported |
| `cdr.entries.confirm` v2 (echoes framework/method/path/line) | ✅ implemented | unit test persists annotation metadata |
| `business-rule` artifact type + `cdr.business.compose` | ✅ implemented | unit tests for all 5 kinds + P2 evidence rules; index integration; VitePress portal renders a `business-rules/` section |
| `cdr.index.list` v2 (emits `## Business Rules`) | ✅ implemented | unit test for surface; integration test for pipeline |
| CodeGraph substrate | ❌ deferred to v1.0 | see "Out of scope" below |

### v0.1 Implementation Status (shipped on `feature/cdr-runtime`, merged into v0.2 base)

| Capability | Status |
| --- | --- |
| `cdr.profile` | ✅ |
| `cdr.entries.prepare` (filename-only baseline) | ✅ |
| `cdr.entries.confirm` | ✅ |
| `cdr.behavior.upsert` | ✅ |
| `cdr.state.derive` | ✅ |
| `cdr.domain.compose` (P1 `derived_from` required) | ✅ |
| `cdr.capability.map.init` | ✅ |
| `cdr.index.list` v1 | ✅ |
| `cdr.doc.generate` (VitePress portal with 3 Vue 3 components) | ✅ |

#### Out of scope (planned for the CodeGraph branch / v1.0)

- CodeGraph CLI / library invocation in `cdr.profile` and `cdr.entries.prepare` (currently uses heuristic regex + tree)
- Cross-repo dependency graph for `cdr.domain.compose`
- Live call-graph evidence in `sources[]` (currently Agent-supplied `symbol_handle` strings)
- MCP adapter for in-editor navigation
- `cdr.state.derive` v2 — resolve `from: "[*]"` via real control-flow analysis (currently only writes/events heuristics)
- `SourceRef.commit_sha` field for cross-branch fact pinning
- Auto-extraction of `business-rule` artifacts (currently Agent-supplied; CodeGraph + LLM miner planned for a future iteration)

These are tracked in [`docs/features/cdr-mining.md`](features/cdr-mining.md) under "Out of scope / future work".

---

## 1. Problem Statement

In enterprise settings, AI failures often stem from missing **versioned, validatable, incremental As-Is cognitive assets**, not from lacking “one more full-repo read.”

| Symptom | Root cause | CDR response |
| --- | --- | --- |
| Wrong summaries; inconsistent agents | No single source of truth | YAML artifacts + index + evidence contract |
| Broad scans; context collapse | No entry budget | Entry-driven analysis + bounded CodeGraph expansion |
| Weak process/state narrative | File-tree-only understanding | behavior → state → business-rule chain |
| Re-analysis every feature | No incremental model | profile/entries revisions + stale markers |
| `repos.analyze` grep posing as semantics | Blurred platform/Agent boundary | Deterministic profile; semantics only in artifacts |

CDR does **not** replace Feature/Workflow. It supplies **Workspace-dimension L3 process assets** consumed by `analyze-current-state` → `solution-design`, via `feature.create` and `context.build`.

---

## 2. Design Stance (Revisions vs. CDR Draft)

### 2.1 Execution model: three roles

```text
┌─────────────────────────────────────────────────────────┐
│  User: @dapei discover behaviors for mall-order         │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Skill Router → skills/cdr/SKILL.md                   │
└───────────────────────────┬─────────────────────────────┘
                            ▼
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
┌───────────────────┐                 ┌───────────────────┐
│ Platform (cdr.*)  │                 │ Agent: semantics │
│ contract/index/   │                 │ writes YAML,      │
│ validate/stale    │                 │ promotes fact     │
└─────────┬─────────┘                 └─────────┬─────────┘
          │                                       │
          ▼                                       ▼
┌─────────────────────────────────────────────────────────┐
│ CodeGraph substrate (Finding only)                      │
│ orient · apisurface · explain · refs · impact · graph     │
│ Never auto-promoted to kind=fact business artifacts     │
└─────────────────────────────────────────────────────────┘
```

- **CodeGraph**: Finding (where code lives, who calls whom, change blast radius).
- **Agent**: Understanding (what a step means, business semantics, rule synthesis).
- **Platform**: Contract (schema, index, upsert, guardrail, context injection).

Layer 3 “DFS” is **Agent-driven along bounded graph neighborhoods** from CodeGraph `explain` / `refs`, not engine grep heuristics for business flow.

### 2.2 Principles (executable)

| Principle | Rule |
| --- | --- |
| P1 Behavior → domain | `domain` artifacts require `derived_from: [behavior-id, …]`; no package-name-only domains |
| P2 Entry-driven | Deep-dive only from `entries` with `status: confirmed` |
| P3 Evidence first | `kind=fact` requires `sources[]` (file/line/symbol); optional `symbol_handle` from CodeGraph |
| P4 Incremental | `profile` / `entries` carry `revision`; behaviors carry `repo_revision`; conflicts → `stale` queue |

### 2.3 Compatibility with v2.2

| CDR draft | This plan |
| --- | --- |
| `behaviors/` | Keep **`docs/as-is/behavior/`** (existing schema) |
| `entries.yaml` | **`docs/as-is/entries/<repo>.yaml`** (replaces ad-hoc `_candidates.yaml` role) |
| `repo-profile.yaml` | **`docs/as-is/profiles/<repo>.yaml`** (+ optional `repo-inventory.md` from `cdr.profile`) |
| `rules/` | **`docs/as-is/business-rules/`** (avoid `.dapei/rules` guardrail confusion) |
| `cognitive.*` | **Retained**; `cdr.*` extends; Router dual-routes then converges |

---

## 3. Target layout

```text
Workspace (docs/as-is + .dapei/cdr/)
│
├── profiles/           ← L0 technical profile (platform + CodeGraph orient)
├── entries/            ← L2 entry catalog (CodeGraph candidates + Agent confirm)
├── behavior/           ← L3 behaviors (Agent + CodeGraph trace)
├── state-machines/     ← L3 states (derived from behaviors + Agent confirm)
├── business-rules/     ← L3 rules (Agent; default inference)
├── domains/            ← L2 domains (v1.1: Agent-assisted + derived_from)
└── capabilities/       ← L1 capability map (v1.2: human anchor + references)

.dapei/cdr/
├── index.yaml          ← unified artifact index
├── graph/<repo>/       ← CodeGraph cache/SQLite (gitignored by default)
└── sessions/<id>/      ← optional per-discover trace metadata
```

CodeGraph indexes live under **`.dapei/graph/<repo>/`**, scanning `repos/<repo>/`. Product repos are not required to host SQLite unless explicitly configured.

---

## 4. Layers and capabilities

### Phase A — v1.0 (recommended 6–10 weeks)

#### Layer 0: Repository profile

**Capability**: `cdr.profile` (replaces semantic portions of `repos.analyze`)

**Platform**:

- CodeGraph: `orient --budget small --json`, `inspect`, `apisurface` when available
- Existing: `detectRepoLanguage`, `detectTestCommands`, manifest list
- **Remove** grep-based API/MQ as fact; optional downgrade to `signals` with `kind: unknown`

**Output**: `docs/as-is/profiles/<repo>.yaml`

```yaml
repo: mall-order
revision: "2026-06-05T12:00:00Z"
stack:
  language: java
  frameworks: [spring-boot]
codegraph:
  indexed_at: "..."
  backend: native
  files_total: 842
entry_patterns_suggested:
  - type: api
    handles: ["symbol:OrderController#create"]
signals:
  mq_files: []
test_commands: ["mvn test"]
```

**User**: `@dapei profile repo mall-order`

---

#### Layer 1: Graph substrate (CodeGraph adapter)

**Capability**: `cdr.graph.ensure` (idempotent index)

**Implementation**: `packages/runtime-adapters/src/codegraph.ts` invoking CLI (Phase A); optional TS API later.

**Platform**: Node ≥ 24, `codegraph doctor`, index into `.dapei/graph/<repo>/`

**Not platform-owned**: Auto-writing graph edges as behavior steps; dumping full graph into `context.build`

**Agent usage** (documented in `skills/cdr/SKILL.md`):

| CodeGraph | CDR use |
| --- | --- |
| `orient` / `inspect` | Stack, hotspots, next commands |
| `search` / `packet get` | Anchor symbols; bounded file context |
| `explain` / `refs` | Expand from entry; fill `sources[]` |
| `impact` / `review` | Regression scope after feature changes |
| `graph --compact-json` | Optional Mermaid in `artifacts/` |

---

#### Layer 2: Entry discovery

**Capabilities**: `cdr.entries.prepare`, `cdr.entries.confirm`

1. `cdr.graph.ensure`
2. Platform pulls entry **candidates** → `docs/as-is/entries/<repo>.yaml` (`status: candidate`)
3. Agent confirms/rejects, writes `summary`, sets `status: confirmed`
4. No `kind=fact` behavior for non-confirmed entries

```yaml
repo: mall-order
revision: "..."
entries:
  - id: create-order
    type: api
    status: confirmed
    summary: "Create order, charge payment, publish event"
    anchor:
      symbol_handle: "symbol:OrderController#create"
      file: src/.../OrderController.java
      line: 42
    priority: high
    discovered_by: codegraph
```

**User**: `@dapei discover entries for mall-order`

---

#### Layer 3: Behavior mining

**Capabilities**: `cdr.behavior.session.start`, `cdr.behavior.upsert` (wraps existing validate + upsert)

**Skill protocol** per confirmed entry:

1. `codegraph explain <handle> --json`
2. Agent traces along graph edges (no whole-repo keyword sweeps)
3. Fill `behavior.schema.yaml`: `entry`, `writes`, `events`, `calls`, `risks`
4. `sources[]` for key conclusions; optional `trace_session`
5. Upsert → `.dapei/cdr/index.yaml`

**Incremental**: Only `behavior_status: missing|stale`; git change → re-`cdr.graph.ensure` → mark related behaviors stale

**User**: `@dapei discover behaviors for mall-order — prioritize payment entries`

---

#### Layer 4: State mining

**Capability**: `cdr.state.derive` (replaces weak `cognitive.state.suggest`)

- Input: upserted behaviors
- Platform: draft from `writes` / `events` → default `kind: inference`, `derived_from: [behavior-ids]`
- Agent: confirm against enums/entities/migrations → upsert fact

**User**: `@dapei discover states for Order in mall-order`

---

#### Layer 5: Business rules (v1 narrowed)

**Capability**: `cdr.rule.upsert` + `business-rule.schema.yaml`

**v1 scope**: Branches on **confirmed behavior paths** only; default `kind: inference`

**Out of v1**: Full-repo rule mining, remote config centers, auto risk policies

**User**: `@dapei discover rules for create-order`

---

### Phase B — v1.1 (Domain, Agent-assisted)

**Capability**: `cdr.domain.compose`

- Template `docs/as-is/domains/<name>.yaml`
- Requires `derived_from`; clustering → inference at most

**User**: `@dapei compose domain Order from mall-order behaviors`

---

### Phase C — v1.2 (Capability map, semi-manual)

**Capability**: `cdr.capability.map.init`

- Human L1 anchors in `docs/as-is/capabilities/product-map.yaml`
- Agent attaches domains and documents gaps

---

## 5. dapei skills integration

### 5.1 Skill modules

| Module | Change |
| --- | --- |
| Root `SKILL.md` | Route `cdr` → `skills/cdr/SKILL.md` |
| `skills/cdr/SKILL.md` | **New**: CDR phases + CodeGraph tool table + red lines |
| `skills/cognitive/SKILL.md` | Thin compatibility wrapper → cdr |
| `skills/repos/SKILL.md` | Technical analysis → `cdr.profile` |
| `skills/feature/SKILL.md` | Document `cdr.index` injection on create |
| `skills/workflow/SKILL.md` | `analyze-current-state` requires entries/behaviors |

### 5.2 Router intents (examples)

```text
@dapei profile repo X                 → cdr.profile
@dapei discover entries for X         → cdr.entries.prepare (+ skill)
@dapei discover behaviors for X       → cdr.behavior.session.start
@dapei discover states for Order      → cdr.state.derive
@dapei discover rules for Y           → cdr.rule.*
@dapei list cdr assets                → cdr.index.list
```

Compatibility:

```text
@dapei cognitive validate ...         → unchanged
@dapei analyze behavior for X         → maps to cdr.behavior.session.start
```

### 5.3 Feature / context / closeout

- **`feature.create`**: Match by repo, keywords, entry tags, domain, behavior id; inject `related-cdr-context.md` (alias legacy name).
- **`context.build` v3**: Profile summary, confirmed entries table, fact behavior table; optional `cdr.graph.packet` on demand; **no** full graph JSON by default.
- **Guardrail COG-001**: Before `solution-design`: ≥1 confirmed entry + ≥1 fact behavior; gate mode optional in v1.1.
- **`cdr.promote` (v1.1)**: On `feature.close`, merge accepted feature-local cognitive changes back to workspace `docs/as-is/*`.

---

## 6. Capability backlog

| ID | Version | Description |
| --- | --- | --- |
| `cdr.profile` | v1.0 | Technical profile; replace analyze semantics |
| `cdr.graph.ensure` | v1.0 | CodeGraph index |
| `cdr.graph.packet` | v1.0 | Bounded context by handle |
| `cdr.entries.prepare` | v1.0 | Entry candidates |
| `cdr.entries.confirm` | v1.0 | Agent confirmation write-back |
| `cdr.behavior.session.start` | v1.0 | Trace session metadata |
| `cdr.behavior.upsert` | v1.0 | Validate + upsert wrapper |
| `cdr.state.derive` | v1.0 | State machine draft |
| `cdr.rule.upsert` | v1.0 | Business rules |
| `cdr.index.list` | v1.0 | Unified listing |
| `cdr.stale.scan` | v1.0 | git diff → stale markers |
| `cdr.promote` | v1.1 | Feature closeout backfill |
| `cdr.domain.compose` | v1.1 | Domain shell |
| `cdr.capability.map.init` | v1.2 | Capability map shell |

**Deprecate**: `repos.analyze` grep API sections; merge `cognitive.discover` into `cdr.entries.prepare` (keep alias).

---

## 7. CodeGraph integration

### 7.1 The actual CLI

v0.9 rewrites the adapter against the real [`colbymchenry/codegraph`](https://github.com/colbymchenry/codegraph) CLI. The v0.7 / v0.8 branch called a fictional subcommand set (`orient`, `refs`, `impact`, `doctor`) that the actual CLI never shipped; those calls would have silently no-oped against the real binary. The v0.9 adapter uses the real subcommands:

| v0.9 method | Real CLI call | Purpose |
| --- | --- | --- |
| `orient(repo, opts)` | `codegraph files --format=json <repo>` + `codegraph query --kind=function --json <pattern> <repo>` | List code files with content + apisurface hints. The `query` subcommand returns route metadata for web-framework handlers; the adapter merges those into per-file `apisurface_hint` on the orient result. |
| `refs(repo, anchor)` | `codegraph node <file:line> --json <repo>` then `codegraph callees <sym> --json <repo>` | Find outbound callees at a call site. If the anchor carries a `symbol`, skip the `node` lookup; otherwise resolve the symbol at the file:line first, then query callees. |
| `impact(repo, base, head)` | `git diff --name-only <base>..<head>` (via the adapter) | Compute the file-level change set between two commits. The real `codegraph impact <sym> --depth N` is symbol-level (what's affected if I change symbol X), not commit-level, so the adapter wraps `git diff` for the change set. |
| `fullDoctor()` | `codegraph status --json <workspaceRoot>` | Surface the real CLI's status: `{ version, pending_sync, files_total, languages }`. |

The real CLI's `codegraph impact <sym> --depth N` is reserved for a future symbol-level blast-radius capability (which would call `codegraph_callers` on each changed symbol).

### 7.2 Integration modes

| Mode | Use |
| --- | --- |
| CLI subprocess (default) | `runtime-adapters` calls `codegraph`; the real CLI ships a self-contained runtime so no system Node is required. |
| MCP server | The `codegraph install --target=<host>` command wires the CodeGraph MCP server into Claude Code / Cursor / Codex CLI / opencode / etc. The agent then has `codegraph_explore`, `codegraph_node`, `codegraph_search`, `codegraph_callers` tools directly. dapei does **not** implement or vendor these tools — `codegraph install` wires them in, and CDR skills tell the agent **when** to use them. |
| Node library | `import CodeGraph from '@colbymchenry/codegraph'`; requires Node ≥ 22.5 for built-in `node:sqlite`. Not used in v0.9 — the CLI subprocess mode covers all current callers. |

### 7.3 Configuration

CodeGraph is **zero-config**. There is no `codegraph.config.json` to write. Language support is automatic from file extension. The real CLI skips dependency / build / cache directories and respects `.gitignore` by default. To exclude something else, add it to `.gitignore`. To pull a default-excluded directory back in, use a `.gitignore` negation (`!vendor/`).

The only dapei-side decision is *which repo* to point CodeGraph at — every product repo under `repos/<repo>/` is independently initialized by `codegraph init -i` in that repo's directory. The index lives at `<repo>/.codegraph/codegraph.db` (CodeGraph-owned, gitignored). dapei does not own or relocate the index.

### 7.4 Degradation

| Failure | Behavior |
| --- | --- |
| codegraph missing | `cdr.profile` sets `codegraph.installed: false`, skips graph calls, uses `manifest` + `tree` only. `cdr.entries.candidate` and `cdr.stale.scan` fall back to tree-walk / `git diff`. The profile block reflects it. |
| `.codegraph/` not initialized in the repo | `cdr.profile` sets `codegraph.status: not-initialized` and surfaces the fix-up command (`codegraph init -i`) in the report's **Next Steps**. |
| Index pending sync (file edits since last sync) | `codegraph_status` surfaces a `### Pending sync:` section naming affected files; the agent reads those directly per the staleness banner protocol. No dapei-side action. |
| Weak language parse (Lua / Liquid / Pascal have lower measured cross-file coverage) | `cdr.entries.candidate` lowers candidate confidence for those files; more Agent confirmation; the engine never silently fabricates entries. |
| Stale graph (commit drift) | `cdr.stale.scan` compares `repo_revision` against the index `revision`; mismatches prompt a re-`codegraph init -i` before the next `cdr.behavior.upsert`. |

The adapter's `orient()`, `refs()`, `impact()`, and `fullDoctor()` methods all return `{ available: false, reason: "..." }` when the CLI is missing or fails. Callers MUST check the flag and degrade gracefully. The design principle is that the dapei platform ships with a working tree-walk + manifest fallback at every level; CodeGraph is an upgrade, not a dependency.

---

## 8. Quality metrics (v1)

| Metric | Definition |
| --- | --- |
| Entry coverage | confirmed_entries / apisurface candidates |
| Behavior coverage | fact_behaviors / confirmed_entries |
| Fact ratio | fact / (fact + inference + unknown) |
| Stale queue | index entries with `stale: true` |

Reports use dapei format: **Conclusion / Risk / Needs Confirmation / Next Steps**.

---

## 9. Differences from original CDR draft

| Draft | This plan |
| --- | --- |
| Full-repo CodeGraph materialization | On-demand index + packet budget |
| Platform DFS for behaviors | Agent DFS + CodeGraph edges |
| Auto domain/capability in v1 | v1.1 / v1.2 with `derived_from` |
| `behaviors/` directory | Keep `behavior/` |
| `rules/` name clash | `business-rules/` |
| Separate command family | `@dapei discover *` → internal `cdr.*` |

---

## 10. Implementation epics

```text
E1  Contracts + index: profiles, entries, business-rule schema, cdr.index
E2  CodeGraph adapter: cdr.graph.ensure / packet + config template
E3  cdr.profile + retire repos.analyze semantic grep
E4  skills/cdr + Router + cognitive compatibility
E5  cdr.entries + cdr.behavior session + upsert/stale
E6  cdr.state.derive + context.build v3 + feature injection
E7  guardrail gate + cdr.promote
--- v1.1 ---
E8  cdr.domain.compose
E9  conflict detection + incremental hardening
--- v1.2 ---
E10 capability map templates
```

---

## 11. v1.0 acceptance criteria

On a workspace with `repos/sample-node-repo` (or equivalent fixture):

1. `@dapei profile repo sample-node-repo` produces profile **without** grep API pseudo-evidence.
2. `@dapei discover entries` yields ≥2 **confirmed** entries with CodeGraph handles.
3. `@dapei discover behaviors` yields **fact** behaviors with `sources` (file/line).
4. `@dapei discover states for Order` produces inference draft + Agent-confirmed upsert.
5. `feature.create` references related behaviors; `context.build` includes summary tables under a fixed size budget.
6. Optional: COG-001 gate blocks `solution-design` without fact behavior.

---

## 12. Related documents

| Document | Role |
| --- | --- |
| [DESIGN.md](../DESIGN.md) | Platform architecture baseline |
| [agents.md](../agents.md) | Agent boundaries and roadmap |
| [skills/cognitive/SKILL.md](../skills/cognitive/SKILL.md) | Current cognitive protocol (to migrate) |
| [CHANGELOG.md](../CHANGELOG.md) | Release history |

### Follow-up ADRs (recommended)

- **ADR-001**: CodeGraph Substrate Adapter (`runtime-adapters`, cache layout, CLI contract)
- **ADR-002**: CDR Asset Layout & v2.2 Compatibility (paths, index migration, aliases)

---

## 13. Summary

CDR preserves **behavior → state → rule → domain → capability** ordering while making delivery feasible inside dapei:

1. **CodeGraph = Finding** via `cdr.graph.*`, indexes under `.dapei/graph`, Agent uses orient/packet/explain for bounded deep-dives.
2. **Agent = Understanding** for YAML artifacts; platform validates, indexes, increments, and injects into features.
3. **Skills = Protocol** via `skills/cdr`, compatible with existing `cognitive.*` and workspace/feature dimension rules.

Target outcome: dapei evolves from an AI coding skill into a **durable enterprise As-Is knowledge substrate** for feature design and delivery—without pretending static graphs are business truth.
