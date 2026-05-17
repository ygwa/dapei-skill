# dapei.skill Target Design

Date: 2026-05-14

## Purpose

This document evaluates the current `dapei.skill` implementation against the expected workflow and defines a target design for turning engineering workflows into reusable AI skills.

The target is an AI Native Engineering Context OS:

- A workspace contains durable code, docs, rules, and feature workspaces.
- A feature is the execution unit for planning, implementation, validation, reporting, and knowledge archival.
- Skills expose stable natural-language entrypoints so users can invoke the same workflow from Codex, Claude Code, Cursor, or other agent runtimes.

Important correction:

The workspace root is the user's current project directory. `dapei` should not create another `workspace/` directory under it. A valid workspace root contains three first-class runtime directories:

- `codebase`: managed Git repositories and repo cache.
- `docs`: durable as-is knowledge about business, architecture, technology, constraints, and decisions.
- `features`: active and historical feature execution workspaces.

The current repository is the implementation repository for the skill itself, so it may keep sample fixtures for development. However, the target user workspace contract must be root-level `codebase / docs / features`, not `workspace/codebase / workspace/features`.

## Feasibility Summary

The idea is feasible and directionally strong.

The current repository has useful pieces. Before this revision, its workspace root model was wrong:

- It used `workspace/codebase` and `workspace/features`, adding an unnecessary nested runtime root.
- It already has `docs` for durable workspace knowledge, which matches the intended model.
- `runtime/templates` and `.dapei/rules` for templates and governance.
- `.agents/skills/dapei-skill/SKILL.md` as the agent-facing skill entrypoint.
- `scripts/dapei` as a deterministic local execution layer.

The main issue is not feasibility. The main issue is that the implementation has two gaps:

1. The root directory contract is off by one level.
2. Implementation depth lags behind the product expectation. Much of the desired workflow exists as directory structure, YAML contract, README wording, and report placeholders, but not yet as reliable end-to-end behavior.

## Revised Core Model

### Workspace Root

The workspace root is the directory where the user initializes `dapei`.

Initialization rules:

- If the directory is empty, initialize it as a new dapei workspace.
- If the directory is non-empty but already conforms to the dapei workspace contract, complete or repair initialization.
- If the directory is non-empty and does not conform, do not create a nested `workspace/` directory. Explain the conflict and ask the user to initialize in an empty directory or explicitly migrate the directory.

Required root-level contract:

```text
<workspace-root>/
├── .dapei/
├── codebase/
├── docs/
└── features/
```

Optional root-level support directories:

```text
<workspace-root>/
├── .agents/
├── runtime/
├── reports/
└── skills/
```

### Codebase Layer

`codebase/` is the managed repository pool:

```text
codebase/
├── mall-payment/
├── mall-order/
└── mall-user/
```

Each child is a Git repository. This layer represents source truth and is also used to infer the workspace's as-is docs.

The codebase layer should support:

- Clone or register existing repos.
- Store repo metadata in `.dapei/codebases.yaml`.
- Detect default branch, current branch, remotes, language, framework, package manager, test commands, and ownership hints.
- Pull architecture and business evidence back into `docs`.

### Docs Layer

`docs/` is the durable knowledge base for the whole workspace:

```text
docs/
├── agents.md
├── as-is/
│   ├── business-current-state.md
│   ├── technical-current-state.md
│   └── repo-inventory.md
├── architecture/
│   ├── business-architecture.md
│   ├── application-architecture.md
│   ├── technical-architecture.md
│   └── integration-architecture.md
├── standards/
│   ├── coding-standards.md
│   ├── tech-stack.md
│   ├── architecture-constraints.md
│   └── testing-standards.md
├── glossary/
├── decisions/
└── feature-impact/
```

This layer is not only hand-written. It should be bootstrapped from `codebase/`, refined through user conversation, and updated after each feature is completed.

### Feature Layer

`features/<feature>` is a local execution workspace:

