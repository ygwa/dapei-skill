import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(__dirname, '../fixtures/sample-node-repo');

function initFixtureRepo(targetPath) {
  execFileSync('cp', ['-R', fixtureRoot, targetPath], { encoding: 'utf8' });
  if (!existsSync(join(targetPath, '.git'))) {
    execFileSync('git', ['-C', targetPath, 'init', '-b', 'main'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.name', 'dapei test'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'add', '.'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'commit', '-m', 'fixture'], { encoding: 'utf8' });
  }
}

const c = (tmp) => ({ rootDir: tmp, now: new Date() });

async function setupWorkspaceWithFeature() {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-feature-link-'));
  const repoPath = join(tmp, 'fixture-repo');
  await core.runCapability('workspace.init', {}, c(tmp));
  initFixtureRepo(repoPath);
  await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, c(tmp));
  await core.runCapability(
    'feature.create',
    {
      name: 'payment-refactor',
      objective: 'CDR link test',
      repos: 'sample-app'
    },
    c(tmp)
  );
  return tmp;
}

test('cdr.feature.link: empty workspace reports assets_tagged: 0', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    const { result } = await core.runCapability(
      'cdr.feature.link',
      { feature: 'payment-refactor' },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.assets_tagged, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.feature.link: tags a behavior that already exists in the index', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    await core.runCapability('cdr.behavior.upsert', {
      id: 'order-create', repo: 'sample-app',
      entry: { type: 'api', method: 'POST', path: '/orders' },
      steps: [{ name: 'V', action: 'check' }],
      confidence: { level: 'high', kind: 'fact' },
      sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
    }, c(tmp));
    const { result } = await core.runCapability(
      'cdr.feature.link',
      { feature: 'payment-refactor' },
      c(tmp)
    );
    assert.ok(result.data.assets_tagged >= 1);
    // cdr.query with created_by_feature should find it
    const q = await core.runCapability(
      'cdr.query',
      { created_by_feature: 'payment-refactor' },
      c(tmp)
    );
    const tagged = q.result.data.results.find((r) => r.id === 'order-create');
    assert.ok(tagged, 'behavior should be findable via created_by_feature filter');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.feature.link: tags domain + capability-map + business-rule files on disk', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    await core.runCapability('cdr.behavior.upsert', {
      id: 'order-create', repo: 'sample-app',
      entry: { type: 'api', method: 'POST', path: '/orders' },
      steps: [{ name: 'V', action: 'check' }],
      confidence: { level: 'high', kind: 'fact' },
      sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
    }, c(tmp));
    await core.runCapability('cdr.state.derive', { entity: 'Order', behaviors: ['order-create'], repo: 'sample-app' }, c(tmp));
    await core.runCapability('cdr.domain.compose', {
      domain: 'transaction',
      description: 'Order handling',
      behaviors: ['order-create'],
      repo: 'sample-app'
    }, c(tmp));
    await core.runCapability('cdr.capability.map.init', {
      product: 'E-Commerce Mall',
      capabilities: [{ id: 'cap.orders', name: 'Orders', spans_repos: ['sample-app'] }]
    }, c(tmp));
    await core.runCapability('cdr.business.compose', {
      id: 'order-amount-positive',
      kind: 'invariant',
      repo: 'sample-app',
      applies_to: ['order-create'],
      confidence: { level: 'high', kind: 'fact' },
      sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
    }, c(tmp));
    const { result } = await core.runCapability(
      'cdr.feature.link',
      { feature: 'payment-refactor' },
      c(tmp)
    );
    const domainYaml = readFileSync(join(tmp, 'docs/as-is/domains/transaction.yaml'), 'utf8');
    assert.match(domainYaml, /created_by_feature: payment-refactor/);
    const capYaml = readFileSync(join(tmp, 'docs/as-is/capabilities/product-map.yaml'), 'utf8');
    assert.match(capYaml, /created_by_feature: payment-refactor/);
    // business-rule file: walk the per-repo layout
    const ruleFiles = readdirSync(join(tmp, 'docs/as-is/business-rules/sample-app'));
    assert.ok(ruleFiles.some((f) => f.endsWith('order-amount-positive.yaml')));
    const ruleYaml = readFileSync(join(tmp, 'docs/as-is/business-rules/sample-app/order-amount-positive.yaml'), 'utf8');
    assert.match(ruleYaml, /created_by_feature: payment-refactor/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.feature.link is idempotent: second call reports 0 (nothing new to tag)', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    await core.runCapability('cdr.behavior.upsert', {
      id: 'order-create', repo: 'sample-app',
      entry: { type: 'api', method: 'POST', path: '/orders' },
      steps: [{ name: 'V', action: 'check' }],
      confidence: { level: 'high', kind: 'fact' },
      sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
    }, c(tmp));
    const r1 = await core.runCapability('cdr.feature.link', { feature: 'payment-refactor' }, c(tmp));
    const r2 = await core.runCapability('cdr.feature.link', { feature: 'payment-refactor' }, c(tmp));
    assert.equal(r1.result.data.assets_tagged, 1, 'first call should tag the new behavior');
    assert.equal(r2.result.data.assets_tagged, 0, 'second call should report 0 — nothing new to tag');
    // And the behavior is still findable after the no-op second call
    const q = await core.runCapability('cdr.query', { created_by_feature: 'payment-refactor' }, c(tmp));
    assert.ok(q.result.data.results.find((r) => r.id === 'order-create'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('feature.close: links CDR assets as a side effect', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    await core.runCapability('cdr.behavior.upsert', {
      id: 'order-create', repo: 'sample-app',
      entry: { type: 'api', method: 'POST', path: '/orders' },
      steps: [{ name: 'V', action: 'check' }],
      confidence: { level: 'high', kind: 'fact' },
      sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
    }, c(tmp));
    const { result } = await core.runCapability(
      'feature.close',
      { feature: 'payment-refactor', confirmed: true },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.ok(result.data.cdr_assets_tagged >= 1);
    // cdr.query should find the tagged behavior
    const q = await core.runCapability(
      'cdr.query',
      { created_by_feature: 'payment-refactor' },
      c(tmp)
    );
    const tagged = q.result.data.results.find((r) => r.id === 'order-create');
    assert.ok(tagged, 'feature.close should have linked the behavior via cdr.feature.link');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('feature.close still works when no CDR assets exist (empty workspace close)', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    const { result } = await core.runCapability(
      'feature.close',
      { feature: 'payment-refactor', confirmed: true },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.cdr_assets_tagged, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('pre-tag assets (no created_by_feature field) keep working through cdr.query', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    // Write an index entry without the v0.10 fields — this simulates a
    // pre-v0.10 entry that never went through cdr.feature.link.
    const indexDir = join(tmp, '.dapei', 'cognitive');
    mkdirSync(indexDir, { recursive: true });
    writeFileSync(
      join(indexDir, 'index.yaml'),
      [
        'version: "0.2"',
        'updated_at: "2026-06-14"',
        'behaviors:',
        '  - { id: legacy-behavior, kind: fact, level: high, repo: sample-app, path: docs/as-is/behavior/legacy.yaml }',
        'state_machines: []',
        'domains: []',
        'capability_maps: []',
        'business_rules: []',
        'unknowns: []',
        'repo_snapshots: []',
        'stale_assets: []',
        ''
      ].join('\n')
    );
    // Filter for a feature name — the legacy entry has no tag, so
    // the filter yields empty without erroring.
    const { result } = await core.runCapability(
      'cdr.query',
      { created_by_feature: 'nonexistent-feature' },
      c(tmp)
    );
    assert.equal(result.data.total, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});