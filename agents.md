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

### Knowledge Boundary & Dimension Rules

To maintain cognitive consistency, the AI must understand two distinct dimensions:

1. **Feature Dimension (Local isolated design and tasks)**:
   - When executing tasks or writing code/designs for a feature, all information must remain strictly inside `features/<feature>/`.
   - AI must NOT directly edit global workspace folders like `docs/as-is/behavior/`, `docs/as-is/state-machines/`, `docs/architecture/`, or `.dapei/`.
   - Local decisions, designs, risks, and artifacts are written to `features/<feature>/memory/`, `features/<feature>/docs/`, `features/<feature>/artifacts/`.
   - The runtime context header (`runtime-context.md`) explicitly reminds the AI of this boundary.

2. **Workspace Dimension (Global durable knowledge)**:
   - Modifications to global repository documents or the global cognitive index should ONLY happen during the feature closeout stage (`feature.close`) or explicit workspace indexing commands.
   - When a feature is close/archived, the agent backfills verified changes (decisions, behavioral models, state machine transitions) to the global workspace `docs/` and re-indexes the cognitive catalog.

#### How Context Injection Works

On `feature.create`:
- The system automatically loads the global cognitive index.
- Behaviors and state machines matching the specified `repos` or keywords in `objective` are injected into `features/<feature>/context/related-cognitive-context.md`.
- `features/<feature>/docs/01-current-state.md` includes a reference to this file.
- `features/<feature>/context/repo-context.md` links to the related cognitive context.

On `context.build`:
- The generated `runtime-context.md` includes a clear header at the top:
  - Current Workspace Name and path
  - Current Feature Name and active stage
  - Explicit rules telling the AI: "You are in the Feature Dimension. Do NOT edit global files. Merge back to workspace only on feature close."
- This ensures the AI always knows which dimension it is operating in.

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

## Cognitive Discovery Runtime (CDR)

CDR is the **L3 process-asset layer** that sits between `repos/` (raw code) and `features/` (requirement execution). It is implemented, not proposed. Owner: `feature/cdr-runtime`.

| Layer | What it answers | Where it lives | How it is produced |
| --- | --- | --- | --- |
| L0 — Profile | "What is this repo, technically?" | `docs/as-is/profiles/<repo>.yaml` | `cdr.profile` (deterministic) |
| L2 — Entries | "What are the entry points worth deep-diving?" | `docs/as-is/entries/<repo>.yaml` | `cdr.entries.prepare` (heuristic) + `cdr.entries.confirm` (Agent) |
| L3 — Behavior | "What does this endpoint actually do, end to end?" | `docs/as-is/behavior/<id>.yaml` | `cdr.behavior.upsert` (Agent reads code, engine validates evidence) |
| L3 — State machine | "What states can `<entity>` be in, and what transitions?" | `docs/as-is/state-machines/<entity>.yaml` | `cdr.state.derive` (inference draft) + Agent confirmation |
| L2 — Domain | "Which behaviors cluster into a domain?" | `docs/as-is/domains/<domain>.yaml` | `cdr.domain.compose` (P1: `derived_from` required) |
| L1 — Capability map | "How do domains map to product value streams?" | `docs/as-is/capabilities/product-map.yaml` | `cdr.capability.map.init` |

### P1 Red Lines (enforced by the engine, not the Agent)

| Rule | Why |
| --- | --- |
| `domain` artifacts MUST carry `derived_from: [behavior-id, …]` | Prevents naming domains from package names alone |
| `behavior` with `kind: fact` MUST carry `sources[]` (file/line/symbol_handle/repo) | Forces the Agent to point at evidence, not guess |
| `behavior` with `kind: inference` MUST carry `derived_from[]` | Surfaces the chain of reasoning |
| `behavior` with `kind: unknown` MUST carry `reason` | Distinguishes "not yet investigated" from "ignored" |

### Cross-package split

CDR is implemented across three packages, each with one responsibility:

| Package | Responsibility | Public surface |
| --- | --- | --- |
| `packages/core` | All atomic capabilities, evidence validation, cognitive index, router | `runCapability(id, input, ctx)` |
| `packages/router` | NL intent → capability mapping, extractor functions | `routeIntent(text, ctx)` |
| `packages/doc-gen` | VitePress portal generation + Vue 3 components | `cdr.doc.generate` capability |

`packages/doc-gen/` is intentionally a **separate workspace package** so the VitePress + Vue dependency footprint does not pollute the core engine. The portal is generated to `<workspace>/.dapei/docs-portal/` (workspace-dimension, not feature-dimension).

### Boundary with Feature dimension

CDR writes only to **workspace-dimension** paths (`docs/as-is/*`, `.dapei/cognitive/*`, `.dapei/docs-portal/`). It never writes into `features/<feature>/`. The Agent working in a feature workspace reads CDR outputs as read-only context via `context.build` (injected into `features/<feature>/context/related-cognitive-context.md`).

---

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
2. P1: **Cognitive Runtime Phase 1** — behavior facts, evidence system, cognitive index. **Shipped in 2.2.0.**
3. P1: **Cognitive Runtime Phase 2** — state transition layer, inconsistency detection.
4. P1: **Cognitive Discovery Runtime v0.1** — `cdr.profile` / `cdr.entries.*` / `cdr.behavior.upsert` / `cdr.state.derive` / `cdr.domain.compose` / `cdr.capability.map.init` / `cdr.doc.generate` / `cdr.index.list`. **Shipped on `feature/cdr-runtime` (awaiting merge to main).**
5. P1: repos-to-docs bootstrap with Agent-driven deep analysis.
6. P1: stage-aware context engineering with cognitive summaries.
7. P1: real feature planning and design generation.
8. P1: validation, test strategy, and guardrail engine.
9. P2: semantic clustering → domain discovery (no forced DDD).
10. P2: worktree isolation, richer reporting, and feature closeout.
11. P2: CodeGraph substrate integration (proposed in `docs/cdr-architecture.md`).
12. P3: cognitive graph, dynamic context budget, external adapters.

## Tone

Use precise product language:

- "Agent calls internal scripts"
- "User invokes dapei through `@dapei`"
- "Scripts are deterministic execution helpers"
- "Docs are durable knowledge"
- "Feature is the execution unit"

Avoid language that makes dapei sound like a CLI-first tool.
