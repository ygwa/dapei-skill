import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

async function setupWorkspaceWithBehavior() {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-query-'));
  const repoPath = join(tmp, 'fixture-repo');
  await core.runCapability('workspace.init', {}, c(tmp));
  initFixtureRepo(repoPath);
  await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, c(tmp));
  await core.runCapability('cdr.profile', { repo: 'sample-app' }, c(tmp));
  // Two behaviors, one with a PaymentClient call, one with order.created event
  await core.runCapability('cdr.behavior.upsert', {
    id: 'order-create', repo: 'sample-app',
    entry: { type: 'api', method: 'POST', path: '/orders' },
    steps: [{ name: 'Validate', action: 'check stock' }],
    confidence: { level: 'high', kind: 'fact' },
    events: ['order.created'],
    calls: [{ target: 'PaymentClient', target_repo: 'mall-payment', protocol: 'http' }],
    writes: [{ table: 'orders', operation: 'insert' }],
    sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
  }, c(tmp));
  await core.runCapability('cdr.behavior.upsert', {
    id: 'order-cancel', repo: 'sample-app',
    entry: { type: 'api', method: 'POST', path: '/orders/cancel' },
    steps: [{ name: 'Mark cancelled', action: 'update row' }],
    confidence: { level: 'high', kind: 'fact' },
    events: ['order.cancelled'],
    writes: [{ table: 'orders', operation: 'update' }],
    sources: [{ file: 'src/services/orderService.ts', line: 4, repo: 'sample-app' }]
  }, c(tmp));
  await core.runCapability('cdr.state.derive', { entity: 'Order', behaviors: ['order-create', 'order-cancel'] }, c(tmp));
  return tmp;
}

function writeIndexWithOrigin(tmp, entries, where = 'behavior') {
  const indexDir = join(tmp, '.dapei', 'cognitive');
  mkdirSync(indexDir, { recursive: true });
  const block = entries.map((e) => `  - { id: ${JSON.stringify(e.id)}, kind: ${JSON.stringify(e.kind)}, level: ${JSON.stringify(e.level)}, repo: sample-app, path: ${JSON.stringify(e.path)}, created_by_feature: ${JSON.stringify(e.feature)} }`).join('\n');
  const whereBlock = where === 'behavior'
    ? `behaviors:\n${block}`
    : `state_machines:\n${block}`;
  writeFileSync(
    join(indexDir, 'index.yaml'),
    [
      'version: "0.2"',
      'updated_at: "2026-06-14"',
      whereBlock,
      'domains: []',
      'capability_maps: []',
      'business_rules: []',
      'unknowns: []',
      'repo_snapshots: []',
      'stale_assets: []',
      ''
    ].join('\n')
  );
}

test('cdr.query: behavior by id_contains returns match', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    const { result } = await core.runCapability('cdr.query', { id_contains: 'order-create' }, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.total, 1);
    assert.equal(result.data.results[0].kind, 'behavior');
    assert.equal(result.data.results[0].id, 'order-create');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.query: filter by event returns only behaviors that emit it', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    const { result } = await core.runCapability('cdr.query', { event: 'order.cancelled' }, c(tmp));
    assert.equal(result.data.total, 1);
    assert.equal(result.data.results[0].id, 'order-cancel');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.query: filter by writes_table returns behaviors that write to it', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    const { result } = await core.runCapability('cdr.query', { writes_table: 'orders' }, c(tmp));
    assert.equal(result.data.total, 2);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.query: filter by calls_target returns behaviors that call it', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    const { result } = await core.runCapability('cdr.query', { calls_target: 'PaymentClient' }, c(tmp));
    assert.equal(result.data.total, 1);
    assert.equal(result.data.results[0].id, 'order-create');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.query: filter by target_repo returns cross-repo behaviors', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    const { result } = await core.runCapability('cdr.query', { target_repo: 'mall-payment' }, c(tmp));
    assert.equal(result.data.total, 1);
    assert.equal(result.data.results[0].id, 'order-create');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.query: state-machine by entity', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    const { result } = await core.runCapability('cdr.query', { target: 'state-machine', entity: 'Order' }, c(tmp));
    assert.equal(result.data.total, 1);
    assert.equal(result.data.results[0].id, 'Order');
    assert.equal(result.data.results[0].kind, 'state-machine');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.query: created_by_feature returns tagged assets', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    writeIndexWithOrigin(tmp, [
      { id: 'order-create', kind: 'fact', level: 'high', path: 'docs/as-is/behavior/order-create.yaml', feature: 'payment-refactor' }
    ]);
    const { result } = await core.runCapability('cdr.query', { created_by_feature: 'payment-refactor' }, c(tmp));
    assert.equal(result.data.total, 1);
    assert.equal(result.data.results[0].id, 'order-create');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.query: no matches returns results: [] and total: 0', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    const { result } = await core.runCapability('cdr.query', { id_contains: 'does-not-exist' }, c(tmp));
    assert.equal(result.data.total, 0);
    assert.deepEqual(result.data.results, []);
    assert.equal(result.data.next_step, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.query: limit clamps at 500', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    const { result } = await core.runCapability('cdr.query', { limit: 1 }, c(tmp));
    assert.ok(result.data.results.length <= 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.query: any target returns behaviors + state-machines', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    const { result } = await core.runCapability('cdr.query', {}, c(tmp));
    const kinds = result.data.results.map((r) => r.kind);
    assert.ok(kinds.includes('behavior'));
    assert.ok(kinds.includes('state-machine'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.query: target=behavior excludes state-machines', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    const { result } = await core.runCapability('cdr.query', { target: 'behavior' }, c(tmp));
    assert.ok(result.data.results.every((r) => r.kind === 'behavior'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.query is read-only: cognitive index file unchanged after query', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    const indexFile = join(tmp, '.dapei', 'cognitive', 'index.yaml');
    const before = (await import('node:fs')).readFileSync(indexFile, 'utf8');
    await core.runCapability('cdr.query', { id_contains: 'order' }, c(tmp));
    await core.runCapability('cdr.query', { event: 'order.created' }, c(tmp));
    const after = (await import('node:fs')).readFileSync(indexFile, 'utf8');
    assert.equal(before, after);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.index.list: new entity filter narrows state-machines', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    const { result } = await core.runCapability('cdr.index.list', { entity: 'Order' }, c(tmp));
    assert.ok(result.data.state_machines.length >= 1);
    assert.ok(result.data.state_machines.every((s) => s.entity === 'Order'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.index.list: created_by_feature filter yields empty on pre-tag workspace (backward compat)', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    // No cdr.feature.link has run, so no entry has the tag yet.
    const { result } = await core.runCapability(
      'cdr.index.list',
      { created_by_feature: 'payment-refactor' },
      c(tmp)
    );
    assert.equal(result.data.behaviors.length, 0,
      'pre-tag workspace: filter yields empty rather than error');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.index.list: created_by_feature filter narrows behaviors after cdr.feature.link', async () => {
  const tmp = await setupWorkspaceWithBehavior();
  try {
    await core.runCapability(
      'cdr.feature.link',
      { feature: 'payment-refactor' },
      c(tmp)
    );
    const { result } = await core.runCapability(
      'cdr.index.list',
      { created_by_feature: 'payment-refactor' },
      c(tmp)
    );
    const ids = result.data.behaviors.map((b) => b.id);
    assert.ok(ids.includes('order-create'),
      'tagged behavior should be findable via cdr.index.list filter');
    assert.ok(ids.includes('order-cancel'),
      'both tagged behaviors should be findable');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});