# Feature: `cdr-runtime` — Cognitive Discovery Runtime v0.1

> **Branch:** `feature/cdr-runtime`
> **Base:** `main` (commit `fc7e52e feat(workspace): add VitePress portal, symbol_handle evidence, pnpm+changesets`)
> **Status:** Awaiting review and merge to `main`
> **Owner:** dapei maintainers

This document is the single source of truth for what landed on the
`feature/cdr-runtime` branch. It is the artifact the reviewer reads before
approving the PR, and the artifact the next maintainer reads to understand
why the code is the way it is.

---

## 1. Outcome

Add a **Cognitive Discovery Runtime (CDR)** layer between raw repo code
(`repos/`) and feature work (`features/`) so the AI agent can answer
"what does this system actually do?" from durable, evidence-validated
YAML artifacts instead of re-reading code every session.

| Before (v2.2) | After (v2.3, this PR) |
| --- | --- |
| Cognitive artifacts exist as **per-session notes** | Cognitive artifacts are a **navigable asset library** (profile → entries → behavior → state → domain → capability map) |
| No portal; users read YAML directly | A real **VitePress portal** is generated at `.dapei/docs-portal/` with 3 custom Vue 3 components |
| `@dapei` only routes English intents | `@dapei` also routes 8 **Chinese (中文)** variants of the same capabilities |
| `cognitive.artifact.upsert` accepts only a YAML string | `cdr.behavior.upsert` accepts structured fields (`id`, `entry`, `steps[]`, `writes[]`, `events[]`, `calls[]`, `risks[]`, `confidence`, `sources[]`, `derived_from[]`) |
| `cognitive.state.suggest` searches behaviors by entity name | `cdr.state.derive` takes an explicit `behaviors[]` list (more predictable) |

---

## 2. Architecture Decision Records (ADRs)

### 2.1 Why a separate `packages/doc-gen/` workspace package?

`vitepress` and `vue` are large. Letting them live inside `packages/core/`
would force every consumer of the core engine to install VitePress
even if they never generate a portal. We split doc-gen into its own
package with `"type": "module"` and a dedicated `pnpm` install boundary.

| Concern | Choice | Trade-off |
| --- | --- | --- |
| Where does `cdr.doc.generate` live? | `packages/doc-gen/src/doc-gen.ts` | +1 cross-package import (`../../../doc-gen/src/doc-gen.ts`); needed to keep core engine dep-free |
| Should templates be compiled at build time? | No — copied at runtime to `.dapei/docs-portal/.vitepress/theme/` | Templates stay as Vue SFC strings the user can edit; the cost is a small file-copy step |
| Where do the Vue components live? | `packages/doc-gen/templates/components/*.vue` | Copied into each generated portal so the user owns the output |

### 2.2 Why a router pattern for Chinese, not a separate Chinese router?

A second router would split the routing table. We chose a single
`routes[]` array with both English and Chinese patterns; confidence
values keep them ranked. The Chinese patterns use the same extractors
where possible and inline-capture groups where the Chinese keyword
positions differ from English.

### 2.3 Why `.mts` for the VitePress config?

VitePress is **ESM-only** (`"type": "module"`). A `config.ts` in CJS
mode fails at build time with `ESM file cannot be loaded by require`.
We emit `config.mts` (ESM TypeScript) and a portal `package.json`
with `"type": "module"` to make resolution deterministic.

### 2.4 Why case-sensitive entity stripping in the router?

`for Order in mall-order` — naive `\border\b/gi` strips BOTH "Order" and
"order" (case-insensitive global), leaving `mall-` instead of
`mall-order`. Switching the strip regex to case-sensitive (`/g` only)
preserves the "order" inside "mall-order". Documented inline next to
the pattern.

---

## 3. What landed

### 3.1 Capabilities (engine layer)

