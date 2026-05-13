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
- Feature is execution unit.
- Context is durable infrastructure.

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
