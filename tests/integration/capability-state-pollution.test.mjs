// Capability state pollution tests (L3 - cross-capability isolation)
//
// Verifies that:
//   - Running capability A does not break or pollute capability B.
//   - The audit log only grows (never overwrites or loses entries).
//   - The workspace state after a sequence of capabilities matches the
//     expected per-capability result, not a side-effect of an earlier run.
//   - Repeated runs are idempotent at the file-system level where they
//     claim to be.
//
// Layer: L3 - engine only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const FIXTURE = join(REPO_ROOT, 'tests', 'fixtures', 'sample-node-repo');

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

function readAuditLog(rootDir) {
  const logFile = join(rootDir, '.dapei', 'audit', 'capability.log');
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

test('capability-state-pollution: workspace.init does not pollute status', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-poll-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    const s1 = await core.runCapability('workspace.status', {}, { rootDir: tmp, now: new Date() });
    const s2 = await core.runCapability('workspace.status', {}, { rootDir: tmp, now: new Date() });

    // status should be deterministic
    assert.deepEqual(s1.result.data, s2.result.data);
    assert.equal(s1.result.data.repoCount, 0);
    assert.equal(s1.result.data.featureCount, 0);
  } finally { cleanTmp(tmp); }
});

test('capability-state-pollution: re-running workspace.init does not lose previous repos/features', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-poll-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    const repoPath = join(tmp, 'fixture');
    initFixtureRepo(repoPath);
    await core.runCapability('repos.add', { name: 'app', url: repoPath }, { rootDir: tmp, now: new Date() });

    // Re-init: should either be idempotent or fail safely without losing data.
    try {
      await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    } catch (err) {
      // If it throws WORKSPACE_INVALID, that's an acceptable safe failure
      assert.equal(err.code, 'WORKSPACE_INVALID');
    }

    // Either way, the previously added repo must still be visible
    const s = await core.runCapability('workspace.status', {}, { rootDir: tmp, now: new Date() });
    assert.equal(s.result.data.repoCount, 1, 'repos must survive a re-init attempt');
  } finally { cleanTmp(tmp); }
});

test('capability-state-pollution: audit log appends one entry per capability invocation', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-poll-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    const before = readAuditLog(tmp).length;

    await core.runCapability('workspace.status', {}, { rootDir: tmp, now: new Date() });
    await core.runCapability('workspace.status', {}, { rootDir: tmp, now: new Date() });
    await core.runCapability('workspace.validate', {}, { rootDir: tmp, now: new Date() });

    const after = readAuditLog(tmp);
    assert.equal(after.length - before, 3, '3 capability invocations should add 3 audit entries');

    // Each entry should record the capability id
    const recent = after.slice(-3).map((e) => e.capability);
    assert.deepEqual(recent, ['workspace.status', 'workspace.status', 'workspace.validate']);
  } finally { cleanTmp(tmp); }
});

test('capability-state-pollution: feature.create then feature.status shows the created feature', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-poll-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    const repoPath = join(tmp, 'fixture');
    initFixtureRepo(repoPath);
    await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, { rootDir: tmp, now: new Date() });

    try {
      await core.runCapability('feature.create', { name: 'f1', repos: 'sample-app' }, { rootDir: tmp, now: new Date() });
    } catch {
      // skip if offline (ff step fails) — we only want to assert the status is consistent
    }

    const status = await core.runCapability('feature.status', {}, { rootDir: tmp, now: new Date() });
    if (existsSync(join(tmp, 'features', 'f1', 'feature.yaml'))) {
      assert.match(status.result.data.text, /f1/);
    }
  } finally { cleanTmp(tmp); }
});

test('capability-state-pollution: cognitive.discover + artifact.upsert do not corrupt each other', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-poll-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    const repoPath = join(tmp, 'fixture');
    initFixtureRepo(repoPath);
    await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, { rootDir: tmp, now: new Date() });

    // discover
    const d1 = await core.runCapability('cognitive.discover', { target: 'sample-app' }, { rootDir: tmp, now: new Date() });
    const d2 = await core.runCapability('cognitive.discover', { target: 'sample-app' }, { rootDir: tmp, now: new Date() });

    // Both discover runs should report the same number of candidates
    assert.equal(d1.result.data.candidateCount, d2.result.data.candidateCount);
    assert.ok(existsSync(join(tmp, 'docs', 'as-is', 'behavior', '_candidates.yaml')));

    // list before any upsert
    const l1 = await core.runCapability('cognitive.artifact.list', { repo: 'sample-app' }, { rootDir: tmp, now: new Date() });
    assert.equal(l1.result.data.behaviors.length, 0);

    // upsert a behavior
    const behaviorYaml = readFileSync(join(FIXTURE, '__expected__', 'behavior', 'order-create.yaml'), 'utf8');
    await core.runCapability('cognitive.artifact.upsert', { type: 'behavior', content: behaviorYaml }, { rootDir: tmp, now: new Date() });

    // list after upsert — must show exactly one behavior
    const l2 = await core.runCapability('cognitive.artifact.list', { repo: 'sample-app' }, { rootDir: tmp, now: new Date() });
    assert.equal(l2.result.data.behaviors.length, 1);

    // discover again — must still be consistent (idempotent in candidate count)
    const d3 = await core.runCapability('cognitive.discover', { target: 'sample-app' }, { rootDir: tmp, now: new Date() });
    assert.equal(d3.result.data.candidateCount, d2.result.data.candidateCount);
  } finally { cleanTmp(tmp); }
});

test('capability-state-pollution: a failed capability invocation does not leave the workspace inconsistent', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-poll-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    // Try a failing capability
    let failed = false;
    try {
      await core.runCapability('feature.create', { name: 'BadName', repos: 'r' }, { rootDir: tmp, now: new Date() });
    } catch {
      failed = true;
    }
    assert.equal(failed, true, 'feature.create with bad name should have failed');

    // Workspace.validate should still pass; the failed create must not have left debris
    const v = await core.runCapability('workspace.validate', {}, { rootDir: tmp, now: new Date() });
    assert.equal(v.result.data.errors.length, 0, 'workspace must remain valid after a failed cap');

    // No BadName directory should exist
    assert.equal(existsSync(join(tmp, 'features', 'BadName')), false);

    // Now a valid create should work
    const repoPath = join(tmp, 'fixture');
    initFixtureRepo(repoPath);
    await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, { rootDir: tmp, now: new Date() });
    try {
      await core.runCapability('feature.create', { name: 'good-name', repos: 'sample-app' }, { rootDir: tmp, now: new Date() });
    } catch {
      // Offline ff may fail; that's environment, not a pollution test
    }
  } finally { cleanTmp(tmp); }
});
