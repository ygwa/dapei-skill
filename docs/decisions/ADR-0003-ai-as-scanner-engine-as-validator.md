---
id: ADR-0003
title: "AI is the scanner; engine is the validator"
status: accepted
date: 2026-06-08
deciders: [ygwa]
technical-story: "feature/cdr-v0.3-ai-as-scanner (PR #4)"
---

## Problem Statement

CDR v0.2 hardcoded regex/annotation parsers for Spring / NestJS / FastAPI / Express into the engine (~150 lines of framework-specific code). Every new framework required new engine code. Worse, the engine was actively *stealing* a job the AI already does well — reading code.

## Decision

Invert responsibility:

- **Engine** returns a file listing with cheap metadata (`cdr.entries.candidate`).
- **AI** reads the file content (which the engine inlines) and identifies entry points using LLM understanding.
- **AI** submits each entry via `cdr.entries.propose` with `sources[]`.
- **Engine** validates: each `sources[].file` exists under `repos/<repo>/<file>`; each `line` is in range.
- `cdr.entries.confirm` REQUIRES `sources[]` (P1 red line).

## Alternatives Considered

### Option A: Keep engine scanning, extend with more frameworks
- **Cons:** Maintenance debt grows unboundedly; AI work is wasted

### Option B: Hybrid — engine scans common cases, AI fills the rest
- **Cons:** Two code paths to test; ambiguity about which the AI should trust

## Consequences

### Positive
- 150 lines of framework-specific code deleted
- Language-agnostic, framework-agnostic
- AI's strength (reading code) is used; engine's strength (deterministic validation) is preserved
- 35 framework-assertion tests replaced with 3 categories of evidence-validation tests

### Negative
- Higher token usage per propose call (AI reads more content)
- Slightly slower for very large repos
- Requires the AI to be capable of identifying entry points — small models may struggle

## References

- `docs/features/cdr-v0.3-ai-as-scanner.md`
- `docs/cdr-architecture.md`
- `packages/cdr/src/capabilities.ts` (post-T6)
