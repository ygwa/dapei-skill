import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(__dirname, '../fixtures/sample-node-repo');

function initFixtureRepo(targetPath) {
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
// End-to-end: walk the full CDR pipeline against a real fixture repo and
// verify the VitePress portal contains a coherent set of pages.
// ---------------------------------------------------------------------------

test('cdr e2e: profile → entries → behavior → state → domain → capability map → doc.generate', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-e2e-'));
  const repoPath = join(tmp, 'fixture-repo');
  try {
    // Step 0: workspace + register repo
    await core.runCapability('workspace.init', {}, c(tmp));
    initFixtureRepo(repoPath);
    await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, c(tmp));

    // Step 1: cdr.profile — emit L0 tech profile
    const { result: profileRes } = await core.runCapability('cdr.profile', { repo: 'sample-app' }, c(tmp));
    assert.equal(profileRes.ok, true);
    assert.ok(profileRes.data.language.includes('nodejs'));
    assert.ok(existsSync(join(tmp, 'docs/as-is/profiles/sample-app.yaml')));

    // Step 2: cdr.entries.candidate — engine lists code files (v0.3: no pattern matching)
    const { result: entriesRes } = await core.runCapability('cdr.entries.candidate', { repo: 'sample-app' }, c(tmp));
    assert.equal(entriesRes.ok, true);
    assert.ok(entriesRes.data.file_count >= 1);
    const files = entriesRes.data.files;
    const orderCtrlFile = files.find((f) => String(f.relpath).includes('orderController.ts'));
    assert.ok(orderCtrlFile, 'orderController.ts must surface as a code file');
    assert.ok(orderCtrlFile.content.length > 0, 'file content must be inlined for AI to read');

    // Step 2b: cdr.entries.propose — AI submits one entry with evidence
    // (In v0.3 the AI reads the content and decides which files are entry points)
    const proposeRes = await core.runCapability(
      'cdr.entries.propose',
      {
        repo: 'sample-app',
        id: 'order-cancel',
        type: 'api',
        file: 'src/routes/orderController.ts',
        line: 4,
        method: 'POST',
        path: '/orders/:id/cancel',
        summary: 'POST /orders/:id/cancel — order cancellation flow',
        sources: [{ file: 'src/routes/orderController.ts', line: 4, repo: 'sample-app' }]
      },
      c(tmp)
    );
    assert.equal(proposeRes.result.ok, true);
    assert.equal(proposeRes.result.data.status, 'candidate');

    // Step 3: cdr.entries.confirm — Agent marks one entry as worth deep-diving
    await core.runCapability(
      'cdr.entries.confirm',
      {
        repo: 'sample-app',
        entry_id: 'order-cancel',
        summary: 'POST /orders/:id/cancel — order cancellation flow',
        priority: 'P0',
        sources: [{ file: 'src/routes/orderController.ts', line: 4, repo: 'sample-app' }]
      },
      c(tmp)
    );
    const entriesDoc = readFileSync(join(tmp, 'docs/as-is/entries/sample-app.yaml'), 'utf8');
    assert.match(entriesDoc, /status:\s*confirmed/);

    // Step 4: cdr.behavior.upsert × 2 — write fact-level behaviors
    const orderCreateBehavior = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'sample-app',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        steps: [
          { name: 'Validate inventory', action: 'Check stock for each line item' },
          { name: 'Pre-allocate stock', action: 'Lock items for 30 minutes' },
          { name: 'Save order', action: 'Insert Order + OrderItem + StockLock rows' }
        ],
        writes: [{ table: 'orders', operation: 'insert' }],
        events: ['order.created', 'order.payment_pending'],
        calls: ['PaymentClient'],
        risks: ['partial_failure'],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [
          { file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' },
          { file: 'src/services/orderService.ts', line: 4, repo: 'sample-app' }
        ]
      },
      c(tmp)
    );
    assert.equal(orderCreateBehavior.result.ok, true);
    assert.equal(orderCreateBehavior.result.data.kind, 'fact');

    const orderCancelBehavior = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-cancel',
        repo: 'sample-app',
        entry: { type: 'api', method: 'POST', path: '/orders/:id/cancel' },
        steps: [
          { name: 'Verify ownership', action: 'Ensure user owns the order' },
          { name: 'Mark cancelled', action: 'Update order status to CANCELLED' },
          { name: 'Initiate refund', action: 'Call PaymentClient to refund if paid' }
        ],
        writes: [{ table: 'orders', operation: 'update' }],
        events: ['order.cancelled', 'order.refund_initiated'],
        calls: ['PaymentClient'],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes/orderController.ts', line: 6, repo: 'sample-app' }]
      },
      c(tmp)
    );
    assert.equal(orderCancelBehavior.result.ok, true);

    // Step 5: cdr.state.derive — infer Order state machine from both behaviors
    const { result: stateRes } = await core.runCapability(
      'cdr.state.derive',
      { entity: 'Order', behaviors: ['order-create', 'order-cancel'], repo: 'sample-app' },
      c(tmp)
    );
    assert.equal(stateRes.ok, true);
    assert.deepEqual(stateRes.data.derived_from.sort(), ['order-cancel', 'order-create']);
    assert.ok(stateRes.data.states.includes('CREATED'), 'insert operation must yield CREATED state');
    assert.ok(stateRes.data.states.includes('CANCELLED'), 'order.cancelled event must yield CANCELLED state');
    assert.ok(stateRes.data.states.includes('REFUND_INITIATED'), 'order.refund_initiated event must yield REFUND_INITIATED state');
    assert.equal(stateRes.data.confidence.kind, 'inference');
    assert.ok(existsSync(join(tmp, 'docs/as-is/state-machines/sample-app/order.yaml')));

    // Step 6: cdr.domain.compose — cluster behaviors under Transaction domain (P1 rule: derived_from required)
    const { result: domainRes } = await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'Transaction',
        description: 'order taking, payment, cancellation',
        behaviors: ['order-create', 'order-cancel'],
        repo: 'sample-app'
      },
      c(tmp)
    );
    assert.equal(domainRes.ok, true);
    assert.equal(domainRes.data.domain, 'transaction');
    assert.ok(existsSync(join(tmp, 'docs/as-is/domains/transaction.yaml')));

    // Step 7: cdr.capability.map.init — wire Transaction domain into a product capability
    const { result: capMapRes } = await core.runCapability(
      'cdr.capability.map.init',
      {
        product: 'E-Commerce Mall',
        capabilities: [
          {
            id: 'core-checkout',
            name: 'Checkout & Order Fulfillment',
            description: 'end-to-end purchasing for retail shoppers',
            domains: ['Transaction']
          }
        ]
      },
      c(tmp)
    );
    assert.equal(capMapRes.ok, true);
    assert.ok(existsSync(join(tmp, 'docs/as-is/capabilities/product-map.yaml')));

    // Step 7b: cdr.business.compose — capture a couple of rules
    const { result: ruleRes } = await core.runCapability(
      'cdr.business.compose',
      {
        id: 'order-amount-positive',
        kind: 'invariant',
        description: 'order.amount must be > 0',
        expr: 'order.amount > 0',
        applies_to: ['order-create'],
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/services/orderService.ts', line: 4, repo: 'sample-app' }]
      },
      c(tmp)
    );
    assert.equal(ruleRes.ok, true);
    assert.ok(existsSync(join(tmp, 'docs/as-is/business-rules/order-amount-positive.yaml')));

    // Step 8: cdr.index.list — confirm the index surfaces everything we wrote
    const { result: indexRes } = await core.runCapability('cdr.index.list', {}, c(tmp));
    assert.equal(indexRes.data.behaviors.length, 2);
    assert.equal(indexRes.data.state_machines.length, 1);
    assert.equal(indexRes.data.domains.length, 1);
    assert.equal(indexRes.data.capability_maps.length, 1);
    assert.equal(indexRes.data.business_rules.length, 1);

    // Step 9: cdr.doc.generate — emit the VitePress portal
    const { result: docRes } = await core.runCapability('cdr.doc.generate', {}, c(tmp));
    assert.equal(docRes.ok, true);
    const portalRoot = join(tmp, '.dapei/docs-portal');
    assert.ok(existsSync(join(portalRoot, 'index.md')));
    assert.ok(existsSync(join(portalRoot, '.vitepress/config.mts')));
    assert.ok(existsSync(join(portalRoot, 'package.json')));
    assert.ok(existsSync(join(portalRoot, '.vitepress/theme/index.ts')));
    assert.ok(existsSync(join(portalRoot, '.vitepress/theme/components/BehaviorFlow.vue')));
    assert.ok(existsSync(join(portalRoot, '.vitepress/theme/components/StateMachine.vue')));
    assert.ok(existsSync(join(portalRoot, '.vitepress/theme/components/CodeLink.vue')));
    assert.ok(existsSync(join(portalRoot, 'behaviors/index.md')));
    assert.ok(existsSync(join(portalRoot, 'behaviors/sample-app/order-create.md')));
    assert.ok(existsSync(join(portalRoot, 'behaviors/sample-app/order-cancel.md')));
    assert.ok(existsSync(join(portalRoot, 'states/sample-app/order.md')));
    assert.ok(existsSync(join(portalRoot, 'domains/transaction.md')));
    assert.ok(existsSync(join(portalRoot, 'profiles/sample-app.md')));

    // Sanity: behavior page must contain Mermaid flow + source pointer
    const orderCreatePage = readFileSync(join(portalRoot, 'behaviors/sample-app/order-create.md'), 'utf8');
    assert.match(orderCreatePage, /```mermaid/);
    assert.match(orderCreatePage, /🟢\s*fact/); // fact badge

    // Sanity: state page must contain stateDiagram-v2
    const orderStatePage = readFileSync(join(portalRoot, 'states/sample-app/order.md'), 'utf8');
    assert.match(orderStatePage, /stateDiagram-v2/);

    // Sanity: VitePress sidebar must list all sections
    const config = readFileSync(join(portalRoot, '.vitepress/config.mts'), 'utf8');
    assert.match(config, /\/behaviors\//);
    assert.match(config, /\/states\//);
    assert.match(config, /\/domains\//);
    assert.match(config, /\/profiles\//);

    // Verify page count >= homepage + 5 section indexes + 2 behaviors + 1 state + 1 domain + 1 profile + 1 business-rule
    assert.ok(docRes.data.pages_generated >= 12, `expected >= 12 pages, got ${docRes.data.pages_generated}`);

    // Verify portal section breakdown surfaced in the result
    assert.equal(docRes.data.sections.behaviors, 2);
    assert.equal(docRes.data.sections.states, 1);
    assert.equal(docRes.data.sections.domains, 1);
    assert.equal(docRes.data.sections.profiles, 1);
    assert.equal(docRes.data.sections.business_rules, 1);
    assert.ok(existsSync(join(portalRoot, 'business-rules/index.md')));
    assert.ok(existsSync(join(portalRoot, 'business-rules/order-amount-positive.md')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
