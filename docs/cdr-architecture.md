# Dapei Cognitive Discovery Runtime (CDR)

## CodeGraph-Integrated Architecture (Implementable v1.0)

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **Implemented v0.2** (in `feature/cdr-mining`; CodeGraph substrate not yet wired) |
| Baseline | dapei.skill v2.2.x |
| External dependency | [lzehrung/codegraph](https://github.com/lzehrung/codegraph) ≥ v1.8 (CLI / library / optional MCP) — **not wired in v0.1 / v0.2** |
| User entry | `@dapei ...` (no new shell commands for end users) |
| Implementation branches | `feature/cdr-runtime` (v0.1), `feature/cdr-mining` (v0.2) |
| Feature delivery docs | [`docs/features/cdr-runtime.md`](features/cdr-runtime.md), [`docs/features/cdr-mining.md`](features/cdr-mining.md) |

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

### 7.1 Integration modes

| Mode | Use |
| --- | --- |
| CLI subprocess (preferred) | `runtime-adapters` calls `codegraph`; version-pinned |
| TypeScript API | High-frequency packet paths (later) |
| MCP | Agent in Cursor; artifacts **must** still land under `docs/as-is` |

### 7.2 Configuration

Template: `runtime/templates/codegraph.config.json.template` with standard ignore globs. Per-repo override under `repos/<name>/`. Index output: `.dapei/graph/<name>/`.

### 7.3 Degradation

| Failure | Behavior |
| --- | --- |
| codegraph missing | `cdr.profile` uses manifest + tree only |
| Weak language parse | Lower candidate confidence; more Agent confirmation |
| Stale graph | `cdr.stale.scan` prompts `cdr.graph.ensure` |

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
