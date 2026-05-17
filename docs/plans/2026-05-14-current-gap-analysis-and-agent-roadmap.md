# dapei.skill Current Gap Analysis and Agent Roadmap

Date: 2026-05-14

## Purpose

This document compares the current repository implementation with the target workflow shown in the 2026-05-13 dapei.skill planning image.

It is written for future coding agents. Use it as the development roadmap before implementing new `dapei.skill` capabilities.

## Executive Summary

The repository currently implements a runnable v0.1 Context OS skeleton:

- Workspace and feature directory contracts exist.
- `scripts/dapei` supports workspace init, feature creation, codebase add/sync/list, workflow checkpointing, feature report generation, feature review, and feature status.
- `.dapei` contains command contracts, feature lifecycle DAG, workspace metadata, schemas, and simple guardrail rule definitions.
- A sample feature workspace exists at `workspace/features/payment-refactor`.
- Basic Claude/Cursor skill/rule files exist.

The planning image describes a fuller AI Native Engineering workflow:

- Natural-language command routing.
- Current-state analysis and gap analysis documents.
- Business, technical, task, acceptance, and architecture design documents.
- Context injection into an AI execution loop.
- Feature memory, decision logs, risk tracking, timeline, reports, tests, and task management.
- Multi-layer capability model from Git/files/search/context execution up to governance.
- Runtime integrations with IDEs, Claude Code, MCP servers, CI/CD, GitHub/GitLab, knowledge base, and notifications.

The largest gap is that current implementation records structures and reports, but does not yet perform real analysis, context assembly, stage validation, task execution orchestration, or enforceable quality gates.

## Source Baseline

Current repository evidence:

- `README.md`: Defines v0.1 scope and CLI commands.
- `DESIGN.md`: Defines architecture layers and context layering protocol.
- `.dapei/commands.yaml`: Defines command contracts.
- `.dapei/workflows/feature-lifecycle.yaml`: Defines feature lifecycle DAG.
- `.dapei/workspace.yaml`: Defines layered context sources and agent profiles.
- `.dapei/rules/*.yaml`: Defines report-mode guardrail rule specs.
- `scripts/dapei`: Implements CLI skeleton and basic Git/file operations.
- `scripts/dapei-guardrail`: Implements a small hardcoded guardrail report.
- `runtime/templates/*`: Provides minimal feature and agent templates.
- `workspace/features/payment-refactor/*`: Provides a sample feature workspace.

Planning image target areas:

- End-to-end workflow: initialize workspace, create feature, analyze current state, design solution, implement, validate locally, report and archive.
- Directory model: `workspace/codebase`, `docs`, `runtime`, `features`, `.dapei`, `skills`, `reports`.
- Feature workspace: `repos`, numbered `docs`, `context`, `memory`, `tests`, `reports`, `tasks`, `agents.md`.
- Capability layers: foundation, workspace, feature, engineering, governance.
- Context injection and AI execution loop.
- Integration ecosystem: natural language entrance, CLI, IDEs, Claude Code, MCP, runtime services, GitHub/GitLab, CI/CD, knowledge base, notifications.

## Gap Matrix

