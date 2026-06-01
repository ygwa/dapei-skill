import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';

const core = await import('../../packages/core/src/index.ts');

function cleanTmp(tmp) {
  rmSync(tmp, { recursive: true, force: true });
}

test('workspace.validate returns status=valid for clean workspace', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ws-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    const { result } = await core.runCapability('workspace.validate', {}, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.ok(['valid', 'warn'].includes(result.data.status), `expected valid/warn, got ${result.data.status}`);
    assert.ok(Array.isArray(result.data.errors), 'errors should be array');
    assert.ok(Array.isArray(result.data.warnings), 'warnings should be array');
    assert.equal(result.data.errors.length, 0, 'fresh workspace should have no errors');
  } finally {
    cleanTmp(tmp);
  }
});

test('workspace.validate returns errors when workspace.yaml missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ws-'));
  try {
    mkdirSync(join(tmp, '.dapei'), { recursive: true });

    const { result } = await core.runCapability('workspace.validate', {}, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.ok(result.data.errors.some(e => e.includes('workspace.yaml')), 'should report missing workspace.yaml');
  } finally {
    cleanTmp(tmp);
  }
});

test('workspace.status returns repoCount and featureCount', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ws-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    const { result } = await core.runCapability('workspace.status', {}, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.ok(typeof result.data.repoCount === 'number', 'repoCount should be number');
    assert.ok(typeof result.data.featureCount === 'number', 'featureCount should be number');
    assert.ok(typeof result.data.conforms === 'boolean', 'conforms should be boolean');
    assert.equal(result.data.repoCount, 0, 'empty workspace should have 0 repos');
    assert.equal(result.data.featureCount, 0, 'empty workspace should have 0 features');
  } finally {
    cleanTmp(tmp);
  }
});

test('workspace.report returns repos and features arrays', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ws-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    const { result } = await core.runCapability('workspace.report', {}, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.ok(Array.isArray(result.data.repos), 'repos should be array');
    assert.ok(Array.isArray(result.data.features), 'features should be array');
  } finally {
    cleanTmp(tmp);
  }
});

test('workspace.init creates .dapei/workspace.yaml', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ws-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    assert.ok(existsSync(join(tmp, '.dapei', 'workspace.yaml')), 'workspace.yaml should be created');
    const content = readFileSync(join(tmp, '.dapei', 'workspace.yaml'), 'utf8');
    assert.ok(content.includes('version:'), 'workspace.yaml should have version');
  } finally {
    cleanTmp(tmp);
  }
});

test('workspace.init creates repos and features directories', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ws-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    assert.ok(existsSync(join(tmp, 'repos')), 'repos dir should be created');
    assert.ok(existsSync(join(tmp, 'features')), 'features dir should be created');
  } finally {
    cleanTmp(tmp);
  }
});