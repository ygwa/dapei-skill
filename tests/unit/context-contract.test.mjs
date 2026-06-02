import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';

const core = await import('../../packages/core/src/index.ts');

function cleanTmp(tmp) {
  rmSync(tmp, { recursive: true, force: true });
}

async function setupWorkspaceWithFeature(tmp) {
  await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

  // Create a minimal repo fixture with a proper remote
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

  // Create feature
  await core.runCapability('feature.create', { name: 'test-feature', repos: 'sample-app', objective: 'test' }, { rootDir: tmp, now: new Date() });
  return tmp;
}

test('context-contract: runtime-context.md contains required fields', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ctx-contract-'));
  try {
    await setupWorkspaceWithFeature(tmp);
    await core.runCapability('context.build', { feature: 'test-feature', stage: 'analyze-current-state' }, { rootDir: tmp, now: new Date() });

    const ctxFile = join(tmp, 'features', 'test-feature', 'context', 'runtime-context.md');
    assert.ok(existsSync(ctxFile), 'runtime-context.md should exist');
    const content = readFileSync(ctxFile, 'utf8');

    assert.ok(content.includes('Feature: test-feature'), 'should contain feature name');
    assert.ok(content.includes('Stage: analyze-current-state'), 'should contain stage name');
    assert.ok(content.includes('Cognitive Behavior Summary'), 'should contain Cognitive Behavior Summary section');
    assert.ok(content.includes('State Machine Summary'), 'should contain State Machine Summary section');
    assert.ok(content.includes('Repo Runtime Evidence'), 'should contain Repo evidence section');
  } finally {
    cleanTmp(tmp);
  }
});

test('context-contract: runtime-context.md does NOT contain itself', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ctx-contract-'));
  try {
    await setupWorkspaceWithFeature(tmp);
    await core.runCapability('context.build', { feature: 'test-feature', stage: 'analyze-current-state' }, { rootDir: tmp, now: new Date() });

    const ctxFile = join(tmp, 'features', 'test-feature', 'context', 'runtime-context.md');
    const content = readFileSync(ctxFile, 'utf8');

    // The context file should not reference itself
    assert.ok(!content.includes('runtime-context.md'), 'runtime-context.md should not contain its own filename');
  } finally {
    cleanTmp(tmp);
  }
});

test('context-contract: context-index.yaml has correct format', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ctx-contract-'));
  try {
    await setupWorkspaceWithFeature(tmp);
    await core.runCapability('context.build', { feature: 'test-feature', stage: 'analyze-current-state' }, { rootDir: tmp, now: new Date() });

    const indexFile = join(tmp, 'features', 'test-feature', 'context', 'context-index.yaml');
    assert.ok(existsSync(indexFile), 'context-index.yaml should exist');
    const content = readFileSync(indexFile, 'utf8');

    assert.ok(content.includes('feature: test-feature'), 'index should contain feature name');
    assert.ok(content.includes('stage: analyze-current-state'), 'index should contain stage');
    assert.ok(content.includes('generated_at:'), 'index should contain generated_at');
    assert.ok(content.includes('cognitive_layer: true'), 'index should have cognitive_layer flag');
  } finally {
    cleanTmp(tmp);
  }
});

test('context-contract: context.build excludes self from sources', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ctx-contract-'));
  try {
    await setupWorkspaceWithFeature(tmp);
    await core.runCapability('context.build', { feature: 'test-feature', stage: 'gap-analysis' }, { rootDir: tmp, now: new Date() });

    const ctxFile = join(tmp, 'features', 'test-feature', 'context', 'runtime-context.md');
    const content = readFileSync(ctxFile, 'utf8');

    // The context should NOT include the runtime-context.md source itself
    // (it should be filtered out in the listFilesRecursively loop with the .endsWith check)
    const selfReferences = content.match(/Source:.*runtime-context\.md/g);
    assert.equal(selfReferences?.length || 0, 0, 'context should not include runtime-context.md as a source');
  } finally {
    cleanTmp(tmp);
  }
});