import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');

test('runCapability throws on unknown capability', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cap-'));
  try {
    await assert.rejects(
      () => core.runCapability('nonexistent.cap', {}, { rootDir: tmp, now: new Date() }),
      /CAPABILITY_NOT_FOUND|unknown capability/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('workspace.init fails on non-empty non-conforming directory', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cap-'));
  try {
    // Create a file that makes directory non-empty
    writeFileSync(join(tmp, 'some-file.txt'), 'content');
    await assert.rejects(
      () => core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() }),
      /not empty|does not look like|not an empty directory/i
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('repos.add fails on duplicate repo', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cap-'));
  try {
    mkdirSync(join(tmp, '.dapei'), { recursive: true });
    mkdirSync(join(tmp, 'repos'), { recursive: true });
    writeFileSync(join(tmp, '.dapei', 'repos.yaml'), 'version: "0.2"\nrepos:\n  - name: existing\n    path: repos/existing\n');

    // Create a fake repo directory
    mkdirSync(join(tmp, 'repos', 'existing'), { recursive: true });
    execFileSync('git', ['init', join(tmp, 'repos', 'existing')], { encoding: 'utf8' });

    await assert.rejects(
      () => core.runCapability('repos.add', { name: 'existing', url: 'git@example.com/repo.git' }, { rootDir: tmp, now: new Date() }),
      /REPO_EXISTS|already exists/i
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('feature.create fails on invalid feature name', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cap-'));
  try {
    mkdirSync(join(tmp, '.dapei'), { recursive: true });
    mkdirSync(join(tmp, 'repos'), { recursive: true });
    mkdirSync(join(tmp, 'features'), { recursive: true });
    writeFileSync(join(tmp, '.dapei', 'workspace.yaml'), 'version: "0.2"\n');

    await assert.rejects(
      () => core.runCapability('feature.create', { name: 'INVALID_NAME!', repos: 'r1' }, { rootDir: tmp, now: new Date() }),
      /INVALID_FEATURE|feature name must match/i
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('feature.create fails when repo not found', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cap-'));
  try {
    mkdirSync(join(tmp, '.dapei'), { recursive: true });
    mkdirSync(join(tmp, 'repos'), { recursive: true });
    mkdirSync(join(tmp, 'features'), { recursive: true });
    writeFileSync(join(tmp, '.dapei', 'workspace.yaml'), 'version: "0.2"\n');

    await assert.rejects(
      () => core.runCapability('feature.create', { name: 'my-feature', repos: 'nonexistent-repo' }, { rootDir: tmp, now: new Date() }),
      /REPO_MISSING|not found in repos/i
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('feature.create creates feature workspace with all dirs', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cap-'));
  try {
    mkdirSync(join(tmp, '.dapei'), { recursive: true });
    mkdirSync(join(tmp, 'repos'), { recursive: true });
    mkdirSync(join(tmp, 'features'), { recursive: true });
    writeFileSync(join(tmp, '.dapei', 'workspace.yaml'), 'version: "0.2"\n');

    // Setup a real git repo in repos/sample-app
    const repoPath = join(tmp, 'repos', 'sample-app');
    execFileSync('git', ['init', repoPath], { encoding: 'utf8' });
    execFileSync('git', ['-C', repoPath, 'config', 'user.name', 'test'], { encoding: 'utf8' });
    execFileSync('git', ['-C', repoPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    writeFileSync(join(repoPath, 'README.md'), '# test');
    execFileSync('git', ['-C', repoPath, 'add', '.'], { encoding: 'utf8' });
    execFileSync('git', ['-C', repoPath, 'commit', '-m', 'init'], { encoding: 'utf8' });

    const { result } = await core.runCapability('feature.create', { name: 'my-feature', repos: 'sample-app', objective: 'test objective' }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.equal(result.data.feature, 'my-feature');

    // Check directories created
    const featureDir = join(tmp, 'features', 'my-feature');
    assert.ok(existsSync(join(featureDir, 'docs')));
    assert.ok(existsSync(join(featureDir, 'context')));
    assert.ok(existsSync(join(featureDir, 'memory')));
    assert.ok(existsSync(join(featureDir, 'reports')));
    assert.ok(existsSync(join(featureDir, 'tasks')));
    assert.ok(existsSync(join(featureDir, 'feature.yaml')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('workflow.runStage requires confirmation for solution-design', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cap-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    mkdirSync(join(tmp, 'repos'), { recursive: true });
    const repoPath = join(tmp, 'repos', 'sample-app');
    execFileSync('git', ['init', repoPath], { encoding: 'utf8' });
    execFileSync('git', ['-C', repoPath, 'config', 'user.name', 'test'], { encoding: 'utf8' });
    execFileSync('git', ['-C', repoPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    writeFileSync(join(repoPath, 'README.md'), '# test');
    execFileSync('git', ['-C', repoPath, 'add', '.'], { encoding: 'utf8' });
    execFileSync('git', ['-C', repoPath, 'commit', '-m', 'init'], { encoding: 'utf8' });

    const { result: fResult } = await core.runCapability('feature.create', { name: 'test-feature', repos: 'sample-app' }, { rootDir: tmp, now: new Date() });
    assert.equal(fResult.ok, true);

    // Without confirmation, should throw
    await assert.rejects(
      () => core.runCapability('workflow.runStage', { feature: 'test-feature', stage: 'solution-design', confirmed: false }, { rootDir: tmp, now: new Date() }),
      /requires confirmation/i
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('workflow.runStage succeeds with confirmation', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cap-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    mkdirSync(join(tmp, 'repos'), { recursive: true });
    const repoPath = join(tmp, 'repos', 'sample-app');
    execFileSync('git', ['init', repoPath], { encoding: 'utf8' });
    execFileSync('git', ['-C', repoPath, 'config', 'user.name', 'test'], { encoding: 'utf8' });
    execFileSync('git', ['-C', repoPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    writeFileSync(join(repoPath, 'README.md'), '# test');
    execFileSync('git', ['-C', repoPath, 'add', '.'], { encoding: 'utf8' });
    execFileSync('git', ['-C', repoPath, 'commit', '-m', 'init'], { encoding: 'utf8' });

    await core.runCapability('feature.create', { name: 'test-feature', repos: 'sample-app' }, { rootDir: tmp, now: new Date() });

    // Copy workflow file so workflow.runStage can find it
    mkdirSync(join(tmp, '.dapei', 'workflows'), { recursive: true });
    writeFileSync(join(tmp, '.dapei', 'workflows', 'feature-lifecycle.yaml'), `
- id: analyze-current-state
  name: Analyze Current State
  stage: analyze-current-state
  outputs:
    - reports/current-state.md

- id: gap-analysis
  name: Gap Analysis
  stage: gap-analysis
  requires: [analyze-current-state]
  outputs:
    - reports/gap-analysis.md

- id: solution-design
  name: Solution Design
  stage: solution-design
  requires: [gap-analysis]
  outputs:
    - reports/design.md
`);

    // With confirmation, should succeed
    const { result } = await core.runCapability('workflow.runStage', { feature: 'test-feature', stage: 'analyze-current-state', confirmed: true }, { rootDir: tmp, now: new Date() });
    assert.equal(result.ok, true);
    assert.equal(result.data.stage, 'analyze-current-state');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});