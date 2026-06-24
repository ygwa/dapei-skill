# 02. Gap Analysis

Date: 2026-06-22

## Related Documents

- Previous: [01. Current State](./01-current-state.md)

## Business Gaps

### BG-1 · No "business module" landing page

A user landing on the portal home sees 6 flat counters + 6 flat links. There is no entry point that says "this product has *N* business modules, here they are grouped by domain, with the entry behaviors and rules each module is bound by". This is the highest-impact gap because it is the first thing a stakeholder sees and currently forces them to mentally stitch the sections together.

**Acceptance signal:** A user can answer "what are the business modules of this product?" from the home page alone, without visiting more than 1 link.

### BG-2 · Domain pages have no "members" view

A domain in CDR is a clustering of behaviors (and indirectly state machines + business rules) per `derived_from`. Today `generateDomainPage` only renders `modules[]` and the module-dependency Mermaid — it never asks "given this domain, which behaviors belong to it, which state machines do those behaviors drive, and which rules apply to it". A reader cannot navigate *into* a domain.

**Acceptance signal:** From any `domain.foo.md` page, the reader sees a "Behaviors in this domain" list with links to each behavior page, plus a "State machines driven by these behaviors" list, plus a "Business rules applying to this domain" list.

### BG-3 · Capability pages have no "spans" view

`product-map.yaml` capabilities carry `domains: [...]` and `spans_repos: [...]` (synthesized by `cdr.capability.map.synth` in v0.8). Today `generateCapabilityPage` reads only the top-level id + description + sub_capabilities — it ignores `domains` and `spans_repos`. A reader cannot tell which domains implement a capability or which repos it cuts across.

**Acceptance signal:** From any `capability.foo.md` page, the reader sees the contributing domains (with links) and the repos the capability touches.

### BG-4 · Behaviors ↔ state machines are not linked

`state-machine.transitions[].behavior_id` is the join key the CDR schema defines for "this transition was driven by this behavior". Neither the behavior page nor the state-machine page surfaces this relation. A user reading a behavior cannot find out which state machine transitions it triggers, and a user reading a state machine cannot find out which behavior drives each transition.

**Acceptance signal:**

- From a behavior page: "Drives transitions in: Order (PENDING_PAYMENT → PAID)" with link to the state machine page.
- From a state machine page: each transition's row in the transitions table includes the resolved behavior link (when `behavior_id` matches an existing behavior id).

### BG-5 · Behaviors / business rules / domains are not cross-linked

`business-rule.applies_to` and `business-rule.derived_from` (when the value is a domain name) are join keys to behaviors and domains respectively. Neither side renders the relation. Same with `domain.derived_from` (the inverse of BG-2) — the page reads `modules` but not `derived_from`.

**Acceptance signal:** Business rule page lists "Applies to behaviors: …" and "Derived from domain: …" with links. Domain page lists "Composed from behaviors: …".

### BG-6 · Business rules are not grouped by kind

There are 5 `kind` values: `invariant / constraint / authorization / sla / compensation`. They have very different meanings for the reader (an SLA is a time budget, an authorization is a role check). Today all 5 kinds render into one flat `/business-rules/index.md` table. The reader cannot see "what are the invariants protecting order-create?".

**Acceptance signal:** `/business-rules/by-kind/invariant.md` (and 4 sibling pages) each list the rules of that kind with a one-line description and link to the rule page. From any rule page a "kind: invariant" badge links to its kind-group page.

### BG-7 · Behaviors are not grouped by entry type

Entry type is `api / mq / cron / rpc / cache / search / other`. Grouping by entry type is a natural "what surfaces does this product expose?" view. Today all behaviors go into one flat index. The reader cannot answer "what are the cron jobs?" or "what MQ events are consumed?" without scanning every behavior.

**Acceptance signal:** `/behaviors/by-entry-type/api.md` (and 6 siblings) each list the behaviors of that entry type with their `entry.method` / `entry.path` summary. The behavior page's "Entry" line links to its entry-type group page.

### BG-8 · v0.5 (`/cross-repo/`) and v0.8 (`/l1/`) portal sections are orphaned

