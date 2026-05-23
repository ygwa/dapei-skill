# Agents Guide

This repository builds `dapei.skill`, an AI Native Engineering Context OS.

The most important rule: **users should experience dapei through AI conversation and loaded skills, not by learning the internal shell scripts.**

## Product Boundary

`dapei` has two layers:

1. **User-facing skill layer**
   - Entry: `@dapei ...`
   - Source of behavior: `SKILL.md` (repository root)
   - User experience: natural language intent, stage confirmation, structured reports.

2. **Internal deterministic execution layer**
   - Entry for Agent/tooling: `scripts/dapei`
   - Modules: `engine/*`, `packages/core/*`, `packages/router/*`, `packages/runtime-adapters/*`
   - Purpose: repeatable filesystem, Git, context, workflow, validation, and report operations.

Do not present `scripts/dapei ...` as the primary user workflow. Document scripts for maintainers, smoke tests, and debugging only — ordinary usage should start with `@dapei`.

## User Interaction Rules

When describing usage, prefer examples like:

```
@dapei initialize the current project workspace
```

```
@dapei create feature payment-refactor, goal is to stabilize payment callback链路, involves mall-payment, mall-order.
start with current state and gap analysis, pause for confirmation before technical design
```

Avoid making the user memorize commands like:

```bash
./scripts/dapei create feature ...
```

If a script command is mentioned, frame it as:

- Agent internal execution
- maintainer/debug command
- CI/smoke test command

## Workspace Contract

The target runtime workspace uses root-level directories:

```
repos/
docs/
features/
```

Do not introduce a nested `workspace/` runtime root. Historical `workspace/` samples may exist only as fixtures or migration references.

## Feature Contract

Feature work belongs under:

```
features/<feature>/
```

Code changes for a feature must go through mapped repositories under:

```
features/<feature>/repos/<repo>
```

Feature docs, context, memory, tasks, tests, reports, and artifacts should stay inside the feature workspace unless the feature is being closed out and accepted knowledge is being written back to `docs/`.

## Agent Workflow

For a user request, the Agent should:

1. Interpret the user's intent.
2. Read `SKILL.md` at repository root.
3. Read relevant `docs/`, `.dapei/`, and feature context.
4. Use internal scripts only when deterministic state changes are needed.
5. Keep user-facing responses in terms of engineering outcomes, not shell commands.
6. Pause for confirmation before `solution-design`, `implementation`, and `acceptance` unless the user explicitly asks to continue.
7. Report each stage using `Conclusion / Risk / Needs Confirmation / Next Steps`.

## Documentation Rules

README should explain:

- What dapei is.
- How users invoke it through AI skills.
- The workspace, docs, repos, and feature model.
- Architecture and internal execution layers.
- Current status and roadmap.

README should not imply that normal users operate dapei by manually running shell commands.

When documenting internal commands, place them under headings like:

- Agent internal execution layer
- Skill developer reference
- CI and smoke testing

## Roadmap Discipline

Keep future plans aligned with the product loop:

```
repos/ reverse analysis
→ docs/ durable knowledge
→ features/ requirement execution
→ validation and review
→ docs/ closeout backfill
```

Prioritize in this order:

1. P0: make the modular platform complete, committed, and smoke-tested.
2. P1: repos-to-docs bootstrap.
3. P1: stage-aware context engineering.
4. P1: real feature planning and design generation.
5. P1: validation, test strategy, and guardrail engine.
6. P2: worktree isolation, richer reporting, and feature closeout.
7. P3: natural-language routing and external adapters.

## Tone

Use precise product language:

- "Agent calls internal scripts"
- "User invokes dapei through `@dapei`"
- "Scripts are deterministic execution helpers"
- "Docs are durable knowledge"
- "Feature is the execution unit"

Avoid language that makes dapei sound like a CLI-first tool.
