// cdr-portal-aggregation Round 1 T5.1 (D7, TstG-1/2/3).
// Mirrors cdr-vitepress-build.test.mjs pattern: mkdtempSync workspace +
// core.runCapability upserts + cdr.doc.generate + assertions on the
// written portal. No fixture dependency (fixtures for cdr-portal-aggregation
// are tracked in Round 3, separate feature).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const core = await import('../../packages/core/src/index.ts');

async function setupAggregationWorkspace() {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cpa-'));
  const ctx = { rootDir: tmp, now: new Date() };
  await core.runCapability('workspace.init', {}, ctx);

  // Real `demo` repo so evidence validator accepts file:line pointers.
  const repoDir = join(tmp, 'repos', 'demo');
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(join(repoDir, 'src'), { recursive: true });
  writeFileSync(join(repoDir, 'src', 'orders.ts'),
    "import { Router } from 'express';\n" +
    "const router = Router();\n" +
    "router.post('/orders', async (req, res) => { res.json({ ok: true }); });\n" +
    "router.get('/orders/:id', async (req, res) => { res.json({ id: req.params.id }); });\n" +
    "export default router;\n"
  );
  writeFileSync(join(repoDir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));

  // Two behaviors in the checkout domain (D1: reuse behavior.derived_from).
  await core.runCapability('cdr.behavior.upsert', {
    id: 'order-create',
    repo: 'demo',
    entry: { type: 'api', method: 'POST', path: '/orders' },
    steps: [{ name: 'Create', action: 'persist order' }],
    confidence: { level: 'high', kind: 'fact' },
    derived_from: ['checkout'],
    sources: [{ file: 'src/orders.ts', line: 3, repo: 'demo' }]
  }, ctx);
  await core.runCapability('cdr.behavior.upsert', {
    id: 'order-cancel',
    repo: 'demo',
    entry: { type: 'api', method: 'POST', path: '/orders/:id/cancel' },
    steps: [{ name: 'Cancel', action: 'release stock' }],
    confidence: { level: 'high', kind: 'fact' },
    derived_from: ['checkout'],
    sources: [{ file: 'src/orders.ts', line: 4, repo: 'demo' }]
  }, ctx);

  // State machine: write directly under docs/as-is/state-machines/demo/.
  // cdr.state.derive infers transitions from already-upserted behaviors; here
  // we want to control transitions explicitly (including a dangling id for D2).
  // State-machine schema (see packages/core/src/evidence.ts):
  //   { entity, states[], transitions[{from,to,trigger,behavior_id?}], confidence, derived_from?, sources?, initial_state? }
  mkdirSync(join(tmp, 'docs/as-is/state-machines', 'demo'), { recursive: true });
  writeFileSync(join(tmp, 'docs/as-is/state-machines', 'demo', 'order.yaml'),
    "entity: Order\n" +
    "repo: demo\n" +
    "states:\n" +
    "  - CREATED\n" +
    "  - CANCELLED\n" +
    "transitions:\n" +
    "  - from: null\n" +
    "    to: CREATED\n" +
    "    trigger: POST /orders\n" +
    "    behavior_id: order-create\n" +
    "  - from: CREATED\n" +
    "    to: CANCELLED\n" +
    "    trigger: cancel\n" +
    "    behavior_id: non-existent-behavior\n" +
    "confidence:\n" +
    "  level: medium\n" +
    "  kind: inference\n" +
    "  evidence_type: inferred_from_behaviors\n" +
    "derived_from:\n" +
    "  - order-create\n" +
    "  - order-cancel\n" +
    "initial_state: CREATED\n"
  );

  // Domain: cite behavior ids as evidence (P1 red line requires behaviors[]).
  await core.runCapability('cdr.domain.compose', {
    domain: 'checkout',
    description: 'Order creation and cancellation flow.',
    behaviors: ['order-create', 'order-cancel']
  }, ctx);

  // Capability map with spans_repos and a domain reference (BG-3).
  // Note: top-level `id` and `name` are required so generateCapabilityPage
  // produces <id>.md (it falls back to basename otherwise, which would be
  // "product-map.md" not "place-order.md").
  mkdirSync(join(tmp, 'docs/as-is/capabilities'), { recursive: true });
  writeFileSync(join(tmp, 'docs/as-is/capabilities/product-map.yaml'),
    "id: place-order\n" +
    "name: Place Order\n" +
    "product: demo-mall\n" +
    "description: End-to-end order placement.\n" +
    "domains:\n" +
    "  - checkout\n" +
    "spans_repos:\n" +
    "  - demo\n" +
    "capabilities:\n" +
    "  - id: place-order\n" +
    "    name: Place Order\n" +
    "    description: End-to-end order placement.\n" +
    "    domains: [checkout]\n" +
    "    spans_repos: [demo]\n"
  );

  // Two business rules: one with applies_to, one without (BG-5 + BG-6).
  // Both carry kind=fact so P1 red line requires sources[] pointing at real code.
  // Both also declare derived_from: ['checkout'] so BG-1's "Business rules applying
  // to this domain" section in /business-modules/index.md has members to render.
  await core.runCapability('cdr.business.compose', {
    id: 'order-amount-positive',
    kind: 'invariant',
    description: 'Order amount must be positive.',
    expr: 'order.amount > 0',
    applies_to: ['order-create'],
    derived_from: ['checkout'],
    confidence: { level: 'high', kind: 'fact' },
    sources: [{ file: 'src/orders.ts', line: 3, repo: 'demo' }]
  }, ctx);
  await core.runCapability('cdr.business.compose', {
    id: 'order-cancel-allowed',
    kind: 'authorization',
    description: 'Only the order owner may cancel.',
    derived_from: ['checkout'],
    confidence: { level: 'high', kind: 'fact' },
    sources: [{ file: 'src/orders.ts', line: 4, repo: 'demo' }]
  }, ctx);

  // Entries: confirmed entry with id matching order-create (BG-9 + back-link).
  mkdirSync(join(tmp, 'docs/as-is/entries'), { recursive: true });
  writeFileSync(join(tmp, 'docs/as-is/entries/demo.yaml'),
    "repo: demo\n" +
    "generated_at: '2026-06-22T00:00:00Z'\n" +
    "entry_count: 1\n" +
    "entries:\n" +
    "  - id: order-create\n" +
    "    type: api\n" +
    "    status: confirmed\n" +
    "    discovered_by: ai\n" +
    "    anchor: src/orders.ts\n" +
    "    line: 3\n" +
    "    method: POST\n" +
    "    path: /orders\n" +
    "    summary: Create order endpoint.\n"
  );

  // Pre-write /l1/index.md and /cross-repo/index.md directly into the portal
  // directory (NOT docs/as-is/) to test BG-8 auto-fold. These mimic what
  // cdr.reversecluster.doc.generate / cdr.crossrepo.doc.generate would write
  // into the portal BEFORE cdr.doc.generate runs. detectExistingPortalSections
  // checks the portal dir on disk.
  mkdirSync(join(tmp, '.dapei', 'docs-portal', 'l1'), { recursive: true });
  writeFileSync(join(tmp, '.dapei', 'docs-portal', 'l1', 'index.md'),
    "---\ntitle: L1 Capability Map\n---\n\n# L1 Capability Map\n\n> Pre-existing L1 section for BG-8 detection.\n"
  );
  mkdirSync(join(tmp, '.dapei', 'docs-portal', 'cross-repo'), { recursive: true });
  writeFileSync(join(tmp, '.dapei', 'docs-portal', 'cross-repo', 'index.md'),
    "---\ntitle: Cross-repo\n---\n\n# Cross-repo\n\n> Pre-existing cross-repo section for BG-8 detection.\n"
  );

  return { tmp, ctx };
}

