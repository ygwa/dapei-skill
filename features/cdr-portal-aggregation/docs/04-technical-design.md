# 04. Technical Design (Round 1 draft — awaiting user confirmation)

Date: 2026-06-22

## Related Documents

- Previous: [01. Current State](./01-current-state.md), [02. Gap Analysis](./02-gap-analysis.md)

> **STATUS:** Solution-design **confirmed 2026-06-22** by user (all D1..D7 = recommended option A). Decided options recorded in "Decision Record" below.

## Decision Record (D1..D7, confirmed 2026-06-22)

| # | Decision | Locked option | Implication for implementation |
|---|---|---|---|
| D1 | Behavior → domain join key | **(A) Reuse `behavior.derived_from`** | No schema change, no validator change. `evidence.ts` already parses `derived_from` (line 21-27). `buildCrossArtifactIndex` reads `behavior.derived_from[]` and treats any entry that names a `domain.name` as a membership link. |
| D2 | Render of unmatched `transitions[].behavior_id` | **(A) `~~id~~` strikethrough + `(no behavior document)` tooltip** | State machine page generator must wrap the missing-id cell in `~~…~~` and append a tooltip span. Never silently hide. |
| D3 | `cdr.doc.generate` auto-fold `/l1/` and `/cross-repo/` | **(A) Default-on, opt-out via `fold_v08_sections: false`** | `detectExistingPortalSections()` runs unconditionally inside `docGenerate.execute`; only the input flag short-circuits it. `CapabilitySpec.inputSchema` gains `fold_v08_sections: { type: "boolean" }`. Default behavior is identical to today's for callers that don't pass it (because until now nobody wrote those sections). |
| D4 | Business modules landing | **(A) New `/business-modules/` top-level section** | Add `business-modules` to `subDirs` (line 838 of `doc-gen.ts`); add to nav; add to sidebar; add to `allPages`. Independent of `/domains/`. |
| D5 | Behavior by entry type | **(A) `/behaviors/by-entry-type/<type>.md` (7 pages + index)** | Add to sidebar with conditional entry. |
| D6 | `cdr.doc.generate` version | **(A) Keep `1.1.0`** | Pure additive change. CHANGELOG records the additive capability (new aggregation pages + auto-fold). |
| D7 | Test organization | **(A) One new file `tests/integration/cdr-portal-aggregation.test.mjs`** | All 9 BG assertions live here. Existing test files unchanged. |


## Architecture Overview

Round 1 is contained to `packages/doc-gen` and its tests. No `packages/core` change. No `packages/router` change. The change is purely **additive at the markdown level**: new pages, expanded existing pages, new sidebar/nav entries, and one auto-discovery pass that folds in `/l1/` and `/cross-repo/` when their source `.md` files exist on disk.

### Data flow (before vs after)

```
BEFORE                                  AFTER
──────                                  ─────
cdr.doc.generate                        cdr.doc.generate
  ├─ loadYamlDir(capabilities)            ├─ loadYamlDir(capabilities)
  ├─ loadYamlDir(domains)                 ├─ loadYamlDir(domains)
  ├─ loadYamlDir(behaviors)               ├─ loadYamlDir(behaviors)
  ├─ loadYamlDir(states)                  ├─ loadYamlDir(states)
  ├─ loadYamlDir(profiles)                ├─ loadYamlDir(profiles)
  ├─ loadYamlDir(entries)   ← dead        ├─ loadYamlDir(business-rules)
  ├─ loadYamlDir(business-rules)          ├─ loadYamlDir(entries)   ← wired
  │                                       │
  ├─ write 6 sections (one yaml → one     ├─ buildCrossArtifactIndex()
  │   page each)                          │     (joins behaviors ⇄ state-machines
  ├─ write homepage (flat counters)       │      ⇄ domains ⇄ rules ⇄ entries
  ├─ write vitepress.config.mts (no L1/   │      into in-memory Map<id,…>)
  │   cross-repo, no entries)             │
  │                                       ├─ write 6 sections (with cross-links
  │                                       │   injected from the index)
  │                                       ├─ write 7 entry-type grouping pages
  │                                       │   (BG-7)
  │                                       ├─ write 5 kind grouping pages (BG-6)
  │                                       ├─ write /entries/<repo>/index.md
  │                                       │   per repo (BG-9)
  │                                       ├─ write /business-modules/index.md
  │                                       │   (BG-1)
  │                                       ├─ write homepage with module landing
  │                                       │
  │                                       ├─ detectExistingPortalSections()
  │                                       │     (BG-8 — scans portalDir for
  │                                       │      /l1/, /cross-repo/, future sections)
  │                                       │
  └─ write vitepress.config.mts (only     └─ write vitepress.config.mts with
      known sections)                         detected sections folded in
```

