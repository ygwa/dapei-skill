import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DOC_GEN_NM = join(REPO_ROOT, 'packages/doc-gen/node_modules');
const VP_BIN = join(DOC_GEN_NM, 'vitepress/bin/vitepress.js');

const core = await import('../../packages/core/src/index.ts');

async function generatePortalInTmp() {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-vp-int-'));
  await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

  // v0.3: create a real `demo` repo with src/orders.ts so the evidence
  // validator (P1 red line) accepts the file:line pointer.
  const repoDir = join(tmp, 'repos', 'demo');
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(join(repoDir, 'src'), { recursive: true });
  const ordersContent = [
    "import { Router } from 'express';",
    "const router = Router();",
    "",
    "router.post('/orders', async (req, res) => {",
    "  // Validate input",
    "  const items = req.body.items;",
    "  if (!items || items.length === 0) return res.status(400).end();",
    "  // Reserve stock",
    "  await stockService.lockItems(items);",
    "  // Persist order",
    "  const order = await orderRepo.create({ items });",
    "  res.json(order);",
    "});",
    "",
    "export default router;",
    ""
  ].join("\n");
  writeFileSync(join(repoDir, 'src', 'orders.ts'), ordersContent);
  writeFileSync(join(repoDir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));

  await core.runCapability('cdr.behavior.upsert', {
    id: 'order-create', repo: 'demo', entry: { type: 'api', method: 'POST', path: '/orders' },
    steps: [{ name: 'Validate', action: 'check stock' }, { name: 'Reserve', action: 'lock items' }],
    confidence: { level: 'high', kind: 'fact' },
    sources: [{ file: 'src/orders.ts', line: 10, repo: 'demo' }]
  }, { rootDir: tmp, now: new Date() });
  await core.runCapability('cdr.state.derive', { entity: 'Order', behaviors: ['order-create'] }, { rootDir: tmp, now: new Date() });
  await core.runCapability('cdr.doc.generate', {}, { rootDir: tmp, now: new Date() });
  return tmp;
}