`cdr.crossrepo.doc.generate` and `cdr.reversecluster.doc.generate` write `.md` files into the same `<portal>` root, but `cdr.doc.generate` does not:

1. Add `/l1/` and `/cross-repo/` index pages to `pages: []` in `.vitepress/config.mts`, so VitePress won't build HTML for them.
2. Add them to the sidebar.
3. Add them to the top nav.
4. Link to them from the home page.

So a user who runs `cdr.capability.map.synth` then `cdr.crossrepo.doc.generate` then `cdr.doc.generate` gets L1 pages that VitePress silently skips.

**Acceptance signal:** After running any combination of `cdr.doc.generate`, `cdr.crossrepo.doc.generate`, `cdr.reversecluster.doc.generate`, the resulting portal's `.vitepress/dist/` contains HTML for every section whose source `.md` exists.

### BG-9 · Entry-point catalog is loaded but never rendered

`doc-gen.ts` line 865 loads `entryDocs` and never reads it. There is no `/entries/` section. The behavioral map never shows "confirmed entries" — the front door of the CDR pipeline is invisible on the portal.

**Acceptance signal:** `/entries/<repo>/index.md` lists the confirmed entries for that repo. The behavior page links back to its entry.

### BG-10 · No quality signals on the portal

`docs/cdr-architecture.md` section 8 specifies 4 quality metrics (entry coverage, behavior coverage, fact ratio, stale queue). None is rendered. A user who just ran `cdr.doc.generate` cannot tell whether their workspace is well-mapped or barely mapped.

**Acceptance signal:** Home page + capability page each carry a "Quality" section with the 4 metrics and the math that produced them (Round 2 work; flagged here so Round 1 keeps the door open).

## Technical Gaps

### TG-1 · `entries` array is loaded and dropped

`doc-gen.ts:865` populates `entryDocs` and never references it. Either remove the load (it is dead code that runs `listFilesRecursively` for nothing) or wire it to a real page. Round 1 chooses to wire it (BG-9).

### TG-2 · Sidebar / pages list is hand-written; v0.8 additions are missed

`generateVitepressConfig` builds `sidebarConfig` and `allPages` from the same loops that build the actual files. If a future capability adds a new portal section (L1 did, cross-repo did), the developer has to remember to also touch `pages` and `sidebar`. This is the root cause of BG-8. Round 1 fixes it by making `cdr.doc.generate` *detect existing portal sections on disk* and fold them into `pages` and `sidebar` automatically, rather than expecting every section to be known up-front.

### TG-3 · Homepage counter doesn't reflect per-repo breakdown

`sections.capabilities++` counts all capabilities without distinguishing "this capability spans 3 repos" from "this capability spans 1 repo". The number alone is misleading. Round 1 splits the homepage counter into "X capabilities across Y repo-spans" so the headline matches what the L1 portal would show.

### TG-4 · `sanitizeMarkdownPage` post-pass may mangle cross-link URLs

The new cross-link strings contain `<CodeLink :source='...' />` Vue components with JSON payloads (lines 182, 498 of current `doc-gen.ts`). The sanitize loop already whitelists those tags, but the *new* cross-link payloads will include `<a href="/behaviors/by-entry-type/api">` style links. Round 1 must ensure any URL emitted into cross-link markdown passes through `mdText` / `mdCell` and is not damaged by sanitization.

## Test Gaps

### TstG-1 · No test asserts cross-artifact links exist on portal pages

`cdr-vitepress-build.test.mjs` only checks for the *existence* of files and embedded step data. It does not assert "domain X page mentions behavior Y", "behavior Z page lists state machine W's transition", "rule R page links to behavior B". Round 1 must add at least one assertion per BG above so the behavior is locked by a regression test.

### TstG-2 · No test exercises the v0.5 / v0.8 portal-section co-build path

`cdr-v0.8-reverse-cluster.test.mjs` runs `cdr.reversecluster.doc.generate` then `cdr.doc.generate` (line 156) but only checks that both completed. It does not assert the resulting `config.mts` includes `/l1/index.md` in `pages: []`. Round 1 must assert this, otherwise BG-8 stays broken.

### TstG-3 · No test exercises a domain with members

