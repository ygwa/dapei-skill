# dapei.skill v0.1 Technical Design

## Positioning

`dapei.skill` is not a code generator wrapper. It is a Context OS for AI Native Engineering.

System objective:

- Keep AI in controlled, sustainable, collaborative engineering loops.
- Make feature lifecycle explicit and stateful.
- Turn architecture and team knowledge into executable context assets.

## Architecture Layers

1. User Layer: command language entrypoint
2. Skill Router: maps command to workflow + context profile
3. Workflow Engine: stage orchestration (DAG)
4. Context System: layered context loading + memory
5. Workspace System: feature isolation and repo mapping
6. Infrastructure: git/ide/mcp/ci runtime

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
