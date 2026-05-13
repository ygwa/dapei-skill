# dapei.skill

`dapei.skill` is an AI Native Engineering Context Operating System.

Core belief:

- Code is temporary.
- Context is infrastructure.

## v0.1 Scope

This repository currently ships a minimum runnable spec (MVP):

1. Workspace initialization contract
2. Feature workspace lifecycle contract
3. Workflow DAG definition for AI SDLC
4. Guardrail rules (report-first, then gate)
5. Reporting contract

## Core Commands (Command Language)

- `@dapei init workspace`
- `@dapei create feature <name> --repos <repo1,repo2,...>`
- `@dapei run workflow <feature> --stage <stage-name>`
- `@dapei report feature <name>`

Detailed command contracts are defined in:

- `/.dapei/commands.yaml`

## Directory Model

- `workspace/`: runtime engineering workspace root
- `workspace/codebase/`: source-of-truth repos (long-lived)
- `workspace/features/`: isolated feature workspaces (agent working area)
- `docs/`: long-term knowledge assets
- `dos/`: engineering operating rules and templates
- `.dapei/`: machine-readable OS metadata and runtime contracts

## Quick Start

1. Prepare `workspace/codebase/*` repositories.
2. Fill `/.dapei/workspace.yaml` for your environment.
3. Create a feature by contract in `/.dapei/commands.yaml`.
4. Execute workflow stages defined in `/.dapei/workflows/feature-lifecycle.yaml`.
5. Persist decisions/risks and output reports in feature workspace.

## CLI (v0.1)

Use:

- `./scripts/dapei init workspace`
- `./scripts/dapei create feature payment-refactor --repos mall-payment,mall-order --objective "stabilize callback flow"`
- `./scripts/dapei run workflow payment-refactor --stage implementation`
- `./scripts/dapei report feature payment-refactor`
- `./scripts/dapei-guardrail payment-refactor`

When creating a feature, if a repo is missing in `workspace/codebase`, CLI will:

1. Ask whether to clone.
2. Ask remote Git URL.
3. Support auth modes: token / username+password / default git prompt.

## Design Reference

- `DESIGN.md`
