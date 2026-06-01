import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';

const core = await import('../../packages/core/src/index.ts');

function cleanTmp(tmp) {
  rmSync(tmp, { recursive: true, force: true });
}

async function setupWorkspaceWithFeature(tmp) {
  await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
  mkdirSync(join(tmp, 'features', 'test-feature', 'tasks'), { recursive: true });
  writeFileSync(join(tmp, 'features', 'test-feature', 'feature.yaml'), `version: "0.2"\nfeature:\n  name: test-feature\n  repos: []\n`);
}

test('feature.tasks list returns empty text for new backlog', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-tasks-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    const { result } = await core.runCapability('feature.tasks', {
      feature: 'test-feature',
      action: 'list'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.equal(result.data.text, '', 'new backlog should return empty text');
  } finally {
    cleanTmp(tmp);
  }
});

test('feature.tasks append adds content to backlog', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-tasks-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    const { result } = await core.runCapability('feature.tasks', {
      feature: 'test-feature',
      action: 'append',
      content: 'Fix the login bug'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.equal(result.data.appended, true);
    assert.ok(existsSync(join(tmp, 'features', 'test-feature', 'tasks', 'backlog.md')), 'backlog.md should be created');

    const content = readFileSync(join(tmp, 'features', 'test-feature', 'tasks', 'backlog.md'), 'utf8');
    assert.ok(content.includes('Fix the login bug'), 'backlog should contain appended task');
  } finally {
    cleanTmp(tmp);
  }
});

test('feature.tasks list returns backlog content', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-tasks-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    await core.runCapability('feature.tasks', {
      feature: 'test-feature',
      action: 'append',
      content: 'First task'
    }, { rootDir: tmp, now: new Date() });

    await core.runCapability('feature.tasks', {
      feature: 'test-feature',
      action: 'append',
      content: 'Second task'
    }, { rootDir: tmp, now: new Date() });

    const { result } = await core.runCapability('feature.tasks', {
      feature: 'test-feature',
      action: 'list'
    }, { rootDir: tmp, now: new Date() });

    assert.ok(result.data.text.includes('First task'), 'list should include first task');
    assert.ok(result.data.text.includes('Second task'), 'list should include second task');
  } finally {
    cleanTmp(tmp);
  }
});

test('feature.tasks append requires content parameter', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-tasks-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    await assert.rejects(
      () => core.runCapability('feature.tasks', {
        feature: 'test-feature',
        action: 'append'
      }, { rootDir: tmp, now: new Date() }),
      /missing field.*content/i
    );
  } finally {
    cleanTmp(tmp);
  }
});

test('feature.tasks append works without # Backlog header', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-tasks-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    // Append a multiline task (should preserve as-is)
    const multilineTask = `## Analysis\n\n- Review codebase structure\n- Identify API endpoints`;
    const { result } = await core.runCapability('feature.tasks', {
      feature: 'test-feature',
      action: 'append',
      content: multilineTask
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    const content = readFileSync(join(tmp, 'features', 'test-feature', 'tasks', 'backlog.md'), 'utf8');
    assert.ok(content.includes(multilineTask), 'multiline content should be preserved');
  } finally {
    cleanTmp(tmp);
  }
});

test('feature.tasks reportFragments contains task info', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-tasks-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    const { result } = await core.runCapability('feature.tasks', {
      feature: 'test-feature',
      action: 'append',
      content: 'Test task'
    }, { rootDir: tmp, now: new Date() });

    assert.ok(result.reportFragments.some(f => f.includes('task')), 'reportFragments should mention task');
  } finally {
    cleanTmp(tmp);
  }
});