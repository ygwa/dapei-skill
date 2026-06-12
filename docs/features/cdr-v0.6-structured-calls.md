# CDR v0.6 — Structured Calls (feature/cdr-v0.6-structured-calls)

## What this PR delivers

The behavior artifact's `calls[]` field graduates from free-form
strings to a structured form that carries protocol, evidence, and the
callee's repo. The cognitive index learns about cross-repo behavior
relationships at the engine level. Pre-v0.6 string arrays keep
working.

### 1. `behavior.calls[]` schema evolution

`evidence.ts` accepts a mixed list:

```yaml
# Legacy (v0.5 and earlier) — still accepted
calls: ["PaymentClient", "InventoryService"]

# Structured (v0.6 preferred)
calls:
  - target: PaymentClient
    protocol: http
    target_repo: mall-payment
    evidence: { file: src/paymentClient.ts, line: 12, repo: mall-order }
  - target: order.events:order.created
    protocol: mq
    evidence: { file: src/events/publisher.ts, line: 3, repo: mall-order }
```

Per-entry validation rules:

| Field | Required | Notes |
|---|---|---|
| `target` | yes (object form) | Callee name. The same string shape as legacy. |
| `protocol` | optional | One of `http | grpc | mq | event | rpc | other`. |
| `target_repo` | optional | Repo that owns the callee. AI must declare explicitly. |
| `evidence` | optional | Single `SourceRef` (not an array — one call has one call site). |

The validation is additive: legacy strings pass through; structured
objects with no `target_repo` are accepted; only `target`-less objects
or out-of-whitelist `protocol` are rejected.

### 2. Hidden bug fix in `cdr.behavior.upsert`

The previous v0.5 implementation called `input.calls.map(String)`,
which silently coerced every object call into the literal string
`"[object Object]"`. The structured form was **lost on the way to
disk**. v0.6 preserves structure (`doc.calls = input.calls as
unknown as YamlValue`); an explicit unit test asserts that the
literal `"[object Object]"` never appears in a behavior YAML.

### 3. `cognitive-index.target_repos`

`IndexBehaviorEntry` grows an optional `target_repos: string[]`
field. The engine populates it during `upsertIndexEntry` by walking
`doc.calls[]` and collecting every `target_repo` that the AI declared
on a structured call. String calls contribute nothing. The field is
additive: pre-v0.6 index entries that lack it keep loading
without error.

The engine **deliberately does not** infer `target_repo` from a
free-form target string. Guessing "PaymentClient belongs to
mall-payment" is a semantic claim that has to come from the AI, not
from a name-matching heuristic.

### 4. `cdr.doc.generate` cross-service table

`generateBehaviorPage` now produces a `## Cross-service calls`
section that lists each structured call as
`Target / Protocol / Target repo / Evidence`. The section only
appears for behaviors with at least one `target_repo`. Legacy
behaviors (calls = string[]) render exactly as they did in v0.5.

The behavior's `## Calls` section also gets a per-entry upgrade:
object calls render as `- **target** [protocol]` with an optional
CodeLink pointing at the call-site evidence.

## What's NOT in this PR

- **`cdr.stale.scan`**. Still on the v0.4 StaleFields schema. Next
  Step 3 / v0.7 work.
- **CodeGraph integration**. The structured calls field is the
  substrate CodeGraph will populate in Step 3; v0.6 itself does
  not wire CodeGraph.
- **Auto-inference of `target_repo`**. The engine stays strict: only
  the AI's explicit `target_repo` is recorded. Heuristic
  inference (e.g., name-matching against registered repos) lands
  when CodeGraph joins the picture.
- **Refactor of `cognitive.artifact.upsert`** to take structured
  calls. The legacy `cognitive.*` namespace still stringifies
  calls. v0.7 (Step 3) will route it through the new evidence
  path if needed.

## How to verify locally

```bash
cd .worktrees/cdr-v0.6-structured-calls
npm run verify
# typecheck: clean
# test: 272 pass / 0 fail (222 unit + 29 integration + 13 scenarios + 8 ai-behavior)
# smoke: 16/16 + 4 L-levels PASS
```

## Files changed

| File | Change |
| --- | --- |
| `packages/core/src/evidence.ts` | Per-entry validation for the new calls[] form |
| `packages/core/src/cognitive-index.ts` | Optional `target_repos` field on `IndexBehaviorEntry`; extraction in `upsertIndexEntry` |
| `packages/core/src/capabilities/domains/cdr.ts` | `cdr.behavior.upsert` stops stringifying calls (the v0.5 silent bug fix) |
| `packages/doc-gen/src/doc-gen.ts` | Structured `## Calls` rendering and new `## Cross-service calls` section |
| `skills/cdr/SKILL.md` | Phase 2 documents the structured calls form and the field semantics |
| `tests/unit/cdr-calls-schema.test.mjs` | 8 new cases (legacy / mixed / structured / dedup / dedup-and-sort / validation rejections / no-evidence-allowed / map-String-bug-regression) |
| `tests/integration/cdr-v0.6-structured-calls.test.mjs` | End-to-end against the v0.4 mall-order + mall-payment fixtures |

## Breaking changes

None. v0.5 string calls still work; v0.5 fixtures still pass
validation. The only behavior change is the silent bug fix that
preserves structured calls on disk (previously they were silently
corrupted to `"[object Object]"` — that corrupted state is
impossible to produce going forward, but pre-v0.6 corrupted
artifacts in the wild will not be auto-migrated).

## ADR-style rationale

**Why mixed form, not strict structured form?**

A strict upgrade would break every pre-v0.6 fixture, every pre-v0.6
test, and every pre-v0.6 user workspace. The mixed form is
backward compatible: old strings continue to work and continue to
render; new structured objects carry the richer information.
Adoption can be incremental — AI converts one call at a time, and
the engine is no longer silently corrupting the ones the AI does
convert.

**Why is `target_repo` optional and not required?**

Required would force the AI to either guess (bad — it would just
make up repo names) or to refuse to write calls at all until it
can name every callee's repo. Optional is the honest product
position: the AI is in charge of stating what it knows; the engine
records whatever the AI says. Missing data is missing data; the
portal's "Cross-service calls" section simply does not appear,
and the cognitive index's `target_repos` is empty for that
behavior. The data is recoverable later by re-running CDR.

**Why no heuristic target_repo inference in v0.6?**

Heuristics rot. A name-matching pass that maps "PaymentClient" to
"mall-payment" works for the fixture we have, but the moment the
real system has a `paymentClient.ts` in `mall-order` (which is
already true in v0.4's fixture) the heuristic is wrong. The right
place to do this kind of inference is CodeGraph (Step 3), which
actually knows the module graph. Until then, the engine does the
honest thing: record what the AI says, no more.
