---
id: ADR-0021
title: "The desktop app is a separate project; the capability graph is acyclic with packages/catalog as its composition root"
status: accepted
date: 2026-10-12
deciders: [ygwa]
technical-story: "repo-hardening"
---

## Problem Statement

Two structural problems accumulated while the desktop application was developed
inside this repository:

1. **A second product lived in the repo.** `desktop/` carried a nested pnpm
   workspace, `design-desktop/` carried its design docs, two feature workspaces
   built it, and thirteen ADRs described contracts that exist only there
   (`FeatureSummary`, `RepoSummary`, `AgentEvent.toolCallId`, the IPC layer, the
   plugin allowlist, the UI tone system). Root CI, root `verify` and
   `scripts/release.sh` never touched any of it. Three of its engine-dependent
   tests hardcoded one developer's absolute checkout path. Its `postinstall`
   script hardcoded a `darwin-arm64` Electron bundle and exited 1 elsewhere, so
   `pnpm install` inside `desktop/` could not even complete on Linux CI.
   The engine contract was mirrored by hand into `desktop/packages/contracts`
   zod schemas, and had already diverged (`repos.add`/`feature.create` name
   rules are stricter there than in the engine).

2. **The package graph had a cycle.** `packages/core` — the kernel plus the
   capability registry — imported the CDR capabilities from
   `../../../cdr/src/capabilities.ts` and the portal generator from
   `../../../doc-gen/src/doc-gen.ts` by relative path, while both of those
   imported `packages/core` back. Nothing else in the tree could tell which
   package owned the composition, and the `exports` maps of the packages were
   decorative. A second, superseded copy of the CDR capabilities sat in
   `packages/core/src/capabilities/domains/cdr.ts` (3007 lines): it was never
   registered as a capability source, 16 of its 17 exports were referenced
   nowhere, and the one export that was used (`cdrProfile`) reached only two
   call sites in `repos.ts` — through a dynamic import, calling the
   implementation directly instead of going through the registry.

## Decision

1. `desktop/`, `design-desktop/`, `features/desktop-m1-m2`,
   `features/desktop-m3` and the desktop-only ADRs (0007–0014, 0016, 0017,
   0019 ×2, 0020) leave this repository and live in the sibling `desktop-app/`
   directory, with a provenance note. ADRs that document **engine** behaviour
   the desktop consumed stay here: ADR-0004 (two-dimension boundary) and
   ADR-0018 (`cdr.context.envelope`, implemented in `packages/cdr`). The
   `desktop:*` npm scripts are removed.

2. Capability composition moves to a new package, `packages/catalog`, which
   depends on `packages/core` (kernel + core capabilities), `packages/cdr` and
   `packages/doc-gen`, and exports `capabilitySpecs`, `capabilities` and
   `runCapability`. `packages/core` keeps the generic runner and the kernel
   (types, evidence, cognitive index, schema validation, guardrail) and never
   imports upward. Consumers — `engine/dapei-engine.ts`, the test suites,
   `scripts/validate-skills.mjs` — import the composition root.

3. Version identity is single-sourced across every shipped manifest:
   `VERSION_SOURCES` in `scripts/lib/release-version.mjs` covers the product
   packages, `SKILL.md`, and all eight `.claude-plugin/plugin.json` files.
   `packages/doc-gen` stays on its own 1.x line for the portal generator.

4. `pnpm` is the only supported package manager: `package-lock.json` is deleted
   and gitignored, and `scripts/release.sh` refreshes `pnpm-lock.yaml`.

## Consequences

### Positive

- The repository has one product again, and its CI story is honest: desktop
  regressions can no longer be silently invisible, because the desktop is not
  claimed by this pipeline at all.
- No package imports upward; a maintainer can read one file
  (`packages/catalog/src/index.ts`) to see the whole capability surface.
- Deleting the superseded 3007-line `domains/cdr.ts` removes a copy that would
  otherwise have to be kept in sync forever; its two real call sites now go
  through `runCapability("cdr.profile", …)` like every other consumer, instead
  of importing a capability implementation as a library.
- Version drift in the marketplace manifests (silently stuck at 3.1.0 while the
  product was 3.2.0) is now a CI failure instead of a release-time surprise.

### Negative

- Cross-package imports are still relative paths, and `packages/*/package.json`
  `exports` maps are not yet consumed by Node. Package-name imports plus a real
  `dist/` per package require a build step and a lockfile refresh; that remains
  follow-up work, deliberately not bundled here.
- The desktop now needs `DAPEI_MONOREPO_ROOT` (or its own engine checkout) to
  reach the engine, and its contract with the engine is still hand-mirrored.
  The clean fix — a version handshake plus schemas generated from
  `spec.inputSchema` — belongs to the desktop project.
- Removing the desktop from the repo drops its feature workspaces out of the
  repo's own dogfooding history; they are preserved in `desktop-app/features/`
  and in git history.