| Area | Target From Planning Image | Current Implementation | Gap | Priority |
| --- | --- | --- | --- | --- |
| Natural-language entry | `@dapei init workspace`, `@dapei create payment feature`, `@dapei analyze current-state`, `@dapei implement feature`, `@dapei daily report` | Bash CLI accepts exact command tokens and optional `@dapei` prefix | No intent parser, alias mapping, Chinese command mapping, or command disambiguation | P1 |
| Workspace initialization | Connect/manage Git repos, sync codebase, initialize docs and runtime assets, configure global context | `init workspace` creates directories and requires `.dapei/workspace.yaml` | Does not generate missing baseline files, validate full structure, or emit workspace report | P1 |
| Codebase registry | Real source library under `workspace/codebase` | `codebase add/sync/list` exists and writes `.dapei/codebases.yaml` | Registry writes raw YAML with limited validation; no repo health, default branch freshness, auth profile, or multi-repo sync | P2 |
| Feature creation | Select related repos, create branch from master, create feature workspace, inject initial context | `create feature` creates dirs, symlinks repos, branches, `feature.yaml`, placeholders | Feature manifest currently writes version `0.2` while sample uses `0.1`; no global feature index; no post-create context interview; no doc templates for numbered design docs | P1 |
| Current-state analysis | Code search, architecture scan, dependency and impact analysis, current-state docs | Lifecycle YAML names stages; CLI only appends checkpoint | No analyzer that scans repos or writes `01-current-state.md`; no dependency graph; no impact report | P1 |
| Gap analysis | Gap document, business gap, technical gap, task candidates | Stage name exists | No `02-gap-analysis.md` template or generation logic | P1 |
| Solution design | Business design, technical design, task breakdown and timeline | Some memory/task files exist | No `03-business-design.md`, `04-technical-design.md`, `05-task-breakdown.md`, `06-acceptance.md` generation workflow | P1 |
| Implementation | Terminal implementation, architectural constraints, real-time context injection, decision/risk records | Agents are described in `agents.md`; CLI does not execute tasks | No agent task runner, no context pack builder, no implementation log, no decision/risk prompting | P1 |
| Local validation | Function verification, unit/integration tests, architecture constraint checks, quality gate | Guardrail script checks a few files/folder names | No test command registry, no validation report, no architecture drift detector, no blocking mode | P1 |
| Reporting | Daily progress, commit summary, architecture drift, knowledge archive | `report feature` emits daily and architecture stub; `review feature` lists commits | Reports are mostly placeholders; no aggregation from tasks, tests, risks, decisions, open questions, or guardrail findings | P2 |
| Feature memory | decision-log, tradeoff, risk, open questions, timeline | `memory/*` files exist | Memory files have no schema, append protocol, or automatic update hooks | P2 |
| Capability layering | L1 Git/files/search/context/execution/integration; L2 workspace lifecycle, mapping, templates, knowledge index; L3 feature lifecycle/context/branch/memory; L4 analysis/design/implementation/verification; L5 governance | Design describes layers conceptually; workspace YAML lists context layers | No capability registry, no capability checks, no runtime service boundary, no extensible plugin API | P2 |
| AI execution loop | Load global/domain/repo/feature context, plan tasks, generate code, validate, update memory | Workspace YAML declares context sources | No `context build` command, no ordered context bundle, no token budget, no provenance, no per-stage context profile | P1 |
| Governance | DDD/layer/boundary, hallucination/context audit, code quality/risk, compliance/security | Rule YAML files exist | Rules are declarative but not interpreted except a few hardcoded checks | P1 |
| Tool ecosystem | GitHub/GitLab, CI/CD, knowledge base, notification system, IDEs, Claude Code, MCP | Minimal Claude/Cursor local files | No integration contracts or adapters | P3 |
| Documentation depth | docs/business, docs/domain, docs/architecture, docs/standards, docs/decisions, docs/workflows, `agents.md` | Only decisions/glossary/workflows and planning docs exist | Missing knowledge base skeleton and authoring templates | P2 |
| Tests | Feature `tests/` and acceptance artifacts | Feature creates `tests/regression`; no repo-level tests | No automated tests for CLI, guardrails, schema validation, or workflows | P1 |

## Recommended Target Directory Contract

Future agents should converge feature workspaces to this structure:

```text
workspace/features/<feature>/
├── feature.yaml
├── repos/
│   └── <repo> -> ../../../codebase/<repo>
├── docs/
│   ├── 01-current-state.md
│   ├── 02-gap-analysis.md
│   ├── 03-business-design.md
│   ├── 04-technical-design.md
│   ├── 05-task-breakdown.md
│   └── 06-acceptance.md
├── context/
│   ├── business-context.md
│   ├── architecture-context.md
│   ├── repo-context.md
│   ├── feature-context.md
│   └── constraints.md
├── memory/
│   ├── decision-log.md
│   ├── tradeoff.md
│   ├── risk.md
│   ├── open-questions.md
│   └── timeline.md
├── tests/
│   ├── test-plan.md
│   └── regression/
├── reports/
│   ├── daily-report.md
│   ├── feature-progress.md
│   ├── architecture-review.md
│   ├── guardrail-report.md
│   └── acceptance-report.md
├── tasks/
│   ├── backlog.md
│   └── plan.md
└── agents.md
```

Compatibility note: current implementation uses `memory/decisions.md` and `memory/risks.md`. Either migrate to the image names (`decision-log.md`, `risk.md`) or support aliases during transition.

## Development Roadmap

### Phase 1: Make The Lifecycle Real

Goal: turn the current stage checkpoint skeleton into document-producing workflow commands.

Tasks:

1. Add stage-specific commands or extend `run workflow` to dispatch by stage.
2. Add templates for `docs/01-current-state.md` through `docs/06-acceptance.md`.
3. Update `create feature` to create those numbered docs from templates.
4. Add stage completion checks: required input files, required output files, and previous-stage dependency validation.
5. Add `reports/implementation-log.md`, `reports/validation-report.md`, and `reports/test-report.md` outputs.
6. Normalize feature manifest version: choose `0.2` and update sample/template/schema references, or keep `0.1` until migration is complete.

Acceptance criteria:

