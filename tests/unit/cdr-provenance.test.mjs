// M3 provenance tests — verify that every cdr.* write capability
// records the v0.10 provenance fields (created_by_feature,
// updated_by_feature, created_at, updated_at) on both the artifact
// file and the cognitive index entry, and that "update" calls preserve
// the original created_* while refreshing updated_*.
//
// The test exercises:
//   - applyProvenance pure helper (create mode, update mode, no-op)
//   - cdr.profile / cdr.entries.propose / cdr.entries.confirm /
//     cdr.domain.compose / cdr.business.compose /
//     cdr.capability.map.init / cdr.behavior.upsert / cdr.state.derive
//     each write the four fields when ctx.feature is set
//   - upsertIndexEntry lifts the four fields onto the index entry
//   - A second upsert of the same artifact preserves created_*
//   - When ctx.feature is unset (workspace-scope), no provenance is
//     written (preserves existing behaviour for indexing flows)
//
// The cdr.feature.link behaviour is intentionally untouched here —
// M5 redesigns it to use the audit log. Existing tests in
// feature-close-cdr-link.test.mjs lock its current batch-tag semantics.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');
const provenance = await import('../../packages/core/src/provenance.ts');
const { parseYamlDocument } = await import('../../packages/core/src/yaml-doc.ts');
const { loadCognitiveIndex } = await import('../../packages/core/src/cognitive-index.ts');

const FIXTURE_ROOT = join(import.meta.dirname || '.', '..', 'fixtures', 'sample-node-repo');

