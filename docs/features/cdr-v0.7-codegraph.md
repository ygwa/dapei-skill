# CDR v0.7 — CodeGraph Integration (feature/cdr-v0.7-codegraph)

## What this PR delivers

The CodeGraph substrate promised in `docs/cdr-architecture.md` §7 is
finally wired in. The platform gains a real **finding** layer — a
way to discover code structure, cross-reference calls, and compute
blast radius — without losing the v0.3 "AI is scanner, engine is
validator" principle. The integration is fully **graceful**:
when the CLI is not installed, every affected capability falls
back to the v0.3-0.6 strategy and emits the same outputs it
always did.

### 1. `runtime-adapters/src/codegraph.ts`

A new `CodeGraphAdapter` class wraps the [lzehrung/codegraph] CLI
subprocess. Three operations are exposed:

| Method | Subcommand | Use |
| --- | --- | --- |
| `orient(repo, opts)` | `codegraph orient --budget small --json <repo>` | `cdr.entries.candidate` input |
| `refs(repo, anchor)` | `codegraph refs --json <anchor>` | `cdr.behavior.upsert` target validation |
| `impact(repo, base, head)` | `codegraph impact --json <base> <head>` | `cdr.stale.scan` blast radius |

A one-shot `which codegraph` probe at construction time; an
optional `DAPEI_CODEGRAPH_BIN` env var lets tests inject a fake.
When the probe fails, the adapter marks the workspace with
`.dapei/graph/.no-codegraph` so subsequent capability calls can
short-circuit the probe. The adapter's `runCliJson` helper
tolerates dialect mismatches: any non-JSON or empty stdout
returns an empty result with `available=false` rather than
throwing.

### 2. `cdr.profile` populates the `codegraph` block

The profile YAML now carries a `codegraph` block that records what
the substrate actually inspected:

```yaml
codegraph:
  available: true|false
  version: "1.8.x" | null
  backend: "native" | "fallback"
  files_total: 842
  apisurface_count: 12
  reason: "<if unavailable, why>"
```

The dangling `data.codegraph.files_total` reference in
`runtime/templates/docs/scripts/build-cognitive-pages.ts` is
finally populated. The profile write is best-effort: the adapter
init failure is a degraded-data signal, not a hard error.

The block is metadata about the substrate, not a claim about the
repo's framework — the v0.3 principle is preserved.

### 3. `cdr.entries.candidate` prefers CodeGraph

`orient` is tried first. When the CLI is present, the result is
structurally richer (each file carries an `apisurface_hint`; the
data block reports `files_total` and `apisurface_count`) and the
call returns `backend='native'`. When it is not, the capability
falls back to the v0.3 `listFilesRecursively` walk with
`backend='fallback'`. Existing callers see the same `files[]`
shape; new callers can branch on `data.backend` to take advantage
of richer output when present.

### 4. `cdr.behavior.upsert` cross-checks `calls[].target`

Structured calls (v0.6 form) that carry an `evidence` SourceRef
are now cross-checked against the call graph. The engine invokes
`adapter.refs(file:line)` and matches the returned callees
against the named `target` using exact / dot-tail / `topic:event`
substring rules.

- When the CLI is **present** and the target is NOT in the refs
  list, the call is **rejected** with `INVALID_EVIDENCE` — the
  user has CodeGraph and expects accuracy.
- When the CLI is **missing**, the check is **skipped** (graceful
  degradation) — the user has accepted the absence by not
  installing the CLI.

The single-doctor-probe design means every `calls[]` entry in a
single `upsert` invocation shares one CLI invocation.

### 5. `cdr.stale.scan` (new in v0.7)

Populates the v0.4 `StaleFields` reservation. The capability:

1. Computes the change set: `codegraph impact <repo> <base>..<head>`
   when the CLI is present, else `git diff --name-only
   <base>..<head> -- repos/<repo>/` as fallback.
2. Walks every behavior / state-machine / business-rule in the
   cognitive index, reads the YAML off disk, and inspects
   `sources[]` for paths that intersect the change set.
3. Marks each match's index entry with `stale=true`,
   `stale_reason`, `stale_at`, and `stale_base`.
4. Saves the index and returns a summary.

Pre-v0.7 assets keep working: the capability does not require
stale fields on existing entries, it only ADDS them on match.

When the diff is empty (no changes) the capability short-circuits
with a friendly report. When no asset's `sources[]` intersect the
change set, the capability reports zero matches.

