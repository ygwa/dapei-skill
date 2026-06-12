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
  const { sourceFile = 'src/routes.ts', line = 6, events } = opts;
  const body = {
    id,
    repo,
    entry: { type: 'api', method: 'POST', path: `/${id}` },
    confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
    sources: [{ file: sourceFile, line, repo }]
  };
  if (events !== undefined) body.events = events;
  return core.runCapability('cdr.behavior.upsert', body, c(tmp));
}

// ---------------------------------------------------------------------------
// v0.8 — cdr.reversecluster.doc.generate
// ---------------------------------------------------------------------------

test('cdr.reversecluster.doc.generate: fails fast when product-map.yaml missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-rcd-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    await assert.rejects(
      core.runCapability('cdr.reversecluster.doc.generate', {}, c(tmp)),
      (err) => err.code === 'FILE_MISSING' && /product-map\.yaml/.test(err.message)
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.reversecluster.doc.generate: emits l1/ section when capability-map exists', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-rcd-'));
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
    await core.runCapability('cdr.capability.map.synth', { product: 'Mall' }, c(tmp));

    const { result } = await core.runCapability('cdr.reversecluster.doc.generate', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.section, 'l1');
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/l1/index.md')));

    const indexMd = readFileSync(join(tmp, '.dapei/docs-portal/l1/index.md'), 'utf8');
    assert.match(indexMd, /# L1 Capability Map/);
    assert.match(indexMd, /mermaid/);
    assert.match(indexMd, /domain\.order/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.reversecluster.doc.generate: emits one page per capability', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-rcd-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await writeBehavior(tmp, 'mall-order', 'order-create');
    await writeBehavior(tmp, 'mall-order', 'order-cancel');
    await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'Order',
        description: 'Order endpoints',
        behaviors: ['order-create', 'order-cancel'],
        repo: 'mall-order',
        confidence: { level: 'medium', kind: 'inference' }
      },
      c(tmp)
    );
    await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'Inventory',
        description: 'Inventory endpoints',
        behaviors: ['order-create'],
        repo: 'mall-order',
        confidence: { level: 'medium', kind: 'inference' }
      },
      c(tmp)
    );
    await core.runCapability('cdr.capability.map.synth', { product: 'Mall' }, c(tmp));

    const { result } = await core.runCapability('cdr.reversecluster.doc.generate', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.capabilities_rendered, 2);
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/l1/domain-order.md')));
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/l1/domain-inventory.md')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.reversecluster.doc.generate: also renders cluster-suggestions when present', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-rcd-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'order-create', { events: ['order.created'] });
    await writeBehavior(tmp, 'mall-payment', 'payment-capture', { events: ['order.created'] });

    await core.runCapability('cdr.domain.suggest', {}, c(tmp));
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
    await core.runCapability(
      'cdr.capability.map.synth',
      { product: 'Mall', use_suggested_domains: true },
      c(tmp)
    );

    const { result } = await core.runCapability('cdr.reversecluster.doc.generate', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.suggestions_rendered, 1);
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/l1/cluster-suggestions.md')));
    const md = readFileSync(join(tmp, '.dapei/docs-portal/l1/cluster-suggestions.md'), 'utf8');
    assert.match(md, /Cluster Suggestions/);
    assert.match(md, /SUGGESTIONS/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.reversecluster.doc.generate: empty workspace renders an empty-state l1/', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-rcd-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    await core.runCapability('cdr.capability.map.synth', { product: 'Mall' }, c(tmp));

    const { result } = await core.runCapability('cdr.reversecluster.doc.generate', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.capabilities_rendered, 0);
    const md = readFileSync(join(tmp, '.dapei/docs-portal/l1/index.md'), 'utf8');
    assert.match(md, /empty/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.reversecluster.doc.generate: respects custom output_dir', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-rcd-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    await core.runCapability('cdr.capability.map.synth', { product: 'Mall' }, c(tmp));

    const { result } = await core.runCapability(
      'cdr.reversecluster.doc.generate',
      { output_dir: 'custom-portal' },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(tmp, 'custom-portal/l1/index.md')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.reversecluster.doc.generate: pages include Mermaid total graph', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-rcd-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'order-create');
    await writeBehavior(tmp, 'mall-payment', 'payment-capture');
    await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'Order',
        description: 'Order',
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
        description: 'Payment',
        behaviors: ['payment-capture'],
        repo: 'mall-payment',
        confidence: { level: 'medium', kind: 'inference' }
      },
      c(tmp)
    );
    await core.runCapability('cdr.capability.map.synth', { product: 'Mall' }, c(tmp));

    await core.runCapability('cdr.reversecluster.doc.generate', {}, c(tmp));
    const md = readFileSync(join(tmp, '.dapei/docs-portal/l1/index.md'), 'utf8');
    assert.match(md, /graph TD/);
    assert.match(md, /domain_order/);
    assert.match(md, /domain_payment/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});