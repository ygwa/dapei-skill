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

async function setupWorkspaceWithRepo() {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-pipeline-status-'));
  const repoPath = join(tmp, 'fixture-repo');
  await core.runCapability('workspace.init', {}, c(tmp));
  initFixtureRepo(repoPath);
  await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, c(tmp));
  return tmp;
}

test('cdr.pipeline.status: empty workspace reports blocked phases + next_action pointing at cdr.profile', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    const { result } = await core.runCapability(
      'cdr.pipeline.status',
      { repo: 'sample-app' },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.overall_status, 'empty');
    assert.equal(result.data.phases[0].id, 'profile');
    assert.equal(result.data.phases[0].status, 'blocked');
    assert.equal(result.data.phases[0].next_action?.capability, 'cdr.profile');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.pipeline.status: after cdr.profile, entries phase has next_action cdr.entries.candidate', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    await core.runCapability('cdr.profile', { repo: 'sample-app' }, c(tmp));
    const { result } = await core.runCapability(
      'cdr.pipeline.status',
      { repo: 'sample-app' },
      c(tmp)
    );
    const profilePhase = result.data.phases.find((p) => p.id === 'profile');
    const entriesPhase = result.data.phases.find((p) => p.id === 'entries');
    assert.equal(profilePhase.status, 'done');
    assert.equal(entriesPhase.status, 'blocked');
    assert.equal(entriesPhase.next_action?.capability, 'cdr.entries.candidate');
    assert.ok(entriesPhase.next_action?.input_template.repo);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.pipeline.status: entries with confirmed entry unblocks behavior', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    await core.runCapability('cdr.profile', { repo: 'sample-app' }, c(tmp));
    // write a confirmed entries file
    const entriesDir = join(tmp, 'docs', 'as-is', 'entries');
    mkdirSync(entriesDir, { recursive: true });
    writeFileSync(
      join(entriesDir, 'sample-app.yaml'),
      'entries:\n  - id: order-create\n    status: confirmed\n    sources:\n      - file: src/routes/orders.ts\n        line: 6\n'
    );
    const { result } = await core.runCapability(
      'cdr.pipeline.status',
      { repo: 'sample-app' },
      c(tmp)
    );
    const entriesPhase = result.data.phases.find((p) => p.id === 'entries');
    const behaviorPhase = result.data.phases.find((p) => p.id === 'behavior');
    assert.equal(entriesPhase.status, 'done');
    assert.equal(behaviorPhase.status, 'blocked');
    assert.equal(behaviorPhase.next_action?.capability, 'cdr.behavior.upsert');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.pipeline.status: behavior present unblocks state', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    await core.runCapability('cdr.profile', { repo: 'sample-app' }, c(tmp));
    await core.runCapability('cdr.behavior.upsert', {
      id: 'order-create', repo: 'sample-app',
      entry: { type: 'api', method: 'POST', path: '/orders' },
      steps: [{ name: 'V', action: 'check' }],
      confidence: { level: 'high', kind: 'fact' },
      sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
    }, c(tmp));
    const { result } = await core.runCapability(
      'cdr.pipeline.status',
      { repo: 'sample-app' },
      c(tmp)
    );
    const statePhase = result.data.phases.find((p) => p.id === 'state');
    assert.equal(statePhase.status, 'blocked');
    assert.equal(statePhase.next_action?.capability, 'cdr.state.derive');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.pipeline.status: state machine derived unblocks domain', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    await core.runCapability('cdr.profile', { repo: 'sample-app' }, c(tmp));
    await core.runCapability('cdr.behavior.upsert', {
      id: 'order-create', repo: 'sample-app',
      entry: { type: 'api', method: 'POST', path: '/orders' },
      steps: [{ name: 'V', action: 'check' }],
      confidence: { level: 'high', kind: 'fact' },
      sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
    }, c(tmp));
    await core.runCapability('cdr.state.derive', { entity: 'Order', behaviors: ['order-create'], repo: 'sample-app' }, c(tmp));
    const { result } = await core.runCapability(
      'cdr.pipeline.status',
      { repo: 'sample-app' },
      c(tmp)
    );
    const statePhase = result.data.phases.find((p) => p.id === 'state');
    const domainPhase = result.data.phases.find((p) => p.id === 'domain');
    assert.equal(statePhase.status, 'done');
    // domain is unblocked (no longer depends on behaviors-only) but
    // still has next_action until cdr.domain.compose is called.
    assert.equal(domainPhase.status, 'blocked');
    assert.equal(domainPhase.next_action?.capability, 'cdr.domain.compose');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.pipeline.status: domain composed + capability map + doc.gen yields complete', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    await core.runCapability('cdr.profile', { repo: 'sample-app' }, c(tmp));
    // Drive the entry pipeline properly: candidate → propose → confirm
    await core.runCapability('cdr.entries.candidate', { repo: 'sample-app' }, c(tmp));
    await core.runCapability('cdr.entries.propose', {
      repo: 'sample-app',
      id: 'order-create',
      type: 'api',
      method: 'POST',
      path: '/orders',
      file: 'src/routes/orders.ts',
      line: 6,
      sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
    }, c(tmp));
    await core.runCapability('cdr.entries.confirm', {
      repo: 'sample-app',
      entry_id: 'order-create',
      summary: 'POST /orders is the primary order creation entry point',
      priority: 'high',
      sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
    }, c(tmp));
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
    await core.runCapability('cdr.doc.generate', {}, c(tmp));
    const { result } = await core.runCapability(
      'cdr.pipeline.status',
      { repo: 'sample-app' },
      c(tmp)
    );
    const statuses = result.data.phases.map((p) => `${p.id}=${p.status}`).join(',');
    assert.equal(result.data.overall_status, 'complete', `phases: ${statuses}`);
    for (const p of result.data.phases) {
      // rule is "skipped" by default (no business rules authored) and
      // that's a legitimate "complete" state — the user opted not to
      // author rules. Every other phase must be done.
      if (p.id === 'rule') continue;
      assert.equal(p.status, 'done', `phase ${p.id} expected done, was ${p.status}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.pipeline.status: up_to_phase=entries truncates later phases', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    await core.runCapability('cdr.profile', { repo: 'sample-app' }, c(tmp));
    const { result } = await core.runCapability(
      'cdr.pipeline.status',
      { repo: 'sample-app', up_to_phase: 'entries' },
      c(tmp)
    );
    const ids = result.data.phases.map((p) => p.id);
    assert.deepEqual(ids, ['profile', 'entries']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.pipeline.status: rule phase is skipped by default (no business rules)', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    const { result } = await core.runCapability(
      'cdr.pipeline.status',
      { repo: 'sample-app' },
      c(tmp)
    );
    const rulePhase = result.data.phases.find((p) => p.id === 'rule');
    assert.equal(rulePhase.status, 'skipped');
    assert.ok(rulePhase.next_action);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.pipeline.status: missing repo raises REPO_MISSING', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-pipeline-status-err-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    await assert.rejects(
      core.runCapability('cdr.pipeline.status', { repo: 'does-not-exist' }, c(tmp)),
      (err) => err.code === 'REPO_MISSING'
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.pipeline.status is read-only: no docs/as-is/ files created or modified', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    const { readdirSync, statSync, readFileSync } = await import('node:fs');
    function snapshotTree(dir) {
      const out = new Map();
      if (!existsSync(dir)) return out;
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, f.name);
        if (f.isDirectory()) {
          for (const [k, v] of snapshotTree(p)) out.set(k, v);
        } else if (f.isFile()) {
          out.set(p, statSync(p).mtimeMs);
        }
      }
      return out;
    }
    const docsAsIs = join(tmp, 'docs', 'as-is');
    const before = snapshotTree(docsAsIs);
    await core.runCapability('cdr.profile', { repo: 'sample-app' }, c(tmp));
    await core.runCapability('cdr.pipeline.status', { repo: 'sample-app' }, c(tmp));
    const after = snapshotTree(docsAsIs);
    // Allow only files that existed before the call OR were added by
    // cdr.profile (the documented side-effect); the status call itself
    // must not add or modify any file.
    const newFiles = [...after.keys()].filter((p) => !before.has(p));
    for (const f of newFiles) {
      // cdr.profile is allowed to add a profile yaml; that's the
      // engine's own write side-effect, not cdr.pipeline.status's.
      assert.ok(f.endsWith('profile.yaml') || f.endsWith('sample-app.yaml'),
        `cdr.pipeline.status must not create files; found new: ${f}`);
    }
    // No existing file should have been modified by the status call.
    for (const [p, mtime] of before) {
      if (after.has(p)) {
        assert.equal(after.get(p), mtime, `${p} was modified by status call`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});