# CDR Reading/Writing Loop Closure (feature/cdr-reading-writing-loop)

## What this branch delivers

Closes the read side and the lifecycle wiring that has been missing
since CDR v0.1–v0.9 shipped. The 9-phase write pipeline already
turns code into structured cognitive artifacts; what remained was
(1) a way to ask the asset base questions, (2) a way for the engine
to tell the AI which capability to call next instead of the AI
guessing, and (3) a way to know which artifacts came out of which
feature. Four PRs land together; they ship one user story:
"the AI can both read and write the engineering knowledge graph,
and feature close knows what it produced."

The four PRs are sequenced for independent review: each is a
self-contained commit. Merge in order (#7.1 → #7.2 → #7.3 → #7.4).

---

## PR #7.1 — CDR query API (commit `7ed8d06`)

### `cdr.index.list` new filters

Three additive filters on the existing capability:

- `entity` — exact match against state-machine entity
- `id_contains` — substring match against behavior id / state-machine
  entity / business-rule id
- `created_by_feature` — exact match against an asset's origin tag
  (added in #7.3; pre-v0.10 entries without the field return
  empty rather than erroring)

Existing `repo` and `kind` filters are unchanged. The capability
version bumped from 1.0.0 to 1.1.0.

### New capability `cdr.query`

Read-only cross-cut search. Inputs:

- `target` — `any | behavior | state-machine | business-rule | domain
  | capability-map`
- `entity` — exact match (state-machine)
- `id_contains` — substring
- `event` — behaviors whose `events[]` contain this substring
- `writes_table` — behaviors whose `writes[].table` contain this
- `calls_target` — behaviors whose `calls[]` (string or v0.6
  structured object) target this
- `target_repo` — behaviors whose `calls[].target_repo` matches
- `created_by_feature` — exact match against origin tag
- `repo` — exact match
- `limit` — default 50, clamped to [1, 500]

Output: `{ results: [...], total, next_step }`. The result entries
carry `kind`, `id`, `repo?`, `path`, `summary` (first 200 chars of
the artifact's description), and `sources[]`.

**Behavior-shaped filters (`event`, `writes_table`, `calls_target`,
`target_repo`) suppress state-machines from results** — those
filters are not semantically applicable to state-machines, so a
non-empty match there would be a false positive. The explicit
`target: state-machine` path bypasses this guard.

The capability is read-only by hard contract. A dedicated test
asserts the cognitive-index file bytes are identical before and
after a query.

### Wiring

- `cdrQuery` registered in `packages/core/src/capabilities/index.ts`
- `tests/unit/documentation-contract.test.mjs` whitelist extended
  with `cdr.query`
- 14 new unit test cases in `tests/unit/cdr-query.test.mjs`

---

## PR #7.2 — Pipeline next-step guidance (commit `bcae6e8`)

### New capability `cdr.pipeline.status`

Read-only status report of every phase of the 9-phase repos→docs
pipeline for a single repo. Inputs:

- `repo` (required)
- `up_to_phase` (optional) — `profile | entries | behavior | state |
  domain | rule | capability-map | doc | all` (default `all`)

Output:

```
{
  repo,
  phases: [
    {
      id: "profile" | "entries" | ... | "doc",
      status: "done" | "blocked" | "skipped",
      artifacts_count: number,
      next_action?: {
        capability: string,
        input_template: {
          repo?: string,
          required_fields: Array<{ name, type, description }>
        },
        hint: string
      }
    },
    ...
  ],
  overall_status: "empty" | "partial" | "complete",
  next_step: string
}
```

The 8 phases match the canonical repos→docs pipeline documented in
`skills/cdr/SKILL.md`. Each phase's `blocked` state is a typed
predecessor:

- `behavior` is blocked until at least one entry is `confirmed`
- `state` is blocked until at least one behavior exists for the repo
- `domain` is blocked until behaviors exist
- `capability-map` is blocked independently
- `doc` is blocked until the capability map exists
- `rule` defaults to `skipped` (business rules are opt-in)

Both `done` and `skipped` count as complete in `overall_status`.

`up_to_phase` truncates the report at the named phase. Default is
`all`.

`next_action` carries the exact capability the AI should call next,
the required fields, and a one-line hint. When the AI is in the
middle of a partial pipeline, this is the only authoritative
recommendation — no more guessing.

The capability is read-only. A dedicated test snapshots the
`docs/as-is/` tree before and after the call and asserts only
the engine's own side-effects (a profile yaml written by
`cdr.profile` in the test setup) are present.

### Wiring

- `cdrPipelineStatus` registered in `packages/core/src/capabilities/index.ts`
- `tests/unit/documentation-contract.test.mjs` whitelist extended
  with `cdr.pipeline`
- 10 new unit test cases in `tests/unit/cdr-pipeline-status.test.mjs`

---

## PR #7.3 — Feature close links CDR artifacts (commit `7d25267`)

### Five `IndexEntryType` interfaces gain optional fields

`IndexBehaviorEntry`, `IndexStateMachineEntry`, `IndexDomainEntry`,
`IndexCapabilityMapEntry`, and `IndexBusinessRuleEntry` all gain
two additive optional fields:

- `created_by_feature?: string` — feature that produced this asset
- `created_at?: string` — ISO timestamp at which the asset was
  created or last tagged

Pre-v0.10 index entries that lack these fields keep loading
without error. `cdr.query` with the `created_by_feature` filter
yields empty rather than erroring on such legacy entries.

### New capability `cdr.feature.link`

Tags every CDR asset touched by a feature with
`created_by_feature: <feature>` and `created_at: <iso-timestamp>`.

Inputs:

- `feature` (required)
- `repo` (optional) — restrict to assets from a single repo

The capability:

1. Scans the cognitive index (`behaviors`, `state_machines`,
   `business_rules`) and stamps matching entries
2. Scans `docs/as-is/domains/*.yaml` and stamps them on disk
3. Scans `docs/as-is/capabilities/*.yaml` and stamps them on disk
4. Idempotent: re-running on the same feature is a no-op
   (`assets_tagged: 0`)

Hard contract: only `feature.close` and `feature.review` are
expected callers. The tag is one-way; there is no
`cdr.feature.unlink` (deliberate).

### `feature.close` v2.0.0 — auto-invokes `cdr.feature.link`

`feature.close` (version 1.0.0 → 2.0.0) now calls
`cdr.feature.link` on the way out, after writing
`docs/decisions/<feature>-decisions.md` and before tearing down
the worktree. The result data gains `cdr_assets_tagged: <n>` so
the AI sees the link count in the close response.

The `feature.close` invocation uses `runCapability("cdr.feature.link", ...)`
indirection rather than a direct `cdrFeatureLink.execute(...)`
import. This matches the pattern that `repos.analyze` uses to
call `cdrProfile` across the same feature branch (PR #6.1+3) and
keeps the two files independent at module-load time.

### Wiring

- `cdrFeatureLink` registered in `packages/core/src/capabilities/index.ts`
- `skills/cdr/SKILL.md` routing table gains `cdr.feature.link`; the
  Phase 7 (Query) section now explains the `created_by_feature`
  source
- `tests/unit/documentation-contract.test.mjs` whitelist extended
  with `cdr.feature`
- 7 new unit test cases in `tests/unit/feature-close-cdr-link.test.mjs`

---

## PR #7.4 — E2E + feature delivery doc + CHANGELOG

- `tests/integration/cdr-reading-writing-loop.test.mjs` — one
  end-to-end test that walks the full write pipeline (profile →
  entries → behavior → state → domain → capability-map →
  doc.generate) and then exercises every read surface
  (`cdr.pipeline.status`, `cdr.query` by entity / event /
  calls_target / target_repo / created_by_feature, and
  `feature.close` auto-tagging).
- `docs/features/cdr-reading-writing-loop.md` (this file).
- `CHANGELOG.md [Unreleased]` consolidates the four PRs into one
  P1 release entry.

---

## What this enables for the AI

The writing loop was already self-service: the AI could call
nine capabilities in sequence to build a cognitive index from
code. The reading loop was not. With these four PRs:

1. **The engine tells the AI what to call next.** `cdr.pipeline.status`
   returns the exact `next_action.capability` and the
   `input_template.required_fields` for the next unfinished
   phase. No more guessing.
2. **The AI can answer questions about the asset base.** "What
   behaviors span `mall-order` and `mall-payment`?"
   `cdr.query { target_repo: 'mall-payment' }`.
   "What came out of feature X?"
   `cdr.query { created_by_feature: 'X' }`.
3. **Feature close knows what it produced.** The
   `docs/decisions/<feature>.md` closeout can now list
   `<kind, id, repo>` tuples that the feature authored, by
   querying `cdr.query { created_by_feature: <feature> }`. The
   previous closeout was a stub; now it has a body to populate.
4. **The `created_by_feature` origin is durable.** Pre-v0.10
   assets load without error and yield empty for any origin
   filter — the field is additive, not a migration.

---

## Verification

- `npm run typecheck` — clean
- 297 unit + 33 integration + 13 scenarios + 8 ai-behavior + 16
  smoke = 367 tests, 0 failures (was 266 on main before this branch)
- `validate:skills` — 0 errors, 0 warnings
- E2E `tests/integration/cdr-reading-writing-loop.test.mjs` —
  1 test, 0.9s, passes

---

## Branch state

`feature/cdr-reading-writing-loop` based on main (`cb2832d`).
Three implementation commits (#7.1, #7.2, #7.3) plus this PR
(#7.4) for 4 commits total ahead of main. No pushes to
`origin` yet.

## Followups (separate branches)

- PR #6.4 (validation COG-001 gate, BREAKING default on) — the
  `cdr.pipeline.status` output will be what an AI sees when
  COG-001 fails.
- Task 3 (changesets CLI integration) — orthogonal; uses the
  same release flow.
- v0.10 features that ride on top of the new read API:
  saved named queries, query-driven review reports, and the
  capability-map's `fact_ratio` enrichment from
  `created_by_feature` distribution.
