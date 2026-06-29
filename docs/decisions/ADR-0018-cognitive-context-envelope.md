---
id: ADR-0018
title: "Cognitive context envelope — read-only structured context for P3→P5 jump"
status: proposed
date: 2026-06-27
deciders: [ygwa]
technical-story: "feature/m3-cognitive-jump (M3-4 + M3-5)"
---

## Problem Statement

The desktop's P3 Knowledge view shows a structured asset tree of cognitive
artifacts (behaviors, state-machines, domains, business-rules). When a user
finds a relevant asset and wants to "ask the agent about it", today's
options are bad:

1. **Copy-paste the YAML into chat** — dumps the whole artifact (often
   200+ lines) into the prompt. Wastes tokens and noise-bombs the agent.
2. **Type a freeform question** — the agent has to first read the asset
   via tool calls. Slow (extra round trip) and brittle (the agent may
   not find the exact file path).
3. **Add a new feature to build context** — forces the user to leave P3
   and start a new feature just to ask a question. Heavy.

We need a **lightweight context handoff** from P3 to P5: pick an asset,
get a small structured "envelope" pre-injected into the agent session,
ask the question in one round trip.

## Constraints

- **Read-only** — the envelope capability must NOT write any
  `docs/as-is/*.yaml` or `.dapei/cognitive/index.yaml`. The user's
  selection of a P3 asset must not have side effects on the asset
  itself or on the cognitive index.
- **Dimension-neutral** — must be callable from both feature dim
  (when the user is asking about a specific feature) and workspace
  dim (when the user is browsing assets generally). It is a READ
  with no dimension write implications.
- **Bounded size** — the envelope (summary + evidence + related_ids)
  must fit in a single agent prompt without exploding context. We
  cap at 8KB serialized.
- **No LLM** — the envelope is purely a function of disk content.
  No summarization, no embedding, no scoring.
- **Desktop-only** — the capability lives in the engine (for access to
  filesystem + cognitive index), but the *trigger* is a P3 UI button
  in the desktop. Other engine consumers (CLI, future web) can use
  it too without UI changes.

## Decision

Add a new engine capability `cdr.context.envelope` (v1.0.0) that, given
a `(target, id, repo?)` triple, returns a structured envelope with:

```ts
{
  envelope: {
    kind: "cognitive-asset-context",
    target: { type: "behavior", id: "order-create", repo: "mall-order" },
    summary: string,        // ≤ 500 chars; first 1-2 paragraphs of the yaml body
    evidence: Array<{
      file: string,
      line?: number,
      symbol?: string,
      repo?: string
    }>,                      // ≤ 10 items, from the asset's frontmatter sources[]
    related_ids: string[],  // ≤ 5 items, same-repo siblings (heuristic walk)
    generated_at: ISODate
  }
}
```

### Size guard

Total envelope ≤ 8KB. If exceeded, the executor drops `related_ids`
first, then truncates `summary`, and as a last resort emits a
minimal `{target, summary: <200 chars>, evidence: [], related_ids: []}`
envelope. The guard is in the executor; callers can trust the size.

### Heuristic related-ids walk

v0.10 of the cognitive index is **metadata only** — it does NOT carry
cross-references between assets (no `behavior_ids` on state-machines,
no `behavior_keys` on domains, no `applies_to` on business_rules).
Those references live in the on-disk yaml files.

v1.0.0 of `cdr.context.envelope` uses a **same-repo sibling heuristic**:
for a target behavior, list state-machines / domains / business-rules
in the same repo. This is a deliberate trade-off — the desktop UI can
show a "siblings" hint rather than a precise cross-link. A future
ADR (ADR-0019 / M3-6 advisor) may promote the heuristic to a true
graph walk with full yaml scanning.

### Persistence

The envelope is **not persisted to disk** by the engine. It is a
function-of-state output. The desktop persists its own copy at
`features/<f>/.dapei/last-attached-context.json` for the "what was
last attached to this feature's session" UI affordance (M3-5 §7
test #3: persistence).

### Serialization to agent prompt (M3-5)

The desktop's `envelopeToPrompt(envelope)` formats the envelope as a
fenced text block:

```
[dapei:cognitive-context]
target: behavior.order-create
repo: mall-order
summary: <500 chars>
evidence:
  - repos/mall-order/src/OrderService.ts:42 [createOrder]
related: order-cancel, order-refund
[/dapei:cognitive-context]
```

This is injected by `agent-host.ts` at attach-time, **after**
`session:ready` fires but **before** the first user message. The
desktop's chat input pre-fills `@dapei 基于 cognitive context: ...`
so the user can edit and send in one round trip.

## Consequences

### Positive

- P3 → P5 jump becomes a 1-click action: pick asset → auto-attach
  with context → ask question.
- No filesystem writes — picking an asset is now a free action
  (users no longer hesitate to "just look").
- Bounded prompt size — the 8KB guard prevents accidental prompt
  explosion (the plan §5 risk `envelope 大小失控` is mitigated).
- Reuses existing `loadCognitiveIndex` and `cognitivePaths` — no
  parallel asset-tracking system.

### Negative

- v1.0.0 related_ids is heuristic (same-repo siblings). The UI
  may show "related" assets that are not actually cross-linked in
  the user's domain. Mitigation: UI label says "siblings" not
  "related" until M3.6 advisor lands a real walk.
- The 8KB hard-cap means very large multi-evidence assets may
  drop the `related_ids` first. The summary (most important for
  the agent) is always preserved (only the last-resort fallback
  truncates it to 200 chars).

### Neutral

- A new capability means a new ADR; a new test suite; a new
  channel in the engine. Maintenance surface grows by one entry.

## Implementation Status

- **engine**: `cdr.context.envelope` v1.0.0 added to
  `packages/cdr/src/capabilities.ts` (Wave A.1 of the iteration).
  Registered in `packages/core/src/capabilities/index.ts` (Wave A.2).
- **desktop (M3-5)**: pending — services, IPC, UI, tests.

## Verification

- `pnpm --filter @dapei/core typecheck` clean
- `pnpm test` — 8 new test cases (per plan §M3-4 #4):
  1. `target=behavior, id=order-create` → returns full envelope
  2. `include_evidence=false` → no `evidence[]`
  3. `include_related=0` → empty `related_ids[]`
  4. non-existent id → `{ok:false, error:{code:'ENVELOPE_NOT_FOUND'}}`
  5. read-only spy — confirm no writer was called
  6. cross-repo behavior → evidence multi-repo
  7. 8KB size guard — oversize envelope truncated
  8. related_ids cross-kind (state-machine + domain + business-rule)
- `pnpm -r typecheck` clean

## Open Questions

- Should the desktop's `envelopeToPrompt` also include a JSON block
  (for agents that prefer structured input) or stay human-readable
  only? Defer to M3.7 docs.
- When the user picks a different feature in the P3 modal, do we
  invalidate the previous envelope? Plan §M3-5 says "切 feature
  时强制清除" — the desktop enforces this in the Inspector's
  "clear mount" button.