test('cdr e2e: doc.gen emits theme + Vue components', async () => {
  const tmp = await generatePortalInTmp();
  try {
    const portal = join(tmp, '.dapei/docs-portal');
    assert.ok(existsSync(join(portal, 'package.json')), 'portal/package.json');
    const pkg = readFileSync(join(portal, 'package.json'), 'utf8');
    assert.match(pkg, /"type":\s*"module"/);

    assert.ok(existsSync(join(portal, '.vitepress/config.mts')), 'portal/.vitepress/config.mts');
    assert.ok(existsSync(join(portal, '.vitepress/theme/index.ts')), 'theme/index.ts');
    for (const c of ['BehaviorFlow.vue', 'StateMachine.vue', 'CodeLink.vue']) {
      assert.ok(existsSync(join(portal, '.vitepress/theme/components', c)), `theme/components/${c}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr e2e: vitepress build produces static HTML with all sections', async () => {
  if (!existsSync(VP_BIN)) {
    // Skip silently if vitepress not installed in this environment
    return;
  }
  const tmp = await generatePortalInTmp();
  const portal = join(tmp, '.dapei/docs-portal');
  try {
    // Symlink packages/doc-gen/node_modules so vitepress can be resolved
    symlinkSync(DOC_GEN_NM, join(portal, 'node_modules'), 'dir');
    execFileSync('node', [VP_BIN, 'build', portal], { encoding: 'utf8', stdio: 'pipe' });

    const dist = join(portal, '.vitepress/dist');
    assert.ok(existsSync(join(dist, 'index.html')));
    assert.ok(existsSync(join(dist, 'behaviors/demo/order-create.html')));
    assert.ok(existsSync(join(dist, 'states/order.html')));

    // Vue components must be referenced in the built JS bundles
    const assetFiles = readdirSync(join(dist, 'assets')).filter((f) => /\.(js|css)$/.test(f));
    const allAssets = assetFiles.map((f) => readFileSync(join(dist, 'assets', f), 'utf8')).join('\n');
    assert.match(allAssets, /BehaviorFlow/, 'BehaviorFlow component must appear in built bundle');
    assert.match(allAssets, /StateMachine/, 'StateMachine component must appear in built bundle');
    assert.match(allAssets, /CodeLink/, 'CodeLink component must appear in built bundle');

    // The behavior page bundle must contain the embedded step data
    const jsFiles = assetFiles.filter((f) => f.endsWith('.js'));
    const orderBundle = jsFiles
      .map((f) => ({ f, content: readFileSync(join(dist, 'assets', f), 'utf8') }))
      .find((x) => x.f.includes('behaviors_demo_order-create.md'))?.content || '';
    assert.match(orderBundle, /Validate/, 'step name must be embedded in page bundle');
    assert.match(orderBundle, /check stock/, 'step action must be embedded in page bundle');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// v0.10 — the sanitizeMarkdownPage post-pass escapes raw `<name>` text in
// free-form prose (descriptions, summaries, entry values, table cells) so
// that VitePress's HTML tokenizer does not latch onto it as an unclosed
// element. Without this, vitepress build fails with "Element is missing end
// tag" the moment a description contains something like `<feature>` or a
// writes.target contains `<repo>`. This regression test exercises the path
// end-to-end: upsert a behavior whose writes.target contains `<repo>`,
// generate the portal, and require vitepress build to succeed.
test('cdr e2e: portal sanitizes angle-bracket text in prose + still builds', async () => {
  if (!existsSync(VP_BIN)) return; // skip silently if vitepress not installed

  const tmp = mkdtempSync(join(tmpdir(), 'dapei-vp-sanitize-'));
  await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
  const repoDir = join(tmp, 'repos', 'demo');
  mkdirSync(join(repoDir, 'src'), { recursive: true });
  const ordersContent = [
    "import { Router } from 'express';",
    "const router = Router();",
    "",
    "router.post('/orders', async (req, res) => {",
    "  res.json({});",
    "});",
    "export default router;",
    ""
  ].join("\n");
  writeFileSync(join(repoDir, 'src', 'orders.ts'), ordersContent);
  writeFileSync(join(repoDir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));

  // The schema only accepts writes/events/calls as free-text carriers.
  // writes.target containing `<repo>` is the realistic angle-bracket
  // exposure path that previously tripped vitepress build when followed by
  // a `<CodeLink>` tag in another section.
  await core.runCapability('cdr.behavior.upsert', {
    id: 'feature-gate',
    repo: 'demo',
    entry: { type: 'api', method: 'POST', path: '/orders' },
    writes: [{ table: 'docs/decisions/<repo>-decisions.md', operation: 'insert' }],
    calls: [{ target: 'commit', protocol: 'http' }],
    confidence: { level: 'high', kind: 'fact' },
    sources: [{ file: 'src/orders.ts', line: 5, repo: 'demo' }]
  }, { rootDir: tmp, now: new Date() });
  await core.runCapability('cdr.doc.generate', {}, { rootDir: tmp, now: new Date() });

  const portal = join(tmp, '.dapei/docs-portal');
  const behaviorMdPath = join(portal, 'behaviors/demo/feature-gate.md');
  const behaviorMd = readFileSync(behaviorMdPath, 'utf8');

  // After sanitize, the raw <repo> prose must be entity-escaped.
  assert.match(behaviorMd, /&lt;repo&gt;/, '<repo> text must be escaped');

  // The Vue component tags we deliberately emit must remain intact so the
  // VitePress build can still register them.
  assert.match(behaviorMd, /<CodeLink\b/, 'CodeLink tag must remain un-escaped');

  // And the whole portal must actually build without "Element is missing end tag".
  symlinkSync(DOC_GEN_NM, join(portal, 'node_modules'), 'dir');
  let buildError = null;
  try {
    execFileSync('node', [VP_BIN, 'build', portal], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    buildError = (e.stderr || e.stdout || '').toString();
  }
  assert.equal(buildError, null, `vitepress build failed:\n${buildError}`);

  rmSync(tmp, { recursive: true, force: true });
});
