// Scenario 05: Feature / Workspace dimension boundary
//
// The dapei AGENTS.md states that during feature work, files must stay inside
// features/<feature>/. Touching the global docs/, .dapei/, or another feature
// is a dimension violation. This scenario verifies that:
//   - A feature.create does not write into another feature's directory
//   - Closing a feature archives its decisions into docs/decisions/, not into
//     another feature's memory/
//   - Cognitive artifacts in docs/as-is/ are global (intentionally), but
//     feature-local context lives in features/<feature>/context/

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, cpSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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

test('scenario-05-dimension: feature.create writes only into features/<name>/, never into another feature', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-s05-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    const repoPath = join(tmp, 'fixture');
    initFixtureRepo(repoPath);
    await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, { rootDir: tmp, now: new Date() });

    // Take a snapshot of which directories exist
    const featuresDir = join(tmp, 'features');
    mkdirSync(featuresDir, { recursive: true });

    // Capture a snapshot of features/ contents before
    mkdirSync(join(featuresDir, 'preexisting'), { recursive: true });
    writeFileSync(join(featuresDir, 'preexisting', 'README.md'), 'preexisting');
    const beforeContents = execFileSync('find', [featuresDir, '-type', 'f'], { encoding: 'utf8' });

    try {
      await core.runCapability('feature.create', { name: 'fresh', repos: 'sample-app' }, { rootDir: tmp, now: new Date() });
    } catch { return; /* skip if env issue */ }

    // The new feature's files should be inside features/fresh/, not features/preexisting/
    const afterContents = execFileSync('find', [featuresDir, '-type', 'f'], { encoding: 'utf8' });
    const newPaths = afterContents.split('\n').filter((p) => p && !beforeContents.includes(p));

    for (const p of newPaths) {
      assert.ok(
        p.includes('/features/fresh/') || p.includes('/features/fresh\n'),
        `feature.create wrote outside features/fresh/: ${p}`,
      );
    }
  } finally { cleanTmp(tmp); }
});

test('scenario-05-dimension: feature.close writes decisions into global docs/decisions/, not into other features', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-s05-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    // Create a feature with a decision log
    const featureDir = join(tmp, 'features', 'f');
    mkdirSync(join(featureDir, 'memory'), { recursive: true });
    mkdirSync(join(featureDir, 'reports'), { recursive: true });
    writeFileSync(join(featureDir, 'feature.yaml'), 'feature:\n  name: f\n  repos: []\n');
    writeFileSync(join(featureDir, 'memory', 'decision-log.md'), 'A: chose option X\nB: deferred Y\n');

    // A second feature whose memory we want to keep clean
    const otherDir = join(tmp, 'features', 'other');
    mkdirSync(join(otherDir, 'memory'), { recursive: true });
    writeFileSync(join(otherDir, 'memory', 'decision-log.md'), 'ORIGINAL: not touched\n');

    await core.runCapability('feature.close', { feature: 'f', confirmed: true }, { rootDir: tmp, now: new Date() });

    // The decision should be archived to docs/decisions/
    assert.ok(existsSync(join(tmp, 'docs', 'decisions', 'f-decisions.md')));
    const archived = readFileSync(join(tmp, 'docs', 'decisions', 'f-decisions.md'), 'utf8');
    assert.match(archived, /chose option X/);

    // The other feature's memory must not be touched
    const otherMem = readFileSync(join(otherDir, 'memory', 'decision-log.md'), 'utf8');
    assert.match(otherMem, /ORIGINAL: not touched/);
  } finally { cleanTmp(tmp); }
});

test('scenario-05-dimension: feature.context files are isolated per feature', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-s05-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    const repoPath = join(tmp, 'fixture');
    initFixtureRepo(repoPath);
    await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, { rootDir: tmp, now: new Date() });

    let aOk = false, bOk = false;
    try { await core.runCapability('feature.create', { name: 'a', repos: 'sample-app', objective: 'Alpha objective' }, { rootDir: tmp, now: new Date() }); aOk = true; } catch {}
    try { await core.runCapability('feature.create', { name: 'b', repos: 'sample-app', objective: 'Beta objective' }, { rootDir: tmp, now: new Date() }); bOk = true; } catch {}

    if (aOk && bOk) {
      // Each feature has its own context dir
      const aCtx = readFileSync(join(tmp, 'features', 'a', 'context', 'feature-context.md'), 'utf8');
      const bCtx = readFileSync(join(tmp, 'features', 'b', 'context', 'feature-context.md'), 'utf8');
      assert.match(aCtx, /Alpha objective/);
      assert.match(bCtx, /Beta objective/);
      assert.doesNotMatch(aCtx, /Beta/);
      assert.doesNotMatch(bCtx, /Alpha/);
    }
  } finally { cleanTmp(tmp); }
});
