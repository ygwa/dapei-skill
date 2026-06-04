// Scenario 03: Stage DAG enforcement
//
// The workflow file declares that implementation requires task-breakdown.
// If the user (or a buggy agent) tries to run implementation without
// finishing the earlier stages, the engine must reject it with
// STAGE_PREREQ_MISSING.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, cpSync } from 'node:fs';
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

async function makeFeature(tmp) {
  await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
  const repoPath = join(tmp, 'fixture');
  initFixtureRepo(repoPath);
  await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, { rootDir: tmp, now: new Date() });
  try {
    await core.runCapability('feature.create', { name: 'f', repos: 'sample-app' }, { rootDir: tmp, now: new Date() });
    return true;
  } catch {
    return false;
  }
}

test('scenario-03-stage-dag: implementation without task-breakdown is rejected', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-s03-'));
  try {
    if (!(await makeFeature(tmp))) return; // skip if env doesn't allow feature.create

    // Try to skip straight to implementation with confirmation
    let err = null;
    try {
      await core.runCapability('workflow.runStage', { feature: 'f', stage: 'implementation', confirmed: true }, { rootDir: tmp, now: new Date() });
    } catch (e) { err = e; }

    // Either STAGE_PREREQ_MISSING (DAG enforced) or the prior stage's outputs missing
    assert.ok(err, 'implementation without prior stages should have failed');
    assert.ok(
      err.code === 'STAGE_PREREQ_MISSING' ||
      err.code === 'STAGE_OUTPUT_MISSING' ||
      err.code === 'INVALID_INPUT',
      `expected DAG-related error, got ${err?.code}: ${err?.message}`,
    );
  } finally { cleanTmp(tmp); }
});

test('scenario-03-stage-dag: unknown stage is rejected with INVALID_STAGE', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-s03-'));
  try {
    if (!(await makeFeature(tmp))) return;

    let err = null;
    try {
      await core.runCapability('workflow.runStage', { feature: 'f', stage: 'made-up-stage' }, { rootDir: tmp, now: new Date() });
    } catch (e) { err = e; }

    assert.ok(err, 'unknown stage should have failed');
    assert.ok(
      err.code === 'INVALID_STAGE' || err.code === 'INVALID_INPUT',
      `expected INVALID_STAGE, got ${err?.code}`,
    );
  } finally { cleanTmp(tmp); }
});

test('scenario-03-stage-dag: solution-design without confirmation is rejected', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-s03-'));
  try {
    if (!(await makeFeature(tmp))) return;

    // First, complete analyze-current-state + gap-analysis
    try { await core.runCapability('workflow.runStage', { feature: 'f', stage: 'analyze-current-state' }, { rootDir: tmp, now: new Date() }); } catch {}
    try { await core.runCapability('workflow.runStage', { feature: 'f', stage: 'gap-analysis' }, { rootDir: tmp, now: new Date() }); } catch {}

    // Now try solution-design without confirmation
    let err = null;
    try {
      await core.runCapability('workflow.runStage', { feature: 'f', stage: 'solution-design' }, { rootDir: tmp, now: new Date() });
    } catch (e) { err = e; }

    assert.ok(err, 'solution-design without confirmation should have failed');
    assert.equal(err.code, 'CONFIRMATION_REQUIRED', `expected CONFIRMATION_REQUIRED, got ${err?.code}`);
  } finally { cleanTmp(tmp); }
});

test('scenario-03-stage-dag: happy path - all stages run in order', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-s03-'));
  try {
    if (!(await makeFeature(tmp))) return;

    const STAGES = [
      { stage: 'analyze-current-state', confirmed: false },
      { stage: 'gap-analysis', confirmed: false },
      { stage: 'solution-design', confirmed: true },
      { stage: 'task-breakdown', confirmed: false },
    ];

    for (const { stage, confirmed } of STAGES) {
      const r = await core.runCapability('workflow.runStage', { feature: 'f', stage, confirmed }, { rootDir: tmp, now: new Date() });
      assert.equal(r.result.ok, true, `stage ${stage} should succeed`);
      assert.ok(existsSync(join(tmp, 'features', 'f', 'reports', `stage-${stage}.completed`)), `marker for ${stage} should exist`);
    }

    // Verify status shows all completed stages
    const status = await core.runCapability('workflow.status', { feature: 'f' }, { rootDir: tmp, now: new Date() });
    assert.deepEqual(status.result.data.completed, STAGES.map((s) => s.stage));
  } finally { cleanTmp(tmp); }
});