```text
features/<feature>/
├── agents.md
├── feature.yaml
├── repos/
├── docs/
├── context/
├── memory/
├── tests/
├── tasks/
└── reports/
```

It combines four kinds of context:

- What to do: requirement, scope, acceptance, task plan.
- What exists: selected slices from `docs/as-is`, `docs/architecture`, and repo scans.
- What constrains us: technical stack, standards, architecture constraints, risk policy.
- What code is relevant: repo branches or worktrees under `features/<feature>/repos`.

### Closed Loop

The intended loop is:

1. User initializes a workspace.
2. User imports repos into `codebase/`.
3. `dapei` analyzes `codebase/` and creates or updates `docs/`.
4. User discusses a new requirement against `docs/`.
5. `dapei` creates a feature plan and technical design.
6. `dapei` creates `features/<feature>` and links or worktrees relevant repos.
7. AI works locally inside the feature workspace.
8. Local validation and acceptance complete.
9. `dapei` writes final decisions, architecture changes, feature impacts, and new constraints back into `docs/`.

## Current Capability Assessment

### What Works Today

After the root-contract correction, current implementation supports a usable v0.1 skeleton:

- Initialize the workspace directory structure with `dapei init workspace`.
- Initialize an empty current directory directly as the workspace root.
- Repair a conforming workspace root by adding missing baseline files.
- Reject a non-empty non-conforming directory instead of creating a nested `workspace/`.
- Add, sync, and list codebases under root `codebase`.
- Create a feature workspace with repo symlinks under root `features/<feature>/repos`.
- Create `feature/<feature>` branches in mapped codebases.
- Generate feature manifest, context files, memory files, task files, reports, and numbered design docs.
- Validate stage ordering at a basic level with `.dapei/workflows/feature-lifecycle.yaml`.
- Generate basic daily, review, architecture, and guardrail reports.
- Provide a lightweight `@dapei` wake-up protocol in the skill file.

### What Does Not Yet Match The Expectation

The current user experience can imply more intelligence than the system actually has:

- Natural-language commands are documented, but the CLI accepts only exact command shapes.
- Repo selection is manual; there is no codebase discovery or recommendation loop.
- Git auth is interactive and temporary; there is no durable credential profile or secure local registry.
- Feature creation creates placeholders, but does not yet carry over a curated workspace knowledge pack from `docs`.
- There is no codebase-to-docs bootstrap flow that analyzes imported repos and writes as-is business, technical, and architecture docs.
- There is no feature-to-docs closeout flow that writes accepted feature design and impact back into workspace docs.
- Stage execution marks or validates files, but does not perform real current-state analysis, gap analysis, design synthesis, implementation orchestration, or acceptance.
- Reports are mostly structured shells; they do not yet aggregate commits, changed files, tests, risks, decisions, and architecture drift into a high-quality human summary.
- `.dapei/rules/*.yaml` looks extensible, but `dapei-guardrail` still uses hardcoded checks.
- There is no first-class `context build` command, so agents must manually rediscover which docs and constraints to load.
- Local validation has no repo-level test command registry or generated test report.
- Daily feature reporting is not scheduled or automated yet.

## Alignment With Expected User Workflow

