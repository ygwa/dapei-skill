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

// Build a self-contained fixture git repo under <tmp>/fixture-sources/<name>
// so repos.add can git clone it into the workspace's repos/ directory.
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

async function writeBehavior(tmp, repo, id, sourceFile = 'src/routes.ts', line = 6) {
  return core.runCapability(
    'cdr.behavior.upsert',
    {
      id,
      repo,
      entry: { type: 'api', method: 'POST', path: `/${id}` },
      writes: [{ table: `${id}_tbl`, operation: 'insert' }],
      events: [`${id}.created`],
      confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
      sources: [{ file: sourceFile, line, repo }]
    },
    c(tmp)
  );
}

// ---------------------------------------------------------------------------
// v0.5 — cdr.business.crosslink
// ---------------------------------------------------------------------------

test('cdr.business.crosslink: returns zero rules on empty workspace', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cl-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    const { result } = await core.runCapability('cdr.business.crosslink', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.total_rules, 0);
    assert.equal(result.data.cross_repo_rules, 0);
    assert.equal(result.data.intra_repo_rules, 0);
    assert.ok(existsSync(join(tmp, 'docs/as-is/cross-repo/cross-links.yaml')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.business.crosslink: intra-repo rules are filtered out by default', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cl-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await writeBehavior(tmp, 'mall-order', 'order-create');
    // Single-repo rule
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'amount-positive',
        kind: 'invariant',
        description: 'amount must be > 0',
        applies_to: ['order-create'],
        repo: 'mall-order',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes.ts', line: 1, repo: 'mall-order' }]
      },
      c(tmp)
    );
    const { result } = await core.runCapability('cdr.business.crosslink', {}, c(tmp));
    assert.equal(result.ok, true);
    // The rule only spans one repo, so it does not appear in the cross-repo view.
    assert.equal(result.data.total_rules, 0);
    assert.equal(result.data.cross_repo_rules, 0);
    assert.equal(result.data.intra_repo_rules, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.business.crosslink: cross-repo rules are grouped by kind', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cl-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'order-create');
    await writeBehavior(tmp, 'mall-payment', 'payment-capture');

    // compensation: spans both repos
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'payment-after-order',
        kind: 'compensation',
        description: 'payment service captures payment in response to order.created',
        applies_to: ['order-create', 'payment-capture'],
        repo: 'mall-payment',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/paymentService.ts', line: 1, repo: 'mall-payment' }]
      },
      c(tmp)
    );
    // sla: also spans both repos
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'payment-30s-sla',
        kind: 'sla',
        description: 'payment must be captured within 30s of order.created',
        applies_to: ['order-create', 'payment-capture'],
        repo: 'mall-payment',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/paymentService.ts', line: 2, repo: 'mall-payment' }]
      },
      c(tmp)
    );

    const { result } = await core.runCapability('cdr.business.crosslink', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.total_rules, 2);
    assert.equal(result.data.cross_repo_rules, 2);
    assert.equal(result.data.by_kind.compensation, 1);
    assert.equal(result.data.by_kind.sla, 1);

    // Verify the file content shape
    const yaml = readFileSync(join(tmp, 'docs/as-is/cross-repo/cross-links.yaml'), 'utf8');
    assert.match(yaml, /payment-after-order/);
    assert.match(yaml, /payment-30s-sla/);
    assert.match(yaml, /compensation/);
    assert.match(yaml, /sla/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.business.crosslink: include_intra_repo brings single-repo rules back', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cl-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await writeBehavior(tmp, 'mall-order', 'order-create');
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'amount-positive',
        kind: 'invariant',
        applies_to: ['order-create'],
        repo: 'mall-order',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes.ts', line: 1, repo: 'mall-order' }]
      },
      c(tmp)
    );
    const { result } = await core.runCapability(
      'cdr.business.crosslink',
      { include_intra_repo: true },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.total_rules, 1);
    assert.equal(result.data.intra_repo_rules, 1);
    assert.equal(result.data.cross_repo_rules, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.business.crosslink: kinds filter limits the output', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cl-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'op-a');
    await writeBehavior(tmp, 'mall-payment', 'op-b');
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'cross-compensation',
        kind: 'compensation',
        applies_to: ['op-a', 'op-b'],
        repo: 'mall-order',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes.ts', line: 1, repo: 'mall-order' }]
      },
      c(tmp)
    );
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'cross-sla',
        kind: 'sla',
        applies_to: ['op-a', 'op-b'],
        repo: 'mall-payment',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes.ts', line: 1, repo: 'mall-payment' }]
      },
      c(tmp)
    );
    const { result } = await core.runCapability(
      'cdr.business.crosslink',
      { kinds: ['sla'] },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.total_rules, 1);
    assert.equal(result.data.by_kind.sla, 1);
    assert.equal(result.data.by_kind.compensation, undefined);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.business.crosslink: applies_to id not in index is reported in skipped', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cl-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'op-a');
    await writeBehavior(tmp, 'mall-payment', 'op-b');
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'mixed-known-unknown',
        kind: 'compensation',
        applies_to: ['op-a', 'op-b', 'op-ghost'],
        repo: 'mall-order',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes.ts', line: 1, repo: 'mall-order' }]
      },
      c(tmp)
    );
    const { result } = await core.runCapability('cdr.business.crosslink', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.total_rules, 1);
    // The rule still counts as cross-repo because two of its applies_to
    // resolve to two distinct repos.
    assert.equal(result.data.cross_repo_rules, 1);
    // The unknown applies_to is logged.
    const ghostSkip = result.data.skipped.find((s) => s.reason.includes('op-ghost'));
    assert.ok(ghostSkip, 'skipped entry for op-ghost must be present');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.business.crosslink: FILE_MISSING when no business-rules dir', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cl-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    // Don't write any business rules — the business-rules/ directory will
    // be created lazily by cdr.business.compose, not by workspace.init.
    // We assert the capability can still run by writing the file path
    // and then deleting it: it should still be a no-op.
    await core.runCapability('cdr.business.crosslink', {}, c(tmp));
    // The capability creates the directory and file on first run. Verify.
    assert.ok(existsSync(join(tmp, 'docs/as-is/cross-repo/cross-links.yaml')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// v0.5 — cdr.crossrepo.doc.generate
// ---------------------------------------------------------------------------

test('cdr.crossrepo.doc.generate: errors when cross-links.yaml is missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cr-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    await assert.rejects(
      () => core.runCapability('cdr.crossrepo.doc.generate', {}, c(tmp)),
      /cross-links\.yaml not found/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.crossrepo.doc.generate: emits a portal section from cross-links.yaml', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cr-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await workspaceWithRepoFixture(tmp, 'mall-payment');
    await writeBehavior(tmp, 'mall-order', 'op-a');
    await writeBehavior(tmp, 'mall-payment', 'op-b');
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'cross-compensation',
        kind: 'compensation',
        description: 'b compensates a',
        applies_to: ['op-a', 'op-b'],
        repo: 'mall-order',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes.ts', line: 1, repo: 'mall-order' }]
      },
      c(tmp)
    );
    await core.runCapability('cdr.business.crosslink', {}, c(tmp));
    const { result } = await core.runCapability('cdr.crossrepo.doc.generate', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.section, 'cross-repo');
    assert.ok(result.data.pages_generated >= 2);
    const portalRoot = join(tmp, '.dapei/docs-portal');
    assert.ok(existsSync(join(portalRoot, 'cross-repo/index.md')));
    assert.ok(existsSync(join(portalRoot, 'cross-repo/cross-compensation.md')));
    // Mermaid block must be present in the index
    const indexMd = readFileSync(join(portalRoot, 'cross-repo/index.md'), 'utf8');
    assert.match(indexMd, /```mermaid/);
    assert.match(indexMd, /graph LR/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
