import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');
const fixtureRoot = join(import.meta.dirname, '../fixtures');

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
  const { sourceFile = 'src/routes.ts', line = 6, events, writes } = opts;
  const body = {
    id,
    repo,
    entry: { type: 'api', method: 'POST', path: `/${id}` },
    confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
    sources: [{ file: sourceFile, line, repo }]
  };
  if (events !== undefined) body.events = events;
  if (writes !== undefined) body.writes = writes;
  return core.runCapability('cdr.behavior.upsert', body, c(tmp));
}

// ---------------------------------------------------------------------------
// v0.8 — cdr.capability.map.synth
// ---------------------------------------------------------------------------

test('cdr.capability.map.synth: returns one capability per domain on empty workspace', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cms-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    const { result } = await core.runCapability(
      'cdr.capability.map.synth',
      { product: 'Empty Product' },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.capability_count, 0);
    assert.equal(result.data.domain_count, 0);
    assert.ok(existsSync(join(tmp, 'docs/as-is/capabilities/product-map.yaml')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.capability.map.synth: synthesizes one capability per composed domain', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cms-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await writeBehavior(tmp, 'mall-order', 'order-create');
    await writeBehavior(tmp, 'mall-order', 'order-cancel');
    await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'Order Lifecycle',
        description: 'All order CRUD endpoints',
        behaviors: ['order-create', 'order-cancel'],
        repo: 'mall-order',
        confidence: { level: 'medium', kind: 'inference' }
      },
      c(tmp)
    );
    const { result } = await core.runCapability(
      'cdr.capability.map.synth',
      { product: 'E-Commerce Mall' },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.capability_count, 1);
    assert.equal(result.data.domain_count, 1);
    const cap = result.data.capabilities[0];
    assert.match(cap.id, /^domain\.order-lifecycle$/);
    assert.equal(cap.domains.length, 1);
    assert.deepEqual(cap.spans_repos, ['mall-order']);
    assert.equal(cap.behavior_count, 2);
    assert.equal(cap.fact_ratio, 1.0);
    assert.equal(cap.source, 'composed');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.capability.map.synth: AI-provided capabilities get back-filled metrics', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cms-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'order-create');
    await writeBehavior(tmp, 'mall-payment', 'payment-capture');
    await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'Order',
        description: 'Order endpoints',
        behaviors: ['order-create'],
        repo: 'mall-order',
        confidence: { level: 'medium', kind: 'inference' }
      },
      c(tmp)
    );
    await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'Payment',
        description: 'Payment endpoints',
        behaviors: ['payment-capture'],
        repo: 'mall-payment',
        confidence: { level: 'medium', kind: 'inference' }
      },
      c(tmp)
    );

    const { result } = await core.runCapability(
      'cdr.capability.map.synth',
      {
        product: 'E-Commerce Mall',
        capabilities: [
          { id: 'core.checkout', name: 'Checkout', description: 'end-to-end checkout', domains: ['Order', 'Payment'] }
        ]
      },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.capability_count, 1);
    const cap = result.data.capabilities[0];
    assert.equal(cap.id, 'core.checkout');
    assert.equal(cap.domains.length, 2);
    assert.deepEqual(cap.spans_repos.sort(), ['mall-order', 'mall-payment']);
    assert.equal(cap.behavior_count, 2);
    assert.equal(cap.fact_ratio, 1.0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.capability.map.synth: rejects capability id without dots', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cms-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    await assert.rejects(
      core.runCapability(
        'cdr.capability.map.synth',
        { product: 'X', capabilities: [{ id: 'invalid_id', name: 'X', domains: [] }] },
        c(tmp)
      ),
      (err) => err.code === 'INVALID_INPUT'
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.capability.map.synth: use_suggested_domains pulls from cdr.domain.suggest', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cms-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'order-create', { events: ['order.created'] });
    await writeBehavior(tmp, 'mall-payment', 'payment-capture', { events: ['order.created'] });

    await core.runCapability('cdr.domain.suggest', {}, c(tmp));

    const { result } = await core.runCapability(
      'cdr.capability.map.synth',
      { product: 'E-Commerce Mall', use_suggested_domains: true },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.capability_count, 1);
    assert.equal(result.data.domain_sources.suggested, 1);
    assert.equal(result.data.capabilities[0].source, 'suggested');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.capability.map.synth: manual_domains wins over composed on name collision', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cms-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await writeBehavior(tmp, 'mall-order', 'order-create');
    await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'Order',
        description: 'composed desc',
        behaviors: ['order-create'],
        repo: 'mall-order',
        confidence: { level: 'medium', kind: 'inference' }
      },
      c(tmp)
    );

    const { result } = await core.runCapability(
      'cdr.capability.map.synth',
      {
        product: 'X',
        manual_domains: [{ name: 'Order', description: 'manual desc', behavior_ids: ['order-create'] }]
      },
      c(tmp)
    );
    assert.equal(result.ok, true);
    const cap = result.data.capabilities.find((c) => c.domains.includes('Order'));
    assert.equal(cap.description, 'manual desc');
    assert.equal(cap.source, 'manual');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.capability.map.synth: writes product-map.yaml with required fields', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cms-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    await core.runCapability(
      'cdr.capability.map.synth',
      { product: 'Mall' },
      c(tmp)
    );
    const yaml = readFileSync(join(tmp, 'docs/as-is/capabilities/product-map.yaml'), 'utf8');
    assert.match(yaml, /product: Mall/);
    assert.match(yaml, /synthesized_by: cdr\.capability\.map\.synth/);
    assert.match(yaml, /capabilities:/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.capability.map.synth: deterministic output across repeated calls', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cms-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await writeBehavior(tmp, 'mall-order', 'order-create');
    await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'Order',
        description: 'Order endpoints',
        behaviors: ['order-create'],
        repo: 'mall-order',
        confidence: { level: 'medium', kind: 'inference' }
      },
      c(tmp)
    );

    const { result: r1 } = await core.runCapability(
      'cdr.capability.map.synth',
      { product: 'Mall' },
      c(tmp)
    );
    const { result: r2 } = await core.runCapability(
      'cdr.capability.map.synth',
      { product: 'Mall' },
      c(tmp)
    );
    assert.equal(r1.data.capability_count, r2.data.capability_count);
    assert.deepEqual(r1.data.capabilities[0].id, r2.data.capabilities[0].id);
    assert.deepEqual(r1.data.capabilities[0].spans_repos, r2.data.capabilities[0].spans_repos);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});