| Capability ID | File | Notes |
| --- | --- | --- |
| `cdr.profile` | `packages/core/src/capabilities/domains/cdr.ts` | reads manifest markers, framework hints, tree (tree/find fallback) |
| `cdr.entries.prepare` | same | scans for `controller|route|resource|handler|listener|consumer|scheduler|job` patterns |
| `cdr.entries.confirm` | same | writes back `status: confirmed` + `summary` |
| `cdr.behavior.upsert` | same | accepts structured fields, validates via `validateBehaviorArtifact` |
| `cdr.state.derive` | same | extracts states from `writes[].operation=insert→CREATED` and `events[].tail→state hint` |
| `cdr.domain.compose` | same | enforces P1 `derived_from` rule via cognitive index lookup |
| `cdr.capability.map.init` | same | writes `docs/as-is/capabilities/product-map.yaml` |
| `cdr.index.list` | same | aggregates index + filesystem scan |
| `cdr.doc.generate` | `packages/doc-gen/src/doc-gen.ts` | portal generator, copied templates + per-page markdown |

### 3.2 Router patterns (`packages/router/src/index.ts`)

8 English + 8 Chinese patterns with mutual-exclusion guarantees.
5 new extractor functions: `extractCdrRepoName` / `EntityName` /
`EntryId` / `DomainName` / `ProductName`.

### 3.3 Vue components (`packages/doc-gen/templates/components/`)

| Component | Purpose | Data flow |
| --- | --- | --- |
| `BehaviorFlow.vue` | Step timeline + collapsible Mermaid source | `:steps='Step[]'` |
| `StateMachine.vue` | State chips + transitions count + collapsible Mermaid stateDiagram | `:entity :states :transitions :initial_state` |
| `CodeLink.vue` | Clickable source pointer with `vscode://` + GitHub remote fallback | `:source='{file,line,symbol_handle,repo}'` |

All registered globally via `packages/doc-gen/templates/theme/index.ts`.

### 3.4 Schemas & types

- `packages/core/src/evidence.ts` — added `validateDomainArtifact` and
  `validateCapabilityMapArtifact` with P1 red lines
- `packages/core/src/schema.ts` — added `BehaviorSpec` / `DomainSpec` /
  `CapabilityMapSpec` TS type aliases (documentation-only; runtime
  validation is still `validateArtifact` in `evidence.ts`)
- `.dapei/schemas/{behavior,state-machine,evidence,cognitive-index}.schema.yaml`
  — no change (already covered by v2.2.0)

### 3.5 Skills & commands

- `skills/cdr/SKILL.md` — 8 `@dapei` examples in `## 用户入口`, 4 red lines,
  3 product principles, 6-stage workflow
- `.dapei/commands.yaml` — 8 cdr command entries with `cli` / `purpose` /
  `inputs` / `workflow` / `outputs`
- `SKILL.md` (root) — cdr line added in the module routing section

### 3.6 Tests

| File | Cases | Covers |
| --- | --- | --- |
| `tests/unit/cdr.test.mjs` | 36 | all 8 cdr capabilities (success + failure paths) + 11 English + 8 Chinese router patterns |
| `tests/integration/cdr-e2e.test.mjs` | 1 | full pipeline: profile → entries → behavior × 2 → state → domain → capability map → doc.generate + VitePress page acceptance |
| `tests/integration/cdr-vitepress-build.test.mjs` | 2 | real `vitepress build` against a generated portal; verifies Vue components in built bundle |
| `tests/unit/documentation-contract.test.mjs` | (modified) | added `cdr.behavior` / `cdr.state` to known capability prefix set |

---

## 4. Verification matrix

| Verification | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | ✅ clean |
| Unit + integration + scenario | `npm run test` (unit + integration + scenario) | ✅ **219 / 219** |
| Smoke (engine + skills + L1/L2 + L3 + L3-narrative + L4) | `bash scripts/smoke-test.sh` | ✅ all 16 + 4 L-levels PASS |
| VitePress build | `node packages/doc-gen/node_modules/vitepress/bin/vitepress.js build <portal>` | ✅ completes in ~1.2s; `behavior-flow` / `state-machine` / `code-link` present in built bundle |
| Skill router coverage | `tests/unit/skill-router-coverage.test.mjs` | ✅ every `@dapei` example in `skills/cdr/SKILL.md` routes to a registered capability |

