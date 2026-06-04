# dapei.skill

[![CI](https://github.com/ygwa/dapei-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/ygwa/dapei-skill/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/ygwa/dapei-skill)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/ygwa/dapei-skill?style=social)](https://github.com/ygwa/dapei-skill/stargazers)

An AI Native Engineering Context OS that emerged from real project work — a set of practices developed through long-term collaboration between engineers and AI.

No silver bullet. Many ideas are simple. But they've genuinely helped reduce real problems:

- AI context that drifts over time
- Requirement misalignment
- Architecture that gradually goes off the rails
- Specs that grow endlessly but no one reads
- Context collapse under multi-agent collaboration

This is a collection of those experiences, packaged as a skill for AI agents to help others avoid the same pitfalls.

---

## Requirements

| | |
| --- | --- |
| **Node.js** | `>= 22.6.0` (needed for `--experimental-strip-types` on the engine) |
| **Git** | recent version with worktree support (Git 2.20+) |
| **AI tool** | any that loads skills from a known path: Claude Code, Cursor, Copilot, Windsurf, … |
| **OS** | macOS, Linux, or WSL2. Native Windows is not tested. |

> A Vercel-Skills-compatible install (Option 1 below) handles the AI tool
> integration automatically; if you go the manual route, the
> `scripts/sync-local-skills.sh` helper covers Claude Code, Cursor, and
> Agent Shell.

---

## Getting Started

No commands to memorize. Just talk to your AI:

```
@dapei initialize the current project workspace
```

```
@dapei add mall-payment and mall-order, then analyze the current technical state
```

```
@dapei create feature payment-refactor
goal: stabilize payment callback链路, reduce order state inconsistency risk
scope: mall-payment, mall-order
constraints: preserve existing API compatibility, canary deploy this week
acceptance: idempotent callbacks, order state converges within 30s, regression tests added
start with current state analysis, pause for confirmation before technical design
```

```
@dapei review payment-refactor changes today, focus on architecture drift and test gaps
```

The AI handles reading context, writing docs, maintaining feature state, and reports back with `Conclusion / Risk / Needs Confirmation / Next Steps`.

---

## How It Works

The full process we actually use — not theory, but lessons learned through real execution.

### Engine Architecture (v2.2 — Cognitive Runtime)

- Skill Router layer: user still invokes `@dapei ...`
- **Cognitive Runtime layer**: Agent-driven behavior analysis with structured YAML artifacts and evidence validation (`cognitive.discover`, `cognitive.artifact.upsert`, …)
- Atomic Capability layer: `dapei-engine` executes typed capabilities such as `workspace.init`, `repos.analyze`, `workflow.runStage`
- Runtime substrate layer: worktree/filesystem/git remains the deterministic source of truth

North Star: **让 AI 持续参与系统认知** — understand how systems behave, how state changes, and how risks propagate — not just generate code.

The internal shell entrypoint `scripts/dapei` is now only a thin adapter that forwards to the Node.js/TypeScript engine for backward compatibility. Execution logic lives in `engine/` and `packages/*` only.

#### Cognitive Runtime (v2.2)

> The 2.2 release adds durable **cognitive memory** for the AI: structured
> YAML artifacts that capture what the system *does*, not just what it
> *contains*.

The Cognitive Runtime layer sits on top of the regular `repos.analyze` flow
and produces three kinds of evidence-backed artifacts:

| Artifact | Where it lives | What it answers |
| --- | --- | --- |
| Behavior | `docs/as-is/behavior/*.yaml` | "What does this endpoint actually do, end to end?" |
| State machine | `docs/as-is/state-machines/*.yaml` | "What states can `<entity>` be in, and what transitions between them?" |
| Evidence block | inside every artifact | "Is this fact, an inference, or unknown?" |

Each artifact is created by the AI itself (not by a grep pre-scan) and must
pass schema validation plus an evidence-quality check. The agent reads the
code, drafts the artifact, the engine validates it, and the agent revises
until it passes. Discoveries and the running index live in
`.dapei/cognitive/index.yaml`.

##### How to invoke

```
@dapei analyze behavior for sample-app, start with API discovery then deep-dive top endpoints
```

```
@dapei analyze state for Order — derive from order-create, order-cancel, order-refund behavior
```

```
@dapei cognitive list              # see all artifacts and the index
@dapei cognitive validate <file>   # re-run schema + evidence check
```

Once an artifact exists, every subsequent `@dapei` request can reference it
by name instead of re-reading the source — so a "what does checkout do?"
question three months from now takes seconds, not minutes.

##### Why this matters

Without cognitive artifacts, the agent re-derives everything from code on
every session. With them, the second session in a new feature inherits the
analysis of the first. The cost reduction is real, and so is the
consistency gain: two agents answering the same question give the same
answer because they are both reading the same artifact, not their own
re-derivation.

### Step 1: Establish Your Context

Before any requirement, let the AI understand your repos:

```
@dapei add mall-payment and mall-order, then analyze the current technical state
```

The AI extracts technical stack, module boundaries, APIs, databases, message queues, and dependencies — writing them to `docs/as-is/` and `docs/architecture/`. For behavior-level understanding, use:

```
@dapei analyze behavior for sample-app, start with API discovery then deep-dive top endpoints
```

This produces evidence-backed behavior artifacts under `docs/as-is/behavior/` — durable cognitive memory so every new requirement starts from a clear foundation instead of re-reading code from scratch.

### Step 2: Create an Isolated Workspace for the Requirement

```
@dapei create feature payment-refactor
goal: stabilize payment callback链路, reduce order state inconsistency risk
scope: mall-payment, mall-order
```

This creates an isolated space under `features/payment-refactor/`, with `mall-payment` and `mall-order` mapped via worktrees. The AI works within this space without affecting other parts of the repos.

Each feature workspace contains:

- `repos/` — mapped repos
- `docs/01-06` — current state / gap analysis / business design / technical design / task breakdown / acceptance
- `context/` — stage-specific context bundles generated by AI
- `memory/` — decisions, risks, open questions
- `reports/` — progress, review, and validation reports

### Step 3: End-to-End Design and Research

The AI advances through the feature workspace in stages:

```
analyze-current-state → gap-analysis → solution-design → task-breakdown → implementation → local-validation → architecture-review → acceptance
```

At each critical node (technical design, implementation, acceptance), the AI pauses for your confirmation rather than bulldozing through.

During this process, the AI continuously pulls context from `docs/` and `repos/`, filling the feature's documents with:

- Which areas of the current repos are likely to cause problems
- Why the existing architecture leads to issues in this requirement
- Which modules, interfaces, and boundaries the changes touch

### Step 4: Implement Across Multiple Repositories

Once the design is confirmed, the AI works in the corresponding repos under `features/payment-refactor/repos/`. Each repo has its own feature branch (e.g., `feature/payment-refactor`), with changes isolated there.

Because the feature workspace provides complete context, the AI always knows when reviewing diffs or making decisions:

- Where this change sits in the overall requirement
- What other repos in this feature have changed
- Current implementation progress and risk points

### Step 5: Validate

After implementation, the AI generates test cases based on the requirement understanding, then runs local validation:

- API tests: curl calls to locally running services
- Browser tests: agent-browser automation
- Regression tests: run test suites on relevant modules

When infrastructure is weak (e.g., some backend services are hard for AI to invoke directly), we typically:

- Use stubs/mocks for external systems
- Event replay for event-driven consumers
- Build temporary test tokens

This produces `reports/test-report.md` and `reports/validation-report.md`.

### Step 6: Close the Loop

Once the requirement passes validation, the AI syncs the development content back to `docs/`:

- Did business rules change?
- Has the architecture drifted?
- Which decisions need to be recorded?
- Which risks need updates?

So the next requirement starts with the latest context.

---

## Core Concepts

### Workspace

A product or business domain's engineering workspace. After initialization:

```
<workspace-root>/
├── .dapei/        # config, workflows, rules
├── repos/      # hosted product repos
├── docs/          # long-term product/business/architecture knowledge
├── features/      # isolated execution spaces for requirements
└── runtime/       # templates and AI rules
```

### Feature

Each requirement lives in its own feature workspace:

```
features/<feature>/
├── feature.yaml       # requirement manifest
├── repos/             # mapped repos (worktrees)
├── docs/              # current state, gap, design, tasks, acceptance
├── context/           # stage-specific AI context bundles
├── memory/            # decisions, risks, open questions
├── tasks/             # backlog and plan
├── tests/             # test plan
└── reports/           # progress, review, validation reports
```

### Context Layering

When entering a new stage, the AI aggregates relevant context from `docs/`, `repos/`, and `feature/`, generating `context/runtime-context.md`. Priority order:

```
1. global: standards / AI rules
2. workspace: current state / architecture / workflows
3. domain: business / domain / terminology
4. repo: repos evidence
5. feature: feature's own docs and context
6. runtime: task and execution state
```

---

## Design Principles

- **AI-first UX**: users interact through conversation, not by learning internal scripts
- **Local-first**: filesystem + Git is the single source of truth
- **Determinism first**: repeatable state changes handled by scripts, not verbal Agent agreements
- **Evidence first**: repos analysis must distinguish evidence, inference, and unknown
- **Feature isolation**: each requirement is independently documented, validated, and archived
- **Closed loop**: accepted business rules and architecture decisions are written back to `docs/` after acceptance

---

## Installation

### Option 1: Vercel Skills (Recommended)

Works with Claude Code, Cursor, Copilot, and 18+ other AI agents:

```bash
# Install latest
npx skills add ygwa/dapei-skill

# Install specific version
npx skills add ygwa/dapei-skill@v1.2.0
```

After installation, just use `@dapei` to invoke.

### Option 2: Manual Install

Copy the skill to your AI tool's supported location:

#### Claude Code

```bash
git clone https://github.com/ygwa/dapei-skill.git /tmp/dapei-skill
cd /tmp/dapei-skill
bash scripts/sync-local-skills.sh --claude-code
```

#### Cursor

Add `.cursor/rules/dapei-core.mdc` to your project — the AI will work using dapei's collaboration approach.

---

## Verification

After cloning, run the smoke test to confirm all modules are intact:

```bash
bash scripts/smoke-test.sh
```

---

## Versioning

dapei-skill follows [Semantic Versioning](https://semver.org/). All releases are
documented in [`CHANGELOG.md`](CHANGELOG.md).

The full release process — when to bump, how to add a `CHANGELOG` entry,
how to cut a tag — lives in [`docs/release-process.md`](docs/release-process.md).

To cut a release (maintainer):

```bash
bash scripts/release.sh patch       # or minor / major / --auto
git push origin main && git push origin vX.Y.Z
```

To install a specific version:

```bash
npx skills add ygwa/dapei-skill@vX.Y.Z
```

---

## References

| Document | Description |
| --- | --- |
| [agents.md](agents.md) | Agent collaboration constraints for this repo |
| [DESIGN.md](DESIGN.md) | Technical design documentation |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [docs/release-process.md](docs/release-process.md) | How to cut a release |
| [SKILL.md](SKILL.md) | Agent Skill entry point |

---

## License

MIT
