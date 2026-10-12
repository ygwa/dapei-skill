---
"dapei-skill": minor
---

**Packages are real packages, and the shipped engine bundle is what runs.**

Cross-package imports now go through the package name and its `exports` map
(`@dapei/core/types`, `@dapei/core/internal/shared`, `@dapei/cdr/capabilities`,
`@dapei/runtime-adapters/system`, `@dapei/catalog`, …) instead of relative paths
that escaped the package directory — 30 call sites in `packages/`, `engine/` and
`scripts/`, plus 81 in `tests/**`. `pnpm install` links the workspace packages
for the first time (the `dependencies` blocks from the previous round were
declarations only). `tests/unit/package-boundaries.test.mjs` enforces the
boundary in the normal unit suite: no relative escape out of a package, no
undeclared `@dapei/*` import (or subpath missing from the target's `exports`),
no unused declared dependency, no cycle in the package graph.

`dist/dapei-engine.js` becomes the distribution artifact instead of an unread
build output: `scripts/dapei`, `scripts/dapei-guardrail` and
`scripts/first-run.mjs` run the source when a checkout has
`engine/dapei-engine.ts` and the bundle otherwise (`DAPEI_USE_BUNDLE=1` forces
the bundle), `npm run smoke:bundle` proves the bundle initializes a workspace,
reaches a CDR capability and routes, and CI runs the smoke suite twice — once
per mode. The bundle needs no `--experimental-strip-types`, so it runs on
Node ≥ 20 while a source checkout keeps the documented ≥ 22.6.0. See ADR-0023.
