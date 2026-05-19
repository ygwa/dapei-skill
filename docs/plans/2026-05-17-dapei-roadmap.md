# dapei.skill Roadmap

Date: 2026-05-17

## Positioning

`dapei.skill` is evolving from an AI coding helper into an AI Native Engineering Context OS.

The target workflow is:

1. Initialize a workspace with durable `docs`, managed `codebase`, and isolated `features`.
2. Reverse-engineer imported codebases into product, architecture, technical, and constraint knowledge.
3. Evaluate a requirement against current codebases and docs.
4. Create a feature workspace with linked or isolated repos and stage-specific context.
5. Refine business and technical design at feature level.
6. Implement the technical plan.
7. Review feature branch changes and generate daily reports.
8. Generate prioritized test plans and local mock/stub strategies.
9. Execute repeatable validation and generate test reports.
10. Close the loop by writing accepted business rules, architecture changes, and decisions back into `docs`.

## Current Stage

The project is currently at **v0.2 platform skeleton**.

Implemented:

- Root-level workspace contract: `codebase/`, `docs/`, `features/`.
- Modular CLI dispatcher in `scripts/dapei`.
- Command modules for workspace, codebase, feature, context, workflow, validation, and reporting.
- Feature lifecycle DAG.
- Feature workspace creation with docs, context, memory, tasks, tests, reports, and repo mapping.
- Basic codebase analysis into `docs/as-is/repo-inventory.md` and `docs/architecture/technical-current-state.md`.
- Runtime context bundle generation.
- Basic local validation and report generation.

Main gaps:

- The modular command files, runtime templates, and `.dapei` contracts are now tracked, but the release baseline still needs full-flow smoke coverage and a clean commit.
- Codebase analysis is evidence-first but shallow.
- Workflow stages validate artifacts but do not yet generate high-quality analysis and design content by themselves.
- Guardrails are still mostly hardcoded.
- Feature repo isolation still defaults to symlink instead of worktree.
- Test plan generation, mock/stub strategy, and closeout-to-docs are not implemented yet.

## Priority Plan

### P0: Make The Current Platform Complete And Trustworthy

Goal: make the existing v0.2 skeleton installable, runnable, and hard to break.

Tasks:

- Keep `scripts/lib/`, `scripts/commands/`, `.dapei/`, and `runtime/` committed together with the thin `scripts/dapei` dispatcher.
- Add a smoke test script or CI job that runs:
  - `dapei init workspace`
  - `dapei codebase analyze --all`
  - `dapei create feature`
  - `dapei context build`
  - `dapei run workflow --stage analyze-current-state`
  - `dapei validate feature`
  - `dapei report feature`
- Add a fixture workspace or sample repo under a clear test-only path instead of relying on historical `workspace/` samples.
- Normalize docs and CI around root-level `codebase/ docs/ features/`.
- Add failure messages for missing module files, missing templates, and invalid workspace roots.
- Make generated reports follow the user-facing `结论 / 风险 / 待确认 / 下一步` shape where applicable.

Expected effect:

- New users can install and run dapei without broken source references.
- Future agents can safely build on the modular structure.
- CI catches missing modules and broken command paths before release.

Acceptance:

- Fresh clone passes syntax checks and smoke test.
- `git status --short` has no untracked roadmap, fixture, runtime, or command modules after the M0 commit.
- README quickstart works in a temporary directory.

### P1: Codebase-To-Docs Bootstrap

Goal: turn imported repositories into durable workspace knowledge.

Tasks:

- Extend `dapei codebase analyze` with analyzer modules:
  - stack and package manager detection
  - source tree and module boundary summary
  - API route/interface extraction
  - DB schema/migration detection
  - MQ/event/topic detection
  - test command and coverage evidence
  - dependency graph summary
- Write outputs into:
  - `docs/as-is/repo-inventory.md`
  - `docs/as-is/business-current-state.md`
  - `docs/as-is/technical-current-state.md`
  - `docs/architecture/application-architecture.md`
  - `docs/architecture/integration-architecture.md`
  - `docs/standards/tech-stack.md`
- Mark every conclusion as evidence, inference, or unknown.

Expected effect:

- Requirement evaluation no longer starts from blank context.
- Agents can answer "what exists today?" before proposing changes.
- Workspace docs become a living baseline rather than hand-written placeholders.

Acceptance:

