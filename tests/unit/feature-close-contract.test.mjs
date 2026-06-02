import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';

const core = await import('../../packages/core/src/index.ts');

function cleanTmp(tmp) {
  rmSync(tmp, { recursive: true, force: true });
}

async function setupFeatureForClose(tmp) {
  await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

  const repoDir = join(tmp, 'repos', 'sample-app');
  const remoteDir = join(tmp, 'remote.git');
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(remoteDir, { recursive: true });

  const { execSync: execSync } = await import('child_process');
  execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
  execSync('git init -b main', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com" && git config user.name "test"', { cwd: repoDir, stdio: 'pipe' });
  execSync('git remote add origin file://' + remoteDir, { cwd: repoDir, stdio: 'pipe' });
  writeFileSync(join(repoDir, 'README.md'), '# test');
  execSync('git add . && git commit -m "init"', { cwd: repoDir, stdio: 'pipe' });
  execSync('git push -u origin main', { cwd: repoDir, stdio: 'pipe' });

  await core.runCapability('feature.create', { name: 'close-test', repos: 'sample-app', objective: 'test close' }, { rootDir: tmp, now: new Date() });

  // Create decision log so close has something to archive
  const decisionDir = join(tmp, 'features', 'close-test', 'memory');
  mkdirSync(decisionDir, { recursive: true });
  writeFileSync(join(decisionDir, 'decision-log.md'), '# Decision Log\n\n- Decision 1: test decision\n');
  return tmp;
}

test('feature-close: feature.close requires acceptance stage confirmation', () => {
  // The confirmGate is set to "acceptance" in feature.close capability
  const featureCloseCap = core.featureClose || core.default?.featureClose;
  // We verify via the capability definition
  const featureSrc = readFileSync(join(process.cwd(), 'packages', 'core', 'src', 'capabilities', 'domains', 'feature.ts'), 'utf8');
  const closeMatch = featureSrc.match(/id:\s*"feature\.close"[\s\S]*?confirmGate:\s*"([^"]+)"/);
  assert.ok(closeMatch, 'feature.close should have confirmGate defined');
  assert.equal(closeMatch[1], 'acceptance', 'feature.close confirmGate should be "acceptance"');
});

test('feature-close: worktree is cleaned up on close', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-close-contract-'));
  try {
    await setupFeatureForClose(tmp);

    await core.runCapability('feature.close', { feature: 'close-test', force: true, confirmed: true }, { rootDir: tmp, now: new Date() });

    // Worktree path should not exist
    const worktreePath = join(tmp, 'features', 'close-test', 'repos', 'sample-app');
    assert.ok(!existsSync(worktreePath), 'worktree path should be removed');

    // The reports/stage-acceptance.completed marker should be created
    const acceptanceMarker = join(tmp, 'features', 'close-test', 'reports', 'stage-acceptance.completed');
    assert.ok(existsSync(acceptanceMarker), 'stage-acceptance.completed marker should be created');
  } finally {
    cleanTmp(tmp);
  }
});

test('feature-close: decision log is written to docs/decisions/<feature>-decisions.md', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-close-contract-'));
  try {
    await setupFeatureForClose(tmp);

    await core.runCapability('feature.close', { feature: 'close-test', force: true, confirmed: true }, { rootDir: tmp, now: new Date() });

    const decisionFile = join(tmp, 'docs', 'decisions', 'close-test-decisions.md');
    assert.ok(existsSync(decisionFile), 'docs/decisions/<feature>-decisions.md should be created');
    const content = readFileSync(decisionFile, 'utf8');
    assert.ok(content.includes('Decision 1'), 'decision log content should be preserved');
  } finally {
    cleanTmp(tmp);
  }
});

test('feature-close: feature-impact document is written to docs/feature-impact/<feature>.md', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-close-contract-'));
  try {
    await setupFeatureForClose(tmp);

    await core.runCapability('feature.close', { feature: 'close-test', force: true, confirmed: true }, { rootDir: tmp, now: new Date() });

    const impactFile = join(tmp, 'docs', 'feature-impact', 'close-test.md');
    assert.ok(existsSync(impactFile), 'docs/feature-impact/<feature>.md should be created');
    const content = readFileSync(impactFile, 'utf8');
    assert.ok(content.includes('Feature Impact: close-test'), 'impact doc should contain feature name');
    assert.ok(content.includes('Archive Date:'), 'impact doc should contain archive date');
  } finally {
    cleanTmp(tmp);
  }
});

test('feature-close: close without force on dirty worktree throws error', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-close-contract-'));
  try {
    await setupFeatureForClose(tmp);

    // Make the worktree dirty
    const worktreePath = join(tmp, 'features', 'close-test', 'repos', 'sample-app');
    writeFileSync(join(worktreePath, 'dirty-file.txt'), 'dirty content');

    // Without --force, this should throw WORKTREE_DIRTY
    // Note: confirmed:true is needed to pass the acceptance gate; force is false so WORKTREE_DIRTY should still be thrown
    await assert.rejects(
      async () => core.runCapability('feature.close', { feature: 'close-test', confirmed: true }, { rootDir: tmp, now: new Date() }),
      (err) => {
        return err.message?.includes('WORKTREE_DIRTY') || err.code === 'WORKTREE_DIRTY';
      }
    );
  } finally {
    cleanTmp(tmp);
  }
});