| Expected workflow | Current state | Match |
| --- | --- | --- |
| User says `@dapei 初始化 workspace` | Skill recognizes the intent; CLI can initialize folders | Partial |
| User provides or is asked for Git repo information | Interactive clone exists; no durable secure auth profile | Partial |
| Current directory is the workspace root | Implemented in CLI root handling | Strong |
| Empty directory initializes directly as workspace | Implemented | Strong |
| Non-empty conforming directory can be initialized or repaired | Implemented with basic structural detection | Partial |
| Non-conforming non-empty directory is rejected with guidance | Implemented | Strong |
| Repos live under root `codebase` | Implemented in CLI root handling | Strong |
| Durable knowledge lives under root `docs` | Implemented | Strong |
| Features live under root `features` | Implemented in CLI root handling | Strong |
| Feature folder brings related repos into `features/<feature>/repos` | Implemented with symlink mode | Strong |
| `docs/agents.md` and feature `agents.md` guide agents | Feature `agents.md` exists; root/docs agents file missing | Partial |
| Workspace docs are carried into feature context | Context files are created, but not assembled from docs | Weak |
| Imported codebase bootstraps as-is docs | Not implemented | Missing |
| Completed feature updates workspace docs | Not implemented | Missing |
| Feature starts with current-state, gap, business, technical, task, and acceptance docs | Numbered docs exist | Structural only |
| Agent works from feature directory | Intended by skill; not enforced by all tooling | Partial |
| Local validation before acceptance | Lifecycle names this stage; implementation is missing | Weak |
| Daily report summarizes commits, work, drift, and tests | Basic reports exist; aggregation is shallow | Weak |
| Tests and acceptance artifacts live in feature | `tests/regression` exists; no test plan generation | Partial |
| Skills can be invoked by a stable name in multiple tools | `@dapei` exists; subskills are not decomposed yet | Partial |

## Key Design Decisions

### 1. Keep `dapei` As The Umbrella Skill

Use `@dapei` as the stable public name. Under it, expose subskills by intent:

- `workspace-init`
- `codebase-manage`
- `feature-create`
- `feature-plan`
- `feature-implement`
- `feature-validate`
- `feature-report`
- `feature-archive`
- `guardrail-review`

Users should not need to know subskill names. The umbrella skill routes natural language to the right deterministic command or agent workflow.

### 2. Keep The Core Local-First

The local filesystem and Git repos should remain the source of truth:

- No required SaaS dependency for core workflows.
- GitHub/GitLab, CI, notifications, and knowledge bases are optional adapters.
- Network-dependent steps must degrade cleanly to local prompts and local reports.

This makes the skill portable across Codex, Claude Code, Cursor, and terminal agents.

### 3. Use Scripts As The Execution Layer, Skills As The Orchestration Layer

The skill should not hide all logic inside prose instructions. It should delegate repeatable state changes to deterministic commands:

- Scripts create folders, symlinks, manifests, branches, reports, and markers.
- Agents perform analysis, design, coding, and summary work using the context packs and templates.
- Guardrails and validation provide machine-checkable feedback.

### 4. Prefer Git Worktrees For Feature Repos

The current implementation creates feature branches directly in `codebase/<repo>` and symlinks those repos into the feature workspace.

This works, but has an isolation problem: two features touching the same repo will fight over the same working tree.

Recommended target:

- Keep `codebase/<repo>` as the canonical clone/cache.
- Use `git worktree add features/<feature>/repos/<repo> -b feature/<feature> <base>` for feature execution.
- Preserve symlink mode as a compatibility fallback for early versions or simple single-feature workspaces.

### 5. Make Context Packs Explicit

Feature creation should generate a stage-specific context pack rather than relying on agents to rediscover everything.

Recommended output:

```text
features/<feature>/context/runtime-context.md
features/<feature>/context/context-index.yaml
```

Each included source should record:

- layer: global, workspace, domain, repo, feature, runtime
- source path
- reason included
- priority
- merge policy
- last updated time

## Target Directory Contract

Recommended workspace shape:

```text
<dapei-root>/
├── .agents/
│   └── skills/dapei-skill/SKILL.md
├── .dapei/
│   ├── workspace.yaml
│   ├── codebases.yaml
│   ├── commands.yaml
│   ├── workflows/
│   ├── rules/
│   └── integrations.yaml
├── docs/
│   ├── agents.md
│   ├── business/
│   ├── architecture/
│   ├── standards/
│   ├── glossary/
│   ├── decisions/
│   └── workflows/
├── runtime/
│   ├── ai-rules/
│   └── templates/
├── codebase/
│   └── <repo>/
└── features/
    └── <feature>/
```

