// M5 audit-log-driven cdr.feature.link tests.
//
// These lock the no-batch-overreach guarantee: cdr.feature.link in
// its default `mode: "audit"` must only tag artifacts that the
// feature actually wrote, derived from `.dapei/audit/capability.log`.
// Pre-existing artifacts from a different feature (or from workspace
// indexing without a feature) must NOT be re-tagged just because
// their `created_by_feature` is empty.
//
// feature-close-cdr-link.test.mjs continues to lock the end-state
// semantics for cdr.feature.link (empty → 0, idempotent, etc.).
// This file locks the contract that distinguishes audit mode from
// the legacy backfill mode.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(__dirname, '../fixtures/sample-node-repo');

function initFixtureRepo(targetPath) {
  execFileSync('cp', ['-R', fixtureRoot, targetPath], { encoding: 'utf8' });
  if (!existsSync(join(targetPath, '.git'))) {
    execFileSync('git', ['-C', targetPath, 'init', '-b', 'main'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.name', 'dapei test'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'add', '.'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'commit', '-m', 'fixture'], { encoding: 'utf8' });
  }
}

function placeFixtureRepo(rootDir, name = 'sample-app') {
  const repoPath = join(rootDir, 'repos', name);
  execFileSync('cp', ['-R', fixtureRoot, repoPath], { encoding: 'utf8' });
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

const NOW = new Date('2026-06-24T10:00:00.000Z');
const c = (tmp) => ({ rootDir: tmp, now: NOW });

async function setupWorkspace() {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-feature-link-m5-'));
  await core.runCapability('workspace.init', {}, c(tmp));
  placeFixtureRepo(tmp);
  return tmp;
}

const BEHAVIOR_INPUT = {
  id: 'order-create',
  repo: 'sample-app',
  entry: { type: 'api', method: 'POST', path: '/orders' },
  confidence: { level: 'high', kind: 'fact' },
  sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
};

// ---------------------------------------------------------------------------
// No-batch-overreach guarantee
// ---------------------------------------------------------------------------

test('cdr.feature.link (audit mode): does NOT re-tag artifacts belonging to another feature', async () => {
  const tmp = await setupWorkspace();
  try {
    // feature-a creates a behavior with feature-a stamped on it via M3 provenance.
    await core.runCapability('cdr.behavior.upsert', BEHAVIOR_INPUT, { rootDir: tmp, now: NOW, feature: 'feature-a' });

    // Now feature-b runs cdr.feature.link — it must NOT claim
    // feature-a's artifact just because the previous batch-tag
    // implementation would have walked the index.
    const result = await core.runCapability(
      'cdr.feature.link',
      { feature: 'feature-b', mode: 'audit' },
      c(tmp)
    );
    assert.equal(result.result.data.assets_tagged, 0, 'feature-b must not claim feature-a artifacts');

    // Verify the original artifact is still tagged with feature-a.
    const docPath = join(tmp, 'docs/as-is/behavior/sample-app/order-create.yaml');
    const doc = readFileSync(docPath, 'utf8');
    assert.match(doc, /created_by_feature: feature-a/, 'feature-a tag preserved on artifact');
    assert.doesNotMatch(doc, /created_by_feature: feature-b/, 'feature-b must not overwrite feature-a');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.feature.link (audit mode): is a no-op when feature already owns the artifact (M3 provenance wins)', async () => {
  const tmp = await setupWorkspace();
  try {
    // feature-a writes a behavior — applyProvenance tags it immediately.
    await core.runCapability('cdr.behavior.upsert', BEHAVIOR_INPUT, { rootDir: tmp, now: NOW, feature: 'feature-a' });

    // Audit mode sees the artifact in the audit log for feature-a, but
    // the artifact is already tagged with feature-a. The implementation
    // must NOT count it as a new tag (idempotency at the file level).
    const result = await core.runCapability(
      'cdr.feature.link',
      { feature: 'feature-a', mode: 'audit' },
      c(tmp)
    );
    assert.equal(result.result.data.assets_tagged, 0, 'already-tagged artifact must not re-tag');

    const docPath = join(tmp, 'docs/as-is/behavior/sample-app/order-create.yaml');
    const doc = readFileSync(docPath, 'utf8');
    assert.match(doc, /created_by_feature: feature-a/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.feature.link (audit mode): tags an artifact written without ctx.feature if the audit log has feature', async () => {
  const tmp = await setupWorkspace();
  try {
    // Write a behavior WITHOUT ctx.feature (workspace-scope call).
    // The audit entry will have feature=undefined, so audit mode for
    // 'feature-a' should not see it. Then we manually write a v0.10
    // audit entry that says feature-a wrote the file, and re-run
    // cdr.feature.link — it must tag the file now.
    await core.runCapability('cdr.behavior.upsert', BEHAVIOR_INPUT, c(tmp));

    // The artifact has no created_by_feature (workspace-scope write).
    const docPath = join(tmp, 'docs/as-is/behavior/sample-app/order-create.yaml');
    const initialDoc = readFileSync(docPath, 'utf8');
    assert.doesNotMatch(initialDoc, /created_by_feature:/, 'workspace-scope writes leave no created_by_feature');

    // Manually append an audit entry claiming feature-a wrote the artifact.
    // (Real-world: a maintainer migrating from pre-v0.10 can rewrite
    // the audit log with the v0.10 shape; the cdr.* writes that ran
    // before M3 lacked feature, so the audit log may need a backfill.)
    const auditFile = join(tmp, '.dapei', 'audit', 'capability.log');
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      auditFile,
      JSON.stringify({
        schema_version: '2.0',
        timestamp: NOW.toISOString(),
        capability: 'cdr.behavior.upsert',
        version: '1.0.0',
        ok: true,
        duration: 0,
        input: {},
        feature: 'feature-a',
        sideEffects: ['backfill'],
        reportFragments: [],
        artifactPaths: ['docs/as-is/behavior/sample-app/order-create.yaml']
      }) + '\n'
    );

    const result = await core.runCapability(
      'cdr.feature.link',
      { feature: 'feature-a', mode: 'audit' },
      c(tmp)
    );
    assert.equal(result.result.data.assets_tagged, 1, 'audit-log-claimed artifact must be tagged');

    const doc = readFileSync(docPath, 'utf8');
    assert.match(doc, /created_by_feature: feature-a/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.feature.link (audit mode): idempotent — second call returns 0', async () => {
  const tmp = await setupWorkspace();
  try {
    await core.runCapability('cdr.behavior.upsert', BEHAVIOR_INPUT, c(tmp));

    // Stamp an audit entry so audit mode can claim the artifact.
    const auditFile = join(tmp, '.dapei', 'audit', 'capability.log');
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      auditFile,
      JSON.stringify({
        schema_version: '2.0',
        timestamp: NOW.toISOString(),
        capability: 'cdr.behavior.upsert',
        version: '1.0.0',
        ok: true,
        duration: 0,
        input: {},
        feature: 'payment-refactor',
        sideEffects: [],
        reportFragments: [],
        artifactPaths: ['docs/as-is/behavior/sample-app/order-create.yaml']
      }) + '\n'
    );

    const r1 = await core.runCapability('cdr.feature.link', { feature: 'payment-refactor', mode: 'audit' }, c(tmp));
    const r2 = await core.runCapability('cdr.feature.link', { feature: 'payment-refactor', mode: 'audit' }, c(tmp));
    assert.equal(r1.result.data.assets_tagged, 1);
    assert.equal(r2.result.data.assets_tagged, 0, 'second call should be a no-op');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Backfill mode (legacy batch-tag) for pre-v0.10 workspaces
// ---------------------------------------------------------------------------

test('cdr.feature.link (backfill mode): tags pre-existing artifacts on disk (profile, domain, capability-map, business-rule)', async () => {
  const tmp = await setupWorkspace();
  try {
    // Pre-existing artifacts: simulate a pre-v0.10 workspace by
    // hand-writing files in each as-is directory with no created_by_feature.
    const profileDir = join(tmp, 'docs/as-is/profiles');
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(join(profileDir, 'sample-app.yaml'), 'repo: sample-app\nlanguage: typescript\n');

    const domainDir = join(tmp, 'docs/as-is/domains');
    mkdirSync(domainDir, { recursive: true });
    writeFileSync(join(domainDir, 'transaction.yaml'), 'domain: transaction\ndescription: pre-existing\n');

    const capDir = join(tmp, 'docs/as-is/capabilities');
    mkdirSync(capDir, { recursive: true });
    writeFileSync(join(capDir, 'product-map.yaml'), 'product: E-Commerce Mall\ncapabilities: []\n');

    const ruleDir = join(tmp, 'docs/as-is/business-rules/sample-app');
    mkdirSync(ruleDir, { recursive: true });
    writeFileSync(join(ruleDir, 'order-amount-positive.yaml'), 'id: order-amount-positive\nkind: invariant\n');

    // Empty audit log so audit mode would fall through to backfill;
    // we use backfill mode explicitly to test the legacy path.
    const result = await core.runCapability(
      'cdr.feature.link',
      { feature: 'payment-refactor', mode: 'backfill' },
      c(tmp)
    );
    assert.equal(result.result.data.assets_tagged, 4, 'backfill tags all four pre-existing artifacts');
    assert.equal(result.result.data.mode, 'backfill');

    assert.match(readFileSync(join(profileDir, 'sample-app.yaml'), 'utf8'), /created_by_feature: payment-refactor/);
    assert.match(readFileSync(join(domainDir, 'transaction.yaml'), 'utf8'), /created_by_feature: payment-refactor/);
    assert.match(readFileSync(join(capDir, 'product-map.yaml'), 'utf8'), /created_by_feature: payment-refactor/);
    assert.match(readFileSync(join(ruleDir, 'order-amount-positive.yaml'), 'utf8'), /created_by_feature: payment-refactor/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.feature.link (audit mode): falls through to backfill when audit log has no v0.10 entries for this feature', async () => {
  const tmp = await setupWorkspace();
  try {
    // Pre-existing artifact with no created_by_feature, no audit entries.
    const profileDir = join(tmp, 'docs/as-is/profiles');
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(join(profileDir, 'sample-app.yaml'), 'repo: sample-app\nlanguage: typescript\n');

    // Audit mode should fall through to backfill and tag the pre-existing artifact.
    const result = await core.runCapability(
      'cdr.feature.link',
      { feature: 'payment-refactor', mode: 'audit' },
      c(tmp)
    );
    assert.ok(result.result.data.assets_tagged >= 1, 'audit mode falls through to backfill and tags pre-existing artifacts');

    const profileDoc = readFileSync(join(profileDir, 'sample-app.yaml'), 'utf8');
    assert.match(profileDoc, /created_by_feature: payment-refactor/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Result observability
// ---------------------------------------------------------------------------

test('cdr.feature.link: result includes mode for observability', async () => {
  const tmp = await setupWorkspace();
  try {
    const auditResult = await core.runCapability(
      'cdr.feature.link',
      { feature: 'payment-refactor', mode: 'audit' },
      c(tmp)
    );
    assert.equal(auditResult.result.data.mode, 'audit');

    const backfillResult = await core.runCapability(
      'cdr.feature.link',
      { feature: 'payment-refactor', mode: 'backfill' },
      c(tmp)
    );
    assert.equal(backfillResult.result.data.mode, 'backfill');

    // Default mode is audit when not specified.
    const defaultResult = await core.runCapability(
      'cdr.feature.link',
      { feature: 'payment-refactor' },
      c(tmp)
    );
    assert.equal(defaultResult.result.data.mode, 'audit');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
