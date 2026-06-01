import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';

const core = await import('../../packages/core/src/index.ts');

function cleanTmp(tmp) {
  rmSync(tmp, { recursive: true, force: true });
}

async function setupWorkspace(tmp) {
  await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
  mkdirSync(join(tmp, '.dapei', 'audit'), { recursive: true });
}

function writeAuditEntry(tmp, capability, feature, ok = true) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    capability,
    feature,
    ok,
    sideEffects: [],
    reportFragments: []
  }) + '\n';
  appendFileSync(join(tmp, '.dapei', 'audit', 'capability.log'), entry);
}

test('audit.query returns empty when no log file', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-audit-'));
  try {
    await setupWorkspace(tmp);

    const { result } = await core.runCapability('audit.query', {}, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    // Filter out entries from audit.query itself (runCapability writes to log)
    const nonQueryEntries = result.data.entries.filter(e => e.capability !== 'audit.query');
    assert.equal(nonQueryEntries.length, 0, 'should be empty when no manual log entries');
  } finally {
    cleanTmp(tmp);
  }
});

test('audit.query returns all entries without filters', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-audit-'));
  try {
    await setupWorkspace(tmp);
    writeAuditEntry(tmp, 'workspace.init', 'test', true);
    writeAuditEntry(tmp, 'feature.create', 'test', true);
    writeAuditEntry(tmp, 'repos.add', 'test', true);

    const { result } = await core.runCapability('audit.query', {}, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    const nonQueryEntries = result.data.entries.filter(e => e.capability !== 'audit.query');
    assert.equal(nonQueryEntries.length, 3, 'should return all 3 entries');
  } finally {
    cleanTmp(tmp);
  }
});

test('audit.query filters by capability', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-audit-'));
  try {
    await setupWorkspace(tmp);
    writeAuditEntry(tmp, 'workspace.init', 'test', true);
    writeAuditEntry(tmp, 'workspace.report', 'test', true);
    writeAuditEntry(tmp, 'feature.create', 'test', true);

    const { result } = await core.runCapability('audit.query', {
      capability: 'workspace.init'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    const nonQueryEntries = result.data.entries.filter(e => e.capability !== 'audit.query');
    assert.equal(nonQueryEntries.length, 1, 'should return only workspace.init entries');
    assert.equal(nonQueryEntries[0].capability, 'workspace.init');
  } finally {
    cleanTmp(tmp);
  }
});

test('audit.query filters by feature', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-audit-'));
  try {
    await setupWorkspace(tmp);
    writeAuditEntry(tmp, 'workspace.init', 'feature-a', true);
    writeAuditEntry(tmp, 'workspace.init', 'feature-b', true);
    writeAuditEntry(tmp, 'workspace.init', 'feature-c', true);

    const { result } = await core.runCapability('audit.query', {
      feature: 'feature-b'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    const nonQueryEntries = result.data.entries.filter(e => e.capability !== 'audit.query');
    assert.equal(nonQueryEntries.length, 1, 'should return only feature-b entries');
    assert.equal(nonQueryEntries[0].feature, 'feature-b');
  } finally {
    cleanTmp(tmp);
  }
});

test('audit.query filters by since time', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-audit-'));
  try {
    await setupWorkspace(tmp);

    // Write entry with old timestamp
    const oldEntry = JSON.stringify({
      timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      capability: 'workspace.init',
      feature: 'test',
      ok: true
    }) + '\n';
    appendFileSync(join(tmp, '.dapei', 'audit', 'capability.log'), oldEntry);

    // Write entry with current timestamp
    writeAuditEntry(tmp, 'feature.create', 'test', true);

    const { result } = await core.runCapability('audit.query', {
      since: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    const nonQueryEntries = result.data.entries.filter(e => e.capability !== 'audit.query');
    assert.equal(nonQueryEntries.length, 1, 'should only return recent entry');
    assert.equal(nonQueryEntries[0].capability, 'feature.create');
  } finally {
    cleanTmp(tmp);
  }
});

test('audit.query respects limit', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-audit-'));
  try {
    await setupWorkspace(tmp);
    for (let i = 0; i < 10; i++) {
      writeAuditEntry(tmp, 'workspace.init', `feature-${i}`, true);
    }

    const { result } = await core.runCapability('audit.query', {
      limit: 3
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    const nonQueryEntries = result.data.entries.filter(e => e.capability !== 'audit.query');
    assert.equal(nonQueryEntries.length, 3, 'should respect limit');
  } finally {
    cleanTmp(tmp);
  }
});

test('audit.query skips malformed lines', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-audit-'));
  try {
    await setupWorkspace(tmp);
    writeAuditEntry(tmp, 'workspace.init', 'test', true);
    appendFileSync(join(tmp, '.dapei', 'audit', 'capability.log'), 'not valid json\n');
    writeAuditEntry(tmp, 'feature.create', 'test', true);

    const { result } = await core.runCapability('audit.query', {}, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    const nonQueryEntries = result.data.entries.filter(e => e.capability !== 'audit.query');
    assert.equal(nonQueryEntries.length, 2, 'should skip malformed line');
  } finally {
    cleanTmp(tmp);
  }
});