### Module structure within `packages/doc-gen/src/doc-gen.ts`

The current 1057-line file is mostly page generators and a single orchestrator. Round 1 introduces one new internal helper (`buildCrossArtifactIndex`) and a small aggregator page-generator section. No new file; no new package.

```
doc-gen.ts
├── (unchanged) helpers: loadYamlDir, mdCell, mdText, sanitizeMarkdownPage, …
├── (changed)    Page generators:
│   generateHomepage               ← BG-1: gain "Business Modules" landing
│   generateBehaviorIndex          ← unchanged
│   generateBehaviorPage           ← BG-4: gain "Drives transitions" section
│   generateStateIndex             ← unchanged
│   generateStatePage              ← BG-4: transitions table gains behavior column
│   generateDomainIndex            ← unchanged
│   generateDomainPage             ← BG-2: gain "Behaviors / States / Rules" sections
│   generateCapabilityIndex        ← unchanged
│   generateCapabilityPage         ← BG-3: gain "Contributing domains / Spans repos"
│   generateBusinessRuleIndex      ← BG-6: rewritten as a hub with by-kind cards
│   generateBusinessRulePage       ← BG-5: gain "Applies to behaviors" + "Derived from"
│   generateProfileIndex/Page      ← unchanged
│   (NEW) generateEntriesPage      ← BG-9
│   (NEW) generateBehaviorByEntryTypeIndex + generateBehaviorByEntryTypePage   ← BG-7
│   (NEW) generateBusinessRulesByKindIndex + generateBusinessRulesByKindPage    ← BG-6
│   (NEW) generateBusinessModulesPage                                            ← BG-1
├── (NEW) crossArtifactIndex.ts (private in-file)  ← join logic
├── (NEW) detectExistingPortalSections()          ← BG-8
└── (changed) docGenerate orchestrator
```

### Sidebar / nav / pages discovery

`generateVitepressConfig` is changed in three places:

1. **Nav** — gain `L1 Map` (when `/l1/` exists) and `Cross-repo` (when `/cross-repo/` exists). Existing 7-item nav stays for the always-present sections.
2. **Sidebar** — gain `/entries/`, `/behaviors/by-entry-type/`, `/business-rules/by-kind/`, `/business-modules/`, `/l1/`, `/cross-repo/` entries (each conditional on the section existing on disk).
3. **Pages list** — every `.md` file under the portal root is now enumerated by `listFilesRecursively(<portalDir>, [".md"], 500)` so any section that already wrote its `.md` is automatically registered for VitePress build. The current hand-written `allPages` array (line 1021) is replaced by this dynamic enumeration.

This is the **TG-2 fix**: any future capability that writes into the portal root will be picked up automatically.

## Component Design

### C1 · `buildCrossArtifactIndex(docs: AllDocs): CrossArtifactIndex`

Pure function. Takes the 7 already-loaded `ParsedDoc[]` arrays and returns a `Map`-backed index:

```ts
interface CrossArtifactIndex {
  // behavior.id → behavior doc
  behaviorsById: Map<string, ParsedDoc>;
  // domain name → domain doc
  domainsByName: Map<string, ParsedDoc>;
  // state machine entity → state machine doc
  statesByEntity: Map<string, ParsedDoc>;
  // business rule id → rule doc
  rulesById: Map<string, ParsedDoc>;

  // inverted indexes (computed once)
  // behavior_id → state machines whose transitions[].behavior_id == behavior.id
  statesByBehavior: Map<string, ParsedDoc[]>;
  // domain name → behaviors whose domain.derived_from contains the domain (when domain sets derived_from)
  // NOTE: domain.derived_from is the *behavior-side* pointer. The inverse map
  // ("which behaviors compose this domain") needs an explicit signal. We will
  // add it via behavior.domain_id (new optional field) in Round 1, OR derive
  // it from capability-map.domains[].behaviors[]. Round 1 chooses the latter
  // (no schema change needed; capability-map already aggregates behaviors).
  behaviorsByDomain: Map<string, ParsedDoc[]>;
  // rule.id → behavior ids from rule.applies_to[]
  rulesByBehavior: Map<string, ParsedDoc[]>;
  // rule.id → domain name from rule.derived_from[]
  rulesByDomain: Map<string, ParsedDoc[]>;
  // repo name → entries
  entriesByRepo: Map<string, ParsedDoc>;
  // behavior id → entry reference (entry.type / entry.method / entry.path is on the behavior itself;
  // the entry catalog is for the dedicated entries section)
  behaviorsByEntryId: Map<string, ParsedDoc>;
}
```

