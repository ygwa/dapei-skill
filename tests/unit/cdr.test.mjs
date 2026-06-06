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

// ---------------------------------------------------------------------------
// 1. cdr.profile
// ---------------------------------------------------------------------------

test('cdr.profile: detects nodejs + writes profile yaml', async () => {
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
// 2. cdr.entries.prepare / confirm
// ---------------------------------------------------------------------------

test('cdr.entries.prepare: scans for entry patterns', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    const { result } = await core.runCapability('cdr.entries.prepare', { repo: 'sample-app' }, ctx(tmp));
    assert.equal(result.ok, true);
    assert.ok(result.data.entry_count >= 1);

    const candidates = result.data.entries;
    const controller = candidates.find((c) => String(c.anchor).includes('orderController'));
    assert.ok(controller, 'orderController.ts should be detected as an entry candidate');
    assert.equal(controller.type, 'api');
    assert.equal(controller.status, 'candidate');
    assert.equal(controller.id, 'order-controller');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.confirm: marks entry confirmed and writes summary', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await core.runCapability('cdr.entries.prepare', { repo: 'sample-app' }, ctx(tmp));
    const { result } = await core.runCapability(
      'cdr.entries.confirm',
      { repo: 'sample-app', entry_id: 'order-controller', summary: 'POST /orders/:id/cancel — cancel order', priority: 'P0' },
      ctx(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.status, 'confirmed');

    const entriesPath = join(tmp, 'docs/as-is/entries/sample-app.yaml');
    const doc = readFileSync(entriesPath, 'utf8');
    assert.match(doc, /status:\s*confirmed/);
    assert.match(doc, /summary:\s*POST \/orders/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.confirm: rejects unknown entry_id', async () => {
  const tmp = await workspaceWithSampleRepo();
  try {
    await core.runCapability('cdr.entries.prepare', { repo: 'sample-app' }, ctx(tmp));
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.confirm',
        { repo: 'sample-app', entry_id: 'ghost', summary: 'no such entry' },
        ctx(tmp)
      ),
      /entry 'ghost' not found/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3. cdr.behavior.upsert (P1)
// ---------------------------------------------------------------------------

test('cdr.behavior.upsert: writes behavior from structured fields and updates index', async () => {
  const tmp = await freshWorkspace();
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
        sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
      },
      ctx(tmp)
    );

    assert.equal(result.ok, true);
    assert.equal(result.data.type, 'behavior');
    assert.equal(result.data.id, 'order-create');
    assert.equal(result.data.kind, 'fact');
    assert.ok(existsSync(join(tmp, 'docs/as-is/behavior/order-create.yaml')));
    assert.ok(existsSync(join(tmp, '.dapei/cognitive/index.yaml')));

    const { result: listResult } = await core.runCapability('cdr.index.list', {}, ctx(tmp));
    assert.equal(listResult.data.behaviors.length, 1);
    assert.equal(listResult.data.behaviors[0].id, 'order-create');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert: rejects fact without sources (P3 rule)', async () => {
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

test('cdr.behavior.upsert: accepts inference with derived_from', async () => {
  const tmp = await freshWorkspace();
  try {
    // First write a fact behavior so derived_from references a real behavior id
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes/orders.ts' }]
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
// 4. cdr.state.derive (P1)
// ---------------------------------------------------------------------------

test('cdr.state.derive: extracts states from writes and events, writes draft', async () => {
  const tmp = await freshWorkspace();
  try {
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        writes: [{ table: 'orders', operation: 'insert' }],
        events: ['order.created', 'order.payment_pending'],
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes/orders.ts' }]
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
    assert.equal(result.data.type, 'state-machine');
    assert.ok(result.data.states.includes('CREATED'), 'insert operation must yield CREATED state');
    assert.ok(result.data.states.includes('PAYMENT_PENDING'), 'event tail must yield state hint');
    assert.equal(result.data.confidence.kind, 'inference');
    assert.deepEqual(result.data.derived_from, ['order-create']);

    const statePath = join(tmp, result.data.path);
    assert.ok(existsSync(statePath));
    const doc = readFileSync(statePath, 'utf8');
    assert.match(doc, /entity:\s*Order/);
    assert.match(doc, /kind:\s*inference/);
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
// 5. cdr.domain.compose (P1 rule: derived_from required)
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
  const tmp = await freshWorkspace();
  try {
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/routes/orders.ts' }]
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
    assert.ok(existsSync(join(tmp, 'docs/as-is/domains/transaction.yaml')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6. cdr.capability.map.init
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
    assert.equal(result.data.product, 'E-Commerce Mall');
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
// 7. cdr.index.list
// ---------------------------------------------------------------------------

test('cdr.index.list: returns empty list on fresh workspace', async () => {
  const tmp = await freshWorkspace();
  try {
    const { result } = await core.runCapability('cdr.index.list', {}, ctx(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.behaviors.length, 0);
    assert.equal(result.data.state_machines.length, 0);
    assert.equal(result.data.domains.length, 0);
    assert.match(result.data.text, /Behaviors: 0/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 8. cdr.doc.generate (smoke — confirms VitePress scaffolding is emitted)
// ---------------------------------------------------------------------------

test('cdr.doc.generate: emits VitePress scaffold and homepage even with no assets', async () => {
  const tmp = await freshWorkspace();
  try {
    const { result } = await core.runCapability('cdr.doc.generate', {}, ctx(tmp));
    assert.equal(result.ok, true);
    assert.ok(result.data.pages_generated >= 6, 'should generate at least index + 5 section overviews');
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/index.md')));
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/.vitepress/config.mts')));
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/capabilities/index.md')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 9. Router: cdr.* intents route to the correct capability
// ---------------------------------------------------------------------------

test('router: profile repo X → cdr.profile', () => {
  const r = router.routeIntent('profile repo mall-order');
  assert.equal(r.capability, 'cdr.profile');
  assert.equal(r.input.repo, 'mall-order');
  assert.ok(r.confidence >= 0.85);
});

test('router: discover entries for X → cdr.entries.prepare', () => {
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

test('router: discover states for X in Y → cognitive.state.suggest with entity extracted', () => {
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

test('router: list behaviors stays on cognitive.artifact.list (does not steal)', () => {
  const r = router.routeIntent('list behaviors for sample-app');
  assert.equal(r.capability, 'cognitive.artifact.list');
});

test('router: discover behaviors for X routes to cognitive.discover (not cdr.behavior.upsert)', () => {
  const r = router.routeIntent('discover behaviors for sample-app');
  assert.equal(r.capability, 'cognitive.discover');
  assert.equal(r.input.target, 'sample-app');
});

// ---------------------------------------------------------------------------
// 10. Router: Chinese (中文) intent routing
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

test('router: 中文 推导状态 for Order → cognitive.state.suggest with entity', () => {
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
  assert.equal(r.input.output_dir, '.dapei/docs-portal');
});

test('router: 中文 列出资产 → cdr.index.list', () => {
  const r = router.routeIntent('列出资产');
  assert.equal(r.capability, 'cdr.index.list');
});