The current portal generation runs against an essentially empty workspace (one behavior, one state machine). Cross-artifact aggregation needs at least one domain with 2 behaviors, 1 state machine with transitions whose `behavior_id` matches, and 1 business rule with `applies_to` set — to verify the *links* are wired. Round 1 must add this scenario.

## Risks

### R-1 · Backward compat of portal URLs

Any new page path must not collide with an existing flat URL. `safeId` produces `kebab-case`; the new paths `/behaviors/by-entry-type/<kind>` and `/business-rules/by-kind/<kind>` use reserved words ("by-entry-type", "by-kind") — verified that `entry.type` slugs are `api / mq / cron / rpc / cache / search / other`, none of which is `by-entry-type` or `by-kind`, so no collision.

### R-2 · Per-repo namespace leaking into aggregation pages

Grouping by entry type or rule kind crosses repo boundaries. The pages must clearly label the repo on every row, otherwise the reader cannot tell which repo the behavior lives in. Round 1 design must include a "Repo" column in any cross-repo grouping.

### R-3 · Behavior schema drift between versions

The fixture `sample-repo-analysis.yaml` is still v2.2-schema. Round 3 will modernize it. Until then, the new aggregation tests must build their own workspaces from scratch (mirroring what `cdr-vitepress-build.test.mjs` already does) so they are not coupled to fixture drift.

### R-4 · Auto-folding v0.5 / v0.8 sections changes existing tests

If `cdr.doc.generate` starts *detecting and folding* the `/l1/` and `/cross-repo/` sections, then the existing `cdr-v0.8-reverse-cluster.test.mjs` test which does `cdr.doc.generate` after `cdr.reversecluster.doc.generate` will see a different `config.mts`. The change is additive (extra pages, extra sidebar entries), so existing assertions should still pass. Will be confirmed in implementation.

### R-5 · `cdr.doc.generate` is invoked from multiple places; auto-folding may surprise callers

`cdr.doc.generate` is the central capability. Auto-folding L1 / cross-repo sections means callers no longer have to invoke them separately — they can just call `cdr.doc.generate` and the portal will include everything. This is desirable but must be opt-in (e.g., a `fold_v08_sections: true` input flag with default true) so that any caller who wants the old behavior can opt out. Will be confirmed in solution-design.

## Open Questions

- [ ] **Q1** — Should `/domains/` (the L2 view) be the new "business modules" home, or should we add a new top-level `/business-modules/` (L1.5) that *contains* domains grouped by capability? Both are defensible.
- [ ] **Q2** — When a behavior has multiple `calls[].target_repo`, do we render one "Cross-service calls" table (current) or one table per target repo (more browsable but more visual noise)?
- [ ] **Q3** — When `behavior_id` on a transition does not match any existing behavior, do we render the id as a dead link, hide the link, or render the id as plain text with a "(no behavior document)" tooltip?
- [ ] **Q4** — The cross-link Mermaid on the L1 portal already shows a domain-level graph. Should Round 1 also produce a behavior-call-graph Mermaid at the bottom of `/behaviors/` (cross-service calls across all behaviors, not just one)?

These will be resolved in the Round 1 solution-design checkpoint.

## Round Plan

| Round | Scope | Exit criterion |
|---|---|---|
| 1 | BG-1, BG-2, BG-3, BG-4, BG-5, BG-6, BG-7, BG-8, BG-9 + TG-1, TG-2, TG-3, TG-4 + TstG-1, TstG-2, TstG-3 | `cdr-vitepress-build.test.mjs` and `cdr-v0.8-reverse-cluster.test.mjs` pass; new `cdr-portal-aggregation.test.mjs` passes with the BG-1..BG-9 assertions |
| 2 | BG-10 + entry-coverage / behavior-coverage / fact-ratio / stale-queue surfaced on home and capability pages; runtime/template's `build-cognitive-pages.ts` parity | New tests assert quality section is rendered with correct math |
| 3 | Modernize `tests/fixtures/sample-node-repo/docs/as-is/` to current schema and seed domains / capabilities / business-rules / entries so a fresh user has a model to copy | `cdr.bootstrap` against the fixture produces a non-empty portal |