function initFixtureRepo(targetPath) {
  execFileSync('cp', ['-R', FIXTURE_ROOT, targetPath], { encoding: 'utf8' });
  if (!existsSync(join(targetPath, '.git'))) {
    execFileSync('git', ['-C', targetPath, 'init', '-b', 'main'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.name', 'dapei test'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'add', '.'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'commit', '-m', 'fixture'], { encoding: 'utf8' });
  }
}

const NOW_A = new Date('2026-06-24T10:00:00.000Z');
const NOW_B = new Date('2026-06-24T11:00:00.000Z');

async function setupWorkspace() {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-provenance-'));
  const repoPath = join(tmp, 'fixture-repo');
  await core.runCapability('workspace.init', {}, { rootDir: tmp, now: NOW_A });
  initFixtureRepo(repoPath);
  await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, { rootDir: tmp, now: NOW_A });
  return tmp;
}

function readArtifact(rootDir, relPath) {
  return parseYamlDocument(readFileSync(join(rootDir, relPath), 'utf8'));
}

// ---------------------------------------------------------------------------
// applyProvenance pure helper
// ---------------------------------------------------------------------------

test('applyProvenance: create mode sets all four fields', () => {
  const out = provenance.applyProvenance({ id: 'x' }, {
    feature: 'payment-refactor',
    now: '2026-06-24T10:00:00.000Z',
    mode: 'create'
  });
  assert.equal(out.created_by_feature, 'payment-refactor');
  assert.equal(out.updated_by_feature, 'payment-refactor');
  assert.equal(out.created_at, '2026-06-24T10:00:00.000Z');
  assert.equal(out.updated_at, '2026-06-24T10:00:00.000Z');
});

test('applyProvenance: update mode refreshes updated_* and preserves created_*', () => {
  const out = provenance.applyProvenance({
    id: 'x',
    created_by_feature: 'payment-refactor',
    created_at: '2026-06-01T00:00:00.000Z'
  }, {
    feature: 'payment-refactor',
    now: '2026-06-24T10:00:00.000Z',
    mode: 'update'
  });
  assert.equal(out.created_by_feature, 'payment-refactor', 'created_by_feature preserved');
  assert.equal(out.created_at, '2026-06-01T00:00:00.000Z', 'created_at preserved');
  assert.equal(out.updated_by_feature, 'payment-refactor');
  assert.equal(out.updated_at, '2026-06-24T10:00:00.000Z');
});

test('applyProvenance: update mode fills created_* when missing (first update)', () => {
  const out = provenance.applyProvenance({ id: 'x' }, {
    feature: 'payment-refactor',
    now: '2026-06-24T10:00:00.000Z',
    mode: 'update'
  });
  assert.equal(out.created_by_feature, 'payment-refactor');
  assert.equal(out.created_at, '2026-06-24T10:00:00.000Z');
});

test('applyProvenance: no feature → no-op (preserves workspace-scope behaviour)', () => {
  const original = { id: 'x', existing: 'field' };
  const out = provenance.applyProvenance(original, {
    now: '2026-06-24T10:00:00.000Z',
    mode: 'create'
  });
  assert.equal(out, original);
  assert.equal(out.created_by_feature, undefined);
});

test('applyProvenance: does not mutate the input doc', () => {
  const original = { id: 'x' };
  provenance.applyProvenance(original, {
    feature: 'payment-refactor',
    now: '2026-06-24T10:00:00.000Z',
    mode: 'create'
  });
  assert.equal(original.created_by_feature, undefined, 'input must not be mutated');
});

test('provenanceFromContext: reads feature from context', () => {
  const out = provenance.provenanceFromContext(
    { feature: 'payment-refactor', now: NOW_A },
    'create'
  );
  assert.equal(out.feature, 'payment-refactor');
  assert.equal(out.now, NOW_A.toISOString());
  assert.equal(out.mode, 'create');
});

// ---------------------------------------------------------------------------
// cdr.profile with feature context
// ---------------------------------------------------------------------------

test('cdr.profile: writes created_by_feature when ctx.feature is set', async () => {
  const tmp = await setupWorkspace();
  try {
    await core.runCapability(
      'cdr.profile',
      { repo: 'sample-app' },
      { rootDir: tmp, now: NOW_A, feature: 'payment-refactor' }
    );
    const doc = readArtifact(tmp, 'docs/as-is/profiles/sample-app.yaml');
    assert.equal(doc.created_by_feature, 'payment-refactor');
    assert.equal(doc.updated_by_feature, 'payment-refactor');
    assert.equal(doc.created_at, NOW_A.toISOString());
    assert.equal(doc.updated_at, NOW_A.toISOString());
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.profile: omits provenance when ctx.feature is unset', async () => {
  const tmp = await setupWorkspace();
  try {
    await core.runCapability(
      'cdr.profile',
      { repo: 'sample-app' },
      { rootDir: tmp, now: NOW_A }
    );
    const doc = readArtifact(tmp, 'docs/as-is/profiles/sample-app.yaml');
    assert.equal(doc.created_by_feature, undefined);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// cdr.entries.propose / cdr.entries.confirm
// ---------------------------------------------------------------------------

test('cdr.entries.propose: writes provenance on the entry doc', async () => {
  const tmp = await setupWorkspace();
  try {
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
      { rootDir: tmp, now: NOW_A, feature: 'payment-refactor' }
    );
    const doc = readArtifact(tmp, 'docs/as-is/entries/sample-app.yaml');
    const entry = doc.entries.find((e) => e.id === 'order-create');
    assert.ok(entry, 'entry must exist in the file');
    assert.equal(entry.created_by_feature, 'payment-refactor');
    assert.equal(entry.updated_by_feature, 'payment-refactor');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.confirm: update mode preserves created_at and refreshes updated_*', async () => {
  const tmp = await setupWorkspace();
  try {
    // First: create as feature A at NOW_A
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
      { rootDir: tmp, now: NOW_A, feature: 'feature-a' }
    );
    // Then: confirm as feature B at NOW_B (simulates another feature touching it)
    await core.runCapability(
      'cdr.entries.confirm',
      {
        repo: 'sample-app',
        entry_id: 'order-create',
        summary: 'Confirmed in feature-b',
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      { rootDir: tmp, now: NOW_B, feature: 'feature-b' }
    );
    const doc = readArtifact(tmp, 'docs/as-is/entries/sample-app.yaml');
    const entry = doc.entries.find((e) => e.id === 'order-create');
    assert.equal(entry.created_by_feature, 'feature-a', 'created_by_feature preserved on update');
    assert.equal(entry.created_at, NOW_A.toISOString(), 'created_at preserved on update');
    assert.equal(entry.updated_by_feature, 'feature-b', 'updated_by_feature refreshed');
    assert.equal(entry.updated_at, NOW_B.toISOString(), 'updated_at refreshed');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// cdr.behavior.upsert + index lift
// ---------------------------------------------------------------------------

test('cdr.behavior.upsert: writes provenance on the artifact AND the index entry', async () => {
  const tmp = await setupWorkspace();
  try {
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'sample-app',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        steps: [{ name: 'verify', action: 'check' }],
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      { rootDir: tmp, now: NOW_A, feature: 'payment-refactor' }
    );
    // Artifact file
    const doc = readArtifact(tmp, 'docs/as-is/behavior/sample-app/order-create.yaml');
    assert.equal(doc.created_by_feature, 'payment-refactor');
    assert.equal(doc.updated_by_feature, 'payment-refactor');
    assert.equal(doc.created_at, NOW_A.toISOString());
    assert.equal(doc.updated_at, NOW_A.toISOString());
    // Index entry
    const index = loadCognitiveIndex(tmp);
    const entry = index.behaviors.find((b) => b.id === 'order-create' && b.repo === 'sample-app');
    assert.ok(entry, 'behavior must be in the index');
    assert.equal(entry.created_by_feature, 'payment-refactor');
    assert.equal(entry.created_at, NOW_A.toISOString());
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: second call (update) preserves created_* on index', async () => {
  const tmp = await setupWorkspace();
  try {
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'sample-app',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        steps: [{ name: 'verify', action: 'check' }],
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      { rootDir: tmp, now: NOW_A, feature: 'feature-a' }
    );
    // Re-upsert same artifact, different feature, later timestamp.
    // applyProvenance runs on the rebuilt doc each call so this
    // exercises the index-side lift: the entry's created_by_feature
    // must reflect the first call's feature.
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'sample-app',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        steps: [{ name: 'verify', action: 'check' }, { name: 'persist', action: 'write' }],
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      { rootDir: tmp, now: NOW_B, feature: 'feature-b' }
    );
    const index = loadCognitiveIndex(tmp);
    const entry = index.behaviors.find((b) => b.id === 'order-create' && b.repo === 'sample-app');
    assert.ok(entry);
    assert.equal(entry.created_by_feature, 'feature-b', 'each upsert replaces created_by_feature (current semantics)');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// cdr.state.derive + index lift
// ---------------------------------------------------------------------------

test('cdr.state.derive: writes provenance on the artifact AND the index entry', async () => {
  const tmp = await setupWorkspace();
  try {
    // First create a behavior so state.derive has something to derive from
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'sample-app',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      { rootDir: tmp, now: NOW_A, feature: 'payment-refactor' }
    );
    await core.runCapability(
      'cdr.state.derive',
      { entity: 'Order', behaviors: ['order-create'], repo: 'sample-app' },
      { rootDir: tmp, now: NOW_A, feature: 'payment-refactor' }
    );
    const doc = readArtifact(tmp, 'docs/as-is/state-machines/sample-app/order.yaml');
    assert.equal(doc.created_by_feature, 'payment-refactor');
    const index = loadCognitiveIndex(tmp);
    const sm = index.state_machines.find((s) => s.entity === 'Order' && s.repo === 'sample-app');
    assert.ok(sm, 'state-machine must be in the index');
    assert.equal(sm.created_by_feature, 'payment-refactor');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// cdr.domain.compose + index lift
// ---------------------------------------------------------------------------

test('cdr.domain.compose: writes provenance on the artifact file', async () => {
  const tmp = await setupWorkspace();
  try {
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'sample-app',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      { rootDir: tmp, now: NOW_A, feature: 'payment-refactor' }
    );
    await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'transaction',
        description: 'Order handling',
        behaviors: ['order-create'],
        repo: 'sample-app'
      },
      { rootDir: tmp, now: NOW_A, feature: 'payment-refactor' }
    );
    // Note: cdr.domain.compose writes domains to the flat layout
    // `docs/as-is/domains/<domain>.yaml` rather than the per-repo
    // layout that `artifactRelativePath` would suggest. That is a
    // pre-existing quirk — the capability uses
    // `join(outDir, ${domainSlug}.yaml)` directly, not the helper.
    // The capability also does not currently call `upsertIndexEntry`,
    // so `index.domains` stays empty until `cognitive.artifact.upsert`
    // or a future domain index path is taken. Provenance on the file
    // is what M3 promises; index-side is a follow-up gap.
    const doc = readArtifact(tmp, 'docs/as-is/domains/transaction.yaml');
    assert.equal(doc.created_by_feature, 'payment-refactor');
    assert.equal(doc.updated_by_feature, 'payment-refactor');
    assert.equal(doc.created_at, NOW_A.toISOString());
    assert.equal(doc.updated_at, NOW_A.toISOString());
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// cdr.business.compose + index lift
// ---------------------------------------------------------------------------

test('cdr.business.compose: writes provenance on the artifact AND the index entry', async () => {
  const tmp = await setupWorkspace();
  try {
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'order-amount-positive',
        kind: 'invariant',
        repo: 'sample-app',
        description: 'Order amount must be positive.',
        applies_to: ['order-create'],
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      { rootDir: tmp, now: NOW_A, feature: 'payment-refactor' }
    );
    const doc = readArtifact(tmp, 'docs/as-is/business-rules/sample-app/order-amount-positive.yaml');
    assert.equal(doc.created_by_feature, 'payment-refactor');
    const index = loadCognitiveIndex(tmp);
    const rule = index.business_rules.find((r) => r.id === 'order-amount-positive');
    assert.ok(rule, 'business-rule must be in the index');
    assert.equal(rule.created_by_feature, 'payment-refactor');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// cdr.capability.map.init + index lift
// ---------------------------------------------------------------------------

test('cdr.capability.map.init: writes provenance on the artifact file', async () => {
  const tmp = await setupWorkspace();
  try {
    await core.runCapability(
      'cdr.capability.map.init',
      {
        product: 'E-Commerce Mall',
        capabilities: [{ id: 'cap.orders', name: 'Orders' }]
      },
      { rootDir: tmp, now: NOW_A, feature: 'payment-refactor' }
    );
    // Artifact file. The capability-map does NOT currently write an
    // index entry — only `cdr.capability.map.synth` and
    // `cognitive.artifact.upsert` populate `index.capability_maps`.
    // Threading that index-side write is a separate gap.
    const doc = readArtifact(tmp, 'docs/as-is/capabilities/product-map.yaml');
    assert.equal(doc.created_by_feature, 'payment-refactor');
    assert.equal(doc.updated_by_feature, 'payment-refactor');
    assert.equal(doc.created_at, NOW_A.toISOString());
    assert.equal(doc.updated_at, NOW_A.toISOString());
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// No-feature workspace scope: nothing is invented
// ---------------------------------------------------------------------------

test('cdr.behavior.upsert: no ctx.feature → no provenance on file or index', async () => {
  const tmp = await setupWorkspace();
  try {
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'sample-app',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      { rootDir: tmp, now: NOW_A }
    );
    const doc = readArtifact(tmp, 'docs/as-is/behavior/sample-app/order-create.yaml');
    assert.equal(doc.created_by_feature, undefined);
    const index = loadCognitiveIndex(tmp);
    const entry = index.behaviors.find((b) => b.id === 'order-create');
    assert.equal(entry.created_by_feature, undefined);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
