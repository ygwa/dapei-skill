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
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ts-decorators-'));
  const repoRoot = join(tmp, 'repos', 'sample');
  cpSync(FIXTURE_SRC, repoRoot, { recursive: true });
  return { tmp, repoRoot, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// TS decorator attach — class-level AND method-level
// Per tree-sitter-typescript#309: decorators sit as siblings inside
// `class_body` (for methods) and as siblings of `class_declaration` in
// `export_statement` (for classes). Both positions must be captured.
// ---------------------------------------------------------------------------

test('TS class-level decorator is captured on the class (export_statement sibling)', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'typescript/sample.ts');
    const cls = r.symbols.find((s) => s.kind === 'class' && s.name === 'OrderController');
    assert.ok(cls, `expected OrderController class symbol`);
    assert.ok(cls.decorators && cls.decorators.length > 0, `expected decorators on OrderController, got ${JSON.stringify(cls.decorators)}`);
    assert.ok(cls.decorators[0].startsWith('Controller'), `expected Controller decorator, got ${cls.decorators[0]}`);
  } finally { cleanup(); }
});

test('TS method-level decorators are captured on the method (class_body sibling)', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'typescript/sample.ts');
    const method = r.symbols.find((s) => s.kind === 'method' && s.name === 'getOrder');
    assert.ok(method, `expected getOrder method symbol`);
    assert.ok(method.decorators && method.decorators.length > 0, `expected decorators on getOrder`);
    assert.ok(method.decorators[0].startsWith('Get'), `expected Get decorator, got ${method.decorators[0]}`);
  } finally { cleanup(); }
});

test('TS entry_candidates are populated for class+methods with decorators', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'typescript/sample.ts');
    assert.ok(r.entry_candidates && r.entry_candidates.length >= 3,
      `expected ≥3 entry candidates (class+2 methods), got ${(r.entry_candidates || []).length}`);
    const handles = r.entry_candidates.map((e) => e.symbol);
    assert.ok(handles.includes('OrderController'), `expected OrderController handle in ${handles.join(',')}`);
    assert.ok(handles.includes('getOrder') || handles.some((h) => h.endsWith('#getOrder')),
      `expected getOrder handle (possibly qualified), got ${handles.join(',')}`);
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// Python decorator attach — preceding sibling of function_definition / class_definition
// ---------------------------------------------------------------------------

test('Python class decorator @dataclass is captured on the class', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'python/sample.py');
    const cls = r.symbols.find((s) => s.kind === 'class' && s.name === 'Order');
    assert.ok(cls, `expected Order class symbol`);
    assert.deepEqual(cls.decorators, ['dataclass']);
  } finally { cleanup(); }
});

test('Python function decorator @app.get is captured on the function', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'python/sample.py');
    const fn = r.symbols.find((s) => s.kind === 'function' && s.name === 'get_orders');
    assert.ok(fn, `expected get_orders function symbol`);
    assert.ok(fn.decorators && fn.decorators.length === 1);
    assert.ok(fn.decorators[0].startsWith('app.get'), `expected app.get decorator, got ${fn.decorators[0]}`);
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// Java annotation attach — child of `modifiers` (positional child[0])
// tree-sitter-java does NOT expose modifiers via childForFieldName;
// we iterate positional children.
// ---------------------------------------------------------------------------

test('Java class annotation @RestController is captured on the class', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'java/Sample.java');
    const cls = r.symbols.find((s) => s.kind === 'class' && s.name === 'OrderController');
    assert.ok(cls, `expected OrderController class symbol`);
    assert.ok(cls.decorators && cls.decorators.length > 0, `expected decorators on OrderController`);
    assert.equal(cls.decorators[0], 'RestController');
  } finally { cleanup(); }
});

test('Java method annotation @GetMapping is captured on the method', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'java/Sample.java');
    const method = r.symbols.find((s) => s.kind === 'method' && s.name === 'getOrder');
    assert.ok(method, `expected getOrder method symbol`);
    assert.deepEqual(method.decorators, ['GetMapping']);
  } finally { cleanup(); }
});

test('Java record declaration is captured as a class symbol', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'java/Sample.java');
    const record = r.symbols.find((s) => s.kind === 'class' && s.name === 'OrderRecord');
    assert.ok(record, `expected OrderRecord (Java record) captured as class symbol`);
  } finally { cleanup(); }
});

test('Java @interface annotation type is captured as interface symbol', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'java/Sample.java');
    const iface = r.symbols.find((s) => s.kind === 'interface' && s.name === 'Validated');
    assert.ok(iface, `expected Validated @interface captured as interface`);
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// JavaScript: no first-class decorator support — adapter returns symbols
// unchanged (does NOT throw).
// ---------------------------------------------------------------------------

test('JavaScript sample parses without throwing; no decorator capture expected', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'javascript/sample.js');
    assert.equal(r.parse_status, 'clean');
    const method = r.symbols.find((s) => s.kind === 'method' && s.name === 'findById');
    assert.ok(method);
    assert.equal(method.decorators, undefined, `JS has no decorator support; should be undefined`);
  } finally { cleanup(); }
});