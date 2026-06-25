import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, rmSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';

const core = await import('../../packages/core/src/index.ts');
const router = await import('../../packages/router/src/index.ts');
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(__dirname, '../fixtures/sample-node-repo');

async function freshWorkspace() {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-'));
  await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
  return tmp;
}

async function workspaceWithSampleRepo() {
  const tmp = await freshWorkspace();
  const repoDest = join(tmp, 'repos', 'sample-app');
  mkdirSync(repoDest, { recursive: true });
  cpSync(join(fixtureRoot, 'src'), join(repoDest, 'src'), { recursive: true });
  writeFileSync(
    join(repoDest, 'package.json'),
    JSON.stringify({ name: 'sample-app', version: '1.0.0', scripts: { test: 'echo test' } })
  );
  return tmp;
}

const ctx = (tmp) => ({ rootDir: tmp, now: new Date() });

const FIXTURE_ROOT = join(__dirname, '..', 'fixtures');

async function workspaceWithFixture(fixtureName, repoName) {
  const tmp = await freshWorkspace();
  const repoDest = join(tmp, 'repos', repoName);
  mkdirSync(repoDest, { recursive: true });
  cpSync(join(FIXTURE_ROOT, fixtureName), repoDest, { recursive: true });
  return tmp;
}

// Convenience: a real-file source for tests where the fixture has it
const realFileSource = { file: 'src/services/orderService.ts', line: 4, repo: 'sample-app' };

// ---------------------------------------------------------------------------
// 1. cdr.profile
// ---------------------------------------------------------------------------