The function also surfaces a `quality: { factCount, inferenceCount, unknownCount, staleCount }` precomputed from `confidence.kind` and the cognitive index — Round 1 stores the structure, Round 2 reads it.

**Public API**: in-file (not exported). Test surface is "after doc.generate, the markdown on disk reflects the join".

### C2 · `detectExistingPortalSections(portalDir: string): { l1: boolean, crossRepo: boolean, businessModules: boolean }`

Synchronous file-system check. Returns which optional sections exist on disk. The orchestrator then folds their pages into `allPages` and `sidebarConfig`.

```ts
function detectExistingPortalSections(portalDir: string) {
  return {
    l1: existsSync(join(portalDir, "l1", "index.md")),
    crossRepo: existsSync(join(portalDir, "cross-repo", "index.md")),
    businessModules: existsSync(join(portalDir, "business-modules", "index.md"))
  };
}
```

### C3 · New page generators

| Generator | Output path | Input | Output markdown |
|---|---|---|---|
| `generateEntriesPage(entriesByRepo)` | `/entries/<repo>/index.md` | confirmed entries for repo | table: id, type, method, path, summary, line, status |
| `generateBehaviorByEntryTypePage(type, behaviors)` | `/behaviors/by-entry-type/<type>.md` | behaviors filtered by `entry.type == type` | table: id, repo, path, summary; grouped by repo |
| `generateBehaviorByEntryTypeIndex(types, behaviors)` | `/behaviors/by-entry-type/index.md` | distinct entry types in the corpus | cards: per-type count + link |
| `generateBusinessRulesByKindPage(kind, rules)` | `/business-rules/by-kind/<kind>.md` | rules filtered by `kind == kind` | table: id, repo, applies_to, derived_from, summary |
| `generateBusinessRulesByKindIndex(kinds, rules)` | `/business-rules/by-kind/index.md` | distinct kinds | cards: per-kind count + link |
| `generateBusinessModulesPage(domains, byDomain)` | `/business-modules/index.md` | composed domains + their behavior memberships | per-domain section: name, repo, behavior count, list of behaviors, list of rules, list of state machines |

### C4 · Cross-link injection in existing generators

Each existing page generator gains a `ctx: CrossArtifactContext` parameter. The context is built once and passed down. The change is mechanical:

