---
id: ADR-0024
title: "Workspace assets have one home: templates ship from runtime/templates, one portal, a self-contained bundle"
status: accepted
date: 2026-10-12
deciders: [ygwa]
technical-story: "repo-hardening"
---

## Problem Statement

Four overlapping arrangements made it impossible to say where a workspace asset
comes from:

1. **Two portal builders over the same data.** `runtime/templates/docs/`
   shipped `scripts/build-cognitive-pages.ts` (273 lines, js-yaml) plus its own
   `.vitepress/config.mts`, `theme/` and `index.md`, all of which
   `workspace.init` copied into every new workspace and wired up by merging
   `docs:build-assets|dev|build|preview` scripts and `vitepress`/`vue`
   devDependencies into the **user's** `package.json`. That pipeline rendered
   `docs/as-is/**` into `docs/compiled/*.md`. Separately, `cdr.doc.generate`
   read the same `docs/as-is/**` and wrote a complete VitePress site into
   `.dapei/docs-portal/` — the only portal the README documents and the only
   one with tests. Nothing ran the template pipeline (its only appearance in
   `tests/**` was a comment), yet it was the one injected into user workspaces.
2. **The product's templates lived in the repo's own workspace state.** The
   canonical templates that `workspace.init` copies were `<engineHome>/.dapei/**`
   — which is also this repository's own `.dapei/`, including its runtime state
   (`.dapei/audit/capability.log`, the cognitive index). Running any dapei
   command inside the repo therefore mutated the product (and a committed
   runtime log grew in git).
3. **A contract nobody read.** `.dapei/schemas/*.yaml` (5 files, 24 KB) had zero
   runtime readers: the only references were a copy list, a comment in
   `schema.ts` claiming the runtime validates against them (it does not — it
   hand-writes the checks in `evidence.ts`), and a CI job that validated the
   files as *JSON Schema* without ever validating an artifact against them.
   `business-rule.schema.yaml` was not even seeded into new workspaces.
4. **The shipped artifact was not shippable.** `dist/dapei-engine.js` is
   self-contained as *code*, but it read its templates from disk, so it only
   worked when a source tree (or `DAPEI_ENGINE_HOME`) happened to be next to it.
   "Ship one file" was therefore not true.

## Decision

1. **One template home.** The pristine scaffolds that users receive live in
   `runtime/templates/dapei/**` (`commands.yaml`, `feature.schema.yaml`,
   `repos.schema.yaml`, `workflows/feature-lifecycle.yaml`, `rules/*.yaml`,
   `cognitive/index.yaml`), next to the feature-document templates in
   `runtime/templates/*.md.template`. `workspace.init` copies from there and
   nothing else. This repository keeps its own `.dapei/` as *its* workspace
   config — the relationship is seed-vs-instance: the repo's copy may diverge
   legitimately (e.g. repo-specific layering rules), which is why both exist.
   Runtime state is no longer versioned: `.dapei/audit/` and `.dapei/cognitive/`
   are gitignored here.
2. **One portal.** The workspace-side site builder is deleted
   (`runtime/templates/docs/**`), and `workspace.init` no longer injects
   `docs:*` scripts or `vitepress`/`vue`/`js-yaml` devDependencies into the host
   `package.json` — which also removes the capability's only write outside its
   declared outputs. `cdr.doc.generate` (doc-gen) is the single renderer,
   producing `<workspace>/.dapei/docs-portal/`; the workspace's `docs/` tree
   stays plain markdown, which is the durable knowledge the portal renders.
   If a browsable shell over the durable docs is wanted again, it belongs inside
   doc-gen's output, not as a second builder.
3. **The unread artifact schemas are gone.** `.dapei/schemas/*.yaml` is deleted;
   the artifact contract lives in `exactly{evidence.ts + each capability's
   inputSchema}`, and `schema.ts`'s comment now says so. CI keeps validating the
   YAML that does ship (`runtime/templates/dapei/**` and this repo's `.dapei/**`):
   `commands.yaml` shape, `*.schema.yaml` as JSON Schema, rule/workflow YAML
   parseability.
4. **The bundle carries its templates.** `scripts/gen-embedded-assets.mjs`
   bakes `runtime/templates/**` into `packages/core/src/generated/embedded-assets.ts`
   (committed, 18 assets, ~26 KB). `copyTemplateAsset` reads disk first — a
   source checkout must always run what you can edit, and a missing template
   there is a hard `TEMPLATE_MISSING` — and falls back to the embedded copy only
   when no engine home exists at all (a shipped bundle). `npm run smoke:bundle`
   proves it: the bundle is copied to a directory with nothing beside it,
   `DAPEI_ENGINE_HOME` unset, and it still initialises a complete workspace,
   reaches `cdr.index.list` and routes. `npm run check:assets` fails CI when the
   generated file is stale.

## Consequences

### Positive

- One answer to "where does this file come from?": `runtime/templates/**` for
  seeds, `.dapei/**` for this workspace's config, `docs/**` for durable
  knowledge, `.dapei/docs-portal/**` for the rendered site.
- `workspace.init` no longer edits the host `package.json`; a user's project is
  never rewritten by initialisation.
- The engine is genuinely one file: a checkout-less consumer (a skill install, a
  container, a copied directory) can run it with plain `node`.
- 5 unread schema files, a 273-line unread builder and two VitePress
  configurations are gone, so there is less to keep in sync.

### Negative

- A workspace no longer gets a ready-to-build docs site of its own; browsing
  `docs/**` means reading markdown, or generating the portal with
  `cdr.doc.generate`. The `Durable Docs` navigation that used to live in the
  template's VitePress config is a documented follow-up for doc-gen.
- The embedded copy duplicates the templates inside the repo (source of truth
  is `runtime/templates/**`; the generated file is derived). The `check:assets`
  gate is what keeps that safe, and it must run before a bundle is shipped.
- `.dapei/schemas/` deletion means anyone who pointed tooling at those files
  must switch to `evidence.ts` / `inputSchema`. The files never had a reader, so
  nothing in-tree did.
