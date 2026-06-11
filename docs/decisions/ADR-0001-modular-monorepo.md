---
id: ADR-0001
title: "Split dapei into a pnpm workspace of focused packages"
status: accepted
date: 2026-05-15
deciders: [ygwa]
technical-story: "feature/modular-refactor"
---

## Problem Statement

Pre-2.0 dapei was a single monolithic shell script that mixed CLI parsing, file I/O, schema validation, capability registry, and routing. Adding any new feature touched the whole file.

## Constraints

- Must continue to run as a single binary CLI for backward compatibility.
- Must not require users to install pnpm — pnpm is a contributor tool only.
- TypeScript strict mode required throughout.

## Decision

Adopt a pnpm workspace with four focused packages:

| Package | Responsibility |
|---|---|
| `@dapei/core` | capability registry, evidence validation, cognitive index, guardrail |
| `@dapei/router` | NL intent → capability mapping, extractors |
| `@dapei/doc-gen` | VitePress portal generation (carries the Vue 3 dep tree) |
| `@dapei/runtime-adapters` | thin shell I/O adapters (file/git/FS) |

A single-file CLI shim at `engine/dapei-engine.ts` imports from `@dapei/core` and `@dapei/router` and is bundled by esbuild into `dist/dapei-engine.js`.

## Alternatives Considered

### Option A: Stay monolithic, extract by file inside one package
- **Pros:** Simpler dep graph; no workspace coordination
- **Cons:** Cannot evolve VitePress dep independently of core; CDR file grows unboundedly

### Option B: Multi-repo (one repo per package)
- **Pros:** Clearest install boundary
- **Cons:** Requires npm publish for cross-package work; high overhead for solo maintainer

## Consequences

### Positive
- Each package has its own clear responsibility; CDR can later become `@dapei/cdr` (now realized in 3.1.0)
- VitePress dep tree isolated to `@dapei/doc-gen`
- Independent version possible (`@dapei/doc-gen` is at 1.0.0, others at 3.0.0)

### Negative
- Contributor must understand pnpm workspace mechanics
- Multiple version sources must stay in sync (enforced by `scripts/lib/release-version.mjs`)

### Neutral
- Bundling via esbuild is invisible to end users

## References

- `pnpm-workspace.yaml`
- `scripts/lib/release-version.mjs`
- `docs/release-process.md`
- CHANGELOG entries from 2.2.0 onward
