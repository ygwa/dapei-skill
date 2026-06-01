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
  mkdirSync(join(tmp, 'features', 'test-feature', 'memory'), { recursive: true });
  writeFileSync(join(tmp, 'features', 'test-feature', 'feature.yaml'), `version: "0.2"\nfeature:\n  name: test-feature\n  repos: []\n`);
}

test('memory.append creates decision log file', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-mem-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    const { result } = await core.runCapability('memory.append', {
      feature: 'test-feature',
      type: 'decision',
      content: 'Chose PostgreSQL over MySQL for its JSON support'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.equal(result.data.feature, 'test-feature');
    assert.equal(result.data.type, 'decision');
    assert.equal(result.data.file, 'decision-log.md');
    assert.ok(existsSync(join(tmp, 'features', 'test-feature', 'memory', 'decision-log.md')), 'decision-log.md should be created');
  } finally {
    cleanTmp(tmp);
  }
});

test('memory.append appends to existing decision log', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-mem-'));
  try {
    await setupWorkspaceWithFeature(tmp);
    const memDir = join(tmp, 'features', 'test-feature', 'memory');
    writeFileSync(join(memDir, 'decision-log.md'), `# Decision Log\n\n## First decision\n\nInitial content\n\n---\n`);

    await core.runCapability('memory.append', {
      feature: 'test-feature',
      type: 'decision',
      content: 'Second decision was made'
    }, { rootDir: tmp, now: new Date() });

    const content = readFileSync(join(memDir, 'decision-log.md'), 'utf8');
    assert.ok(content.includes('First decision'), 'should keep original content');
    assert.ok(content.includes('Second decision was made'), 'should append new content');
  } finally {
    cleanTmp(tmp);
  }
});

test('memory.append creates risk log file', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-mem-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    const { result } = await core.runCapability('memory.append', {
      feature: 'test-feature',
      type: 'risk',
      content: 'Single point of failure in payment gateway'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.equal(result.data.file, 'risk.md');
    assert.ok(existsSync(join(tmp, 'features', 'test-feature', 'memory', 'risk.md')), 'risk.md should be created');
  } finally {
    cleanTmp(tmp);
  }
});

test('memory.append creates question log file', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-mem-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    const { result } = await core.runCapability('memory.append', {
      feature: 'test-feature',
      type: 'question',
      content: 'Should we use REST or GraphQL for the API?'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.equal(result.data.file, 'open-questions.md');
    assert.ok(existsSync(join(tmp, 'features', 'test-feature', 'memory', 'open-questions.md')), 'open-questions.md should be created');
  } finally {
    cleanTmp(tmp);
  }
});

test('memory.append creates note log file', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-mem-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    const { result } = await core.runCapability('memory.append', {
      feature: 'test-feature',
      type: 'note',
      content: 'Team prefers async communication'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.equal(result.data.file, 'notes.md');
    assert.ok(existsSync(join(tmp, 'features', 'test-feature', 'memory', 'notes.md')), 'notes.md should be created');
  } finally {
    cleanTmp(tmp);
  }
});

test('memory.append fails for nonexistent feature', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-mem-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    await assert.rejects(
      () => core.runCapability('memory.append', {
        feature: 'nonexistent',
        type: 'decision',
        content: 'test'
      }, { rootDir: tmp, now: new Date() }),
      /FEATURE_MISSING|not found/i
    );
  } finally {
    cleanTmp(tmp);
  }
});

test('memory.append requires type parameter', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-mem-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    await assert.rejects(
      () => core.runCapability('memory.append', {
        feature: 'test-feature',
        content: 'test'
      }, { rootDir: tmp, now: new Date() }),
      /missing field.*type/i
    );
  } finally {
    cleanTmp(tmp);
  }
});

test('memory.append reportFragments indicates append', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-mem-'));
  try {
    await setupWorkspaceWithFeature(tmp);

    const { result } = await core.runCapability('memory.append', {
      feature: 'test-feature',
      type: 'decision',
      content: 'Test decision'
    }, { rootDir: tmp, now: new Date() });

    assert.ok(result.reportFragments.some(f => f.includes('decision')), 'reportFragments should mention decision');
  } finally {
    cleanTmp(tmp);
  }
});