- `./scripts/dapei create feature <name> --repos <repo> --objective "..."` creates the target feature directory contract.
- `./scripts/dapei run workflow <name> --stage analyze-current-state` writes or validates `docs/01-current-state.md`.
- Invalid stage order fails with an actionable error.
- Existing sample feature can be migrated or remains backwards-compatible.

### Phase 2: Context Builder And Agent Handoff

Goal: make context injection explicit, auditable, and reusable by Agents.

Tasks:

1. Add `./scripts/dapei context build <feature> --stage <stage>`.
2. Read `.dapei/workspace.yaml` context layers in priority order.
3. Resolve `<feature>` placeholders and repo symlinks.
4. Produce `workspace/features/<feature>/context/runtime-context.md` or `context-pack.md`.
5. Include provenance: source file, layer, priority, merge policy, and included sections.
6. Add a compact `agents.md` generation template that points agents to the correct stage inputs/outputs.

Acceptance criteria:

- Context pack contains global, workspace, domain, repo, feature, and runtime sections when sources exist.
- Missing context sources are reported but do not crash unless the stage declares them required.
- Agents can start from `agents.md` plus `context/runtime-context.md` without rediscovering the whole repo.

### Phase 3: Current-State And Gap Analysis

Goal: support the image's analysis capability with concrete repo scanning.

Tasks:

1. Add repo scanner helpers for file tree, language/framework detection, dependency files, test commands, and package/module boundaries.
2. Add code search summaries for feature-related keywords from objective/context.
3. Generate `docs/01-current-state.md` with touched repos, likely modules, dependencies, existing tests, and unknowns.
4. Generate `docs/02-gap-analysis.md` with missing behavior, architectural risks, test gaps, and open questions.
5. Append major unknowns to `memory/open-questions.md`.

Acceptance criteria:

- Analysis works for at least one repo symlink in `repos/`.
- Reports distinguish evidence from inference.
- The output gives an implementer enough context to begin design without rereading every file.

### Phase 4: Guardrails As An Engine

Goal: interpret `.dapei/rules/*.yaml` instead of hardcoding a few checks.

Tasks:

1. Implement a rule runner that loads rule YAML files.
2. Support check types already declared: `path-deny`, `file-required`, `evidence-required`, `glossary-match`, `folder-name-regex`.
3. Add mode support: `report` and `gate`.
4. Add severity and exit-code policy.
5. Include guardrail findings in daily report and architecture review.
6. Add tests for rule interpretation.

Acceptance criteria:

- `./scripts/dapei-guardrail <feature>` evaluates all rules in `.dapei/rules`.
- Gate mode blocks high-severity failures.
- Report format includes rule id, severity, evidence, and remediation.

### Phase 5: Local Validation And Quality Gates

Goal: make the local acceptance step reliable.

Tasks:

1. Add `test_commands` to repo metadata or feature manifest.
2. Add `./scripts/dapei validate feature <name>`.
3. Run configured unit/integration/lint commands per mapped repo.
4. Write `reports/test-report.md` and `reports/validation-report.md`.
5. Add acceptance checklist validation against `docs/06-acceptance.md`.
6. Add architecture drift summary from guardrails plus changed files.

Acceptance criteria:

- Validation reports command, cwd, exit code, duration, and important output summary.
- Failed tests are visible in daily report.
- Acceptance cannot pass while high-severity guardrails fail in gate mode.

### Phase 6: Reporting And Knowledge Archival

Goal: make report generation useful for humans and future Agents.

Tasks:

1. Upgrade `report feature` to aggregate progress, commits, changed files, tests, risks, open questions, decisions, and guardrails.
2. Add `./scripts/dapei archive feature <name>` for completed features.
3. Write final summaries to `reports/acceptance-report.md` and optionally workspace-level `docs/decisions`.
4. Add daily report date ranges and previous-report tracking.
5. Add knowledge index update hooks for glossary/decisions/workflows.

Acceptance criteria:

- Daily report is actionable without opening all feature files.
- Archive preserves final decisions, risks, and accepted design.
- Report generation is idempotent or clearly appends dated sections.

### Phase 7: Integration Ecosystem

Goal: prepare for the runtime and tool ecosystem shown in the planning image.

Tasks:

1. Define adapter contracts for GitHub/GitLab, CI/CD, IDE, Claude Code, MCP, knowledge base, and notifications.
2. Add `.dapei/integrations.yaml` with disabled-by-default integration slots.
3. Add `./scripts/dapei integrations list` and `check`.
4. Add MCP/tool invocation guidelines to `docs/workflows/ai-sdlc.md` and `agents.md` templates.
5. Keep integrations optional so the local CLI remains runnable without network access.