### 6. Test fake: `tests/fixtures/fake-codegraph/codegraph`

A shell-script test double for the real codegraph binary. Tests
prepend the fixture directory to `PATH` so the
runtime-adapters `CodeGraphAdapter` probes the fake instead of
the real CLI. Supported subcommands: `orient`, `refs`, `impact`,
`doctor`. The `impact` command uses an inline python3 script for
JSON encoding because the bash heredoc approach was unreliable
with backslash-escaped strings.

## What's NOT in this PR

- **`cdr.graph.ensure`** as a separate capability. The doctor
  probe + no-codegraph marker combination already serves this
  purpose; an explicit `ensure` capability can land in v0.7.1 if
  users want to warm the index before running `stale.scan`.
- **Real CodeGraph installation instructions.** This PR ships the
  adapter; whether to install the actual CLI is a deployment
  decision. The README will get an optional-install note in a
  follow-up.
- **Auto-discovery of cross-repo relationships from CodeGraph**
  edges. v0.5 still owns that flow via `cdr.business.cross_link`;
  v0.7 only uses CodeGraph for finding (where code lives, who
  calls whom, blast radius), not for understanding.

## How to verify locally

```bash
cd .worktrees/cdr-v0.7-codegraph
npm run verify
# typecheck: clean
# test: 281 pass / 0 fail (230 unit + 30 integration + 13 scenarios + 8 ai-behavior)
# smoke: 16/16 + 4 L-levels PASS
```

## Files changed

| File | Change |
| --- | --- |
| `packages/runtime-adapters/src/codegraph.ts` | New: `CodeGraphAdapter` with `orient` / `refs` / `impact` / `doctor` |
| `packages/core/src/capabilities/domains/cdr.ts` | `cdr.profile` populates the codegraph block; `cdr.entries.candidate` prefers CodeGraph; `cdr.behavior.upsert` cross-checks targets; new `cdr.stale.scan` |
| `packages/core/src/capabilities/index.ts` | Register `cdrStaleScan` |
| `tests/fixtures/fake-codegraph/codegraph` | New: shell-script test double for the real codegraph CLI |
| `tests/unit/cdr-codegraph.test.mjs` | New: 9 unit tests (profile, entries native + fallback, behavior reject + accept + degrade, stale mark + empty + fallback) |
| `docs/features/cdr-v0.7-codegraph.md` | This file |
| `CHANGELOG.md` | Unreleased section |
| `.changeset/cdr-v0.7-codegraph.md` | Minor version bump |

## Breaking changes

None for users without the codegraph CLI installed: the v0.3-0.6
behaviour is preserved end-to-end. Pre-v0.7 stale fields are
optional; the index loader is forward-compatible.

For users with the codegraph CLI installed: `cdr.behavior.upsert`
is now stricter about structured calls — every `calls[].target`
with an evidence SourceRef must be reachable from the call site
in the call graph. This is the intended behaviour and matches
the cdr-architecture.md §7.1 "v0.7 strict gate" decision.

## ADR-style rationale

**Why graceful degradation rather than a hard dependency?**

The v0.3 principle is "AI is scanner, engine is validator". The
CodeGraph CLI is a substrate, not a validation rule. A workspace
without the CLI should still be usable: the engine has fallback
behaviours at every level (tree walk for orient, skip for refs,
git diff for impact). Requiring the CLI would have made dapei
unrunnable on machines that don't have it, and would have
duplicated the v0.3 dependency model in the wrong layer.

**Why cross-check `target` only when CodeGraph is present?**

Heuristic matching (e.g., "PaymentClient" → "mall-payment") is
exactly the kind of static-graph-as-business-truth claim that
cdr-architecture.md §13 says we reject. The engine stays honest:
when CodeGraph is present, the AI's target claim must match
actual call-graph edges. When it is not, we trust the AI's
declaration. The user is in control of the strictness.

**Why reserve `stale` fields without the scanner, then add the
scanner in the same release?**

The v0.4 StaleFields reservation was a schema commitment. Land
it, get the index loader to be forward-compatible, then add the
scanner. The alternative — a "scanner lands first" PR — would
have required a migration of every existing index entry. This
release is purely additive on the index side.

**Why a fake-codegraph fixture rather than skipping the unit
tests when no CLI is installed?**

The fake documents the expected CLI contract and lets the test
suite run identically in CI and on developer machines. The fake
is also useful for future "shape" tests: if a real CLI emits a
different field, the diff is a 30-line script change rather than
a 100-line test rewrite.
