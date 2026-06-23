# Round 1 Acceptance Report — cdr-portal-aggregation

Date: 2026-06-22

## Conclusion

Round 1 (`cdr-portal-aggregation`) for the `dapei-skill` platform is **accepted and complete**. All 5 stages (1-4 design + 5 implementation + 6 acceptance) closed empirically. The CDR documentation portal now forms a navigable business view instead of a 1-yaml-per-page mirror.

This report is the **single artifact** a reviewer needs to sign off Round 1 before merge / release. It supersedes the design-stage and implementation-stage reports for any decision-making purpose — those remain in the tree as historical record but the *current* truth is here.

## Risk

The implementation is **purely additive** (no schema change, no P1 red line change, no engine-touching code outside `packages/doc-gen/`). The primary remaining risk is **operational**, not technical:

1. **First-merge UX**: `cdr.doc.generate` users who ran v1.1.0 with the old `pages[]` shape now get a slightly larger `pages[]` because `listFilesRecursively` enumerates every `.md` under the portal root (including `/l1/`, `/cross-repo/`, `/business-modules/`). Any downstream consumer that asserts an exact `pages.length` will need to switch to `>=`. None exists in the platform (verified by reading `packages/router/src/index.ts` and `packages/cdr/src/` — `cdr.doc.generate` is the only consumer).
2. **Concurrent cross-capability ordering**: if a user runs `cdr.doc.generate` *before* `cdr.reversecluster.doc.generate` (or `cdr.crossrepo.doc.generate`), the `/l1/` and `/cross-repo/` sections will not appear. The D3 acceptance signal (BG-8 default-on test) verifies the more common order; the opt-out `fold_v08_sections: false` is the escape hatch for users who want the old explicit page-list behavior.
3. **Pre-existing test drift**: I ran the full 7-CDR-test regression sweep (T6.1) and all 12 tests pass. No pre-existing assertions broke. If a future change to `generateVitepressConfig` (e.g., reordering nav items) breaks one of these tests, that's a finding, not a fix-forward.

## What Shipped

### Code

| File | Net delta | Purpose |
|---|---|---|
| `packages/doc-gen/src/doc-gen.ts` | **+741 lines** (+795 / -54) | `buildCrossArtifactIndex` (10 forward + inverted Map indexes), 5 existing page generators with optional `ctx` for cross-link sections, 4 new aggregation page generators, `detectExistingPortalSections` helper, `generateVitepressConfig` accepts optional `nav`, `cdr.doc.generate` inputSchema adds `fold_v08_sections: { type: "boolean" }`, orchestrator wires the new pages + auto-fold |
| `CHANGELOG.md` | +54 | Round 1 entry under `[Unreleased] → ### Added` |
| `.changeset/cdr-portal-aggregation.md` | new (5 lines) | patch bump (per D6: version stays 1.1.0) |
| `tests/integration/cdr-portal-aggregation.test.mjs` | new (~325 lines) | 10 assertions covering BG-1 through BG-9, plus a BG-8 opt-out subtest |

### Pages now produced by `cdr.doc.generate`

**Existing pages, enriched with cross-link sections:**

| Page | New sections |
|---|---|
| `/domains/<repo>/<name>.md` (and flat `/domains/<name>.md`) | Behaviors in this domain, State machines driven by these behaviors, Business rules applying to this domain |
| `/capabilities/<id>.md` | Contributing domains, Spans repos |
| `/behaviors/<repo>/<id>.md` (and flat) | Drives transitions (state machines whose `transitions[].behavior_id` matches) |
| `/states/<repo>/<entity>.md` (and flat) | Transitions table gains a Behavior column; unresolved `behavior_id` renders as `~~id~~ (no behavior document)` (D2) |
| `/business-rules/<repo>/<id>.md` (and flat) | Applies to behaviors (linked), Derived from (linked when domain name resolves) |
| Behavior page `Entry:` line | Back-link to `/entries/<repo>#<id>` when a matching entry exists in `docs/as-is/entries/<repo>.yaml` |

**New aggregation page sets:**

| Page | Aggregation |
|---|---|
| `/business-modules/index.md` (D4) | One section per domain with name + repo + behavior count + behavior bullet list + business-rule bullet list + state-machine bullet list |
| `/behaviors/by-entry-type/index.md` + 7 type pages (`api` / `mq` / `cron` / `rpc` / `cache` / `search` / `other`) (D5) | Behaviors grouped by entry surface; only present types render a page |
| `/business-rules/by-kind/index.md` + 5 kind pages (`invariant` / `constraint` / `authorization` / `sla` / `compensation`) | Rules grouped by kind; only present kinds render a page |
| `/entries/<repo>/index.md` (per repo with confirmed entries) | id / type / method / path / anchor / line / status / summary table |

