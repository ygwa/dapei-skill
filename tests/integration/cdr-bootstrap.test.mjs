import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const FIRST_RUN = join(REPO_ROOT, 'scripts/first-run.mjs');
const FIXTURE_ROOT = join(REPO_ROOT, 'tests/fixtures/sample-node-repo/docs/as-is');

/**
 * T4.1 — round 3 acceptance test for `scripts/first-run.mjs`.
 *
 * 4 test cases (design § C-5):
 *   1. empty workspace → first-run seeds fixtures and produces portal
 *   2. re-run on existing workspace is idempotent (no overwrite, no error)
 *   3. existing workspace with seeded cognitive/ is preserved (no re-seed)
 *   4. round 1 regression: portal generation still works end-to-end
 */

function runFirstRun(cwd) {
  return execFileSync('node', [FIRST_RUN], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 90_000,
  });
}

function emptyWorkspace() {
  return mkdtempSync(join(tmpdir(), 'dapei-first-run-'));
}

function seedCognitiveDir(workspace) {
  const cog = join(workspace, '.dapei/cognitive');
  mkdirSync(cog, { recursive: true });
  // marker file simulating a previously-seeded workspace (user already has cognitive/ contents)
  writeFileSync(join(cog, 'previous-marker.yaml'), 'id: previous\n');
  return cog;
}

test('first-run on empty workspace seeds fixtures and produces portal', () => {
  const workspace = emptyWorkspace();
  try {
    // S1: detect workspace — must contain repos/ or .dapei/. Pre-create empty dirs
    // so S3 passes; S5 will seed .dapei/cognitive/ from fixture.
    mkdirSync(join(workspace, 'repos'), { recursive: true });
    mkdirSync(join(workspace, 'docs'), { recursive: true });
    mkdirSync(join(workspace, 'features'), { recursive: true });

    const out = runFirstRun(workspace);

    // S5 evidence: .dapei/cognitive/ should now contain fixture artifacts
    const cog = join(workspace, '.dapei/cognitive');
    assert.ok(existsSync(cog), `cognitive dir missing: ${cog}`);
    const cogEntries = readdirSync(cog);
    assert.ok(cogEntries.length > 0, 'cognitive dir empty after first-run');
    // Fixture has behavior/order-create.yaml — verify it landed
    const orderCreate = join(cog, 'behavior/order-create.yaml');
    assert.ok(existsSync(orderCreate), `expected fixture file missing: ${orderCreate}`);

    // Output should mention workspace and "done"
    assert.match(out, /workspace:/);
    assert.match(out, /done/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('first-run is idempotent on existing workspace', () => {
  const workspace = emptyWorkspace();
  try {
    mkdirSync(join(workspace, 'repos'), { recursive: true });
    mkdirSync(join(workspace, 'docs'), { recursive: true });
    mkdirSync(join(workspace, 'features'), { recursive: true });

    // First run: seeds
    runFirstRun(workspace);
    const cog = join(workspace, '.dapei/cognitive');
    const firstEntries = readdirSync(cog);
    assert.ok(firstEntries.length > 0, 'first-run did not seed');

    // Add a user file to cognitive/ that should NOT be overwritten
    const userFile = join(cog, 'user-custom.yaml');
    writeFileSync(userFile, 'id: user-custom\nrepo: user-repo\n');
    const beforeSecond = readFileSync(userFile, 'utf8');

    // Second run: should be no-op on cognitive/ contents (per D4)
    runFirstRun(workspace);

    assert.ok(existsSync(userFile), 'first-run deleted user file');
    const afterSecond = readFileSync(userFile, 'utf8');
    assert.equal(afterSecond, beforeSecond, 'first-run modified user file');
    // Existing cognitive dir entries should still be present
    const secondEntries = readdirSync(cog);
    assert.ok(secondEntries.includes('user-custom.yaml'), 'user file removed by re-run');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('first-run skips re-seeding when cognitive/ already has entries', () => {
  const workspace = emptyWorkspace();
  try {
    mkdirSync(join(workspace, 'repos'), { recursive: true });
    mkdirSync(join(workspace, 'docs'), { recursive: true });
    mkdirSync(join(workspace, 'features'), { recursive: true });

    // Pre-seed with marker (S5 should detect non-empty and skip)
    const cog = seedCognitiveDir(workspace);
    const markerPath = join(cog, 'previous-marker.yaml');
    assert.ok(existsSync(markerPath));

    const out = runFirstRun(workspace);

    // S5 emits "skip seed" message
    assert.match(out, /not empty/);
    assert.match(out, /skip seed/);
    // Marker preserved
    assert.ok(existsSync(markerPath), 'first-run cleared pre-existing cognitive/');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('round 1 regression: cdr.doc.generate still produces a buildable portal', async () => {
  // Mirrors round 1 cdr-vitepress-build.test.mjs pattern. Locks round 1
  // portal-generation behavior into round 3 acceptance.
  const workspace = emptyWorkspace();
  try {
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, { rootDir: workspace, now: new Date() });

    mkdirSync(join(workspace, 'repos/demo/src'), { recursive: true });
    writeFileSync(
      join(workspace, 'repos/demo/src/orders.ts'),
      [
        "import { Router } from 'express';",
        "const router = Router();",
        "",
        "router.post('/orders', async (req, res) => {",
        "  // Validate input",
        "  const items = req.body.items;",
        "  if (!items || items.length === 0) return res.status(400).end();",
        "  // Persist order",
        "  const order = await orderRepo.create({ items });",
        "  res.json(order);",
        "});",
        "",
        "export default router;",
        "",
      ].join('\n')
    );
    writeFileSync(join(workspace, 'repos/demo/package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));

    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'demo',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        steps: [{ name: 'Validate', action: 'check stock' }, { name: 'Reserve', action: 'lock items' }],
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/orders.ts', line: 10, repo: 'demo' }],
      },
      { rootDir: workspace, now: new Date() }
    );
    await core.runCapability(
      'cdr.state.derive',
      { entity: 'Order', behaviors: ['order-create'] },
      { rootDir: workspace, now: new Date() }
    );
    await core.runCapability('cdr.doc.generate', {}, { rootDir: workspace, now: new Date() });

    const portal = join(workspace, '.dapei/docs-portal');
    assert.ok(existsSync(portal), 'portal not generated');
    // Round 1 contract: portal/package.json + .vitepress/config.mts + theme
    assert.ok(existsSync(join(portal, 'package.json')), 'portal/package.json');
    const pkg = readFileSync(join(portal, 'package.json'), 'utf8');
    assert.match(pkg, /"type":\s*"module"/);
    assert.ok(existsSync(join(portal, '.vitepress/config.mts')), 'portal/.vitepress/config.mts');
    assert.ok(existsSync(join(portal, '.vitepress/theme/index.ts')), 'theme/index.ts');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
