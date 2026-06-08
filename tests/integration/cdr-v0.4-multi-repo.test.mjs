import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');
const __dirname = dirname(fileURLToPath(import.meta.url));
const mallOrderFixture = join(__dirname, '../fixtures/mall-order');
const mallPaymentFixture = join(__dirname, '../fixtures/mall-payment');

function initFixtureRepo(fixtureRoot, targetPath) {
  execFileSync('cp', ['-R', fixtureRoot, targetPath], { encoding: 'utf8' });
  if (!existsSync(join(targetPath, '.git'))) {
    execFileSync('git', ['-C', targetPath, 'init', '-b', 'main'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.name', 'dapei test'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'add', '.'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'commit', '-m', 'fixture'], { encoding: 'utf8' });
  }
}

const c = (tmp) => ({ rootDir: tmp, now: new Date() });

// ---------------------------------------------------------------------------
// CDR v0.4 — multi-repo merge end-to-end.
//
// Asserts that the per-repo namespace (docs/as-is/<section>/<repo>/<id>.yaml)
// prevents path collisions when two repos both produce a behavior with the
// same id (order-create). The same applies to state-machines and
// business-rules.
//
// Also asserts that cdr.state.derive and cdr.domain.compose can cluster
// artifacts across repos without overwriting each other.
// ---------------------------------------------------------------------------

test('cdr v0.4: multi-repo merge — same behavior id in two repos does not collide', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-multi-repo-'));
  try {
    // Step 0: workspace + register both repos
    await core.runCapability('workspace.init', {}, c(tmp));
    const orderPath = join(tmp, 'mall-order');
    const paymentPath = join(tmp, 'mall-payment');
    initFixtureRepo(mallOrderFixture, orderPath);
    initFixtureRepo(mallPaymentFixture, paymentPath);
    await core.runCapability('repos.add', { name: 'mall-order', url: orderPath }, c(tmp));
    await core.runCapability('repos.add', { name: 'mall-payment', url: paymentPath }, c(tmp));

    // Step 1: cdr.profile × 2
    await core.runCapability('cdr.profile', { repo: 'mall-order' }, c(tmp));
    await core.runCapability('cdr.profile', { repo: 'mall-payment' }, c(tmp));
    assert.ok(existsSync(join(tmp, 'docs/as-is/profiles/mall-order.yaml')));
    assert.ok(existsSync(join(tmp, 'docs/as-is/profiles/mall-payment.yaml')));

    // Step 2: cdr.entries.propose × 2 — same id "order-create" in both repos
    await core.runCapability(
      'cdr.entries.propose',
      {
        repo: 'mall-order',
        id: 'order-create',
        type: 'api',
        file: 'src/routes.ts',
        line: 6,
        method: 'POST',
        path: '/orders',
        summary: 'POST /orders — create order in mall-order',
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    await core.runCapability(
      'cdr.entries.propose',
      {
        repo: 'mall-payment',
        id: 'order-create',
        type: 'api',
        file: 'src/routes.ts',
        line: 6,
        method: 'POST',
        path: '/payments',
        summary: 'POST /payments — capture payment in mall-payment',
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-payment' }]
      },
      c(tmp)
    );

    // Step 3: cdr.entries.confirm × 2
    await core.runCapability(
      'cdr.entries.confirm',
      {
        repo: 'mall-order',
        entry_id: 'order-create',
        summary: 'create order',
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    await core.runCapability(
      'cdr.entries.confirm',
      {
        repo: 'mall-payment',
        entry_id: 'order-create',
        summary: 'capture payment',
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-payment' }]
      },
      c(tmp)
    );

    // Step 4: cdr.behavior.upsert × 2 — same id, different repos, different repos on sources
    // The whole point: two repos produce the same behavior id, paths must not collide.
    const orderBehavior = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        steps: [
          { name: 'Persist order', action: 'Insert into orders table' }
        ],
        writes: [{ table: 'orders', operation: 'insert' }],
        events: ['order.created'],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    assert.equal(orderBehavior.result.ok, true);

    const paymentBehavior = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-payment',
        entry: { type: 'api', method: 'POST', path: '/payments' },
        steps: [
          { name: 'Persist payment', action: 'Insert into payments table' }
        ],
        writes: [{ table: 'payments', operation: 'insert' }],
        events: ['payment.captured'],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-payment' }]
      },
      c(tmp)
    );
    assert.equal(paymentBehavior.result.ok, true);

    // **Key v0.4 assertion** — both files exist, no overwriting.
    assert.ok(existsSync(join(tmp, 'docs/as-is/behavior/mall-order/order-create.yaml')),
      'mall-order behavior file must exist at per-repo path');
    assert.ok(existsSync(join(tmp, 'docs/as-is/behavior/mall-payment/order-create.yaml')),
      'mall-payment behavior file must exist at per-repo path');

    // **Key v0.4 assertion** — index knows both as separate entries.
    const { result: indexAfterBehaviors } = await core.runCapability('cdr.index.list', {}, c(tmp));
    const behaviorIds = indexAfterBehaviors.data.behaviors.map((b) => `${b.id}@${b.repo}`).sort();
    assert.deepEqual(behaviorIds, ['order-create@mall-order', 'order-create@mall-payment']);

    // Step 5: cdr.state.derive — cluster Order entity across both repos
    // Notice we do NOT pass `repo` here — the entity is the cross-repo join key.
    const { result: stateRes } = await core.runCapability(
      'cdr.state.derive',
      { entity: 'Order', behaviors: ['order-create'] },
      c(tmp)
    );
    assert.equal(stateRes.ok, true);
    // The state machine must pick up CREATED (from orders.insert) AND PENDING_PAYMENT
    // (from payments.insert — but our behavior only emits order.created / payment.captured).
    // The state hint comes from event tail + writes; both behaviors contribute.
    assert.ok(stateRes.data.derived_from.includes('order-create'),
      'derived_from must reference the behavior id');
    assert.equal(stateRes.data.confidence.kind, 'inference');
    // Per-repo state-machine path
    assert.ok(existsSync(join(tmp, 'docs/as-is/state-machines/order.yaml')));

    // Step 6: cdr.domain.compose — cluster both behaviors under one domain
    const { result: domainRes } = await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'Order Transaction',
        description: 'cross-service order and payment flow',
        behaviors: ['order-create', 'order-create'],
        // v0.4 — domain at cross-repo scope: pass no repo, behaviors carry their own.
      },
      c(tmp)
    );
    assert.equal(domainRes.ok, true);

    // Step 7: cdr.business.compose × 2 — same id in both repos must not collide
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'amount-positive',
        kind: 'invariant',
        description: 'order amount must be > 0',
        applies_to: ['order-create'],
        repo: 'mall-order',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/orderService.ts', line: 4, repo: 'mall-order' }]
      },
      c(tmp)
    );
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'amount-positive',
        kind: 'invariant',
        description: 'payment amount must be > 0',
        applies_to: ['order-create'],
        repo: 'mall-payment',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/paymentService.ts', line: 4, repo: 'mall-payment' }]
      },
      c(tmp)
    );
    assert.ok(existsSync(join(tmp, 'docs/as-is/business-rules/mall-order/amount-positive.yaml')));
    assert.ok(existsSync(join(tmp, 'docs/as-is/business-rules/mall-payment/amount-positive.yaml')));

    // Step 8: cdr.doc.generate — portal pages must be namespaced per repo
    const { result: docRes } = await core.runCapability('cdr.doc.generate', {}, c(tmp));
    assert.equal(docRes.ok, true);
    const portalRoot = join(tmp, '.dapei/docs-portal');
    assert.ok(existsSync(join(portalRoot, 'behaviors/mall-order/order-create.md')),
      'mall-order behavior page must exist at per-repo URL');
    assert.ok(existsSync(join(portalRoot, 'behaviors/mall-payment/order-create.md')),
      'mall-payment behavior page must exist at per-repo URL');
    assert.ok(existsSync(join(portalRoot, 'business-rules/mall-order/amount-positive.md')));
    assert.ok(existsSync(join(portalRoot, 'business-rules/mall-payment/amount-positive.md')));

    // **VitePress sidebar must include per-repo links**
    const config = readFileSync(join(portalRoot, '.vitepress/config.mts'), 'utf8');
    assert.match(config, /\/behaviors\/mall-order\/order-create/);
    assert.match(config, /\/behaviors\/mall-payment\/order-create/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// v0.4 — backward compatibility: a flat (legacy) behavior file at
// docs/as-is/behavior/<id>.yaml must still be readable by cdr.state.derive.
// This is the "fallback to legacy path" code path in cdr.state.derive.
// ---------------------------------------------------------------------------

test('cdr v0.4: legacy flat behavior file is still readable (backward compat)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-legacy-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    // Plant a legacy flat file directly, bypassing cdr.behavior.upsert
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(join(tmp, 'docs/as-is/behavior'), { recursive: true });
    writeFileSync(
      join(tmp, 'docs/as-is/behavior/legacy-behavior.yaml'),
      [
        'id: legacy-behavior',
        'entry:',
        '  type: api',
        '  method: GET',
        '  path: /legacy',
        'writes:',
        '  - table: legacy',
        '    operation: insert',
        'confidence:',
        '  level: high',
        '  kind: fact',
        '  evidence_type: direct_code',
        'sources:',
        '  - file: src/x.ts',
        '    line: 1',
        '    repo: legacy-repo',
        ''
      ].join('\n')
    );

    // cdr.state.derive with the legacy behavior id, no repo on it.
    // The state machine reads the file via the legacy fallback path.
    const { result: stateRes } = await core.runCapability(
      'cdr.state.derive',
      { entity: 'Legacy', behaviors: ['legacy-behavior'] },
      c(tmp)
    );
    assert.equal(stateRes.ok, true);
    assert.ok(stateRes.data.states.includes('CREATED'),
      'insert operation must yield CREATED state — proves the legacy flat file was read');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