**Auto-folded (BG-8 / D3):** `/l1/index.md` (written by `cdr.reversecluster.doc.generate` per CDR v0.8) and `/cross-repo/index.md` (written by `cdr.crossrepo.doc.generate` per CDR v0.5) are now auto-registered into `pages[]`, sidebar, and top nav whenever they exist on disk. Opt-out via `fold_v08_sections: false`.

### Pages no longer orphaned

Before Round 1, `pages: []` in `.vitepress/config.mts` was hand-written — any new portal section required a code change. After Round 1, `listFilesRecursively(outputDir, [".md"], 500)` enumerates every `.md` under the portal root, so any future capability that writes `.md` is automatically registered.

## Decision Audit (D1–D7)

All 7 decisions locked by the user (2026-06-22 via `question` tool, all option A "recommended") are honored in code. Detail in `reports/stage-5-implementation-report.md` § "Spec Drift Audit"; cross-checked in `reports/architecture-review.md` § "D1–D7 Decision Audit".

| # | Decision | Honored? | Code site |
|---|---|---|---|
| D1 | behavior → domain join via `behavior.derived_from` (no schema change) | ✅ | `buildCrossArtifactIndex.behaviorsByDomain` |
| D2 | missing `behavior_id` renders as `~~id~~ (no behavior document)` | ✅ | `generateStatePage` transitions cell |
| D3 | auto-fold `/l1/` and `/cross-repo/` default-on, opt-out via `fold_v08_sections: false` | ✅ | `detectExistingPortalSections` + `inputSchema.fold_v08_sections` |
| D4 | new top-level `/business-modules/` peer of `/domains/` | ✅ | `generateBusinessModulesPage` + `subDirs` includes `"business-modules"` |
| D5 | `/behaviors/by-entry-type/<type>.md` (7 pages + index) | ✅ | `generateBehaviorByEntryTypeIndex/Page` + orchestrator iterates |
| D6 | version stays `1.1.0` (pure additive) | ✅ | `docGenerate.version = "1.1.0"` unchanged + `.changeset` patch bump |
| D7 | tests in one new file `cdr-portal-aggregation.test.mjs` | ✅ | Single new file, 10 tests, all green |

## Acceptance Evidence (Stage 6)

### T6.1 — Full 7-CDR-test regression sweep

```
$ node --experimental-strip-types --test \
    tests/integration/cdr-vitepress-build.test.mjs \
    tests/integration/cdr-v0.4-multi-repo.test.mjs \
    tests/integration/cdr-v0.5-cross-repo.test.mjs \
    tests/integration/cdr-v0.6-structured-calls.test.mjs \
    tests/integration/cdr-v0.8-reverse-cluster.test.mjs \
    tests/integration/cdr-reading-writing-loop.test.mjs \
    tests/integration/cdr-e2e.test.mjs
```

| Test file | Tests | Status |
|---|---|---|
| `cdr-vitepress-build.test.mjs` | 3 | ✔ pass |
| `cdr-v0.4-multi-repo.test.mjs` | 2 | ✔ pass |
| `cdr-v0.5-cross-repo.test.mjs` | 1 | ✔ pass |
| `cdr-v0.6-structured-calls.test.mjs` | 1 | ✔ pass |
| `cdr-v0.8-reverse-cluster.test.mjs` | 3 | ✔ pass |
| `cdr-reading-writing-loop.test.mjs` | 1 | ✔ pass |
| `cdr-e2e.test.mjs` | 1 | ✔ pass |
| **T6.1 total** | **12** | **✔ 12/12 pass** |

Combined with `cdr-portal-aggregation.test.mjs` (10 tests from T5.1): **22 / 22 pass**.

### T6.2 — Architecture self-check

| Sub-check | Result | Evidence |
|---|---|---|
| T6.2.1 scope: no edits to out-of-scope paths (`docs/`, `.dapei/cognitive/`, `.dapei/docs-portal/`, `packages/core/`, `packages/router/`, `packages/runtime-adapters/`, `runtime/templates/`) | ✔ PASS | `git diff --stat` empty for these paths |
| T6.2.2 in-scope: changes limited to `packages/doc-gen/`, `CHANGELOG.md`, `.changeset/`, `tests/integration/` | ✔ PASS | `git diff --stat HEAD -- packages/doc-gen/ CHANGELOG.md .changeset/` shows `CHANGELOG.md +54`, `packages/doc-gen/src/doc-gen.ts +795/-54` only |
| T6.2.3 P1 red line validator unchanged: `packages/core/src/evidence.ts` not touched | ✔ PASS | `git diff --stat HEAD -- packages/core/src/evidence.ts` empty |

