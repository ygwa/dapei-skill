---
id: ADR-0004
title: "Workspace and Feature dimensions are physically separated"
status: accepted
date: 2026-05-20
deciders: [ygwa]
---

## Problem Statement

When an AI is working on a feature, it would naturally want to update global docs/architecture/ or .dapei/cognitive/ as it learns. But mid-feature speculation pollutes the durable knowledge base. Other features then trust stale or incomplete claims.

## Decision

Two distinct dimensions:

| Dimension | Paths | When written |
|---|---|---|
| **Feature** | `features/<f>/**` | During active feature work |
| **Workspace** | `docs/`, `.dapei/`, `repos/` | Only on `feature.close` or explicit `cdr.*` capabilities |

The runtime context header (`features/<f>/context/runtime-context.md`) reminds the AI of its current dimension. CDR capabilities physically refuse to write into `features/<f>/`.

## Consequences

### Positive
- Durable knowledge stays curated
- Speculation is local; verified knowledge is global
- `feature.close` is the explicit promotion ceremony

### Negative
- Two paths to update the same concept (feature draft + close-time backfill)
- AI must remember the dimension constantly
