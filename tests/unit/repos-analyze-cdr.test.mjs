import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
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
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-repos-cdr-'));
  const repoPath = join(tmp, 'fixture-repo');
  await core.runCapability('workspace.init', {}, c(tmp));
  initFixtureRepo(repoPath);
  await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, c(tmp));
  return tmp;
}

test('repos.analyze default use_cdr=true writes cdr profile yaml and returns new shape', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    const { result } = await core.runCapability('repos.analyze', { target: 'sample-app' }, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.use_cdr, true);
    assert.equal(result.data.target, 'sample-app');
    assert.equal(result.data.profiles.length, 1);
    const p = result.data.profiles[0];
    assert.equal(p.name, 'sample-app');
    assert.ok(p.profile_path.endsWith('docs/as-is/profiles/sample-app.yaml'));
    assert.ok(p.language && p.language.includes('nodejs'));
    assert.ok(Array.isArray(p.manifest_files));
    assert.ok(p.manifest_files.length >= 1);
    assert.ok(Array.isArray(p.test_commands));
    assert.ok(existsSync(join(tmp, p.profile_path)));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('repos.analyze use_cdr=false keeps legacy shape and writes repo-inventory.md', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    const { result } = await core.runCapability(
      'repos.analyze',
      { target: 'sample-app', use_cdr: false },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.use_cdr, false);
    assert.equal(result.data.deprecated, true);
    assert.equal(result.data.repos.length, 1);
    assert.equal(result.data.repos[0].name, 'sample-app');
    assert.ok(result.data.report.endsWith('docs/as-is/repo-inventory.md'));
    assert.ok(existsSync(join(tmp, result.data.report)));
    const reportContent = readFileSync(join(tmp, result.data.report), 'utf8');
    assert.match(reportContent, /Mode: legacy \(use_cdr=false; deprecated\)/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('repos.analyze use_cdr=false skips cdr.profile (no profile yaml written)', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    await core.runCapability(
      'repos.analyze',
      { target: 'sample-app', use_cdr: false },
      c(tmp)
    );
    assert.ok(!existsSync(join(tmp, 'docs/as-is/profiles/sample-app.yaml')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('repos.analyze --all with default use_cdr walks every registered repo', async () => {
  const tmp = await setupWorkspaceWithRepo();
  const secondRepoPath = join(tmp, 'fixture-repo-2');
  try {
    initFixtureRepo(secondRepoPath);
    await core.runCapability('repos.add', { name: 'sample-app-2', url: secondRepoPath }, c(tmp));
    const { result } = await core.runCapability('repos.analyze', { target: '--all' }, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.use_cdr, true);
    const names = result.data.profiles.map((p) => p.name).sort();
    assert.deepEqual(names, ['sample-app', 'sample-app-2']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('repos.analyze unknown repo target falls back to single-repo path', async () => {
  const tmp = await setupWorkspaceWithRepo();
  try {
    const { result } = await core.runCapability('repos.analyze', { target: 'does-not-exist' }, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.profiles.length, 0);
    assert.match(result.data.next_step, /no repos found/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});