Acceptance criteria:

- A local-only workflow still works.
- Integration availability is discoverable.
- Future agents know where to add adapters without coupling them to core workflow logic.

## Concrete Backlog For Future Agents

Use these as issue-sized tasks.

| ID | Task | Files Likely Touched | Depends On | Acceptance |
| --- | --- | --- | --- | --- |
| DAP-001 | Normalize feature manifest version and migration policy | `.dapei/feature*.schema.yaml`, `runtime/templates/feature.yaml.template`, `scripts/dapei`, sample feature | none | New and sample features validate against one chosen schema |
| DAP-002 | Add numbered feature doc templates | `runtime/templates`, `scripts/dapei` | DAP-001 | New feature contains `docs/01` to `docs/06` |
| DAP-003 | Implement stage output validation | `.dapei/workflows/feature-lifecycle.yaml`, `scripts/dapei` | DAP-002 | Running a stage checks required prior outputs |
| DAP-004 | Add context build command | `scripts/dapei`, `.dapei/workspace.yaml`, `runtime/templates/agents.feature.md.template` | DAP-003 | `context/runtime-context.md` is generated with provenance |
| DAP-005 | Implement repo current-state scanner | `scripts/dapei` or `scripts/dapei-analyze`, feature docs | DAP-004 | `01-current-state.md` includes repo evidence and unknowns |
| DAP-006 | Implement gap-analysis generator | `scripts/dapei` or `scripts/dapei-analyze`, feature docs | DAP-005 | `02-gap-analysis.md` summarizes gaps and risks |
| DAP-007 | Replace hardcoded guardrail checks with YAML rule runner | `scripts/dapei-guardrail`, `.dapei/rules`, tests | DAP-001 | All declared rules are evaluated |
| DAP-008 | Add validation command and test report | `scripts/dapei`, feature reports | DAP-007 | Configured test commands produce `test-report.md` |
| DAP-009 | Upgrade daily report aggregation | `scripts/dapei`, report templates | DAP-008 | Daily report includes commits, tests, risks, decisions, guardrails |
| DAP-010 | Add integration registry | `.dapei/integrations.yaml`, `scripts/dapei`, docs | DAP-009 | Integrations are discoverable and optional |
| DAP-011 | Add CLI regression tests | `tests/`, `scripts/` | DAP-001 | Core commands covered by automated tests |
| DAP-012 | Expand skill instructions for agents | `.agents/skills/dapei-skill/SKILL.md`, `.claude/skills/dapei-skill/SKILL.md`, `runtime/templates/agents.feature.md.template` | DAP-004 | Agents are instructed to use staged docs/context/memory consistently |

## Agent Implementation Rules

Future agents should follow these rules when working from this roadmap:

1. Preserve local-first operation. Do not require network services for the core lifecycle.
2. Prefer small, composable shell commands over a monolithic script expansion. If `scripts/dapei` grows too large, extract helpers under `scripts/lib/`.
3. Keep compatibility with existing feature workspaces unless a migration command is added.
4. Do not silently overwrite human-written feature docs. Generate missing files and append dated sections when updating existing files.
5. Every generated analysis document must separate evidence, inference, risks, and open questions.
6. Every command that changes feature state should update `reports/feature-progress.md` or `memory/timeline.md`.
7. Guardrails should start in report mode and only block when `gate` mode is explicitly enabled.
8. Prefer schema validation before running workflow stages.
9. All new CLI behavior needs a test or a scripted smoke check.
10. Keep natural-language routing as a thin layer over deterministic commands.

## Suggested Next Agent Prompt

Use this prompt to start the next implementation agent:

```text
You are implementing dapei.skill according to docs/plans/2026-05-14-current-gap-analysis-and-agent-roadmap.md.
Start with Phase 1. Do not change unrelated files. Preserve backwards compatibility with existing workspace/features/payment-refactor.
Implement DAP-001, DAP-002, and DAP-003, then run a smoke test by creating a temporary feature workspace or using a safe fixture.
Update the roadmap checklist or add a short implementation note when done.
```

## Open Decisions

- Should the canonical feature manifest version be `0.1` or `0.2`? Current code writes `0.2`, but the sample feature and original schema still show `0.1`.
- Should feature memory files use image names (`decision-log.md`, `risk.md`) or current repo names (`decisions.md`, `risks.md`)?
- Should the CLI remain Bash-only, or should analysis/rule execution move to a more structured runtime such as Python or Node?
- Should feature branches be created directly in `workspace/codebase` repos, or should future versions use Git worktrees for stronger isolation?
- What is the minimum supported integration surface for v0.2: GitHub only, or GitHub plus CI plus notifications?