```ts
// generateDomainPage — BG-2
const behaviorsInDomain = ctx.behaviorsByDomain.get(domainName) ?? [];
if (behaviorsInDomain.length) {
  md += `## Behaviors in this domain\n\n` +
        behaviorsInDomain.map(b => `- [${b.doc.id}](${linkPathFor(b)})`).join("\n");
}
```

Cross-link URLs go through `mdCell` (table cells) or `mdText` (prose), so any `<` / `>` characters in id-like strings get entity-escaped and pass through `sanitizeMarkdownPage` cleanly.

### C5 · VitePress config change

`generateVitepressConfig(productName, sidebarConfig, allPages)` is unchanged in signature but:

- `allPages` is replaced by `listFilesRecursively(<portalDir>, [".md"], 500).map(relToPortal)`
- `sidebarConfig` gains up to 6 conditional keys (`/entries/`, `/behaviors/by-entry-type/`, `/business-rules/by-kind/`, `/business-modules/`, `/l1/`, `/cross-repo/`) — only added when the section's `index.md` exists
- The top-level `nav` array gains up to 2 conditional entries (`L1 Map`, `Cross-repo`)

## Data Model

No schema change. Round 1 only **reads** existing fields and **renders** them through new joins.

| Field (already in schema) | Used by new generator |
|---|---|
| `domain.derived_from: [behavior-id…]` | BG-2 (reverse-lookup to behaviors; *new* — domain pages did not surface derived_from) |
| `behavior.domain_id` (optional, ad-hoc) | BG-2 fallback when `derived_from` is missing |
| `state-machine.transitions[].behavior_id` | BG-4 |
| `business-rule.applies_to: [behavior-id…]` | BG-5, BG-6 |
| `business-rule.derived_from: [domain or behavior-id…]` | BG-5, BG-6 |
| `business-rule.kind` | BG-6 |
| `behavior.entry.type / method / path` | BG-7 |
| `entries/<repo>.yaml: entries[].{id, type, method, path, summary, status, anchor:{file,line}}` | BG-9 |
| `product-map.capabilities[].{domains:[name…], spans_repos:[repo…]}` | BG-3 |

Round 1 introduces **one new optional behavior field** (or uses an existing one — TBD in task-breakdown): a way for a behavior to declare which domain it belongs to. Two options:

- **Option A** — add `domain_id: <domain-name>` to behavior schema. Pro: explicit, fast. Con: schema change + validator change.
- **Option B** — infer from `capability-map.capabilities[].behaviors[]` where each capability lists the behavior ids that implement it. Pro: no schema change. Con: requires a capability map to exist before the link is renderable.

**Default for Round 1:** Option A *if and only if* the existing `behavior.derived_from` (already supported per schema, see `validateBehaviorArtifact`) can serve the same role. **Confirmed:** `validateBehaviorArtifact` does not currently check `derived_from`, but `evidence.ts` does parse it (line 21-27 of evidence.ts). So we reuse `behavior.derived_from: [domain-name…]` and reverse-lookup `domainsByName.has(name)`. **No schema change.** Round 1 design uses Option B' = reuse behavior.derived_from.

## API Design

No new public capability surface. `cdr.doc.generate` gains **one new optional input field**:

```ts
{
  output_dir?: string,
  fold_v08_sections?: boolean  // default true; when true, auto-folds /l1/ and /cross-repo/ if they exist
}
```

The input schema in `CapabilitySpec<…>` is updated to allow `fold_v08_sections: { type: "boolean" }`. Default behavior matches today's callers (which never pass it).

## Error Handling

| Failure | Behavior |
|---|---|
| Cross-artifact join references a missing artifact | Render the missing id as `~~id~~` strikethrough with `(no artifact)` tooltip. Never throw. |
| `entries/<repo>.yaml` exists but is unparseable | Skip the repo's entries page, log warning to `reportFragments`. Existing behavior is unchanged: `loadYamlDir` already swallows parse errors. |
| `/l1/` exists but `index.md` is missing | `detectExistingPortalSections` returns `l1: false` so VitePress doesn't try to register a missing page. |
| Auto-folded section introduces a sidebar nav collision with an existing nav text | Add a `(v0.8)` suffix to disambiguate. |

## Migration Strategy

Round 1 is **purely additive**. There is no:

- schema change (no `validateArtifact` change)
- input schema change for existing callers (the new `fold_v08_sections` defaults to true and is optional)
- removal of any existing page or URL
- change to `pages` already documented in `CHANGELOG.md`

A user who ran `cdr.doc.generate` yesterday and runs it again today gets the same 6 sections plus new aggregation pages plus the auto-folded `/l1/` / `/cross-repo/` if they had been generated separately.

If any existing test breaks, the implementation should fix forward (most likely: a test was asserting `pages: []` is exactly N entries — update to be `>= N entries`).

## Confirmation Checklist (please confirm before implementation)

| # | Decision | Options |
|---|---|---|
| D1 | Reuse `behavior.derived_from` as the behavior→domain pointer | (A) reuse as-is (recommended), (B) add explicit `behavior.domain_id` field with schema change |
| D2 | When a state-machine `transitions[].behavior_id` does not match any behavior | (A) render as ~~id~~ with `(no behavior document)` (recommended), (B) hide the link silently |
| D3 | `/l1/` and `/cross-repo/` auto-folding in `cdr.doc.generate` | (A) default-on, opt-out via `fold_v08_sections: false` (recommended), (B) opt-in via `fold_v08_sections: true` |
| D4 | New top-level page | (A) `/business-modules/` as a separate top-level section (recommended), (B) fold into `/domains/index.md` |
| D5 | Behavior-by-entry-type page | (A) `/behaviors/by-entry-type/<type>.md` (recommended), (B) section inside `/behaviors/index.md` |
| D6 | New `cdr.doc.generate` schema bump | (A) keep version `1.1.0`, document additive change in CHANGELOG (recommended), (B) bump to `1.2.0` |
| D7 | Test strategy | (A) one new file `tests/integration/cdr-portal-aggregation.test.mjs` covering all 9 BG assertions (recommended), (B) scatter assertions into existing test files |

> **Please reply with D1..D7 decisions (or "go with recommended") and I will produce the Round 1 task-breakdown and stop there before writing any implementation code.**
