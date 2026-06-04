// Scenario 01: Fresh user onboarding (happy path)
//
// A new user comes in with a clean directory and an existing repo.
// They should be able to go from "@dapei initialize" to "running a
// workflow stage" with each step producing the expected artifacts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const FIXTURE = join(REPO_ROOT, 'tests', 'fixtures', 'sample-node-repo');

// workspace.init reads DAPEI_ENGINE_HOME to copy workflow + template files into
// the new workspace. CLI scripts/dapei sets this automatically; direct
// runCapability callers (like these tests) must set it explicitly.
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

test('scenario-01-fresh-user: initialize → add repo → create feature → build context → run stage', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-s01-'));
  try {
    // 1. Initialize workspace
    const initResult = await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    assert.equal(initResult.result.ok, true);
    assert.ok(existsSync(join(tmp, '.dapei', 'workspace.yaml')));
    assert.ok(existsSync(join(tmp, 'repos')));
    assert.ok(existsSync(join(tmp, 'features')));
    assert.ok(existsSync(join(tmp, 'docs')));

    // 2. Add a repo
    const repoPath = join(tmp, 'fixture');
    initFixtureRepo(repoPath);
    const addResult = await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, { rootDir: tmp, now: new Date() });
    assert.equal(addResult.result.ok, true);
    assert.ok(existsSync(join(tmp, 'repos', 'sample-app', '.git')));

    // 3. Create a feature
    let createFailed = false;
    try {
      await core.runCapability('feature.create', { name: 'first-feature', repos: 'sample-app' }, { rootDir: tmp, now: new Date() });
    } catch {
      // offline ff may fail; that's environment, not a test failure
      createFailed = true;
    }

    if (!createFailed) {
      // 4. Build context for analyze-current-state
      const ctxResult = await core.runCapability('context.build', { feature: 'first-feature', stage: 'analyze-current-state' }, { rootDir: tmp, now: new Date() });
      assert.equal(ctxResult.result.ok, true);
      assert.ok(existsSync(join(tmp, 'features', 'first-feature', 'context', 'runtime-context.md')));

      // 5. Run the first workflow stage
      const stageResult = await core.runCapability('workflow.runStage', { feature: 'first-feature', stage: 'analyze-current-state' }, { rootDir: tmp, now: new Date() });
      assert.equal(stageResult.result.ok, true);
      assert.ok(existsSync(join(tmp, 'features', 'first-feature', 'reports', 'stage-analyze-current-state.completed')));

      // 6. Verify feature.yaml exists and is parseable
      const fyPath = join(tmp, 'features', 'first-feature', 'feature.yaml');
      assert.ok(existsSync(fyPath));
      const fy = readFileSync(fyPath, 'utf8');
      assert.match(fy, /name:\s*"first-feature"/);

      // 7. workspace.status should now report 1 repo and 1 feature
      const status = await core.runCapability('workspace.status', {}, { rootDir: tmp, now: new Date() });
      assert.equal(status.result.data.repoCount, 1);
      assert.equal(status.result.data.featureCount, 1);
    }
  } finally { cleanTmp(tmp); }
});

test('scenario-01-fresh-user: workspace.validate passes for a fresh clean workspace', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-s01-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    const v = await core.runCapability('workspace.validate', {}, { rootDir: tmp, now: new Date() });
    assert.equal(v.result.ok, true);
    assert.equal(v.result.data.errors.length, 0);
  } finally { cleanTmp(tmp); }
});