---

## 5. Risks and follow-up

| Risk | Mitigation | Owner |
| --- | --- | --- |
| `cdr.entries.prepare` heuristic misses Spring/Express/Go patterns (e.g., `*Controller.go`, `*.handler.go`) | Add a stack-aware pattern table to the `cdr.ts` heuristics; tracked in `feature/cdr-runtime` follow-ups | TBD |
| CodeGraph substrate not wired (the `docs/cdr-architecture.md` "proposed" → "implemented v0.1" transition) | v0.1 uses `tree`/`find` + filename regex; the v1.0 CodeGraph integration is a separate feature branch | CodeGraph team |
| Vue components embed data as inline JSON in markdown — for very large steps[], this could blow past markdown parser limits | If observed, switch to a VitePress data loader (`*.data.ts`) | TBD |
| Portal `node_modules` is not auto-installed — user must `pnpm install` in the portal dir | Documented in `README.md` "Cognitive Discovery Runtime" section | n/a |

---

## 6. Out of scope (deliberate)

- CodeGraph CLI / library invocation (deferred to v1.0)
- Cross-repo dependency graph for domains
- Live in-editor navigation (MCP adapter for Cursor / Claude Code)
- `cdr.behavior.upsert` v2 that takes a stream of behaviors
- Domain auto-discovery via semantic clustering (Roadmap P2)

---

## 7. How to verify locally

```bash
# 1. Switch to the branch
git fetch origin
git checkout feature/cdr-runtime
pnpm install

# 2. Run the full test suite
npm run test:unit
npm run test:integration
npm run test:scenarios
bash scripts/smoke-test.sh

# 3. Generate a portal in a throwaway workspace
node --experimental-strip-types -e "
  import('./packages/core/src/index.ts').then(async (c) => {
    const fs = await import('node:fs');
    const tmp = '/tmp/dapei-cdr-demo';
    fs.rmSync(tmp, {recursive: true, force: true});
    fs.mkdirSync(tmp, {recursive: true});
    await c.runCapability('workspace.init', {}, {rootDir: tmp, now: new Date()});
    await c.runCapability('cdr.behavior.upsert', {
      id: 'demo', entry: {type: 'api', method: 'POST', path: '/x'},
      steps: [{name: 'A', action: 'do A'}, {name: 'B', action: 'do B'}],
      confidence: {level: 'high', kind: 'fact'},
      sources: [{file: 'src/x.ts', line: 10}]
    }, {rootDir: tmp, now: new Date()});
    await c.runCapability('cdr.state.derive', {entity: 'X', behaviors: ['demo']}, {rootDir: tmp, now: new Date()});
    await c.runCapability('cdr.doc.generate', {}, {rootDir: tmp, now: new Date()});
    console.log('Portal at', tmp + '/.dapei/docs-portal');
  });
"

# 4. Build the portal
cd /tmp/dapei-cdr-demo/.dapei/docs-portal
ln -sf <repo-root>/packages/doc-gen/node_modules ./node_modules
node <repo-root>/packages/doc-gen/node_modules/vitepress/bin/vitepress.js build .
open .vitepress/dist/index.html
```

The opened page should show the index, capability index, behaviors index,
and a per-behavior page with a step timeline + flowchart.

---

## 8. Reviewer checklist

- [ ] All 219 tests pass on the branch tip
- [ ] `npm run typecheck` is clean
- [ ] `bash scripts/smoke-test.sh` is green
- [ ] `docs/cdr-architecture.md` status table now reads "Implemented v0.1"
- [ ] `CHANGELOG.md [Unreleased]` lists all 8 cdr capabilities
- [ ] `README.md` "Cognitive Discovery Runtime (v2.3 — CDR)" section is
      coherent and links to the feature doc
- [ ] `skills/cdr/SKILL.md` is in the loaded skills set (run
      `tests/unit/skill-router-coverage.test.mjs`)
- [ ] Manual `vitepress build` on a generated portal produces
      `.vitepress/dist/index.html` with the 3 Vue components
