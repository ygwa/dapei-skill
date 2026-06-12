---
id: ADR-0002
title: "Every cognitive artifact carries a typed confidence + conditional evidence block"
status: accepted
date: 2026-05-23
deciders: [ygwa]
technical-story: "Cognitive Runtime Phase 1 (2.2.0)"
---

## Problem Statement

LLMs hallucinate. Without a discipline forcing the AI to cite evidence, cognitive artifacts (behavior, state-machine, domain) drift into plausible-but-wrong claims that the next agent then trusts.

## Decision

Every YAML artifact MUST carry:

```yaml
confidence:
  level: high | medium | low
  kind: fact | inference | unknown
```

with conditional fields by `kind`:

| Kind | Required additional field |
|---|---|
| `fact` | `sources: [{ file, line?, symbol_handle?, repo? }]` |
| `inference` | `derived_from: [<artifact-id>, …]` |
| `unknown` | `reason: <string>` |

The engine REJECTS any artifact where `kind` does not match the supplied evidence type. This is enforced in `packages/core/src/evidence.ts` and shared by six capabilities via `validateEvidencePoints()`.

## Consequences

### Positive
- Reviewers can audit confidence at a glance
- Stale-check (`cdr.asset.stalecheck`) compares `sources[].file` mtime to detect when fact-level artifacts became uncertain
- Forces AI to point at a file/line, not paraphrase

### Negative
- Slightly more verbose YAML
- AI must spend tokens on `sources[]` extraction

## References

- `.dapei/schemas/evidence.schema.yaml`
- `packages/core/src/evidence.ts`
- `agents.md` § P1 Red Lines