test('BG-1: /business-modules/index.md lists every domain with members', async () => {
  const { tmp, ctx } = await setupAggregationWorkspace();
  try {
    await core.runCapability('cdr.doc.generate', {}, ctx);
    const portal = join(tmp, '.dapei/docs-portal');
    const md = readFileSync(join(portal, 'business-modules', 'index.md'), 'utf8');
    assert.match(md, /checkout/, 'business-modules page should mention the checkout domain');
    assert.match(md, /order-create/, 'business-modules page should list order-create behavior');
    assert.match(md, /order-cancel/, 'business-modules page should list order-cancel behavior');
    assert.match(md, /order-amount-positive/, 'business-modules page should list the invariant rule');
    assert.match(md, /Order/, 'business-modules page should list the Order state machine');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('BG-2: domain page shows Behaviors / State machines / Business rules members', async () => {
  const { tmp, ctx } = await setupAggregationWorkspace();
  try {
    await core.runCapability('cdr.doc.generate', {}, ctx);
    const portal = join(tmp, '.dapei/docs-portal');
    const md = readFileSync(join(portal, 'domains', 'checkout.md'), 'utf8');
    assert.match(md, /## Behaviors in this domain/, 'domain page must have Behaviors section');
    assert.match(md, /order-create/, 'domain page must list order-create');
    assert.match(md, /## State machines driven by these behaviors/, 'domain page must have States section');
    assert.match(md, /Order/, 'domain page must list Order state machine');
    assert.match(md, /## Business rules applying to this domain/, 'domain page must have Rules section');
    assert.match(md, /order-amount-positive/, 'domain page must list the invariant rule');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('BG-3: capability page shows Contributing domains / Spans repos', async () => {
  const { tmp, ctx } = await setupAggregationWorkspace();
  try {
    await core.runCapability('cdr.doc.generate', {}, ctx);
    const portal = join(tmp, '.dapei/docs-portal');
    const md = readFileSync(join(portal, 'capabilities', 'place-order.md'), 'utf8');
    assert.match(md, /## Contributing domains/, 'capability page must have Contributing domains section');
    assert.match(md, /checkout/, 'capability page must list the checkout domain');
    assert.match(md, /## Spans repos/, 'capability page must have Spans repos section');
    assert.match(md, /demo/, 'capability page must list the demo repo');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('BG-4: behavior page shows Drives transitions; state page shows Behavior column with D2 strikethrough', async () => {
  const { tmp, ctx } = await setupAggregationWorkspace();
  try {
    await core.runCapability('cdr.doc.generate', {}, ctx);
    const portal = join(tmp, '.dapei/docs-portal');

    const behaviorMd = readFileSync(join(portal, 'behaviors', 'demo', 'order-create.md'), 'utf8');
    assert.match(behaviorMd, /## Drives transitions/, 'behavior page must have Drives transitions section');
    assert.match(behaviorMd, /Order/, 'behavior page must list Order state machine');

    const stateMd = readFileSync(join(portal, 'states', 'demo', 'order.md'), 'utf8');
    assert.match(stateMd, /\| Behavior \|/, 'state page transitions table must have Behavior column');
    // D2: dangling id renders as strikethrough + tooltip
    assert.match(stateMd, /~~non-existent-behavior~~/, 'D2: missing behavior_id renders as strikethrough');
    assert.match(stateMd, /no behavior document/, 'D2: missing behavior_id has tooltip');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('BG-5: business rule page links to behaviors and domain', async () => {
  const { tmp, ctx } = await setupAggregationWorkspace();
  try {
    await core.runCapability('cdr.doc.generate', {}, ctx);
    const portal = join(tmp, '.dapei/docs-portal');
    const md = readFileSync(join(portal, 'business-rules', 'order-amount-positive.md'), 'utf8');
    assert.match(md, /order-create/, 'rule page must mention applied-to behavior');
    assert.match(md, /\/behaviors\//, 'rule page must link to behaviors section');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('BG-6: business rules are grouped by kind', async () => {
  const { tmp, ctx } = await setupAggregationWorkspace();
  try {
    await core.runCapability('cdr.doc.generate', {}, ctx);
    const portal = join(tmp, '.dapei/docs-portal');
    // invariant present → /business-rules/by-kind/invariant.md exists
    assert.ok(existsSync(join(portal, 'business-rules', 'by-kind', 'index.md')), 'by-kind index must exist');
    assert.ok(existsSync(join(portal, 'business-rules', 'by-kind', 'invariant.md')), 'invariant kind page must exist');
    assert.ok(existsSync(join(portal, 'business-rules', 'by-kind', 'authorization.md')), 'authorization kind page must exist');
    // constraint not present → no page
    assert.equal(existsSync(join(portal, 'business-rules', 'by-kind', 'constraint.md')), false, 'constraint kind page must not exist when no rules of that kind');

    const indexMd = readFileSync(join(portal, 'business-rules', 'by-kind', 'index.md'), 'utf8');
    assert.match(indexMd, /invariant/, 'by-kind index must list invariant');
    assert.match(indexMd, /authorization/, 'by-kind index must list authorization');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('BG-7: behaviors are grouped by entry type', async () => {
  const { tmp, ctx } = await setupAggregationWorkspace();
  try {
    await core.runCapability('cdr.doc.generate', {}, ctx);
    const portal = join(tmp, '.dapei/docs-portal');
    assert.ok(existsSync(join(portal, 'behaviors', 'by-entry-type', 'index.md')), 'by-entry-type index must exist');
    assert.ok(existsSync(join(portal, 'behaviors', 'by-entry-type', 'api.md')), 'api type page must exist');
    // No mq/cron entries in fixture → no pages for those types
    assert.equal(existsSync(join(portal, 'behaviors', 'by-entry-type', 'mq.md')), false, 'mq type page must not exist when no mq behaviors');

    const indexMd = readFileSync(join(portal, 'behaviors', 'by-entry-type', 'index.md'), 'utf8');
    assert.match(indexMd, /api/, 'by-entry-type index must list api');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('BG-8: /l1/ and /cross-repo/ are auto-folded into portal (default-on)', async () => {
  const { tmp, ctx } = await setupAggregationWorkspace();
  try {
    await core.runCapability('cdr.doc.generate', {}, ctx);
    const portal = join(tmp, '.dapei/docs-portal');
    const cfg = readFileSync(join(portal, '.vitepress', 'config.mts'), 'utf8');
    assert.match(cfg, /\/l1\/index\.md/, 'config.mts pages must include /l1/index.md');
    assert.match(cfg, /\/cross-repo\/index\.md/, 'config.mts pages must include /cross-repo/index.md');
    assert.match(cfg, /L1 Map/, 'config.mts nav must include L1 Map');
    assert.match(cfg, /Cross-repo/, 'config.mts nav must include Cross-repo');

    // Opt-out: fold_v08_sections: false excludes them.
    const tmp2 = mkdtempSync(join(tmpdir(), 'dapei-cpa-optout-'));
    const ctx2 = { rootDir: tmp2, now: new Date() };
    try {
      await core.runCapability('workspace.init', {}, ctx2);
      mkdirSync(join(tmp2, 'docs/as-is/l1'), { recursive: true });
      writeFileSync(join(tmp2, 'docs/as-is/l1/index.md'), '# L1\n');
      await core.runCapability('cdr.doc.generate', { fold_v08_sections: false }, ctx2);
      const cfg2 = readFileSync(join(tmp2, '.dapei/docs-portal/.vitepress/config.mts'), 'utf8');
      assert.equal(/\/l1\/index\.md/.test(cfg2), false, 'opt-out: /l1/index.md must NOT be in pages');
      assert.equal(/L1 Map/.test(cfg2), false, 'opt-out: L1 Map must NOT be in nav');
    } finally {
      rmSync(tmp2, { recursive: true, force: true });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('BG-9: /entries/<repo>/index.md lists entries; behavior page links back to it', async () => {
  const { tmp, ctx } = await setupAggregationWorkspace();
  try {
    await core.runCapability('cdr.doc.generate', {}, ctx);
    const portal = join(tmp, '.dapei/docs-portal');

    assert.ok(existsSync(join(portal, 'entries', 'demo.md')), '/entries/demo.md must exist');
    const entriesMd = readFileSync(join(portal, 'entries', 'demo.md'), 'utf8');
    assert.match(entriesMd, /order-create/, 'entries page must list the order-create entry');

    const behaviorMd = readFileSync(join(portal, 'behaviors', 'demo', 'order-create.md'), 'utf8');
    assert.match(behaviorMd, /entry catalog/, 'behavior page must have an "entry catalog" back-link when entry exists');
    assert.match(behaviorMd, /\/entries\/demo/, 'back-link must target /entries/demo');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('TstG-2: cdr.doc.generate still works after pre-existing /l1/ + /cross-repo/ are present', async () => {
  const { tmp, ctx } = await setupAggregationWorkspace();
  try {
    // Calling cdr.doc.generate after /l1/index.md + /cross-repo/index.md
    // already exist on disk (mimics cdr.reversecluster.doc.generate running
    // first). Pages from those sections must still be built.
    await core.runCapability('cdr.doc.generate', {}, ctx);
    const portal = join(tmp, '.dapei/docs-portal');
    assert.ok(existsSync(join(portal, 'l1', 'index.md')), '/l1/index.md must survive cdr.doc.generate');
    assert.ok(existsSync(join(portal, 'cross-repo', 'index.md')), '/cross-repo/index.md must survive cdr.doc.generate');
    assert.ok(existsSync(join(portal, 'business-modules', 'index.md')), '/business-modules/index.md must be generated by cdr.doc.generate');
    assert.ok(existsSync(join(portal, 'behaviors', 'demo', 'order-create.md')), 'main behavior pages must still be generated');
    assert.ok(existsSync(join(portal, 'states', 'demo', 'order.md')), 'main state pages must still be generated');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