Recommended feature shape:

```text
features/<feature>/
├── feature.yaml
├── agents.md
├── repos/
│   └── <repo>/
├── docs/
│   ├── 01-current-state.md
│   ├── 02-gap-analysis.md
│   ├── 03-business-design.md
│   ├── 04-technical-design.md
│   ├── 05-task-breakdown.md
│   └── 06-acceptance.md
├── context/
│   ├── context-index.yaml
│   ├── runtime-context.md
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
├── tasks/
│   ├── backlog.md
│   └── plan.md
└── reports/
    ├── daily-report.md
    ├── feature-progress.md
    ├── implementation-log.md
    ├── validation-report.md
    ├── test-report.md
    ├── architecture-review.md
    ├── guardrail-report.md
    └── acceptance-report.md
```

## Target User Interaction

### Workspace Initialization

User:

```text
@dapei 初始化这个 workspace，用来管理多个业务代码库。
```

Agent behavior:

1. Inspect the current directory.
2. If empty, create `.dapei`, `codebase`, `docs`, and `features`.
3. If non-empty and already conforming, complete missing baseline files.
4. If non-empty and non-conforming, stop and explain that initialization should happen in an empty directory or through an explicit migration command.
5. Ask only for missing high-value inputs: workspace name, default branch, initial repos.
6. Generate `docs/agents.md` and a workspace report.

### Codebase Onboarding

User:

```text
@dapei 接入 mall-payment 和 mall-order。如果本地没有，问我要 Git 地址。
```

Agent behavior:

1. Check `.dapei/codebases.yaml` and `codebase`.
2. Ask for missing Git URLs or auth mode.
3. Clone or link repos.
4. Record repo metadata: default branch, remote URL, test commands, framework, owner, last sync.
5. Run a lightweight repo inventory.
6. Produce a codebase onboarding report.
7. Update `docs/as-is/repo-inventory.md` and relevant architecture/standards docs with evidence-backed findings.

Credential note:

- Do not store raw secrets in project files.
- Store only auth profile references, such as `auth_profile: github-work`.
- Prefer OS credential manager, SSH agent, Git credential helper, or environment variable references.

### Feature Creation

User:

```text
@dapei 创建 feature payment-refactor，目标是稳定支付回调，涉及 mall-payment,mall-order。
```

Agent behavior:

1. Normalize feature name.
2. Resolve involved repos from explicit input or codebase registry.
3. Sync base branches after confirmation.
4. Create feature branches or worktrees.
5. Create the feature workspace contract.
6. Build the initial context pack from `docs`, repo evidence, and feature goal.
7. Copy or reference the relevant workspace knowledge into `features/<feature>/context`.
8. Ask for missing acceptance criteria if needed.
9. Stop before implementation unless the user asks to continue.

### Planning And Design

User:

```text
@dapei 推进 payment-refactor 到 solution-design，先做现状分析和 gap 分析。
```

Agent behavior:

1. Run current-state analysis across mapped repos.
2. Search code for relevant terms, APIs, modules, tests, dependencies, and prior decisions.
3. Write `01-current-state.md` with evidence and unknowns.
4. Write `02-gap-analysis.md` with business gaps, technical gaps, test gaps, and risks.
5. Draft `03-business-design.md` and `04-technical-design.md`.
6. Update memory files.
7. Return `结论 / 风险 / 待确认 / 下一步`.

The planning phase may happen before the physical feature repo workspace is created. In that case, the requirement and design docs can first be drafted under `docs/feature-impact/<candidate-feature>` or a temporary planning area, then promoted into `features/<feature>/docs` when development starts.

### Implementation

User:

```text
@dapei 开始实现 payment-refactor，按任务拆解端到端推进，本地验收优先。
```

Agent behavior:

