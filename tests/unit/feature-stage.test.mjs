import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';

const core = await import('../../packages/core/src/index.ts');

function cleanTmp(tmp) {
  rmSync(tmp, { recursive: true, force: true });
}

async function setupWorkspaceWithFeature(tmp, featureName = 'test-feature') {
  await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
  mkdirSync(join(tmp, 'repos'), { recursive: true });
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
  mkdirSync(join(tmp, 'features', featureName, 'reports'), { recursive: true });
  writeFileSync(join(tmp, 'features', featureName, 'feature.yaml'), `version: "0.2"\nfeature:\n  name: ${featureName}\n  repos: []\n`);
  return join(tmp, 'features', featureName);
}

test('feature.stage get returns null for new feature', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-stage-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    const { result } = await core.runCapability('feature.stage', {
      feature: 'test-feature',
      action: 'get'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.equal(result.data.stage, null, 'new feature should have no stage');
  } finally {
    cleanTmp(tmp);
  }
});

test('feature.stage set creates stage marker and updates progress', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-stage-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    const { result } = await core.runCapability('feature.stage', {
      feature: 'test-feature',
      action: 'set',
      stage: 'analyze-current-state'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.equal(result.data.stage, 'analyze-current-state');
    assert.ok(existsSync(join(tmp, 'features', 'test-feature', 'reports', 'stage-analyze-current-state.completed')), 'stage marker should be created');
    assert.ok(existsSync(join(tmp, 'features', 'test-feature', 'reports', 'feature-progress.md')), 'progress file should be created');
  } finally {
    cleanTmp(tmp);
  }
});

test('feature.stage get returns current stage after set', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-stage-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    await core.runCapability('feature.stage', {
      feature: 'test-feature',
      action: 'set',
      stage: 'gap-analysis'
    }, { rootDir: tmp, now: new Date() });

    const { result } = await core.runCapability('feature.stage', {
      feature: 'test-feature',
      action: 'get'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.equal(result.data.stage, 'gap-analysis');
  } finally {
    cleanTmp(tmp);
  }
});

test('feature.stage set requires stage parameter', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-stage-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    await assert.rejects(
      () => core.runCapability('feature.stage', {
        feature: 'test-feature',
        action: 'set'
      }, { rootDir: tmp, now: new Date() }),
      /missing field.*stage/i
    );
  } finally {
    cleanTmp(tmp);
  }
});

test('feature.stage set overwrites previous stage', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-stage-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    await core.runCapability('feature.stage', {
      feature: 'test-feature',
      action: 'set',
      stage: 'analyze-current-state'
    }, { rootDir: tmp, now: new Date() });

    await core.runCapability('feature.stage', {
      feature: 'test-feature',
      action: 'set',
      stage: 'gap-analysis'
    }, { rootDir: tmp, now: new Date() });

    const { result } = await core.runCapability('feature.stage', {
      feature: 'test-feature',
      action: 'get'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.data.stage, 'gap-analysis');
    assert.ok(existsSync(join(tmp, 'features', 'test-feature', 'reports', 'stage-gap-analysis.completed')));
  } finally {
    cleanTmp(tmp);
  }
});

test('feature.stage returns sideEffects after set', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-stage-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    const { result } = await core.runCapability('feature.stage', {
      feature: 'test-feature',
      action: 'set',
      stage: 'solution-design'
    }, { rootDir: tmp, now: new Date() });

    assert.ok(Array.isArray(result.sideEffects));
    assert.ok(result.sideEffects.length > 0, 'set should produce sideEffects');
  } finally {
    cleanTmp(tmp);
  }
});

test('feature.stage reportFragments contains stage info', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-stage-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    const { result } = await core.runCapability('feature.stage', {
      feature: 'test-feature',
      action: 'set',
      stage: 'solution-design'
    }, { rootDir: tmp, now: new Date() });

    assert.ok(result.reportFragments.some(f => f.includes('solution-design')), 'reportFragments should mention stage');
  } finally {
    cleanTmp(tmp);
  }
});