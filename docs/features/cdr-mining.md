# Feature: `cdr-mining` — Cognitive Discovery Runtime v0.2 (Mining Edition)

> **Branch:** `feature/cdr-mining`
> **Base:** `feature/cdr-runtime` (v0.1 PR #2; **not yet merged**)
> **Status:** Awaiting review and merge to `main`
> **Owner:** dapei maintainers

This document is the single source of truth for what landed on the
`feature/cdr-mining` branch. It is the artifact the reviewer reads before
approving the PR, and the artifact the next maintainer reads to understand
why the code is the way it is.

---

## 1. Outcome

v0.1 turned CDR into a **durable asset library** rendered as a VitePress
portal. v0.2 takes the next step and makes dapei-skill actually **read
code** (annotation-aware) and **classify business rules** as first-class
artifacts.

| Before (v0.1) | After (v0.2, this PR) |
| --- | --- |
| `cdr.entries.prepare` matches **filename only** (`*Controller.java`) | Reads file content; recognizes Spring `@RestController`+`@GetMapping`, NestJS `@Controller('api/v1')`+`@Get(':id')`, FastAPI `@app.get`/`@router.post`, Express `app.get`/`router.post` — and concatenates class-level base paths |
| `cdr.entries.confirm` only stores `summary` | Echoes back `framework` / `method` / `path` / `line` so the Agent doesn't re-derive them |
| No `business-rule` artifact type | New `ArtifactType = "business-rule"` with 5 kinds (`invariant` / `constraint` / `authorization` / `sla` / `compensation`); `cdr.business.compose` capability; portal renders a 6th section `business-rules/` |
| Cognitive index has 4 arrays | Index now carries `business_rules[]` as a 5th |
| VitePress portal has 5 sections | Portal has 6 sections (added `Business Rules`) |
| Router has 16 cdr.* patterns (8 English + 8 Chinese) | +1 Chinese for business rules → 17 total |

---

## 2. Architecture Decision Records (ADRs)

### 2.1 Why two-pass entry scan instead of just content?

`cdr.entries.prepare` keeps the **filename heuristic** as a fallback and
adds a **content-based annotation scan** that takes precedence when both
fire on the same file. Rationale:
- Pure-utility repos (e.g., a string-utils library) have no annotations
  but still deserve filename-discovered entry candidates
- A Spring `OrderController.java` would get exactly ONE entry per HTTP
  verb (method + path), not one per whole file — higher signal density
- Frameworks that don't fit the regex set (Ktor, Rocket, AdonisJS, etc.)
  fall back to filename, so we never regress below v0.1

### 2.2 Why cap file read at 200KB?

Generated Java/TS files (auto-generated gRPC stubs, OpenAPI clients)
can be megabytes. We skip those. The 200KB threshold comfortably covers
hand-written controllers (typical Spring `@RestController` is 5-20KB)
while protecting the engine from memory pressure.

### 2.3 Why concatenate class-level + method-level paths?

A NestJS controller like `@Controller('api/v1/users')` with
`@Get(':id')` is semantically `GET /api/v1/users/:id` — the
class-level path is **mandatory** for the URL to be useful. Same for
Spring `@RequestMapping("/api/v1/orders")` + `@GetMapping("/{id}")`.
`joinUrlPath(base, suffix)` handles:
- `(/api/v1/orders, /{id})` → `/api/v1/orders/{id}`
- `(/api/v1/orders, "")` → `/api/v1/orders` (method inherits class path)
- `(undefined, /{id})` → `/{id}` (no class-level path)

### 2.4 Why underscore-free capability IDs?

`capability-registry.test.mjs` enforces `^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$`
on every capability ID. `cdr.business_rules.compose` was rejected; renamed
to `cdr.business.compose` (mirrors `cdr.domain.compose` — the "rule" lives
in the schema `kind` field, not the capability name).

### 2.5 Why 5 `business-rule` kinds?

Maps to the categories an Agent (or LLM miner) needs to express:
- **invariant** — must always hold (e.g., `order.amount > 0`)
- **constraint** — must hold in some scope (e.g., `stock >= 0` per warehouse)
- **authorization** — who can do what (e.g., `only owner or admin can cancel`)
- **sla** — timing/availability commitments (e.g., `payment must settle < 30s`)
- **compensation** — saga rollback paths (e.g., `cancel order → refund within 60s`)

Other categories (data-ownership, locality, freshness) defer to v0.3+ once
real mining arrives.

### 2.6 Why Agent-supplied, not auto-extracted (yet)?

Same reasoning as v0.1: `packages/core/` is **deterministic** — no LLM
calls. Business rules are **semantic** — only the LLM can read a function
body and assert `amount > 0`. So `cdr.business.compose` accepts the
Agent's structured output and validates it (P2 evidence rules). The
actual mining happens in the Agent's context; the engine is the
structured store + validator.

When `CodeGraph` + LLM miner lands in v1.0, this capability's API does
not change — only the producer (Agent → automated pipeline).

---

## 3. What landed

### 3.1 Capabilities (engine layer)

| Capability ID | File | Notes |
| --- | --- | --- |
| `cdr.entries.prepare` v2 | `packages/core/src/capabilities/domains/cdr.ts` | Two-pass: filename heuristic + content annotation scan; file size cap 200KB; class-level path concatenation |
| `cdr.entries.confirm` v2 | same | Accepts `framework` / `method` / `path` / `line` inputs and persists them onto the entry YAML |
| `cdr.business.compose` | same | New capability; 5 kinds; writes `docs/as-is/business-rules/<id>.yaml`; updates cognitive index |

### 3.2 Evidence validation (`packages/core/src/evidence.ts`)

- `ArtifactType` union extended with `"business-rule"`
- `BusinessRuleKind = "invariant" | "constraint" | "authorization" | "sla" | "compensation"`
- `validateBusinessRuleArtifact(doc)`:
  - `id` must match `^[a-z0-9-]+$`
  - `kind` must be one of the 5
  - `applies_to` (optional array) must be an array
  - `expr` (optional string) is the formal predicate
  - `description` (optional string) is a human summary
  - Evidence block: same P2 rules as other artifacts (`fact` needs `sources[]`, `inference` needs `derived_from[]`, `unknown` needs `reason`)

### 3.3 Cognitive index (`packages/core/src/cognitive-index.ts`)

- `CognitiveIndex.business_rules: IndexBusinessRuleEntry[]` (id, kind, path, repo, evidence_kind, evidence_level)
- `upsertIndexEntry(index, "business-rule", ...)` adds the entry
- `artifactRelativePath("business-rule", doc)` resolves `docs/as-is/business-rules/<id>.yaml`
- `loadCognitiveIndex` defaults `business_rules: []` for fresh indexes

### 3.4 Router (`packages/router/src/index.ts`)

- 9th Chinese pattern: `(?:组合|聚类|compose).*(?:业务规则?|business[\s_-]?rule?)\s+([a-zA-Z0-9_-]+)` → `cdr.business.compose` (confidence 0.9)

### 3.5 Skills, commands, portal

- `skills/cdr/SKILL.md` — already documents `cdr.*` capabilities; v0.2 just adds a routing row for `cdr.business.compose` and the 9th Chinese user example
- `.dapei/commands.yaml` — new `cdr-business-compose` entry
- `packages/doc-gen/src/doc-gen.ts`:
  - `loadYamlDir(cp.businessRulesDir)` reads the new section
  - `generateBusinessRuleIndex` and `generateBusinessRulePage` (Kind / Confidence / Description / Expression / Applies To / Derived From / Sources)
  - New `sidebarConfig["/business-rules/"]` and VitePress nav entry `Business Rules`
- `tests/fixtures/{sample-spring,sample-nestjs,sample-fastapi}/` — three new repos with realistic content (Spring `OrderController.java`, NestJS `user.controller.ts`, FastAPI `main.py`)

### 3.6 Tests

| File | Cases | What |
| --- | --- | --- |
| `tests/unit/cdr.test.mjs` | 52 | v0.1 36 + 5 cross-framework + 1 Express-wins-over-filename + 1 confirm-persists + 8 business-compose (1 write + 5 kinds + 3 reject) + 1 list-segregates + 1 Chinese router |
| `tests/integration/cdr-e2e.test.mjs` | 1 (extended) | step 7b writes a business rule; portal page count assertion bumps to ≥12 |
| `tests/unit/capability-registry.test.mjs` | unchanged | confirms `cdr.business.compose` passes the `domain.name` ID regex |
| `tests/unit/documentation-contract.test.mjs` | unchanged | `cdr.business` added to the known-prefix set |

---

## 4. Verification matrix

| Verification | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | ✅ clean |
| Unit + integration + scenario | `npm run test` | ✅ **235 / 235** |
| Smoke (16 + 4 L-levels) | `bash scripts/smoke-test.sh` | ✅ all PASS |
| VitePress portal with business-rules section | `vitepress build` on a generated portal | ✅ completes; `<BusinessFlow>` / `<StateMachine>` / `<CodeLink>` present |
| Router coverage | `tests/unit/skill-router-coverage.test.mjs` | ✅ every `@dapei` example in `skills/cdr/SKILL.md` (incl. v0.2 additions) routes to a registered capability |

---

## 5. Risks and follow-up

| Risk | Mitigation | Owner |
| --- | --- | --- |
| Heuristic regex misses edge cases (Ktor, Rocket, AdonisJS, gRPC, tRPC, GraphQL) | Add new framework entries to `ANNOTATION_PATTERNS`; keep the filename fallback so unknown stacks still get a candidate | TBD per framework |
| 200KB file cap silently skips large generated controllers (e.g., OpenAPI clients) | Add a `cdr.entries.prepare` flag to force-include large files; or add a separate `cdr.entries.scan_oversize` capability | TBD |
| `joinUrlPath` is naive (no path-variable substitution, no wildcard handling) | Adequate for v0.2; v1.0 can use CodeGraph for real path resolution | v1.0 |
| Business rules are Agent-supplied — not auto-mined | Documented as v0.2 limitation; CodeGraph + LLM miner planned for v1.0 | v1.0 |
| Underscore-free capability ID convention | Renamed `cdr.business_rules.compose` → `cdr.business.compose`; all 10 cdr.* now follow the convention | n/a |

---

## 6. Out of scope (deliberate)

- CodeGraph substrate (planned for v1.0 in `docs/cdr-architecture.md`)
- Auto-extraction of `business-rule` artifacts (requires LLM + static analysis)
- `cdr.state.derive` v2 — resolve `from: "[*]"` via real control-flow
- `SourceRef.commit_sha` field for cross-branch fact pinning
- `cognitive.artifact.list` filter `kind` should accept `business-rule` (currently only `fact | inference | unknown`)

---

## 7. How to verify locally

```bash
# 1. Switch to the branch (base: feature/cdr-runtime, which is the v0.1 PR #2 — not yet merged)
git fetch origin
git checkout feature/cdr-mining
pnpm install

# 2. Run the full test suite
npm run test:unit
npm run test:integration
npm run test:scenarios
bash scripts/smoke-test.sh

# 3. Try the new annotation-aware entry scan
node --experimental-strip-types -e "
  import('./packages/core/src/index.ts').then(async (c) => {
    const fs = await import('node:fs');
    const tmp = '/tmp/dapei-cdr-mining-demo';
    fs.rmSync(tmp, {recursive: true, force: true});
    fs.mkdirSync(tmp + '/repos/sample-app', {recursive: true});
    fs.cpSync('./tests/fixtures/sample-spring', tmp + '/repos/sample-app', {recursive: true});
    await c.runCapability('workspace.init', {}, {rootDir: tmp, now: new Date()});
    const {result} = await c.runCapability('cdr.entries.prepare', {repo: 'sample-app'}, {rootDir: tmp, now: new Date()});
    console.log(JSON.stringify(result.data.entries, null, 2));
  });
"

# 4. Try the new business-rule compose
node --experimental-strip-types -e "
  import('./packages/core/src/index.ts').then(async (c) => {
    const fs = await import('node:fs');
    const tmp = '/tmp/dapei-cdr-mining-demo2';
    fs.rmSync(tmp, {recursive: true, force: true});
    fs.mkdirSync(tmp, {recursive: true});
    await c.runCapability('workspace.init', {}, {rootDir: tmp, now: new Date()});
    const {result} = await c.runCapability('cdr.business.compose', {
      id: 'order-amount-positive',
      kind: 'invariant',
      description: 'order.amount must be > 0',
      expr: 'order.amount > 0',
      applies_to: ['order-create'],
      confidence: {level: 'high', kind: 'fact'},
      sources: [{file: 'src/services/orderService.ts', line: 12}]
    }, {rootDir: tmp, now: new Date()});
    console.log(JSON.stringify(result, null, 2));
  });
"

# 5. Generate a portal (now with business-rules section)
cd /tmp/dapei-cdr-mining-demo2
node --experimental-strip-types -e "
  import('<repo>/packages/core/src/index.ts').then(async (c) => {
    await c.runCapability('cdr.doc.generate', {}, {rootDir: '/tmp/dapei-cdr-mining-demo2', now: new Date()});
  });
"
```

---

## 8. Reviewer checklist

- [ ] All 235 tests pass on the branch tip
- [ ] `npm run typecheck` is clean
- [ ] `bash scripts/smoke-test.sh` is green
- [ ] `docs/cdr-architecture.md` status table reads "Implemented v0.2"
- [ ] `CHANGELOG.md [Unreleased]` lists all 3 v0.2 additions
- [ ] `agents.md` roadmap has the new "CDR v0.2" line marked Shipped
- [ ] `skills/cdr/SKILL.md` is consistent with new capabilities
- [ ] Manual `vitepress build` on a generated portal produces a `business-rules/index.md`
- [ ] Three new fixture repos exist and are picked up correctly