1. Work from `features/<feature>`.
2. Load `agents.md`, `context/runtime-context.md`, numbered docs, tasks, and guardrails.
3. Implement across mapped repos.
4. Record decisions, risks, and implementation notes.
5. Run local validation commands.
6. Update reports and task status.

### Daily Report

User:

```text
@dapei report payment-refactor，告诉我今天谁提交了什么、完成了什么、风险和架构漂移。
```

Agent behavior:

1. Collect commits since the last report.
2. Collect changed files and diff stats.
3. Read tasks, memory, tests, validation, and guardrail output.
4. Produce a concise report with:
   - Completed work
   - Commit summary
   - Test and validation status
   - Architecture drift or rule violations
   - Risks and blockers
   - Next recommended actions

### Feature Closeout

User:

```text
@dapei 验收并归档 payment-refactor，把对架构和后续 feature 的影响沉淀回 docs。
```

Agent behavior:

1. Confirm local validation, tests, guardrails, and acceptance are complete.
2. Summarize the final business decision, technical decision, changed boundaries, and known risks.
3. Update `docs/decisions`, `docs/architecture`, `docs/standards`, or `docs/feature-impact` as appropriate.
4. Mark the feature as accepted or archived.
5. Keep links from workspace docs back to the feature's final design and reports.

## Skill Architecture

### Umbrella Skill: `dapei`

Responsibilities:

- Interpret `@dapei` requests.
- Route to the correct subskill or deterministic script command.
- Maintain the feature lifecycle discipline.
- Keep stage reports in the `结论 / 风险 / 待确认 / 下一步` format.

### Subskill: `workspace-init`

Responsibilities:

- Initialize workspace directories and baseline files.
- Generate `docs/agents.md`.
- Validate `.dapei/workspace.yaml`.
- Enforce the current-directory-as-workspace-root contract.
- Reject unsafe initialization in non-conforming non-empty directories.
- Emit workspace initialization report.

### Subskill: `codebase-manage`

Responsibilities:

- Add, sync, list, inspect, and health-check repos.
- Maintain `.dapei/codebases.yaml`.
- Capture repo metadata and test commands.
- Handle Git auth through safe profile references.
- Bootstrap `docs/as-is` and repo inventory from imported codebases.

### Subskill: `feature-create`

Responsibilities:

- Resolve repos.
- Create feature branches or worktrees.
- Generate feature docs, context, memory, reports, tasks, and `agents.md`.
- Build initial context pack from `docs`, feature goal, and selected repos.

### Subskill: `feature-plan`

Responsibilities:

- Current-state analysis.
- Gap analysis.
- Business design.
- Technical design.
- Task breakdown.
- Acceptance design.

### Subskill: `feature-implement`

Responsibilities:

- Load stage-specific context.
- Execute tasks across repos.
- Update implementation log, decisions, risks, and timeline.
- Keep changes scoped to the feature workspace.

### Subskill: `feature-validate`

Responsibilities:

- Run local lint, test, build, and custom validation commands.
- Generate `test-report.md` and `validation-report.md`.
- Evaluate acceptance criteria.

### Subskill: `feature-report`

Responsibilities:

- Generate daily and on-demand reports.
- Summarize commits, changes, task progress, tests, risks, decisions, and guardrails.
- Support scheduled automation later.

### Subskill: `feature-closeout`

Responsibilities:

- Verify acceptance completeness.
- Write final feature impact summaries.
- Update durable workspace docs.
- Archive or mark the feature as accepted.

### Subskill: `guardrail-review`

Responsibilities:

- Interpret `.dapei/rules/*.yaml`.
- Run report-mode and gate-mode checks.
- Detect architecture drift and missing evidence.

## Implementation Roadmap

### Phase 1: Make The Existing Contract Honest

Priority: high.

Tasks:

