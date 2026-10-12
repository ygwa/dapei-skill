---
id: ADR-0023
title: "Packages are real packages: name-based imports, an enforced boundary test, and one shipped bundle"
status: accepted
date: 2026-10-12
deciders: [ygwa]
technical-story: "repo-hardening"
---

## Problem Statement

ADR-0021 broke the package dependency cycle, but the package boundaries were
still cosmetic:

1. **Every cross-package import was a relative path** (`../../core/src/types.ts`,
   `../../../../runtime-adapters/src/system.ts`) — 30 of them in `packages/`,
   `engine/` and `scripts/`, plus ~81 in `tests/**`. Since a relative path can
   reach any file, `exports` maps were decorative: nothing stopped a package
   from importing another package's internals, or from importing a sibling it
   never declared as a dependency (`router` and `runtime-adapters` declared no
   dependencies at all, yet were imported everywhere).
2. **`pnpm install` never linked the workspace packages.** The `dependencies`
   blocks added in ADR-0021 were never resolved, so `node_modules/@dapei/*` did
   not exist and the declarations were documentation only.
3. **The one build artifact existed but nobody used it.**
   `npm run build` produced a self-contained `dist/dapei-engine.js`, while
   `scripts/dapei`, `scripts/dapei-guardrail` and `scripts/first-run.mjs` all
   ran `engine/dapei-engine.ts` through `--experimental-strip-types`. That made
   `node >= 22.6.0` a hard requirement for *every* user, even though the bundle
   needs no flags, and it left the build output unverified — the exact failure
   mode that had already bitten this repo once (`first-run.mjs` importing a
   `packages/core/dist/index.js` that no build ever produced).

## Decision

1. **Name-based imports.** Every cross-package import uses the package name and
   a subpath declared in the target's `exports` map (`@dapei/core/types`,
   `@dapei/core/internal/shared`, `@dapei/cdr/capabilities`,
   `@dapei/runtime-adapters/system`, `@dapei/catalog`, …). Subpaths are added to
   `exports` when a sibling genuinely needs them; the `internal/` prefix marks
   kernel helpers that exist only for the sibling capability packages.
   `packages/*` are private and source-first: `exports` point at `./src/*.ts`,
   and Node's type stripping loads them directly. Resolution works because the
   workspace links exist (`pnpm install` links each package's declared
   dependencies, plus the six packages at the repo root so root-level tests and
   scripts resolve them).

2. **The boundary is enforced, not documented.**
   `tests/unit/package-boundaries.test.mjs` runs in the normal unit glob and
   fails when: a relative specifier escapes its package; an imported
   `@dapei/<pkg>[/subpath]` is missing from the importer's declared
   dependencies or from the target's `exports`; a declared dependency is unused;
   or the package graph gains a cycle.

3. **One shipped artifact.** `dist/dapei-engine.js` (esbuild, self-contained)
   — **moved to `skills/engine/dapei-engine.js` by ADR-0025, which also made it
   committed skill content** —
   is *the* distribution artifact, and it is exercised: `npm run smoke:bundle`
   drives `workspace.init`, `cdr.index.list` and `route` through it with a plain
   `node` invocation, and CI runs the whole smoke suite twice — once through the
   source path and once with `DAPEI_USE_BUNDLE=1`. `scripts/dapei` and
   `scripts/dapei-guardrail` prefer **source when the checkout has it** (an
   edited `.ts` must never be shadowed by a stale bundle) and fall back to the
   bundle when it does not, which is the installed-skill case.

## Consequences

### Positive

- A package can no longer reach into another package's internals by accident:
  the module resolver and the boundary test both refuse it, and TypeScript
  resolves the same `exports` maps.
- The dependency graph is declared and checkable; `router` and
  `runtime-adapters` staying dependency-free is now a verified property rather
  than a coincidence.
- The shipped artifact is real and tested, so a consumer without a TypeScript
  toolchain (`node dist/dapei-engine.js …`) is a supported path instead of an
  untested claim. `npm run verify` covers both modes.

### Negative

- **No per-package `dist/`.** Publishing compiled libraries was considered and
  deliberately skipped: all six packages are `private`, the only in-repo
  consumer of the compiled output is the engine bundle, and a second build path
  whose artifacts nothing loads is how this repo grew its first
  "import a dist that does not exist" bug. If a package is ever published, add
  `publishConfig`/`files` and a real emit at that point.
- The bundle still reads `runtime/templates` and `.dapei/commands.yaml` from
  disk next to it, so shipping the bundle *without* the repo tree (e.g. inside
  an installed skill) needs the templates to travel with it — tracked as
  follow-up, not solved here.
- `node >= 22.6.0` remains the requirement for a source checkout; only the
  bundle lowers it (to `>= 20`). The dual path means both must be kept working,
  which CI now enforces.
