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

async function seedFixtureRepo(tmp, repoName) {
  const srcDir = join(tmp, 'fixture-sources', repoName);
  mkdirSync(srcDir, { recursive: true });
  cpSync(join(fixtureRoot, repoName), srcDir, { recursive: true });
  gitInit(srcDir);
  return srcDir;
}

async function workspaceWithRepoFixture(tmp, repoName) {
  await core.runCapability('workspace.init', {}, c(tmp));
  const srcDir = await seedFixtureRepo(tmp, repoName);
  await core.runCapability('repos.add', { name: repoName, url: srcDir }, c(tmp));
  await core.runCapability('cdr.profile', { repo: repoName }, c(tmp));
}

// ---------------------------------------------------------------------------
// v0.6 — calls[] schema evolution
// ---------------------------------------------------------------------------

test('cdr.behavior.upsert: accepts legacy string[] calls (backward compat)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-calls-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    const { result } = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        calls: ['PaymentClient', 'InventoryService'],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    assert.equal(result.ok, true);
    // Legacy string calls do NOT contribute target_repos (the AI did not
    // declare a target_repo, so the engine has nothing to record).
    const { result: idxRes } = await core.runCapability('cdr.index.list', {}, c(tmp));
    const behavior = idxRes.data.behaviors.find((b) => b.id === 'order-create');
    assert.ok(behavior, 'behavior must be in the index');
    assert.equal(behavior.target_repos, undefined,
      'string-only calls do not contribute target_repos');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: accepts structured object calls with target_repo', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-calls-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    const { result } = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        calls: [
          {
            target: 'PaymentClient',
            protocol: 'http',
            target_repo: 'mall-payment',
            evidence: { file: 'src/routes.ts', line: 7, repo: 'mall-order' }
          }
        ],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    assert.equal(result.ok, true);
    // target_repos is recorded on the index entry
    const { result: idxRes } = await core.runCapability('cdr.index.list', {}, c(tmp));
    const behavior = idxRes.data.behaviors.find((b) => b.id === 'order-create');
    assert.deepEqual(behavior.target_repos, ['mall-payment']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: accepts a mix of strings and structured objects', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-calls-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    const { result } = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        calls: [
          'InventoryService',
          {
            target: 'PaymentClient',
            protocol: 'http',
            target_repo: 'mall-payment',
            evidence: { file: 'src/routes.ts', line: 7, repo: 'mall-order' }
          }
        ],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    assert.equal(result.ok, true);
    // Only the structured call contributes to target_repos.
    const { result: idxRes } = await core.runCapability('cdr.index.list', {}, c(tmp));
    const behavior = idxRes.data.behaviors.find((b) => b.id === 'order-create');
    assert.deepEqual(behavior.target_repos, ['mall-payment']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: rejects structured call without target', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-calls-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await assert.rejects(
      () => core.runCapability(
        'cdr.behavior.upsert',
        {
          id: 'order-create',
          repo: 'mall-order',
          entry: { type: 'api', method: 'POST', path: '/orders' },
          calls: [{ protocol: 'http' }],
          confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
          sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
        },
        c(tmp)
      ),
      /calls\[0\]\.target is required/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: rejects structured call with bad protocol', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-calls-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    await assert.rejects(
      () => core.runCapability(
        'cdr.behavior.upsert',
        {
          id: 'order-create',
          repo: 'mall-order',
          entry: { type: 'api', method: 'POST', path: '/orders' },
          calls: [{ target: 'PaymentClient', protocol: 'websockets' }],
          confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
          sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
        },
        c(tmp)
      ),
      /protocol must be one of/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: structured call without evidence is allowed (optional in v0.6)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-calls-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    const { result } = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        calls: [{ target: 'PaymentClient', protocol: 'http', target_repo: 'mall-payment' }],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    assert.equal(result.ok, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: multiple target_repos are deduplicated and sorted', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-calls-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    const { result } = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        calls: [
          { target: 'PaymentClient', protocol: 'http', target_repo: 'mall-payment' },
          { target: 'PaymentClient', protocol: 'http', target_repo: 'mall-payment' },
          { target: 'InventoryClient', protocol: 'grpc', target_repo: 'mall-inventory' }
        ],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    assert.equal(result.ok, true);
    const { result: idxRes } = await core.runCapability('cdr.index.list', {}, c(tmp));
    const behavior = idxRes.data.behaviors.find((b) => b.id === 'order-create');
    assert.deepEqual(behavior.target_repos, ['mall-inventory', 'mall-payment']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: v0.5 behavior of calls.map(String) is fixed (objects survive)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-calls-'));
  try {
    await workspaceWithRepoFixture(tmp, 'mall-order');
    const { result } = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        calls: [{ target: 'PaymentClient', protocol: 'http' }],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    assert.equal(result.ok, true);
    // Re-read the file from disk and confirm the structured form is preserved.
    const onDisk = readFileSync(join(tmp, 'docs/as-is/behavior/mall-order/order-create.yaml'), 'utf8');
    assert.match(onDisk, /target: PaymentClient/);
    assert.match(onDisk, /protocol: http/);
    // The literal "[object Object]" (the v0.5 silent bug) must not appear.
    assert.doesNotMatch(onDisk, /\[object Object\]/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
