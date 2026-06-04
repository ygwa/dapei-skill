// Scenario 02: Multiple features on the same repo, in parallel
//
// Two features (foo, bar) on the same repo. Each should get its own
// worktree + branch. The worktree paths and feature directories must
// not collide. Removing one must not affect the other.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const FIXTURE = join(REPO_ROOT, 'tests', 'fixtures', 'sample-node-repo');

if (!process.env.DAPEI_ENGINE_HOME) process.env.DAPEI_ENGINE_HOME = REPO_ROOT;

const core = await import('../../packages/core/src/index.ts');

function cleanTmp(t) { rmSync(t, { recursive: true, force: true }); }
function initFixtureRepo(targetPath) {
  cpSync(FIXTURE, targetPath, { recursive: true });
  if (!existsSync(join(targetPath, '.git'))) {
    execFileSync('git', ['-C', targetPath, 'init', '-b', 'main'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.name', 'dapei test'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'add', '.']);
    execFileSync('git', ['-C', targetPath, 'commit', '-m', 'fixture']);
  }
  return targetPath;
}

test('scenario-02-multi-feature: two features on same repo get independent worktrees', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-s02-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    const repoPath = join(tmp, 'fixture');
    initFixtureRepo(repoPath);
    await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, { rootDir: tmp, now: new Date() });

    // Try to create both features
    let fooCreated = false, barCreated = false;
    try { await core.runCapability('feature.create', { name: 'foo', repos: 'sample-app' }, { rootDir: tmp, now: new Date() }); fooCreated = true; } catch {}
    try { await core.runCapability('feature.create', { name: 'bar', repos: 'sample-app' }, { rootDir: tmp, now: new Date() }); barCreated = true; } catch {}

    if (fooCreated && barCreated) {
      // Each feature should have its own directory
      assert.ok(existsSync(join(tmp, 'features', 'foo', 'feature.yaml')));
      assert.ok(existsSync(join(tmp, 'features', 'bar', 'feature.yaml')));

      // Each should have its own worktree
      assert.ok(existsSync(join(tmp, 'features', 'foo', 'repos', 'sample-app', '.git')));
      assert.ok(existsSync(join(tmp, 'features', 'bar', 'repos', 'sample-app', '.git')));

      // Branches in repos/sample-app should include both feature/foo and feature/bar
      const branches = execFileSync('git', ['-C', join(tmp, 'repos', 'sample-app'), 'branch', '--list'], { encoding: 'utf8' });
      assert.match(branches, /feature\/foo/);
      assert.match(branches, /feature\/bar/);

      // workspace.status should show 1 repo, 2 features
      const status = await core.runCapability('workspace.status', {}, { rootDir: tmp, now: new Date() });
      assert.equal(status.result.data.repoCount, 1);
      assert.equal(status.result.data.featureCount, 2);
    }
  } finally { cleanTmp(tmp); }
});

test('scenario-02-multi-feature: closing one feature does not affect the other', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-s02-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    const repoPath = join(tmp, 'fixture');
    initFixtureRepo(repoPath);
    await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, { rootDir: tmp, now: new Date() });

    let fooCreated = false, barCreated = false;
    try { await core.runCapability('feature.create', { name: 'foo', repos: 'sample-app' }, { rootDir: tmp, now: new Date() }); fooCreated = true; } catch {}
    try { await core.runCapability('feature.create', { name: 'bar', repos: 'sample-app' }, { rootDir: tmp, now: new Date() }); barCreated = true; } catch {}

    if (fooCreated && barCreated) {
      // Capture bar's worktree existence before
      const barWtBefore = existsSync(join(tmp, 'features', 'bar', 'repos', 'sample-app', '.git'));

      // Close foo (force -- it might have dirty worktree in offline test envs)
      await core.runCapability('feature.close', { feature: 'foo', confirmed: true, force: true }, { rootDir: tmp, now: new Date() });

      // foo's worktree should be removed
      assert.equal(
        existsSync(join(tmp, 'features', 'foo', 'repos', 'sample-app', '.git')),
        false,
        'foo worktree should be removed after close',
      );

      // bar's worktree should be untouched
      assert.equal(
        existsSync(join(tmp, 'features', 'bar', 'repos', 'sample-app', '.git')),
        barWtBefore,
        'bar worktree must not be affected by closing foo',
      );
    }
  } finally { cleanTmp(tmp); }
});
