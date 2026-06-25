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
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-ts-types-'));
  const repoRoot = join(tmp, 'repos', 'sample');
  cpSync(FIXTURE_SRC, repoRoot, { recursive: true });
  return { tmp, repoRoot, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// Type-level contracts: CodeMapFile / CodeMapSymbol / ParseStatus
// These tests guard the contract that cdr.entries.candidate consumes.
// ---------------------------------------------------------------------------

test('CodeMapFile has the documented shape', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'typescript/sample.ts');
    // Required fields
    assert.equal(typeof r.relpath, 'string');
    assert.ok(['typescript', 'javascript', 'python', 'java', 'unsupported'].includes(r.language));
    const validStatuses = ['clean', 'partial', 'unsupported', 'oversized'];
    assert.ok(validStatuses.includes(r.parse_status), `parse_status ${r.parse_status} not in enum`);
    assert.ok(Array.isArray(r.symbols));
    assert.ok(Array.isArray(r.imports));
    // parse_diagnostic only when parse_status !== 'clean'
    if (r.parse_status !== 'clean') {
      assert.ok(typeof r.parse_diagnostic === 'string', `parse_status=${r.parse_status} requires parse_diagnostic`);
    }
  } finally { cleanup(); }
});

test('CodeMapSymbol has the documented shape (kind / name / start_line / end_line)', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'typescript/sample.ts');
    assert.ok(r.symbols.length > 0);
    for (const s of r.symbols) {
      assert.ok(['class', 'function', 'method', 'interface', 'module'].includes(s.kind),
        `kind ${s.kind} not in enum`);
      assert.equal(typeof s.name, 'string');
      assert.ok(s.name.length > 0, `symbol name must not be empty`);
      assert.equal(typeof s.start_line, 'number');
      assert.equal(typeof s.end_line, 'number');
      assert.ok(s.start_line >= 1);
      assert.ok(s.end_line >= s.start_line);
      // decorators is optional; if present, must be string[]
      if (s.decorators !== undefined) {
        assert.ok(Array.isArray(s.decorators));
        for (const d of s.decorators) assert.equal(typeof d, 'string');
      }
      // parent is optional; if present, must be string
      if (s.parent !== undefined) {
        assert.equal(typeof s.parent, 'string');
      }
    }
  } finally { cleanup(); }
});

test('imports are captured with source + line', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'typescript/sample.ts');
    assert.ok(r.imports.length > 0, `expected at least one import`);
    const src = r.imports.find((i) => i.source === './order-model');
    assert.ok(src, `expected import from './order-model', got ${r.imports.map((i) => i.source).join(',')}`);
    assert.equal(typeof src.line, 'number');
    assert.ok(src.line >= 1);
  } finally { cleanup(); }
});

test('entry_candidates shape is { symbol, line, decorators[] }', async () => {
  const { repoRoot, cleanup } = await seedRepo();
  try {
    const adapter = new TreeSitterCodeMapAdapter();
    const r = adapter.parseFile(repoRoot, 'typescript/sample.ts');
    assert.ok(r.entry_candidates && r.entry_candidates.length > 0);
    for (const e of r.entry_candidates) {
      assert.equal(typeof e.symbol, 'string');
      assert.equal(typeof e.line, 'number');
      assert.ok(Array.isArray(e.decorators));
      assert.ok(e.decorators.length > 0, `entry_candidates must have ≥1 decorator to qualify as a weak signal`);
    }
  } finally { cleanup(); }
});

test('fullDoctor reports the documented shape', () => {
  const adapter = new TreeSitterCodeMapAdapter();
  const doc = adapter.fullDoctor();
  assert.equal(doc.backend, 'native');
  assert.deepEqual(doc.languages.sort(), ['java', 'javascript', 'python', 'typescript']);
  assert.equal(typeof doc.cold_start_ms, 'number');
  assert.ok(doc.cold_start_ms >= 0);
  // The five count fields default to 0 in doctor (filled by profile capability)
  assert.equal(typeof doc.files_parsed, 'number');
  assert.equal(typeof doc.files_partial, 'number');
  assert.equal(typeof doc.files_unsupported, 'number');
  assert.equal(typeof doc.files_oversized, 'number');
});