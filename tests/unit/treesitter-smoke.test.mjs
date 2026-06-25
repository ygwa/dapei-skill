import test from 'node:test';
import assert from 'node:assert/strict';
import { TreeSitterCodeMapAdapter } from '../../packages/runtime-adapters/src/treesitter/index.ts';
import { mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_SRC = join(__dirname, '..', 'fixtures', 'treesitter');

async function seedRepo() {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ts-smoke-'));
  const repoRoot = join(tmp, 'repos', 'sample');
  cpSync(FIXTURE_SRC, repoRoot, { recursive: true });
  return { tmp, repoRoot, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// Phase 1 acceptance: four grammars parse baseline fixtures cleanly
// ---------------------------------------------------------------------------

test('typescript baseline fixture parses with parse_status=clean', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'typescript/sample.ts');
    assert.equal(r.parse_status, 'clean', `expected clean, got ${r.parse_status} (${r.parse_diagnostic})`);
    assert.equal(r.language, 'typescript');
    const classNames = r.symbols.filter((s) => s.kind === 'class').map((s) => s.name);
    assert.ok(classNames.includes('OrderController'), `expected OrderController in ${classNames.join(',')}`);
    assert.ok(classNames.includes('Foo'), `expected default-export Foo in ${classNames.join(',')}`);
  } finally { cleanup(); }
});

test('tsx fixture parses with parse_status=clean (JSX not confused for comparison)', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'typescript/sample.tsx');
    assert.equal(r.parse_status, 'clean', `tsx should parse cleanly: ${r.parse_diagnostic}`);
    assert.equal(r.language, 'typescript');
    // Self-closing <Foo /> should NOT produce an ERROR node
    const fc = r.symbols.filter((s) => s.kind === 'function').map((s) => s.name);
    assert.ok(fc.includes('Foo'), `expected function Foo: ${fc.join(',')}`);
  } finally { cleanup(); }
});

test('javascript baseline fixture parses with parse_status=clean', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'javascript/sample.js');
    assert.equal(r.parse_status, 'clean');
    assert.equal(r.language, 'javascript');
    const methods = r.symbols.filter((s) => s.kind === 'method').map((s) => s.name);
    assert.ok(methods.includes('findById'), `expected method findById: ${methods.join(',')}`);
  } finally { cleanup(); }
});

test('python baseline fixture parses with parse_status=clean', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'python/sample.py');
    assert.equal(r.parse_status, 'clean');
    assert.equal(r.language, 'python');
    const fns = r.symbols.filter((s) => s.kind === 'function').map((s) => s.name);
    assert.ok(fns.includes('get_orders'), `expected function get_orders: ${fns.join(',')}`);
  } finally { cleanup(); }
});

test('java baseline fixture parses with parse_status=clean', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'java/Sample.java');
    assert.equal(r.parse_status, 'clean', `expected clean: ${r.parse_diagnostic}`);
    assert.equal(r.language, 'java');
    const classes = r.symbols.filter((s) => s.kind === 'class').map((s) => s.name);
    assert.ok(classes.includes('OrderController'), `expected class OrderController: ${classes.join(',')}`);
    assert.ok(classes.includes('OrderRecord'), `expected Java record captured as class: ${classes.join(',')}`);
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// Phase 1 acceptance: broken fixtures produce parse_status=partial
// ---------------------------------------------------------------------------

test('typescript broken fixture produces parse_status=partial', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'typescript/broken.ts');
    assert.equal(r.parse_status, 'partial');
    assert.match(r.parse_diagnostic || '', /ERROR|MISSING|partial/);
  } finally { cleanup(); }
});

test('javascript broken fixture produces parse_status=partial', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'javascript/broken.js');
    assert.equal(r.parse_status, 'partial');
  } finally { cleanup(); }
});

test('java broken fixture produces parse_status=partial', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'java/Broken.java');
    assert.equal(r.parse_status, 'partial');
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// Phase 1 acceptance: unsupported extension → parse_status=unsupported
// ---------------------------------------------------------------------------

test('unsupported extension produces parse_status=unsupported', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ts-unsup-'));
  try {
    const repoRoot = join(tmp, 'repos', 'sample');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(repoRoot, { recursive: true });
    writeFileSync(join(repoRoot, 'opaque.xyz'), 'this is not a recognized language');
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'opaque.xyz');
    assert.equal(r.parse_status, 'unsupported');
    assert.equal(r.language, 'unsupported');
    assert.equal(r.symbols.length, 0);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Phase 1 acceptance: cold-start ≤ 500 ms (per plan §1.3 budget)
// ---------------------------------------------------------------------------

test('cold-start across all four grammars ≤ 500 ms', () => {
  const t0 = performance.now();
  const adapter = new TreeSitterCodeMapAdapter();
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 500, `cold start ${elapsed.toFixed(0)}ms exceeded 500ms budget`);
  // The doctor reports the actual cold-start measurement
  const doc = adapter.fullDoctor();
  assert.equal(doc.backend, 'native');
  assert.deepEqual(doc.languages.sort(), ['java', 'javascript', 'python', 'typescript']);
});