- Running `dapei codebase analyze --all` on a multi-repo workspace produces a useful repo inventory and architecture baseline.
- Unknowns are written into a clearly labeled section instead of being hallucinated.
- Context builder can include generated docs with provenance.

### P1: Context Engineering V1

Goal: make feature execution reliably context-aware.

Tasks:

- Promote `dapei context build <feature> --stage <stage>` into a stage-aware context router.
- Define context profiles per lifecycle stage:
  - analysis
  - gap
  - design
  - implementation
  - validation
  - review
  - closeout
- Add priority and budget controls:
  - P0 must-read context
  - P1 important context
  - P2 optional context
  - P3 historical/reference context
- Include source provenance for every context block.
- Generate a concise `features/<feature>/agents.md` handoff that points to the right stage files.

Expected effect:

- AI work becomes repeatable: same feature and same stage produce a predictable context pack.
- The user can understand why a piece of context was included.
- Large workspaces can avoid dumping the entire docs/codebase into the model.

Acceptance:

- `context/runtime-context.md` contains source, layer, priority, and reason for inclusion.
- Different stages produce meaningfully different context packs.
- Missing docs are reported as gaps, not silent failures.

### P1: Real Feature Planning And Design Generation

Goal: turn lifecycle stages into actual engineering artifacts.

Tasks:

- Add stage handlers for:
  - `analyze-current-state`
  - `gap-analysis`
  - `solution-design`
  - `task-breakdown`
- Generate or refine:
  - `docs/01-current-state.md`
  - `docs/02-gap-analysis.md`
  - `docs/03-business-design.md`
  - `docs/04-technical-design.md`
  - `docs/05-task-breakdown.md`
  - `docs/06-acceptance.md`
- Ensure technical design includes:
  - background
  - goals and non-goals
  - current state
  - proposal
  - data model
  - API design
  - DB design
  - sequence diagrams
  - flow diagrams
  - state diagrams
  - affected codebases
  - risks and rollout plan

Expected effect:

- Feature design becomes a structured, auditable artifact.
- Implementation agents receive a clear plan rather than a vague prompt.
- Design review can happen before code changes.

Acceptance:

- A feature can progress from current-state to task-breakdown with useful content in each numbered doc.
- Every important assumption is written to memory or open questions.
- Solution design has enough detail for implementation without rereading the entire codebase.

### P1: Validation And Test Strategy V1

Goal: make testing repeatable and local-first.

Tasks:

- Add test command registry in `.dapei/codebases.yaml` and feature manifests.
- Generate `features/<feature>/tests/test-plan.md` from requirement and technical design.
- Prioritize cases as P0/P1/P2.
- Support validation methods:
  - unit/integration command
  - curl/API call
  - browser automation
  - mock/stub plan
  - manual verification note
- Add mock/stub recommendations for MQ, async jobs, webhook callbacks, external payment providers, and third-party APIs.
- Make `dapei validate feature` consume the test plan and produce structured results.

Expected effect:

- Tests are not only "run whatever exists"; they are derived from the requirement and design.
- Hard-to-test integrations get a concrete local verification path.
- Validation reports become useful for acceptance and review.

Acceptance:

- Each feature has a test plan with priority, method, expected result, and status.
- API features can produce executable curl examples.
- Web features can declare browser verification flows.
- Validation report lists command, cwd, exit code, duration, and failure summary.

### P1: Guardrail Engine

Goal: replace hardcoded checks with configurable governance.

Tasks:

- Interpret `.dapei/rules/*.yaml`.
- Support rule types:
  - required file
  - path deny/allow
  - naming regex
  - evidence required
  - glossary match
  - changed file risk policy
  - API compatibility check
- Support severity:
  - info
  - warn
  - error
  - blocker
- Support modes:
  - report
  - gate
- Include findings in daily report, architecture review, and validation report.

Expected effect:

- Teams can encode architecture, style, risk, and compliance constraints as local rules.
- Review becomes less dependent on memory and more consistent across agents.
- High-risk violations can block acceptance when gate mode is enabled.

Acceptance:

- `dapei-guardrail <feature>` evaluates YAML rules, not only hardcoded file checks.
- Report includes rule id, severity, evidence, and remediation.
- Gate mode exits non-zero for configured blocker rules.

### P2: Feature Repo Isolation With Git Worktree

Goal: support parallel features touching the same repo safely.

Tasks:

