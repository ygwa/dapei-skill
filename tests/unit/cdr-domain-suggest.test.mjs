import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(__dirname, '../fixtures');

const c = (tmp) => ({ rootDir: tmp, now: new Date() });

function gitInit(path) {
  execFileSync('git', ['-C', path, 'init', '-b', 'main'], { encoding: 'utf8' });
  execFileSync('git', ['-C', path, 'config', 'user.name', 'dapei test'], { encoding: 'utf8' });
  execFileSync('git', ['-C', path, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  execFileSync('git', ['-C', path, 'add', '.'], { encoding: 'utf8' });
  execFileSync('git', ['-C', path, 'commit', '-m', 'fixture'], { encoding: 'utf8' });
}

async function seedFixtureRepo(tmp, repoName, fixtureName = repoName) {
  const srcDir = join(tmp, 'fixture-sources', repoName);
  mkdirSync(srcDir, { recursive: true });
  cpSync(join(fixtureRoot, fixtureName), srcDir, { recursive: true });
  gitInit(srcDir);
  return srcDir;
}

async function workspaceWithRepoFixture(tmp, repoName, fixtureName = repoName) {
  await core.runCapability('workspace.init', {}, c(tmp));
  const srcDir = await seedFixtureRepo(tmp, repoName, fixtureName);
  await core.runCapability('repos.add', { name: repoName, url: srcDir }, c(tmp));
  await core.runCapability('cdr.profile', { repo: repoName }, c(tmp));
}

async function writeBehavior(tmp, repo, id, opts = {}) {
  const { sourceFile = 'src/routes.ts', line = 6, events, writes, calls } = opts;
  const body = {
    id,
    repo,
    entry: { type: 'api', method: 'POST', path: `/${id}` },
    confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
    sources: [{ file: sourceFile, line, repo }]
  };
  if (events !== undefined) body.events = events;
  if (writes !== undefined) body.writes = writes;
  if (calls !== undefined) body.calls = calls;
  return core.runCapability('cdr.behavior.upsert', body, c(tmp));
}

// ---------------------------------------------------------------------------
// v0.8 — cdr.domain.suggest
// ---------------------------------------------------------------------------

test('cdr.domain.suggest: returns empty report on empty workspace', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ds-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    const { result } = await core.runCapability('cdr.domain.suggest', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.behavior_count, 0);
    assert.equal(result.data.reported_cluster_count, 0);
    assert.ok(existsSync(join(tmp, 'docs/as-is/cross-repo/domain-suggestions.yaml')));
    const yaml = readFileSync(join(tmp, 'docs/as-is/cross-repo/domain-suggestions.yaml'), 'utf8');
    assert.match(yaml, /These are SUGGESTIONS/);
    assert.match(yaml, /behavior_count: 0/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.domain.suggest: does not call cdr.domain.compose — only writes suggestions file', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ds-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'order-create', { events: ['order.created'], writes: [{ table: 'orders', operation: 'insert' }] });
    await writeBehavior(tmp, 'mall-payment', 'payment-capture', { events: ['order.created'], writes: [{ table: 'orders', operation: 'update' }] });

    const { result } = await core.runCapability('cdr.domain.suggest', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.reported_cluster_count, 1);
    assert.equal(result.data.clusters[0].behavior_keys.length, 2);

    // Suggestion file present
    assert.ok(existsSync(join(tmp, 'docs/as-is/cross-repo/domain-suggestions.yaml')));
    // No domain.yaml created by the suggest capability itself
    const { result: domainFiles } = await core.runCapability('cdr.index.list', {}, c(tmp));
    assert.equal(domainFiles.data.domains.length, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.domain.suggest: clusters cross-repo behaviors via shared-events', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ds-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'order-create', { events: ['order.created', 'order.audit'] });
    await writeBehavior(tmp, 'mall-payment', 'payment-capture', { events: ['order.created'] });

    const { result } = await core.runCapability('cdr.domain.suggest', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.behavior_count, 2);
    assert.equal(result.data.reported_cluster_count, 1);
    const cluster = result.data.clusters[0];
    assert.equal(cluster.confidence, 'high');
    assert.equal(cluster.repos.length, 2);
    assert.match(cluster.suggested_name, /order/i);
    assert.ok(cluster.evidence.some((e) => e.type === 'shared-events' && e.detail === 'order.created'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.domain.suggest: clusters via cross-repo calls when events absent', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ds-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'order-create', {
      events: [],
      calls: [{ target: 'payment.capture', target_repo: 'mall-payment', evidence: { file: 'src/routes.ts', line: 5 } }]
    });
    await writeBehavior(tmp, 'mall-payment', 'payment-capture');

    const { result } = await core.runCapability('cdr.domain.suggest', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.reported_cluster_count, 1);
    const cluster = result.data.clusters[0];
    assert.equal(cluster.confidence, 'low');
    assert.ok(cluster.evidence.some((e) => e.type === 'cross-repo-calls'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.domain.suggest: clusters via shared-writes', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ds-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'order-create', {
      events: [],
      writes: [{ table: 'transactions', operation: 'insert' }]
    });
    await writeBehavior(tmp, 'mall-payment', 'payment-capture', {
      events: [],
      writes: [{ table: 'transactions', operation: 'update' }]
    });

    const { result } = await core.runCapability('cdr.domain.suggest', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.reported_cluster_count, 1);
    const cluster = result.data.clusters[0];
    assert.equal(cluster.confidence, 'medium');
    assert.ok(cluster.evidence.some((e) => e.type === 'shared-writes' && e.detail === 'transactions'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.domain.suggest: clusters via business-rule co-apply', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ds-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'order-create');
    await writeBehavior(tmp, 'mall-payment', 'payment-capture');
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'payment-after-order',
        kind: 'compensation',
        description: 'payment captures after order',
        applies_to: ['order-create', 'payment-capture'],
        repo: 'mall-payment',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/paymentService.ts', line: 1, repo: 'mall-payment' }]
      },
      c(tmp)
    );

    const { result } = await core.runCapability('cdr.domain.suggest', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.reported_cluster_count, 1);
    const cluster = result.data.clusters[0];
    assert.ok(cluster.evidence.some((e) => e.type === 'business-rule'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.domain.suggest: filters out sub-min-size clusters', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ds-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await writeBehavior(tmp, 'mall-order', 'lonely', { events: ['lonely.event'] });

    const { result } = await core.runCapability('cdr.domain.suggest', { min_size: 2 }, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.behavior_count, 1);
    assert.equal(result.data.reported_cluster_count, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.domain.suggest: limits output via max_clusters', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ds-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await writeBehavior(tmp, 'mall-order', 'a-1', { events: ['a.created'] });
    await writeBehavior(tmp, 'mall-order', 'a-2', { events: ['a.created'] });
    await writeBehavior(tmp, 'mall-order', 'b-1', { events: ['b.created'] });
    await writeBehavior(tmp, 'mall-order', 'b-2', { events: ['b.created'] });

    const { result } = await core.runCapability('cdr.domain.suggest', { max_clusters: 1 }, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.reported_cluster_count, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.domain.suggest: deterministic — same input yields same output', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ds-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'order-create', { events: ['order.created'] });
    await writeBehavior(tmp, 'mall-payment', 'payment-capture', { events: ['order.created'] });

    const { result: r1 } = await core.runCapability('cdr.domain.suggest', {}, c(tmp));
    const { result: r2 } = await core.runCapability('cdr.domain.suggest', {}, c(tmp));
    assert.deepEqual(r1.data.clusters[0].behavior_keys, r2.data.clusters[0].behavior_keys);
    assert.equal(r1.data.clusters[0].suggested_name, r2.data.clusters[0].suggested_name);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.domain.suggest: repos[] filter limits the behavior universe', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ds-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'order-create', { events: ['order.created'] });
    await writeBehavior(tmp, 'mall-payment', 'payment-capture', { events: ['order.created'] });

    const { result } = await core.runCapability(
      'cdr.domain.suggest',
      { repos: ['mall-order'] },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.behavior_count, 1);
    assert.equal(result.data.reported_cluster_count, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});