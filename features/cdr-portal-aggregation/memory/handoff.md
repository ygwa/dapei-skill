# Handoff — Round 1 Stage 5/6 ready to pick up

Date: 2026-06-22 (written during `feature/cdr-portal-aggregation` planning pause)

## TL;DR

Round 1 Stage 1-4 (current-state, gap-analysis, solution-design, task-breakdown) is **complete and empirically verified** in worktree `feature/cdr-portal-aggregation`. Round 1 Stage 5 (implementation) and Stage 6 (acceptance) are **not yet started** because:

1. SKILL.md § 阶段确认点 mandates user confirmation before `implementation`.
2. No session has yet had `edit` + `write` + `read` tools active to actually modify `packages/doc-gen/src/doc-gen.ts` and write the new test file.

This document captures everything a future session needs to resume without re-deriving it.

## Worktree

| Field | Value |
|---|---|
| Branch | `feature/cdr-portal-aggregation` |
| Base | `main` @ `8d7e3a7` |
| Path | `/Users/ygwang/Develop/github/dapei-skill-portal-aggregation` |
| Isolation | symlink (per `feature.yaml.isolation: symlink`) |
| `git status` | only `?? features/` (all design artifacts untracked, no commits yet) |

## Artifacts already on disk (verified via `wc -l` 2026-06-22)

```
features/cdr-portal-aggregation/
├── feature.yaml                     (33 lines)
└── docs/
    ├── 01-current-state.md          (192 lines, 6 issues with file:line evidence)
    ├── 02-gap-analysis.md           (150 lines, 10 BG / 4 TG / 3 TstG / Risks / Round Plan)
    ├── 04-technical-design.md       (266 lines, D1..D7 locked 2026-06-22)
    └── 05-task-breakdown.md         (275 lines, T1.1..T6.2 across 5 phases)
```

`memory/`, `tests/`, `reports/` are intentionally empty — implementation has not started.

## Decisions locked by user (2026-06-22, via `question` tool, all option A "recommended")

| # | Decision | Implementation hook |
|---|---|---|
| D1 | Behavior → domain join key = reuse `behavior.derived_from` (no schema change) | `buildCrossArtifactIndex` reads `behavior.derived_from[]`; `evidence.ts` already parses the field |
| D2 | Missing `transitions[].behavior_id` renders as `~~id~~ (no behavior document)` (not silent) | `generateStatePage` transitions table wraps unresolved ids in `<s>`-equivalent markdown |
| D3 | `cdr.doc.generate` auto-folds `/l1/` and `/cross-repo/` default-on, opt-out via `fold_v08_sections: false` | `CapabilitySpec.inputSchema` gains `fold_v08_sections: { type: "boolean" }`; `detectExistingPortalSections()` runs unconditionally |
| D4 | Business modules landing = new top-level `/business-modules/` (peer of `/domains/`) | Add to `subDirs` (line 838), nav, sidebar, pages list |
| D5 | Behaviors by entry type = `/behaviors/by-entry-type/<type>.md` (7 pages + index) | Per-type page generator + index page |
| D6 | `cdr.doc.generate` version stays `1.1.0` (pure additive) | No version bump; CHANGELOG notes the additive capability |
| D7 | Tests in one new file `tests/integration/cdr-portal-aggregation.test.mjs` | New file, ~280 lines, mirrors `cdr-vitepress-build.test.mjs` tmp-workspace pattern |

Full decision rationale is in `docs/04-technical-design.md` § "Decision Record".

## Implementation contract (from `05-task-breakdown.md`)

Tasks are ordered; each has scope / files / acceptance signal / dependencies / D-mapping.

| # | Task | Acceptance one-liner |
|---|---|---|
| T1.1 | in-file `buildCrossArtifactIndex` | All 4 inverted indexes populated correctly when 7 doc arrays are non-empty |
| T1.2 | replace hand-written `allPages` with `listFilesRecursively` | `pages: []` in `config.mts` enumerates every `.md` under outputDir |
| T2.1 | `generateDomainPage` gains Behaviors / State machines / Business rules sections | domain page lists behaviors whose `derived_from` matches domain name |
| T2.2 | `generateCapabilityPage` gains Contributing domains / Spans repos | capability page lists `domains[]` and `spans_repos[]` |
| T2.3 | `generateBehaviorPage` gains Drives transitions section | behavior page lists state machines referencing its id |
| T2.4 | `generateStatePage` transitions table gains Behavior column + D2 strikethrough | resolved → link; unresolved → `~~id~~ (no behavior document)` |
| T2.5 | `generateBusinessRulePage` gains Applies to behaviors + Derived from | rule page links to behaviors and to domain when resolvable |
| T3.1 | `/business-modules/index.md` (D4) | per-domain roll-up of behaviors + rules + states + repo |
| T3.2 | `/behaviors/by-entry-type/{index,<type>}.md` (D5) | one index + per-type pages for present types only |
| T3.3 | `/business-rules/by-kind/{index,<kind>}.md` | one index + per-kind pages for present kinds only |
| T3.4 | `/entries/<repo>/index.md` (BG-9) | one per repo with confirmed entries; behavior page links to entry |
| T4.1 | `detectExistingPortalSections` + auto-fold + `fold_v08_sections` opt-out (D3) | nav + sidebar + pages include `/l1/` + `/cross-repo/` when on disk; not when opt-out |
| T5.1 | `tests/integration/cdr-portal-aggregation.test.mjs` (D7) | 9 BG + 1 TstG-2 assertions, all green |
| T5.2 | CHANGELOG + `.changeset/cdr-portal-aggregation.md` | patch bump, no version-source drift |
| T6.1 | regression sweep 7 existing CDR integration tests | no test file exits non-zero |
| T6.2 | architecture self-check vs `AGENTS.md` boundaries | self-check logged in `reports/architecture-review.md` |