- Add `feature_repo_mode: worktree | symlink`.
- Implement worktree creation under `features/<feature>/repos/<repo>`.
- Fetch and branch from latest `main` or `master`.
- Track base ref, base branch, and worktree path in `feature.yaml`.
- Add cleanup/archive behavior for completed features.

Expected effect:

- Multiple features can work on the same repository without fighting over one working tree.
- Feature workspace becomes a stronger execution sandbox.
- Review and validation are scoped to the feature branch/worktree.

Acceptance:

- Two features can map the same repo concurrently.
- Each feature has an independent branch and working directory.
- Cleanup does not delete unrelated user changes.

### P2: Reporting And Review V2

Goal: make reports useful to humans, not just generated files.

Tasks:

- Improve `dapei review feature` to aggregate:
  - commits since last review
  - changed files and diff stats
  - test results
  - guardrail findings
  - risks
  - open questions
  - architecture drift
  - docs updates needed
- Add daily report summary sections:
  - completed
  - in progress
  - blocked
  - new risks
  - next actions
- Add report quality checks for empty or placeholder reports.

Expected effect:

- Daily report becomes a real engineering handoff artifact.
- Review can compare implementation against docs and constraints.
- Product and engineering stakeholders can understand status without reading commits.

Acceptance:

- Report explains what changed, why it matters, what was validated, and what remains risky.
- Empty reports are flagged.
- Architecture review references concrete changed files and rules.

### P2: Feature Closeout And Docs Backfill

Goal: complete the knowledge loop.

Tasks:

- Add `dapei close feature <name>` or `dapei archive feature <name>`.
- Generate closeout artifacts:
  - acceptance summary
  - business rule changes
  - architecture impact
  - API/DB changes
  - operational notes
  - decisions and tradeoffs
- Write accepted knowledge back into:
  - `docs/business`
  - `docs/domain`
  - `docs/architecture`
  - `docs/standards`
  - `docs/decisions`
  - `docs/feature-impact`
- Mark feature lifecycle status as closed or archived.

Expected effect:

- Completed work improves future context.
- Docs become more accurate over time.
- Similar future requirements can reuse prior decisions and constraints.

Acceptance:

- Closing a feature creates a feature impact document.
- Decisions are copied or linked into `docs/decisions`.
- Architecture and business docs receive proposed updates with clear provenance.

### P3: Natural Language Router And Plugin Adapters

Goal: make dapei feel like a stable AI workflow, not a command memorization exercise.

Tasks:

- Add natural-language intent mapping for Chinese and English commands.
- Add command aliases:
  - 初始化
  - 接入代码库
  - 创建需求
  - 评估需求
  - 生成测试方案
  - 执行验证
  - 生成日报
  - 需求闭环
- Add optional adapters:
  - GitHub PR/issue
  - CI status
  - browser verification
  - knowledge base sync
  - notification hooks

Expected effect:

- Users can stay in conversation and let the Agent route to deterministic commands.
- dapei can integrate with external systems while keeping local-first core behavior.

Acceptance:

- Common Chinese workflow requests map to the right command or clarification question.
- External integrations are optional and fail gracefully.

## Suggested Milestones

### M0: Commit And Stabilize

Scope: P0.

Target effect: current modular platform is installable and tested.

### M1: Context-Aware Planning

Scope: P1 codebase bootstrap, context engineering, and real planning/design stage handlers.

Target effect: a new requirement can produce current-state, gap, business design, technical design, and task plan from docs plus code evidence.

### M2: Repeatable Validation And Governance

Scope: P1 validation/test strategy and guardrail engine.

Target effect: every feature can produce a prioritized test plan, repeatable local validation, and architecture/risk review.

### M3: Parallel Feature Execution And Closeout

Scope: P2 worktree isolation, reporting V2, and feature closeout.

Target effect: multiple features can run safely, and completed work updates durable docs.

### M4: Natural Workflow Experience

Scope: P3 router and adapters.

Target effect: users drive the full lifecycle through natural language while dapei keeps deterministic state and artifacts.

## Recommended Next Step

Start with **P0: Make The Current Platform Complete And Trustworthy**.

Reason: the current platform has the right modular shape, but the business value depends on a trustworthy first run. Until the full `init → codebase analyze → feature → context → workflow → validate → report` path is covered by a fixture-backed smoke test and committed as a clean baseline, later P1 intelligence can regress the core experience without being caught.