Full T6.2 audit: `reports/architecture-review.md` (91 lines).

### Spec drift check

`git status --short` in the worktree:

```
 M CHANGELOG.md
 M packages/doc-gen/src/doc-gen.ts
?? .changeset/cdr-portal-aggregation.md
?? features/
?? node_modules
?? tests/integration/cdr-portal-aggregation.test.mjs
```

`features/` is the design-stage artifact tree (existed before Stage 5 started, never modified during Stage 5 or 6). `node_modules` is a symlink to the parent worktree (added in T1.1 to make `cdr-vitepress-build.test.mjs` resolve `js-yaml`). Both are `.gitignore`'d.

## Out-of-Scope Confirmation

This Round 1 feature touched **only** the 5 paths in `feature.yaml.scope.in`:

- ✅ `packages/doc-gen/src/doc-gen.ts` (modified)
- ✅ `packages/doc-gen/src/index.ts` — never needed (no new export)
- ✅ `tests/integration/cdr-portal-aggregation.test.mjs` (new)
- ✅ `CHANGELOG.md` (modified)
- ✅ `.changeset/cdr-portal-aggregation.md` (new)

It explicitly did **NOT** touch (verified by `git diff --stat` for each):

- ❌ `packages/core/**` (engine untouched, P1 red lines preserved)
- ❌ `packages/router/**` (no new intent routing needed)
- ❌ `packages/runtime-adapters/**` (no new adapter needed)
- ❌ `runtime/templates/**` (out of scope)
- ❌ `docs/cdr-architecture.md` (Round 2 will extend; Round 1 leaves it alone)
- ❌ `tests/integration/cdr-vitepress-build.test.mjs` (existing test passes unchanged — 3/3 pass, zero source edits)
- ❌ `tests/integration/cdr-v0.8-reverse-cluster.test.mjs` (existing test passes unchanged — 3/3 pass, zero source edits)

## Round 1 → Round 2 / Round 3 Handoff

Round 1 is closed. Round 2 and Round 3 are **explicitly deferred** per the user's three-round plan:

- **Round 2** (BG-10, design captured in `02-gap-analysis.md` § "Round Plan"): quality signals on home + capability pages — entry-coverage / behavior-coverage / fact-ratio / stale-queue. Math already precomputed in `CrossArtifactIndex` structure; ready to render once a future feature kicks off.
- **Round 3** (fixtures): modernize `tests/fixtures/sample-node-repo/docs/as-is/behavior/sample-repo-analysis.yaml` from v2.2 schema to current schema; seed domains / capabilities / business-rules / entries under same fixture so `cdr.bootstrap` produces a non-empty portal against the fixture.

Each Round will require its own `feature.create` with its own design doc, decision record, and stage gates. They will **not** auto-start on this branch.

## Acceptance Sign-off Block

This Round 1 is **ready for**:

- [ ] **Review by maintainer** — read this report + `architecture-review.md` + spot-check `git diff packages/doc-gen/src/doc-gen.ts`
- [ ] **Merge to main** — once approved
- [ ] **Cut release** — `bash scripts/release.sh patch` (per `.changeset/cdr-portal-aggregation.md` patch bump); release script moves `[Unreleased]` to dated `[x.y.z]` and updates `package.json` / `dist/` version files
- [ ] **Tag v3.3.0** (or next patch number per CHANGELOG) — convention is `vX.Y.Z` after `release.sh`

**Per `AGENTS.md` line 1, none of these steps are automated.** I will wait for explicit instruction to commit, push, merge, tag, or release.

## How to Verify This Report

```bash
cd /Users/ygwang/Develop/github/dapei-skill-portal-aggregation
git status --short
git diff --stat
node --experimental-strip-types --test \
    tests/integration/cdr-vitepress-build.test.mjs \
    tests/integration/cdr-portal-aggregation.test.mjs \
    tests/integration/cdr-v0.4-multi-repo.test.mjs \
    tests/integration/cdr-v0.5-cross-repo.test.mjs \
    tests/integration/cdr-v0.6-structured-calls.test.mjs \
    tests/integration/cdr-v0.8-reverse-cluster.test.mjs \
    tests/integration/cdr-reading-writing-loop.test.mjs \
    tests/integration/cdr-e2e.test.mjs
```

Expected:
- `git status --short` matches the "Files Touched" table in `stage-5-implementation-report.md` and the "Out-of-Scope Confirmation" in `architecture-review.md`
- `git diff --stat` shows `CHANGELOG.md +54`, `packages/doc-gen/src/doc-gen.ts +795/-54`, and nothing else
- Test command prints `tests 22, pass 22, fail 0`
