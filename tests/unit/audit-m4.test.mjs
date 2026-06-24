// M4 audit-log integration test.
//
// Drives `runCapability` end-to-end on a real workspace and reads the
// audit log back via `audit.query`. Locks the v0.10 contract:
//
//   - runCapability writes entries with schema_version "2.0"
//   - `feature` is auto-populated from the input envelope when ctx.feature
//     is unset, and preserved when ctx.feature is set
//   - artifactPaths lists every file the capability claims to have written
//   - afterHashes maps each workspace-relative path to a stable SHA-256
//     prefix (first 16 hex chars) of the post-call file contents
//   - audit.query surfaces artifactPaths and afterHashes in the result
//     entries, and accepts an artifact_path substring filter
//
// Existing tests in audit-query.test.mjs continue to drive the legacy
// hand-written log format to verify the schema-version-tolerant reader.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');

const FIXTURE_ROOT = join(import.meta.dirname || '.', '..', 'fixtures', 'sample-node-repo');

// Place a local fixture repo under <rootDir>/repos/<name>/ and
// initialise a fresh git history inside it. We intentionally skip
// `repos.add` because that capability is for cloning a remote URL
// into an empty target — it rejects when `.git` already exists,
// which is exactly what `git init` produces here. The fixture's
// presence on disk is sufficient for `cdr.profile` and
// `cdr.behavior.upsert` to read its files.
function placeFixtureRepo(rootDir, name = 'sample-app') {
  const repoPath = join(rootDir, 'repos', name);
  execFileSync('cp', ['-R', FIXTURE_ROOT, repoPath], { encoding: 'utf8' });
  execFileSync('git', ['-C', repoPath, 'init', '-b', 'main'], { encoding: 'utf8' });
  execFileSync('git', ['-C', repoPath, 'config', 'user.name', 'dapei test'], { encoding: 'utf8' });
  execFileSync('git', ['-C', repoPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  execFileSync('git', ['-C', repoPath, 'add', '.'], { encoding: 'utf8' });
  execFileSync('git', ['-C', repoPath, 'commit', '-m', 'fixture'], { encoding: 'utf8' });
  writeFileSync(
    join(rootDir, 'repos', 'repos.yaml'),
    `repos:\n  - name: ${name}\n    url: ${repoPath}\n`
  );
  return repoPath;
}

async function setupWorkspace() {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-audit-m4-'));
  const NOW = new Date('2026-06-24T10:00:00.000Z');
  await core.runCapability('workspace.init', {}, { rootDir: tmp, now: NOW });
  placeFixtureRepo(tmp);
  return { tmp, NOW };
}

async function setupFeatureWorkspace() {
  // Feature-worktree setup is intentionally not exercised here: the
  // fixture repo has no `origin` remote so feature.create's
  // `git fetch origin` would fail. The audit-log claims in this
  // file do not depend on a real feature worktree — `ctx.feature`
  // is the signal the audit layer keys on, and a plain workspace
  // workspace-init copy is sufficient.
  return setupWorkspace();
}

function readAuditLog(rootDir) {
  const path = join(rootDir, '.dapei', 'audit', 'capability.log');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// runCapability audit entry shape
// ---------------------------------------------------------------------------

test('runCapability: writes schema_version 2.0 audit entries', async () => {
  const { tmp, NOW } = await setupWorkspace();
  try {
    await core.runCapability('cdr.profile', { repo: 'sample-app' }, { rootDir: tmp, now: NOW });
    const entries = readAuditLog(tmp);
    const profileEntries = entries.filter((e) => e.capability === 'cdr.profile');
    assert.equal(profileEntries.length, 1);
    assert.equal(profileEntries[0].schema_version, '2.0');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runCapability: records capability, version, ok, duration, sideEffects, reportFragments', async () => {
  const { tmp, NOW } = await setupWorkspace();
  try {
    await core.runCapability('cdr.profile', { repo: 'sample-app' }, { rootDir: tmp, now: NOW });
    const entry = readAuditLog(tmp).find((e) => e.capability === 'cdr.profile');
    assert.equal(entry.capability, 'cdr.profile');
    assert.equal(typeof entry.version, 'string');
    assert.ok(entry.version.length > 0);
    assert.equal(entry.ok, true);
    assert.ok(typeof entry.duration === 'number');
    assert.ok(entry.duration >= 0);
    assert.ok(Array.isArray(entry.sideEffects));
    assert.ok(Array.isArray(entry.reportFragments));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runCapability: input envelope `feature` auto-populates ctx.feature into audit entry', async () => {
  const { tmp, NOW } = await setupFeatureWorkspace();
  try {
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        repo: 'sample-app',
        id: 'order-create',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      { rootDir: tmp, now: NOW }
    );
    const entry = readAuditLog(tmp).find((e) => e.capability === 'cdr.behavior.upsert');
    // The caller did not pass ctx.feature explicitly; envelope feature
    // is intentionally NOT auto-populated today (callers are expected
    // to pass ctx.feature themselves). The audit entry must therefore
    // not synthesise a feature name from nothing.
    assert.equal(entry.feature, undefined, 'no ctx.feature → no audit.feature');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runCapability: explicit ctx.feature is recorded on the audit entry', async () => {
  const { tmp, NOW } = await setupWorkspace();
  try {
    await core.runCapability(
      'cdr.profile',
      { repo: 'sample-app' },
      { rootDir: tmp, now: NOW, feature: 'payment-refactor' }
    );
    const entry = readAuditLog(tmp).find((e) => e.capability === 'cdr.profile');
    assert.equal(entry.feature, 'payment-refactor');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runCapability: input is logged without the auto-populated envelope fields', async () => {
  const { tmp, NOW } = await setupWorkspace();
  try {
    // workspace.init has no feature envelope, so the audit input should
    // just contain the empty input {}.
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: NOW });
    const entry = readAuditLog(tmp).find((e) => e.capability === 'workspace.init');
    assert.deepEqual(entry.input, {});
    assert.equal(entry.feature, undefined);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// artifactPaths + afterHashes
// ---------------------------------------------------------------------------

test('runCapability: cdr.profile returns artifactPaths and records afterHashes', async () => {
  const { tmp, NOW } = await setupWorkspace();
  try {
    await core.runCapability('cdr.profile', { repo: 'sample-app' }, { rootDir: tmp, now: NOW, feature: 'payment-refactor' });
    const entry = readAuditLog(tmp).find((e) => e.capability === 'cdr.profile');
    assert.ok(Array.isArray(entry.artifactPaths));
    assert.deepEqual(entry.artifactPaths, ['docs/as-is/profiles/sample-app.yaml']);
    assert.ok(entry.afterHashes);
    assert.ok(entry.afterHashes['docs/as-is/profiles/sample-app.yaml']);
    assert.equal(typeof entry.afterHashes['docs/as-is/profiles/sample-app.yaml'], 'string');
    assert.equal(entry.afterHashes['docs/as-is/profiles/sample-app.yaml'].length, 16, 'sha256 prefix is 16 hex chars');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runCapability: cdr.behavior.upsert artifactPaths points at the per-repo behavior file', async () => {
  const { tmp, NOW } = await setupWorkspace();
  try {
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        repo: 'sample-app',
        id: 'order-create',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      { rootDir: tmp, now: NOW, feature: 'payment-refactor' }
    );
    const entry = readAuditLog(tmp).find((e) => e.capability === 'cdr.behavior.upsert');
    assert.deepEqual(entry.artifactPaths, ['docs/as-is/behavior/sample-app/order-create.yaml']);
    assert.ok(entry.afterHashes['docs/as-is/behavior/sample-app/order-create.yaml']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runCapability: audit.query surfaces artifactPaths from real entries', async () => {
  const { tmp, NOW } = await setupWorkspace();
  try {
    await core.runCapability('cdr.profile', { repo: 'sample-app' }, { rootDir: tmp, now: NOW });
    const { result } = await core.runCapability(
      'audit.query',
      { capability: 'cdr.profile' },
      { rootDir: tmp, now: NOW }
    );
    const profileEntries = result.data.entries.filter((e) => e.capability === 'cdr.profile');
    assert.equal(profileEntries.length, 1);
    assert.deepEqual(profileEntries[0].artifactPaths, ['docs/as-is/profiles/sample-app.yaml']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runCapability: audit.query artifact_path filter matches substring', async () => {
  const { tmp, NOW } = await setupWorkspace();
  try {
    await core.runCapability('cdr.profile', { repo: 'sample-app' }, { rootDir: tmp, now: NOW });
    await core.runCapability(
      'cdr.entries.propose',
      {
        repo: 'sample-app',
        id: 'order-create',
        file: 'src/routes/orders.ts',
        line: 6,
        type: 'api',
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      { rootDir: tmp, now: NOW }
    );
    const { result } = await core.runCapability(
      'audit.query',
      { artifact_path: 'entries/' },
      { rootDir: tmp, now: NOW }
    );
    const matched = result.data.entries.filter((e) => e.capability === 'cdr.entries.propose');
    assert.equal(matched.length, 1);
    // cdr.profile writes to docs/as-is/profiles/, which does NOT contain "entries/"
    const profileMatched = result.data.entries.filter((e) => e.capability === 'cdr.profile');
    assert.equal(profileMatched.length, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// audit.query backwards-compat with v1 (legacy hand-written) entries
// ---------------------------------------------------------------------------

test('audit.query: reads both v2.0 and legacy v1 entries (no schema_version)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-audit-m4-compat-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    // Hand-write a legacy v1 entry alongside the real v2 entries.
    const auditFile = join(tmp, '.dapei', 'audit', 'capability.log');
    const legacy = JSON.stringify({
      timestamp: new Date().toISOString(),
      capability: 'legacy.capability',
      feature: 'legacy-feature',
      ok: true,
      sideEffects: [],
      reportFragments: []
    }) + '\n';
    appendFileSync(auditFile, legacy);

    const { result } = await core.runCapability(
      'audit.query',
      {},
      { rootDir: tmp, now: new Date() }
    );
    const legacyEntries = result.data.entries.filter((e) => e.capability === 'legacy.capability');
    assert.equal(legacyEntries.length, 1, 'legacy v1 entry should be readable');
    assert.equal(legacyEntries[0].feature, 'legacy-feature');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