test('cdr.profile: detects nodejs + writes profile yaml (no frameworks field in v0.3)', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    const { result } = await core.runCapability('cdr.profile', { repo: 'sample-app' }, ctx(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.repo, 'sample-app');
    assert.ok(result.data.language.includes('nodejs'));

    const profilePath = join(tmp, result.data.path);
    assert.ok(existsSync(profilePath));
    const doc = readFileSync(profilePath, 'utf8');
    assert.match(doc, /repo:\s*sample-app/);
    assert.match(doc, /language:\s*nodejs/);
    // v0.3: frameworks field removed — engine no longer prescribes
    assert.doesNotMatch(doc, /\bframeworks:/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.profile: rejects missing repo on disk', async () => {
  const tmp = await freshWorkspace();
  try {
    await assert.rejects(
      () => core.runCapability('cdr.profile', { repo: 'nonexistent' }, ctx(tmp)),
      /repos\/nonexistent not found/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. cdr.entries.candidate (NEW v0.3 — file list, no pattern matching)
// ---------------------------------------------------------------------------

test('cdr.entries.candidate: returns all code files in repo with structured code_map', async () => {
  // v1.0 (ADR-0006): candidate returns code_map per file (imports / symbols /
  // line ranges). Content is NOT inlined — AI requests it via cdr.entries.expand.
  const tmp = await workspaceWithSampleRepo();
  try {
    const { result } = await core.runCapability('cdr.entries.candidate', { repo: 'sample-app' }, ctx(tmp));
    assert.equal(result.ok, true);
    assert.ok(result.data.file_count >= 5, 'sample-node-repo has >= 5 ts files');
    assert.equal(result.data.backend, 'tree-sitter');

    const files = result.data.files;
    const relpaths = files.map((f) => f.relpath).sort();
    assert.ok(relpaths.includes('src/routes/orders.ts'));
    assert.ok(relpaths.includes('src/routes/orderController.ts'));
    assert.ok(relpaths.includes('src/services/orderService.ts'));

    // v1.0: each file carries code_map (no content field)
    const orders = files.find((f) => f.relpath === 'src/routes/orders.ts');
    assert.ok(orders.code_map, 'code_map must be present');
    assert.equal(orders.language, 'typescript');
    assert.ok(['clean', 'partial', 'unsupported', 'oversized'].includes(orders.parse_status));
    assert.ok(Array.isArray(orders.code_map.symbols), 'code_map.symbols is an array');
    assert.ok(Array.isArray(orders.code_map.imports), 'code_map.imports is an array');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.candidate: includes Spring/NestJS/FastAPI files unchanged (no framework coupling)', async () => {
  // v0.3: engine does NOT prescribe which framework — it just returns files.
  // AI is the one that decides "this Java file with @RestController is an entry".
  // The candidate result for sample-spring must include OrderController.java
  // as a regular code file, no special framework detection.
  const tmp = await workspaceWithFixture('sample-spring', 'spring-app');
  try {
    const { result } = await core.runCapability('cdr.entries.candidate', { repo: 'spring-app' }, ctx(tmp));
    assert.equal(result.ok, true);
    const files = result.data.files;
    const ctrl = files.find((f) => f.relpath.includes('OrderController.java'));
    assert.ok(ctrl, 'OrderController.java must be listed as a code file');
    assert.equal(ctrl.language, 'java');
    // No framework field on file entries — the AI decides
    assert.equal(ctrl.framework, undefined);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.candidate: rejects missing repo', async () => {
  const tmp = await freshWorkspace();
  try {
    await assert.rejects(
      () => core.runCapability('cdr.entries.candidate', { repo: 'nonexistent' }, ctx(tmp)),
      /repos\/nonexistent not found/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3. cdr.entries.propose (NEW v0.3 — AI submits one entry with evidence)
// ---------------------------------------------------------------------------

test('cdr.entries.propose: writes entry to entries yaml when evidence is valid', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    const { result } = await core.runCapability(
      'cdr.entries.propose',
      {
        repo: 'sample-app',
        id: 'order-create',
        type: 'api',
        file: 'src/routes/orders.ts',
        line: 6,
        method: 'POST',
        path: '/orders',
        summary: 'POST /orders — create order',
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      ctx(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.id, 'order-create');
    assert.equal(result.data.status, 'candidate');

    const entriesPath = join(tmp, 'docs/as-is/entries/sample-app.yaml');
    assert.ok(existsSync(entriesPath));
    const doc = readFileSync(entriesPath, 'utf8');
    assert.match(doc, /id:\s*order-create/);
    assert.match(doc, /discovered_by:\s*ai/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.propose: rejects entry without sources[] (P1 red line)', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.propose',
        {
          repo: 'sample-app',
          id: 'bad-one',
          type: 'api',
          file: 'src/routes/orders.ts',
          line: 6
        },
        ctx(tmp)
      ),
      /sources\[\] is required/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.propose: rejects entry with line out of file range', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.propose',
        {
          repo: 'sample-app',
          id: 'bad-line',
          type: 'api',
          file: 'src/routes/orderController.ts',
          line: 9999, // way beyond the 9-line file
          sources: [{ file: 'src/routes/orderController.ts', line: 9999, repo: 'sample-app' }]
        },
        ctx(tmp)
      ),
      /line 9999 out of range/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.propose: rejects entry with file that does not exist in repo', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.propose',
        {
          repo: 'sample-app',
          id: 'ghost',
          type: 'api',
          file: 'src/nonexistent.ts',
          line: 1,
          sources: [{ file: 'src/nonexistent.ts', line: 1, repo: 'sample-app' }]
        },
        ctx(tmp)
      ),
      /file not found in repo 'sample-app': src\/nonexistent\.ts/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.propose: rejects invalid id pattern', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.propose',
        {
          repo: 'sample-app',
          id: 'Invalid Id',
          type: 'api',
          file: 'src/routes/orders.ts',
          line: 6,
          sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
        },
        ctx(tmp)
      ),
      /id must match/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.propose: idempotent — re-proposing same id replaces entry', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await core.runCapability(
      'cdr.entries.propose',
      {
        repo: 'sample-app',
        id: 'order-create',
        type: 'api',
        file: 'src/routes/orders.ts',
        line: 6,
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      ctx(tmp)
    );
    await core.runCapability(
      'cdr.entries.propose',
      {
        repo: 'sample-app',
        id: 'order-create',
        type: 'api',
        file: 'src/routes/orderController.ts',
        line: 4,
        sources: [{ file: 'src/routes/orderController.ts', line: 4, repo: 'sample-app' }]
      },
      ctx(tmp)
    );

    const doc = readFileSync(join(tmp, 'docs/as-is/entries/sample-app.yaml'), 'utf8');
    const occurrences = (doc.match(/id:\s*order-create/g) || []).length;
    assert.equal(occurrences, 1, 'only one entry with id=order-create should exist');
    assert.match(doc, /orderController\.ts/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. cdr.entries.prepare (v0.3 — thin orchestrator delegating to .candidate)
// ---------------------------------------------------------------------------

test('cdr.entries.prepare v0.3: delegates to candidate, returns workflow description', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    const { result } = await core.runCapability('cdr.entries.prepare', { repo: 'sample-app' }, ctx(tmp));
    assert.equal(result.ok, true);
    assert.ok(result.data.file_count >= 5);
    assert.equal(result.data.entries, undefined, 'v0.3: entries[] field is gone (no platform scanning)');
    assert.ok(result.data.workflow, 'workflow field must be present');
    assert.match(result.data.workflow.next, /cdr\.entries\.propose/);
    assert.equal(result.data.workflow.prefer, 'cdr.entries.candidate');
    assert.equal(result.data.workflow.deprecated, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 5. cdr.entries.confirm (v0.3 — requires sources[], validates evidence)
// ---------------------------------------------------------------------------

test('cdr.entries.confirm: marks proposed entry as confirmed when sources[] valid', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    // First propose an entry
    await core.runCapability(
      'cdr.entries.propose',
      {
        repo: 'sample-app',
        id: 'order-create',
        type: 'api',
        file: 'src/routes/orders.ts',
        line: 6,
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      ctx(tmp)
    );

    // Then confirm it
    const { result } = await core.runCapability(
      'cdr.entries.confirm',
      {
        repo: 'sample-app',
        entry_id: 'order-create',
        summary: 'POST /orders — create order',
        priority: 'P0',
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      ctx(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.status, 'confirmed');

    const doc = readFileSync(join(tmp, 'docs/as-is/entries/sample-app.yaml'), 'utf8');
    assert.match(doc, /status:\s*confirmed/);
    assert.match(doc, /summary:\s*POST/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.confirm: rejects call without sources[] (P1 red line)', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await core.runCapability(
      'cdr.entries.propose',
      {
        repo: 'sample-app',
        id: 'order-create',
        type: 'api',
        file: 'src/routes/orders.ts',
        line: 6,
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      ctx(tmp)
    );
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.confirm',
        {
          repo: 'sample-app',
          entry_id: 'order-create',
          summary: 'no evidence, this should fail'
        },
        ctx(tmp)
      ),
      /sources\[\] is required/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.confirm: rejects confirm with evidence pointing at missing file', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await core.runCapability(
      'cdr.entries.propose',
      {
        repo: 'sample-app',
        id: 'order-create',
        type: 'api',
        file: 'src/routes/orders.ts',
        line: 6,
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      ctx(tmp)
    );
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.confirm',
        {
          repo: 'sample-app',
          entry_id: 'order-create',
          summary: 'lying about evidence',
          sources: [{ file: 'src/does-not-exist.ts', line: 1, repo: 'sample-app' }]
        },
        ctx(tmp)
      ),
      /file not found in repo/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.confirm: rejects unknown entry_id', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await core.runCapability(
      'cdr.entries.propose',
      {
        repo: 'sample-app',
        id: 'order-create',
        type: 'api',
        file: 'src/routes/orders.ts',
        line: 6,
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      ctx(tmp)
    );
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.confirm',
        {
          repo: 'sample-app',
          entry_id: 'ghost',
          summary: 'no such entry',
          sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
        },
        ctx(tmp)
      ),
      /entry 'ghost' not found/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6. cdr.behavior.upsert (now validates evidence points)
// ---------------------------------------------------------------------------

test('cdr.behavior.upsert: writes behavior when sources[] point at real code', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    const { result } = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'sample-app',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        writes: [{ table: 'orders', operation: 'insert' }],
        events: ['order.created'],
        calls: ['PaymentClient'],
        risks: ['partial_failure'],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/services/orderService.ts', line: 4, repo: 'sample-app' }]
      },
      ctx(tmp)
    );

    assert.equal(result.ok, true);
    assert.equal(result.data.kind, 'fact');
    assert.ok(existsSync(join(tmp, 'docs/as-is/behavior/sample-app/order-create.yaml')));
    assert.ok(existsSync(join(tmp, '.dapei/cognitive/index.yaml')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: rejects fact whose sources[] point at non-existent file', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.behavior.upsert',
        {
          id: 'lying-behavior',
          repo: 'sample-app',
          entry: { type: 'api', method: 'POST', path: '/x' },
          confidence: { level: 'high', kind: 'fact' },
          sources: [{ file: 'src/this-file-does-not-exist.ts', line: 1, repo: 'sample-app' }]
        },
        ctx(tmp)
      ),
      /file not found in repo/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: rejects fact whose sources[] have line out of range', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.behavior.upsert',
        {
          id: 'bad-line',
          repo: 'sample-app',
          entry: { type: 'api', method: 'POST', path: '/x' },
          confidence: { level: 'high', kind: 'fact' },
          // publisher.ts has only 10 lines
          sources: [{ file: 'src/events/publisher.ts', line: 9999, repo: 'sample-app' }]
        },
        ctx(tmp)
      ),
      /line 9999 out of range/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: rejects fact without sources (P1 rule)', async () => {
  const tmp = await freshWorkspace();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.behavior.upsert',
        {
          id: 'bad-one',
          entry: { type: 'api', method: 'POST', path: '/x' },
          confidence: { level: 'high', kind: 'fact' }
        },
        ctx(tmp)
      ),
      /kind=fact requires sources|INVALID_ARTIFACT/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: accepts inference with derived_from (no sources needed)', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/services/orderService.ts', line: 4, repo: 'sample-app' }]
      },
      ctx(tmp)
    );

    const { result } = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-cancel-inferred',
        entry: { type: 'api', method: 'POST', path: '/orders/:id/cancel' },
        confidence: { level: 'medium', kind: 'inference' },
        derived_from: ['order-create']
      },
      ctx(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.kind, 'inference');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 7. cdr.state.derive (now validates evidence points if sources[] provided)
// ---------------------------------------------------------------------------

test('cdr.state.derive: extracts states from writes and events', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        writes: [{ table: 'orders', operation: 'insert' }],
        events: ['order.created', 'order.payment_pending'],
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/services/orderService.ts', line: 4, repo: 'sample-app' }]
      },
      ctx(tmp)
    );

    const { result } = await core.runCapability(
      'cdr.state.derive',
      { entity: 'Order', behaviors: ['order-create'], repo: 'sample-app' },
      ctx(tmp)
    );

    assert.equal(result.ok, true);
    assert.equal(result.data.entity, 'Order');
    assert.ok(result.data.states.includes('CREATED'));
    assert.ok(result.data.states.includes('PAYMENT_PENDING'));
    assert.equal(result.data.confidence.kind, 'inference');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.state.derive: rejects sources[] with non-existent file', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/services/orderService.ts', line: 4, repo: 'sample-app' }]
      },
      ctx(tmp)
    );

    // The draft itself is inference, but explicit sources are still validated
    // when the caller provides them with `repo` set — defense against typos.
    await assert.rejects(
      () => core.runCapability(
        'cdr.state.derive',
        {
          entity: 'Order',
          behaviors: ['order-create'],
          repo: 'sample-app',
          sources: [{ file: 'src/nope.ts', line: 1, repo: 'sample-app' }]
        },
        ctx(tmp)
      ),
      /file not found in repo/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.state.derive: rejects empty behaviors array', async () => {
  const tmp = await freshWorkspace();
  try {
    await assert.rejects(
      () => core.runCapability('cdr.state.derive', { entity: 'Order', behaviors: [] }, ctx(tmp)),
      /behaviors\[\] must contain at least one/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.state.derive: rejects behaviors not on disk', async () => {
  const tmp = await freshWorkspace();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.state.derive',
        { entity: 'Order', behaviors: ['nonexistent-behavior'] },
        ctx(tmp)
      ),
      /behaviors not found on disk/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 8. cdr.domain.compose
// ---------------------------------------------------------------------------

test('cdr.domain.compose: rejects empty derived_from (P1 rule)', async () => {
  const tmp = await freshWorkspace();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.domain.compose',
        { domain: 'Transaction', description: 'core order taker', behaviors: [] },
        ctx(tmp)
      ),
      /behaviors\[\] must contain at least one/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.domain.compose: rejects behaviors not in index', async () => {
  const tmp = await freshWorkspace();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.domain.compose',
        { domain: 'Transaction', description: 'x', behaviors: ['nonexistent'] },
        ctx(tmp)
      ),
      /behaviors not found in cognitive index/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.domain.compose: writes domain yaml when behaviors exist', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/services/orderService.ts', line: 4, repo: 'sample-app' }]
      },
      ctx(tmp)
    );

    const { result } = await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'Transaction',
        description: 'core order taker',
        behaviors: ['order-create'],
        repo: 'sample-app'
      },
      ctx(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.domain, 'transaction');
    assert.deepEqual(result.data.derived_from, ['order-create']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 9. cdr.capability.map.init
// ---------------------------------------------------------------------------

test('cdr.capability.map.init: writes product map yaml', async () => {
  const tmp = await freshWorkspace();
  try {
    const { result } = await core.runCapability(
      'cdr.capability.map.init',
      {
        product: 'E-Commerce Mall',
        capabilities: [
          { id: 'core-checkout', name: 'Checkout', description: 'order flow', domains: ['Transaction'] }
        ]
      },
      ctx(tmp)
    );
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(tmp, 'docs/as-is/capabilities/product-map.yaml')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.capability.map.init: rejects empty capabilities array', async () => {
  const tmp = await freshWorkspace();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.capability.map.init',
        { product: 'X', capabilities: [] },
        ctx(tmp)
      ),
      /capabilities\[\] must contain at least one/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 10. cdr.index.list
// ---------------------------------------------------------------------------

test('cdr.index.list: returns empty list on fresh workspace', async () => {
  const tmp = await freshWorkspace();
  try {
    const { result } = await core.runCapability('cdr.index.list', {}, ctx(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.behaviors.length, 0);
    assert.match(result.data.text, /Behaviors: 0/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 11. cdr.doc.generate (smoke)
// ---------------------------------------------------------------------------

test('cdr.doc.generate: emits VitePress scaffold even with no assets', async () => {
  const tmp = await freshWorkspace();
  try {
    const { result } = await core.runCapability('cdr.doc.generate', {}, ctx(tmp));
    assert.equal(result.ok, true);
    assert.ok(result.data.pages_generated >= 6);
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/index.md')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 12. cdr.business.compose (now validates evidence points)
// ---------------------------------------------------------------------------

test('cdr.business.compose: writes invariant rule when sources[] valid', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    const { result } = await core.runCapability(
      'cdr.business.compose',
      {
        id: 'order-amount-positive',
        kind: 'invariant',
        description: 'order.amount must be > 0',
        expr: 'order.amount > 0',
        applies_to: ['order-create'],
        repo: 'sample-app',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/services/orderService.ts', line: 4, repo: 'sample-app' }]
      },
      ctx(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.kind, 'invariant');
    assert.ok(existsSync(join(tmp, 'docs/as-is/business-rules/sample-app/order-amount-positive.yaml')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.business.compose: rejects sources[] pointing at non-existent file', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.business.compose',
        {
          id: 'bad-rule',
          kind: 'invariant',
          description: 'x',
          confidence: { level: 'high', kind: 'fact' },
          sources: [{ file: 'src/does-not-exist.ts', line: 1, repo: 'sample-app' }]
        },
        ctx(tmp)
      ),
      /file not found in repo/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

for (const kind of ['invariant', 'constraint', 'authorization', 'sla', 'compensation']) {
  test(`cdr.business.compose: accepts kind=${kind}`, async () => {
    const tmp = await workspaceWithSampleRepo();
    try {
      const { result } = await core.runCapability(
        'cdr.business.compose',
        {
          id: `rule-${kind}`,
          kind,
          description: `${kind} rule`,
          confidence: { level: 'high', kind: 'fact' },
          // Use a real file from the fixture
          sources: [{ file: 'src/services/orderService.ts', line: 4, repo: 'sample-app' }]
        },
        ctx(tmp)
      );
      assert.equal(result.ok, true, `kind=${kind} should be accepted`);
      assert.equal(result.data.kind, kind);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
}

test('cdr.business.compose: rejects unknown kind', async () => {
  const tmp = await freshWorkspace();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.business.compose',
        {
          id: 'bad-rule',
          kind: 'best-practice',
          confidence: { level: 'low', kind: 'inference' },
          derived_from: ['order-create']
        },
        ctx(tmp)
      ),
      /field 'kind' must be one of/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.business.compose: rejects fact without sources (P1 rule)', async () => {
  const tmp = await freshWorkspace();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.business.compose',
        {
          id: 'no-evidence',
          kind: 'constraint',
          confidence: { level: 'high', kind: 'fact' }
        },
        ctx(tmp)
      ),
      /kind=fact requires sources/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.business.compose: rejects invalid id pattern', async () => {
  const tmp = await freshWorkspace();
  try {
    await assert.rejects(
      () => core.runCapability(
        'cdr.business.compose',
        {
          id: 'Invalid Id With Spaces',
          kind: 'invariant',
          confidence: { level: 'low', kind: 'inference' },
          derived_from: ['order-create']
        },
        ctx(tmp)
      ),
      /id must match/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 13. Router: cdr.* intents route to the correct capability (unchanged in v0.3)
// ---------------------------------------------------------------------------

test('router: profile repo X → cdr.profile', () => {
  const r = router.routeIntent('profile repo mall-order');
  assert.equal(r.capability, 'cdr.profile');
  assert.equal(r.input.repo, 'mall-order');
});

test('router: discover entries for X → cdr.entries.prepare (now thin orchestrator)', () => {
  const r = router.routeIntent('discover entries for mall-order');
  assert.equal(r.capability, 'cdr.entries.prepare');
  assert.equal(r.input.repo, 'mall-order');
});

test('router: confirm entry X in Y → cdr.entries.confirm', () => {
  const r = router.routeIntent('confirm entry order-create in mall-order');
  assert.equal(r.capability, 'cdr.entries.confirm');
  assert.equal(r.input.entry_id, 'order-create');
  assert.equal(r.input.repo, 'mall-order');
});

test('router: discover states for X in Y → cognitive.state.suggest', () => {
  const r = router.routeIntent('discover states for Order in mall-order');
  assert.equal(r.capability, 'cognitive.state.suggest');
  assert.equal(r.input.entity, 'Order');
  assert.equal(r.input.repo, 'mall-order');
});

test('router: compose domain X from Y → cdr.domain.compose', () => {
  const r = router.routeIntent('compose domain Transaction from order-create behaviors');
  assert.equal(r.capability, 'cdr.domain.compose');
  assert.equal(r.input.domain, 'Transaction');
});

test('router: init capability map for X → cdr.capability.map.init', () => {
  const r = router.routeIntent('init capability map for E-Commerce Mall');
  assert.equal(r.capability, 'cdr.capability.map.init');
  assert.equal(r.input.product, 'E-Commerce Mall');
});

test('router: generate documentation portal → cdr.doc.generate', () => {
  const r = router.routeIntent('generate documentation portal');
  assert.equal(r.capability, 'cdr.doc.generate');
  assert.equal(r.input.output_dir, '.dapei/docs-portal');
});

test('router: list assets → cdr.index.list', () => {
  const r = router.routeIntent('list assets');
  assert.equal(r.capability, 'cdr.index.list');
});

test('router: list behaviors stays on cognitive.artifact.list', () => {
  const r = router.routeIntent('list behaviors for sample-app');
  assert.equal(r.capability, 'cognitive.artifact.list');
});

test('router: discover behaviors for X routes to cognitive.discover', () => {
  const r = router.routeIntent('discover behaviors for sample-app');
  assert.equal(r.capability, 'cognitive.discover');
  assert.equal(r.input.target, 'sample-app');
});

// ---------------------------------------------------------------------------
// 14. Router: Chinese (中文) intent routing
// ---------------------------------------------------------------------------

test('router: 中文 分析 mall-order → cdr.profile', () => {
  const r = router.routeIntent('分析 mall-order');
  assert.equal(r.capability, 'cdr.profile');
  assert.equal(r.input.repo, 'mall-order');
});

test('router: 中文 扫描入口 for mall-order → cdr.entries.prepare', () => {
  const r = router.routeIntent('扫描入口 for mall-order');
  assert.equal(r.capability, 'cdr.entries.prepare');
  assert.equal(r.input.repo, 'mall-order');
});

test('router: 中文 确认入口 order-create in mall-order → cdr.entries.confirm', () => {
  const r = router.routeIntent('确认入口 order-create in mall-order');
  assert.equal(r.capability, 'cdr.entries.confirm');
  assert.equal(r.input.entry_id, 'order-create');
  assert.equal(r.input.repo, 'mall-order');
});

test('router: 中文 推导状态 for Order → cognitive.state.suggest', () => {
  const r = router.routeIntent('推导状态 for Order in mall-order');
  assert.equal(r.capability, 'cognitive.state.suggest');
  assert.equal(r.input.entity, 'Order');
  assert.equal(r.input.repo, 'mall-order');
});

test('router: 中文 组合领域 Transaction → cdr.domain.compose', () => {
  const r = router.routeIntent('组合领域 Transaction from behaviors');
  assert.equal(r.capability, 'cdr.domain.compose');
  assert.equal(r.input.domain, 'Transaction');
});

test('router: 中文 初始化功能地图 for E-Commerce Mall → cdr.capability.map.init', () => {
  const r = router.routeIntent('初始化功能地图 for E-Commerce Mall');
  assert.equal(r.capability, 'cdr.capability.map.init');
  assert.equal(r.input.product, 'E-Commerce Mall');
});

test('router: 中文 生成文档门户 → cdr.doc.generate', () => {
  const r = router.routeIntent('生成文档门户');
  assert.equal(r.capability, 'cdr.doc.generate');
});

test('router: 中文 列出资产 → cdr.index.list', () => {
  const r = router.routeIntent('列出资产');
  assert.equal(r.capability, 'cdr.index.list');
});

test('router: 中文 组合业务规则 order-amount-positive → cdr.business.compose', () => {
  const r = router.routeIntent('组合业务规则 order-amount-positive');
  assert.equal(r.capability, 'cdr.business.compose');
  assert.equal(r.input.id, 'order-amount-positive');
});
