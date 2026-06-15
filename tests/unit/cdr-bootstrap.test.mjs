import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');
const router = await import('../../packages/router/src/index.ts');
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
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-bootstrap-'));
  const repoPath = join(tmp, 'fixture-repo');
  await core.runCapability('workspace.init', {}, c(tmp));
  initFixtureRepo(repoPath);
  await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, c(tmp));
  return tmp;
}

test('cdr.bootstrap: default mode runs profile + entry discovery', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    const { result } = await core.runCapability('cdr.bootstrap', { repo: 'sample-app' }, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.repo, 'sample-app');
    assert.ok(result.data.profile_path.endsWith('docs/as-is/profiles/sample-app.yaml'));
    assert.ok(existsSync(join(tmp, result.data.profile_path)));
    assert.ok(result.data.candidate_files_count >= 1);
    assert.match(result.data.next_step, /cdr\.entries\.propose/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.bootstrap: profile=false skips profile write', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    const { result } = await core.runCapability(
      'cdr.bootstrap',
      { repo: 'sample-app', profile: false },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.profile_path, null);
    assert.ok(!existsSync(join(tmp, 'docs/as-is/profiles/sample-app.yaml')));
    assert.ok(result.data.candidate_files_count >= 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.bootstrap: entry_discovery=false skips file listing', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    const { result } = await core.runCapability(
      'cdr.bootstrap',
      { repo: 'sample-app', entry_discovery: false },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.ok(result.data.profile_path.endsWith('docs/as-is/profiles/sample-app.yaml'));
    assert.equal(result.data.candidate_files_count, 0);
    assert.match(result.data.next_step, /skip to behavior mining/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.bootstrap: missing workspace raises WORKSPACE_MISSING', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-bootstrap-err-'));
  try {
    await assert.rejects(
      core.runCapability('cdr.bootstrap', { repo: 'sample-app' }, c(tmp)),
      (err) => err.code === 'WORKSPACE_MISSING'
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.bootstrap: missing repo raises REPO_MISSING', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-bootstrap-err-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    await assert.rejects(
      core.runCapability('cdr.bootstrap', { repo: 'does-not-exist' }, c(tmp)),
      (err) => err.code === 'REPO_MISSING'
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.bootstrap is idempotent: re-run yields same profile_path', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    const r1 = await core.runCapability('cdr.bootstrap', { repo: 'sample-app' }, c(tmp));
    const r2 = await core.runCapability('cdr.bootstrap', { repo: 'sample-app' }, c(tmp));
    assert.equal(r1.result.data.profile_path, r2.result.data.profile_path);
    assert.equal(r1.result.data.candidate_files_count, r2.result.data.candidate_files_count);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('router: bootstrap sample-app routes to cdr.bootstrap with repo extracted', () => {
  const r = router.routeIntent('bootstrap sample-app');
  assert.equal(r.capability, 'cdr.bootstrap');
  assert.equal(r.input.repo, 'sample-app');
});

test('router: 引导 mall-payment (中文) routes to cdr.bootstrap', () => {
  const r = router.routeIntent('引导 mall-payment');
  assert.equal(r.capability, 'cdr.bootstrap');
  assert.equal(r.input.repo, 'mall-payment');
});

test('repos.add auto_profile=true writes profile yaml and returns profile_path', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-repos-auto-profile-'));
  const repoPath = join(tmp, 'fixture-repo');
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    initFixtureRepo(repoPath);
    const { result } = await core.runCapability(
      'repos.add',
      { name: 'sample-app', url: repoPath, auto_profile: true },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.name, 'sample-app');
    assert.ok(result.data.profile_path.endsWith('docs/as-is/profiles/sample-app.yaml'));
    assert.ok(existsSync(join(tmp, result.data.profile_path)));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('repos.add auto_profile=false (default) leaves no profile yaml', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-repos-no-auto-profile-'));
  const repoPath = join(tmp, 'fixture-repo');
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    initFixtureRepo(repoPath);
    const { result } = await core.runCapability(
      'repos.add',
      { name: 'sample-app', url: repoPath },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.profile_path, undefined);
    assert.ok(!existsSync(join(tmp, 'docs/as-is/profiles/sample-app.yaml')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});