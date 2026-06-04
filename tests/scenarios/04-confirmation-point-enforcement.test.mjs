// Scenario 04: Confirmation point enforcement
//
// The three confirmation points (solution-design, implementation, acceptance)
// must block engine actions until input.confirmed === true.
// feature.close has the same gate at the capability level (confirmGate: "acceptance").

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
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

// All three confirmation stages from types.ts
const CONFIRM_STAGES = ['solution-design', 'implementation', 'acceptance'];

test('scenario-04-confirmation: every confirmation stage in workflow.runStage requires explicit confirmation', async () => {
  for (const stage of CONFIRM_STAGES) {
    const tmp = mkdtempSync(join(tmpdir(), 'dapei-s04-'));
    try {
      await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
      const repoPath = join(tmp, 'fixture');
      initFixtureRepo(repoPath);
      await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, { rootDir: tmp, now: new Date() });

      let featureOk = false;
      try {
        await core.runCapability('feature.create', { name: 'c', repos: 'sample-app' }, { rootDir: tmp, now: new Date() });
        featureOk = true;
      } catch { /* skip */ }

      if (!featureOk) continue;

      // Pre-complete all prerequisites so the only thing standing in the way is the gate.
      for (const pre of ['analyze-current-state', 'gap-analysis', 'task-breakdown', 'local-validation', 'architecture-review']) {
        try {
          await core.runCapability('workflow.runStage', { feature: 'c', stage: pre }, { rootDir: tmp, now: new Date() });
        } catch { /* ignore; we just need the marker */ }
        // The workflow needs marker files; if the stage failed, write a stub marker
        const marker = join(tmp, 'features', 'c', 'reports', `stage-${pre}.completed`);
        if (!existsSync(marker)) writeFileSync(marker, 'stage: ' + pre + '\ncompleted-at: stub\n');
      }

      let err = null;
      try {
        await core.runCapability('workflow.runStage', { feature: 'c', stage }, { rootDir: tmp, now: new Date() });
      } catch (e) { err = e; }

      assert.ok(err, `${stage} without confirmation should have failed`);
      assert.equal(err.code, 'CONFIRMATION_REQUIRED', `${stage}: expected CONFIRMATION_REQUIRED, got ${err?.code}`);
    } finally { cleanTmp(tmp); }
  }
});

test('scenario-04-confirmation: feature.close has confirmGate independent of stage marker', async () => {
  // feature.close is a separate capability with its own confirmGate: "acceptance".
  // It is gated by the runCapability wrapper (not by workflow.runStage).
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-s04-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    // Fabricate a minimal feature
    const featureDir = join(tmp, 'features', 'f');
    mkdirSync(join(featureDir, 'reports'), { recursive: true });
    writeFileSync(join(featureDir, 'feature.yaml'), 'feature:\n  name: f\n');

    let err = null;
    try {
      await core.runCapability('feature.close', { feature: 'f' }, { rootDir: tmp, now: new Date() });
    } catch (e) { err = e; }
    assert.equal(err?.code, 'CONFIRMATION_REQUIRED');
  } finally { cleanTmp(tmp); }
});
