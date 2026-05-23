# dapei.skill v0.1 Technical Design

## Positioning

`dapei.skill` is not a code generator wrapper. It is a Context OS for AI Native Engineering.

System objective:

- Keep AI in controlled, sustainable, collaborative engineering loops.
- Make feature lifecycle explicit and stateful.
- Turn architecture and team knowledge into executable context assets.

## Architecture Layers

1. User Layer: command language entrypoint
2. Skill Router: maps user intent to modular skills
3. Atomic Capability Engine: typed capability registry and deterministic execution
4. Workflow Engine: stage orchestration (DAG)
5. Context System: layered context loading + memory
6. Workspace System: feature isolation and repo mapping
7. Infrastructure: git/ide/mcp/ci runtime

## Runtime Unit

- Workspace is runtime universe.
- Workspace root is the user's current directory after initialization.
- Feature is execution unit.
- Context is durable infrastructure.

## Workspace Root Contract

`dapei` must initialize the current directory as the workspace root. It must not create a nested `workspace/` runtime directory.

Root-level runtime directories:

- `repos/`: managed Git repositories.
- `docs/`: durable as-is business, architecture, technology, standards, decisions, and feature impact knowledge.
- `features/`: feature execution workspaces.

Initialization policy:

- Empty directory: create the workspace contract.
- Non-empty conforming directory: complete missing dapei metadata and reports.
- Non-empty non-conforming directory: stop and ask the user to use an empty directory or run an explicit migration flow.

The intended knowledge loop is:

1. Import repositories into `repos/`.
2. Analyze repos to bootstrap and refresh `docs/`.
3. Discuss and design new requirements using `docs` as durable context.
4. Create `features/<feature>` with relevant repo branches or worktrees plus dynamic context.
5. Implement and validate locally inside the feature workspace.
6. Close out the feature by updating `docs` with accepted design, decisions, constraints, and cross-feature impact.

## Context Layering Protocol

Load order:

1. Global
2. Workspace
3. Domain
4. Repo
5. Feature
6. Runtime transient

Each layer defines:

- `priority`: numeric precedence
- `merge_policy`: `override | append | deny`

## Guardrail Strategy

Two-phase rollout:

1. Report mode (non-blocking)
2. Gate mode (blocking)

Rule families:

- Layering and boundary
- Naming and structure
- API and dependency direction
- Risk-sensitive change policy

## MVP Deliverables

- `.dapei/workspace.yaml`
- `.dapei/feature.schema.yaml`
- `.dapei/commands.yaml`
- `.dapei/workflows/feature-lifecycle.yaml`
- `.dapei/rules/*.yaml`
- docs templates for memory/reporting

## Capability Evolution (v2.1)

- Capability registration is handled through a central TS registry (`CapabilityRegistry`).
- Input contracts are validated by schema before execution (required, type, enum, additional properties).
- New capabilities should be added as specs and registered, not wired by ad-hoc command parsing logic.

## Cognitive Runtime Architecture (v2.2)

North Star: **让 AI 持续参与系统认知** — not just write code, but maintain structured understanding of how the system behaves.

Layer stack:

1. **AI Interaction Layer** — `@dapei` + `skills/cognitive/SKILL.md` (discover → deep-dive protocol)
2. **Cognitive Runtime** — `cognitive.*` capabilities: validate, upsert, list, index
3. **Semantic Analysis (Agent-driven)** — Agent reads `repos/` and writes YAML artifacts
4. **Evidence Extraction (substrate)** — directory tree + manifest file paths only; Agent orients and chooses entry strategy
5. **Local Runtime Substrate** — filesystem/git/worktree

Cognitive artifact paths:

- `docs/as-is/behavior/<id>.yaml` — behavior facts (API → writes → events → calls)
- `docs/as-is/state-machines/<entity>.yaml` — state transition models
- `.dapei/cognitive/index.yaml` — manifest of validated artifacts

Evidence contract (`packages/core/src/evidence.ts`):

- `kind=fact` requires `sources[]`
- `kind=inference` requires `derived_from[]`
- `kind=unknown` requires `reason`

Phase roadmap: Behavior → State → Semantic Clustering → Capability Mapping → Cognitive Graph → Dynamic Context Budget.
See `docs/plans/cognitive-runtime-roadmap.md`.
