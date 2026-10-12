---
id: ADR-0025
title: "The engine ships as skill content: a committed bundle inside skills/engine with a freshness gate"
status: accepted
date: 2026-10-12
deciders: [ygwa]
technical-story: "repo-hardening"
---

## Problem Statement

Every skill in this repository is prose that tells an agent to call a
capability — and until this change, nothing that gets installed could execute
one. `grep -rn "dapei-engine\|scripts/dapei" skills/` returned nothing, and
`.claude-plugin/marketplace.json` listed only the seven capability skills, whose
plugin sources are `./skills/<name>`. So `npx skills add ygwa/dapei-skill`
installed a complete set of instructions with no engine to run them: the promise
in the README ("install, then talk to your AI") held only if the user also had
the repository checked out and the agent happened to find `scripts/dapei` there.

Two facts made this cheap to fix once ADR-0023 and ADR-0024 landed: the bundle
had become standalone (templates embedded by `gen:assets`), and the runner no
longer depended on import order. What remained was a packaging decision:
where the artifact lives and how it stays honest.

## Decision

1. **`dist/dapei-engine.js` becomes `skills/engine/dapei-engine.js`.** The
   bundle is a payload of a real plugin: `skills/engine/` holds `SKILL.md`
   (how to resolve and invoke the engine, what to do when it is missing),
   `.claude-plugin/plugin.json`, the bundle, and a manifest.
   `.claude-plugin/marketplace.json` lists it as `dapei-engine`, so installing
   the skill set installs an engine, and `VERSION_SOURCES` picks up its
   manifest automatically (18 sources now).
2. **The bundle is committed.** An install reads the repository at a ref; an
   artifact that only exists after a local build is not shipped by definition.
   The cost — a ~306 KB minified file in git — is accepted, and mitigated below.
3. **Freshness is enforced, not trusted.** `npm run check:bundle` recomputes a
   fingerprint of the build inputs (`engine/**`, `packages/**/src/**`, the
   package manifests, and `runtime/templates/**`, whose contents are embedded)
   and compares it with `skills/engine/bundle-manifest.json`, which
   `scripts/build-engine-bundle.mjs` writes on every build. CI runs it, so
   "source changed, bundle not rebuilt" is a red build rather than a stale
   artifact. Byte-comparison against a fresh esbuild run was rejected: minifier
   output shifts between esbuild patch releases, which would produce false
   failures.
4. **`scripts/dapei` keeps preferring source.** In a checkout, editing a `.ts`
   and running a command must not be shadowed by a committed bundle;
   `DAPEI_USE_BUNDLE=1` forces the shipped artifact, which is how CI exercises
   it. Everything else (`dapei-guardrail`, `first-run.mjs`, `smoke:bundle`)
   resolves the same way and acknowledges the same "no engine found" error.

## Consequences

### Positive

- Installing the skill now installs a runnable engine: one file, Node ≥ 20, no
  TypeScript, no `node_modules`, works copied anywhere (the templates travel
  inside it). The repository and the install finally agree on what "the engine"
  is.
- The failure mode this class of packaging usually has — a stale committed
  artifact — is a deterministic CI error with an exact remedy in the message.
- `skills/engine/SKILL.md` gives the agent an explicit resolution order and an
  explicit instruction to report a missing engine instead of narrating a
  capability it never ran.

### Negative

- Every engine-affecting source change now requires `npm run build` and a commit
  that includes a ~306 KB generated file. A CI job that rebuilds and commits the
  bundle on `main` is the alternative; it was not adopted because it puts a
  bot-authored commit in the release path for a single-maintainer project.
- The fingerprint covers the inputs the bundle depends on, not every possible
  input: adding a new input root means updating `INPUT_ROOTS`/`PACKAGE_GLOBS` in
  the build script. A miss would let a stale bundle through, so that list is
  documented next to the code that consumes it.
- Two ways to run the engine remain (source and bundle). CI exercises both, and
  the wrapper picks deterministically, but a contributor who reads only
  `skills/engine/SKILL.md` may not realise the source path exists — mitigated by
  the same file documenting all three entries.