- Change the target contract from nested `workspace/` to root-level `codebase / docs / features`.
- Add initialization checks for empty, conforming, and non-conforming directories.
- Update README and skill instructions to clearly separate implemented behavior from planned behavior.
- Add `docs/agents.md` template and generation.
- Ensure feature creation uses templates consistently.
- Add schema validation for `feature.yaml` and `codebases.yaml`.
- Add a smoke test suite for `init`, `create feature`, `run workflow`, `report`, and `guardrail`.

### Phase 2: Context Builder

Priority: high.

Tasks:

- Add `dapei context build <feature> --stage <stage>`.
- Read `.dapei/workspace.yaml` context layers.
- Resolve docs, rules, feature context, tasks, and repo summaries.
- Generate `context-index.yaml` and `runtime-context.md`.
- Make context building the bridge from durable `docs` into feature-local `context`.

### Phase 3: Real Analysis Stages

Priority: high.

Tasks:

- Add repo scanners for file tree, dependency files, framework detection, test commands, and code search.
- Add `dapei docs bootstrap` or `dapei docs refresh` to update workspace `docs` from `codebase`.
- Generate `01-current-state.md` from evidence.
- Generate `02-gap-analysis.md` from evidence, inference, risks, and unknowns.
- Append missing decisions and questions to memory.

### Phase 4: Worktree-Based Feature Isolation

Priority: medium.

Tasks:

- Add a workspace config option: `feature_repo_mode: worktree | symlink`.
- Use worktrees by default for new features.
- Keep symlink mode for compatibility.
- Add detection for dirty base repos before creating a feature.

### Phase 5: Validation And Guardrail Engine

Priority: high.

Tasks:

- Add repo-level `test_commands`.
- Add `dapei validate feature <name>`.
- Generate validation and test reports.
- Replace hardcoded guardrail checks with a YAML rule runner.
- Support report mode and gate mode.

### Phase 6: Reporting And Automation

Priority: medium.

Tasks:

- Upgrade report aggregation.
- Track `last-report-at` separately from `last-review-at`.
- Add scheduled daily report support through the host agent platform.
- Add archive flow for completed features.
- Add closeout flow that updates workspace docs after acceptance.

### Phase 7: Integrations

Priority: medium to low.

Tasks:

- Add `.dapei/integrations.yaml`.
- Define optional adapters for GitHub, GitLab, CI, notifications, knowledge base, and MCP.
- Keep all integration-dependent workflows optional.

## Risks And Mitigations

### Risk: Overpromising Natural Language Automation

Mitigation:

- Keep natural language as a routing layer.
- Back every state-changing operation with deterministic commands.
- Document capability levels clearly.

### Risk: Feature Isolation Breaks Across Multiple Concurrent Features

Mitigation:

- Move from symlinks to Git worktrees.
- Refuse to create a new feature from a dirty base repo unless the user confirms.

### Risk: Context Becomes Too Large Or Noisy

Mitigation:

- Build stage-specific context packs.
- Track provenance and reason for each included file.
- Separate evidence from inference in analysis docs.

### Risk: Secrets Leak Into The Workspace

Mitigation:

- Never store tokens or passwords in `.dapei` or `docs`.
- Store auth profile names only.
- Prefer SSH agent, Git credential manager, OS keychain, or environment variables.

### Risk: Guardrails Become Decorative

Mitigation:

- Implement a real YAML rule runner.
- Include guardrail findings in daily and architecture reports.
- Add gate mode only after report mode is useful.

## Recommended Next Implementation Slice

Start with a small but high-leverage slice:

1. Add `docs/agents.md` and a template under `runtime/templates`.
2. Add `context build` command.
3. Generate `context-index.yaml` and `runtime-context.md` during feature creation.
4. Add a current-state scanner that writes evidence to `01-current-state.md`.
5. Update `SKILL.md` so `@dapei 创建 feature` explicitly instructs agents to create the feature, build context, then stop at the first confirmation point.

This slice makes the skill feel substantially closer to the expected workflow without requiring full automation of implementation, testing, and integrations.
