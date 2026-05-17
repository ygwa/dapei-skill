# dapei.skill Modular Refactor

Date: 2026-05-15

## Goal

Refactor `dapei.skill` from a monolithic CLI skeleton into a modular local execution platform that can support the target AI Native Engineering workflow:

1. Workspace initialization.
2. Codebase ingestion and reverse analysis.
3. Feature workspace creation.
4. Dynamic context engineering.
5. Lifecycle stage orchestration.
6. Implementation support.
7. Review and daily reporting.
8. Test plan and repeatable validation.
9. Validation report generation.
10. Feature closeout and docs maintenance.

## New Execution Shape

The CLI entrypoint is intentionally thin:

```text
scripts/dapei
```

Reusable behavior now lives in:

```text
scripts/lib/core.sh
scripts/commands/workspace.sh
scripts/commands/codebase.sh
scripts/commands/feature.sh
scripts/commands/context.sh
scripts/commands/workflow.sh
scripts/commands/validation.sh
scripts/commands/report.sh
```

This makes future growth additive. New analyzers, validators, report writers, and adapters can be added as modules instead of expanding one large script.

## Added Capabilities

### Codebase Analysis

```bash
dapei codebase analyze <name|--all>
```

Outputs:

- `docs/as-is/repo-inventory.md`
- `docs/architecture/technical-current-state.md`

The first implementation detects repository stack, branch, revision, likely test commands, and top-level evidence. It is intentionally evidence-first and leaves deeper architecture inference to later analyzers.

### Context Builder

```bash
dapei context build <feature> --stage <stage>
```

Outputs:

- `features/<feature>/context/runtime-context.md`

The context bundle follows the layered protocol:

1. global
2. workspace
3. domain
4. repo
5. feature
6. runtime

Each included source is labeled with its layer and provenance.

### Feature Validation

```bash
dapei validate feature <name>
```

Outputs:

- `features/<feature>/reports/test-report.md`
- `features/<feature>/reports/validation-report.md`

The first implementation auto-detects common local test commands from repository files and records command output, cwd, exit code, and guardrail status.

## Compatibility

Existing commands remain available:

- `dapei init workspace`
- `dapei codebase add`
- `dapei codebase sync`
- `dapei codebase list`
- `dapei create feature`
- `dapei run workflow`
- `dapei review feature`
- `dapei report feature`
- `dapei status feature`

The runtime contract continues to converge on root-level:

```text
codebase/
docs/
features/
```

Historical `workspace/` fixtures may remain in this repository for development references, but they are not the target user workspace contract.

## Remaining Work

- Replace the hardcoded guardrail script with a YAML rule engine.
- Add Git worktree isolation mode for concurrent features touching the same repo.
- Add a closeout/archive command that writes accepted feature knowledge back to `docs/`.
- Add richer codebase analyzers for routes, APIs, DB schema, queues, domain models, and dependency graphs.
- Add test command registry support in `.dapei/codebases.yaml` and `feature.yaml`.
