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
 * 5 test cases:
 *   1. empty workspace → first-run initializes it and writes no sample artifacts
 *   2. empty workspace + `--with-samples` → sample artifacts are seeded
 *   3. re-run on existing workspace is idempotent (no overwrite, no error)
 *   4. existing workspace with seeded cognitive/ is preserved (no re-seed)
 *   5. round 1 regression: portal generation still works end-to-end
 *
 * Sample seeding is opt-in (`--with-samples`): the bootstrap no longer copies
 * the test fixtures into a user workspace by default.
 */

function runFirstRun(cwd, args = []) {
  return execFileSync('node', [FIRST_RUN, ...args], {
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

test('first-run on empty workspace initializes it without writing sample artifacts', () => {
  const workspace = emptyWorkspace();
  try {
    // S1: detect workspace — must contain repos/ or .dapei/. Pre-create empty dirs
    // so S3 passes.
    mkdirSync(join(workspace, 'repos'), { recursive: true });
    mkdirSync(join(workspace, 'docs'), { recursive: true });
    mkdirSync(join(workspace, 'features'), { recursive: true });

    const out = runFirstRun(workspace);

    // S4 creates .dapei/cognitive/; S5 must not touch it unless --with-samples.
    const cog = join(workspace, '.dapei/cognitive');
    assert.ok(existsSync(cog), `cognitive dir missing: ${cog}`);
    assert.deepEqual(readdirSync(cog), [], 'default run must not seed sample artifacts');
    assert.match(out, /S5: seed sample artifacts \(opt-in\)/);
    assert.match(out, /pass --with-samples/);
    assert.match(out, /workspace:/);
    assert.match(out, /done/);

    // S7 produces the portal
    assert.ok(existsSync(join(workspace, '.dapei/docs-portal')), 'portal not generated');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('first-run --with-samples seeds the sample CDR artifacts', () => {
  const workspace = emptyWorkspace();
  try {
    mkdirSync(join(workspace, 'repos'), { recursive: true });
    mkdirSync(join(workspace, 'docs'), { recursive: true });
    mkdirSync(join(workspace, 'features'), { recursive: true });

    const out = runFirstRun(workspace, ['--with-samples']);

    const cog = join(workspace, '.dapei/cognitive');
    const cogEntries = readdirSync(cog);
    assert.ok(cogEntries.length > 0, 'cognitive dir empty after --with-samples');
    // Fixture has behavior/order-create.yaml — verify it landed
    const orderCreate = join(cog, 'behavior/order-create.yaml');
    assert.ok(existsSync(orderCreate), `expected fixture file missing: ${orderCreate}`);
    assert.match(out, /seeded from/);
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

    // First run: seeds (samples are opt-in)
    runFirstRun(workspace, ['--with-samples']);
    const cog = join(workspace, '.dapei/cognitive');
    const firstEntries = readdirSync(cog);
    assert.ok(firstEntries.length > 0, 'first-run did not seed');

    // Add a user file to cognitive/ that should NOT be overwritten
    const userFile = join(cog, 'user-custom.yaml');
    writeFileSync(userFile, 'id: user-custom\nrepo: user-repo\n');
    const beforeSecond = readFileSync(userFile, 'utf8');

    // Second run: should be no-op on cognitive/ contents (per D4)
    runFirstRun(workspace, ['--with-samples']);

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

    const out = runFirstRun(workspace, ['--with-samples']);

    // S5 emits "not empty" + "skip seed" messages
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
    const core = await import('../../packages/catalog/src/index.ts');
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