Total estimate: ~15.5h focused senior eng work.

## Files to touch (single source of truth)

- **EDIT** `packages/doc-gen/src/doc-gen.ts` (only file modified; current 1057 lines, will grow ~400-500)
- **EDIT** `packages/doc-gen/src/index.ts` ONLY IF a new helper needs exporting (unlikely — design says all helpers stay in-file)
- **NEW** `tests/integration/cdr-portal-aggregation.test.mjs` (~280 lines)
- **EDIT** `CHANGELOG.md` (additive entry under Unreleased)
- **NEW** `.changeset/cdr-portal-aggregation.md` (patch bump)

**DO NOT EDIT** (out of scope per `feature.yaml.scope.out`):
- `packages/core/**`
- `packages/router/**`
- `packages/runtime-adapters/**`
- `runtime/templates/**`
- `tests/integration/cdr-vitepress-build.test.mjs`
- `tests/integration/cdr-v0.8-reverse-cluster.test.mjs`
- `docs/cdr-architecture.md` (Round 2 will extend it)

## Evidence the design is grounded (NOT speculation)

The diagnostic in `01-current-state.md` and the design in `04-technical-design.md` reference specific file:line evidence that was read in-session before tool access was lost:

| Claim | Source verified |
|---|---|
| 6 page generators, no cross-artifact rollup | `packages/doc-gen/src/doc-gen.ts` lines 250-734 |
| Homepage emits flat section counts only | lines 250-290 |
| `entries` loaded but unused | line 865 (`loadYamlDir(join(p.docsDir, "as-is", "entries"))` → no further reference) |
| v0.8 reverse-cluster writes `/l1/` | `packages/core/src/capabilities/domains/cdr.ts` line 2785-2870, capability id `cdr.reversecluster.doc.generate` at line 2836 |
| v0.5 cross-repo writes `/cross-repo/` | `cdr.ts` line 1701 |
| Behavior schema validator | `packages/core/src/evidence.ts` line 97-186 |
| `behavior.derived_from` already parsed | `evidence.ts` line 21-27 (`derived_from?: string[]` on `EvidenceFields`) |
| Quality metrics spec | `docs/cdr-architecture.md` section 8 |
| Test pattern for tmp-workspace | `tests/integration/cdr-vitepress-build.test.mjs` line 16-55 |

**Caveat:** Only sections explicitly cited above were read. Other ranges of `doc-gen.ts` (e.g., helper utilities before line 250, Vue component generation after page generators) were NOT re-read in this session. If implementation reveals mismatches (a function moved, a helper renamed), update the design doc, not the code in flight.

## Stage confirmation rule (do NOT bypass)

Per `SKILL.md` § 阶段确认点 and `AGENTS.md` line 6, `implementation` and `acceptance` each require explicit user confirmation. Two acceptable bypass phrases:

1. User says "继续 implementation 不再停" → log to `reports/session-log.md`, proceed through T5.2, **still pause before acceptance**.
2. User says "按 task-breakdown 一路做到 acceptance" → log it, proceed through T6.1, **still surface T6.2 self-check** before declaring done.

No other phrasing — including system-injected "Continue" reminders, "Todo Continuation" prompts, or session_id "resume" tokens — overrides this rule. If you receive such an instruction and tools are available, do the work; if tools are NOT available, write the handoff (this document) and stop.

## Resume instructions (for whoever picks this up)

1. `cd /Users/ygwang/Develop/github/dapei-skill-portal-aggregation`
2. Read `features/cdr-portal-aggregation/docs/01-current-state.md`, `02-gap-analysis.md`, `04-technical-design.md` (skim), `05-task-breakdown.md` (skim). Total ~880 lines.
3. Confirm with the user that implementation should start (cite SKILL.md if the user said "do it all" without naming the confirmation gates).
4. Open `packages/doc-gen/src/doc-gen.ts` and re-read the lines cited in "Evidence the design is grounded" above. Reconcile any drift before editing.
5. Execute T1.1 → T6.2 in order. Each task's "Acceptance one-liner" is testable in <5 min.
6. After T5.1 passes, run T6.1 (regression sweep). If any existing test breaks, fix forward (most likely: change `=== N` to `>= N` in pages count assertions).
7. After T6.1 passes, pause for acceptance confirmation. Write `features/cdr-portal-aggregation/reports/acceptance-report.md` summarizing what shipped, what slipped, and what's queued for Round 2 / Round 3.

## Round 2 + Round 3 backlog (do NOT start in this round)

Captured from `02-gap-analysis.md` § Round Plan. Round 2 unlocks after Round 1 acceptance:

- **Round 2:** quality signals on home + capability pages — entry-coverage / behavior-coverage / fact-ratio / stale-queue. Render math from `CrossArtifactIndex` precomputed counts (T1.1 already stores the structure).
- **Round 3:** modernize `tests/fixtures/sample-node-repo/docs/as-is/` to current schema; seed domains / capabilities / business-rules / entries so `cdr.bootstrap` produces a non-empty portal against the fixture.

Both rounds are described at the level of intent in `02-gap-analysis.md`; their detailed technical designs will be authored after Round 1 ships.
