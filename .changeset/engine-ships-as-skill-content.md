---
"dapei-skill": minor
---

**The engine ships as skill content, so installing the skill installs a working
engine.**

`dist/dapei-engine.js` moved to `skills/engine/dapei-engine.js` and became a
plugin payload alongside a new `skills/engine/SKILL.md` (how to resolve and
invoke the engine, and the obligation to report a missing entry instead of
narrating a capability that never ran) and `bundle-manifest.json`. The
marketplace manifest lists it as `dapei-engine`, and the version checker picks
up its plugin manifest automatically (18 sources). Previously no skill mentioned
the engine at all — the instructions were prose with nothing to execute.

Because the bundle has to exist at the ref people install, it is committed, and
`npm run check:bundle` (part of `verify`, and a CI step) fails when engine
sources changed without a rebuild: `scripts/build-engine-bundle.mjs` records an
input fingerprint covering `engine/**`, `packages/**/src/**`, the package
manifests and `runtime/templates/**` (whose contents are embedded). `npm run
build` writes both files; `scripts/release.sh` stages them. `scripts/dapei`,
`dapei-guardrail` and `first-run.mjs` resolve the bundle at its new path while
still preferring source in a checkout. See ADR-0025.
