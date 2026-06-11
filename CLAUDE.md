# CLAUDE.md

> Single source of truth for AI agents working on the `dapei-skill` repository.
> For the runtime operating contract (rules the AI follows when *using* dapei against a user workspace), see [`agents.md`](./agents.md).

## What this repo is

`dapei.skill` (npm `@dapei/*`) is an **AI Native Engineering Context OS**. The user experience is `@dapei <intent>` in a chat session; the engine is a deterministic TypeScript capability registry that the AI orchestrates via `runCapability(id, input, ctx)`.

Two non-negotiable architectural commitments:

1. **The engine never reads code.** All semantic understanding is the AI's job. The engine returns file listings (cheap) and validates evidence (deterministic).
2. **Evidence-first artifacts.** Every cognitive YAML asset carries `confidence: { kind: fact | inference | unknown }` plus conditional `sources[]` / `derived_from[]` / `reason`. The engine refuses to persist artifacts whose evidence type does not match the claim.

## Repo layout

```
SKILL.md                    Router skill (entry point loaded by AI)
agents.md                   Runtime operating contract
.claude-plugin/             Plugin manifests (added by P1 refactor)
commands/                   High-frequency workflow commands (added by P1 refactor)
skills/                     Per-domain skill markdown
  cdr/                      Cognitive Discovery Runtime skill
  cognitive/                Cognitive Runtime skill
  feature/                  Feature lifecycle skill
  workflow/                 Stage DAG skill
  workspace/                Workspace init/validate/status
  repos/                    Repo registry
  validation/               Test discovery + execution
packages/                   pnpm workspace
  core/                     Capability registry, evidence, guardrail
  cdr/                      CDR domain capabilities (added by P2 refactor)
  router/                   NL → capability mapper
  doc-gen/                  VitePress portal generator
  runtime-adapters/         Shell I/O adapters
engine/                     CLI shim
runtime/templates/          Markdown templates for workspace init
.dapei/                     Workspace config (schemas, rules, commands, workflows)
docs/                       Public docs (architecture, decisions, features, plans)
plans/                      Working design drafts (gitignored)
scripts/                    Release, version-check, sync, validate
tests/                      unit / integration / scenarios / ai-behavior
```

## Design rules

### Skills are nouns, capabilities are atoms, commands are verbs

| Layer | Role | Lives in |
|---|---|---|
| **Skill** | A domain of knowledge — when loaded into the AI's context, it teaches the AI how to think about that domain | `skills/<name>/SKILL.md` |
| **Capability** | A single deterministic engine operation with input schema, validation, and audit logging | `packages/*/src/capabilities/domains/*.ts` registered in `packages/core/src/capabilities/index.ts` |
| **Command** | A user-triggered workflow that chains 2+ capabilities to produce a deliverable | `commands/<name>.md` (added in P1) |

### Frontmatter contract (enforced by `scripts/validate-skills.mjs`)

Every `SKILL.md` must start with:

```yaml
---
name: <kebab-case>             # MUST equal directory name OR `dapei-<directory>`
description: <one sentence>. Use when <trigger 1>, <trigger 2>, or <trigger 3>.
---
```

### No silent code modification by the engine

The engine returns file listings (`cdr.entries.candidate`), validates evidence (`validateEvidencePoints`), and writes structured YAML once evidence passes. It does NOT pattern-match code, run regex over source, or infer business logic. Any capability that wants to do those things must be rejected in review.

### Cross-reference rules in command bodies

Commands may reference **capabilities by id** (`feature.create`, `cdr.entries.candidate`, etc.) — these are validated by `scripts/validate-skills.mjs` and are stable contract surface.

Commands **MUST NOT** hard-reference other skills' commands or skills' concepts in body prose. Use natural language only:

- ✅ "Want me to run **drift-check** to see stale assets?"
- ❌ "Run `@dapei /drift-check` to see stale assets." (the `/drift-check` is a command in another skill)
- ❌ "Apply the **cdr** skill." (commands orchestrate **capabilities**, not skills — load the skill explicitly via the description-trigger)

This keeps command bodies installable as standalone units in a future marketplace split, and prevents the "I called the wrong skill because its name was hard-coded" failure mode. Skill and command names in *body prose* should look like **bold nouns** the AI is invited to load, not `@dapei /<cmd>` invocations.

### Two dimensions, never confused

| Dimension | Files | When written |
|---|---|---|
| **Feature** | `features/<feature>/**` | During active feature work |
| **Workspace** | `docs/`, `.dapei/`, `repos/` | Only on `feature.close` or explicit `cdr.*` calls |

The AI working in a feature workspace MUST NOT write to workspace-dimension paths. The runtime context header reminds it. See `agents.md` § Dimension Rules.

## Common AI tasks in this repo

| Task | Skill / Tooling |
|---|---|
| Add a new capability | Add to `packages/*/src/capabilities/domains/<domain>.ts`, register in `packages/core/src/capabilities/index.ts`, add unit test in `tests/unit/`, add route in `packages/router/src/index.ts` |
| Change a SKILL.md | Edit the file, run `npm run validate:skills` |
| Add a new skill | `mkdir skills/<name>`, create `SKILL.md` with frontmatter, run validator |
| Add a new command (workflow) | Create `commands/<name>.md` with frontmatter (description, argument-hint), document workflow steps that reference capabilities by id |
| Add a route | Edit `packages/router/src/index.ts`, add regex + extractor, add test in `tests/unit/router.test.mjs` |
| Bump version | Use `scripts/release.sh`; it enforces the 6-source version sync via `scripts/check-version-consistency.sh` |
| Document a decision | Add an ADR to `docs/decisions/ADR-NNNN-<slug>.md` (template at `docs/decisions/TEMPLATE.md`) |

## Verify your changes

Single command before committing:

```bash
npm run verify   # typecheck + validate:skills + build + test + smoke
```

## What NOT to do

- Do NOT add framework-specific regex to the engine — the v0.3 "AI as scanner" pivot deleted 150 lines of this; don't reintroduce it.
- Do NOT make capabilities reach into `features/<feature>/` from workspace-dimension code.
- Do NOT skip the `confirmGate` for `solution-design`, `implementation`, `acceptance` — these are red lines.
- Do NOT add new top-level directories without updating `.gitignore` and this file.
- Do NOT commit anything from `plans/`, `.worktrees/`, `.omo/`, `.agent-shell/`, `dist/` — all gitignored intentionally.

## Where to find more

- `agents.md` — runtime operating contract (what the AI does at user request time)
- `docs/cdr-architecture.md` — CDR v0.3 architecture rationale
- `docs/release-process.md` — release/version-sync process
- `docs/features/` — per-feature delivery docs
- `docs/decisions/` — ADRs
- `docs/plans/` — committed implementation plans (this file is one)
- `CHANGELOG.md` — release log
