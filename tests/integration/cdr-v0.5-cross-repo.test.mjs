import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
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
  execFileSync('git', ['-C', targetPath, 'init', '-b', 'main'], { encoding: 'utf8' });
  execFileSync('git', ['-C', targetPath, 'config', 'user.name', 'dapei test'], { encoding: 'utf8' });
  execFileSync('git', ['-C', targetPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  execFileSync('git', ['-C', targetPath, 'add', '.'], { encoding: 'utf8' });
  execFileSync('git', ['-C', targetPath, 'commit', '-m', 'fixture'], { encoding: 'utf8' });
}

const c = (tmp) => ({ rootDir: tmp, now: new Date() });

// ---------------------------------------------------------------------------
// v0.5 — full cross-repo rules flow against real fixtures.
//
// Reuses the v0.4 mall-order + mall-payment fixtures. Walks:
//   1. workspace.init + repos.add × 2
//   2. cdr.behavior.upsert × 2 (real source-pointed)
//   3. cdr.business.compose × 2 — one compensation rule, one sla rule
//   4. cdr.business.crosslink — produces cross-links.yaml
//   5. cdr.crossrepo.doc.generate — emits portal section
// Verifies that the cross-repo view surfaces the kind grouping and that
// the portal page contains the Mermaid diagram and the per-rule links.
// ---------------------------------------------------------------------------

test('cdr v0.5: cross-repo business rules + portal render', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-v05-'));
  try {
    // Step 0: workspace + register both repos
    await core.runCapability('workspace.init', {}, c(tmp));
    const orderSrc = join(tmp, 'mall-order-src');
    const paymentSrc = join(tmp, 'mall-payment-src');
    initFixtureRepo(mallOrderFixture, orderSrc);
    initFixtureRepo(mallPaymentFixture, paymentSrc);
    await core.runCapability('repos.add', { name: 'mall-order', url: orderSrc }, c(tmp));
    await core.runCapability('repos.add', { name: 'mall-payment', url: paymentSrc }, c(tmp));

    // Step 1: behaviors with real source-pointed evidence
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        writes: [{ table: 'orders', operation: 'insert' }],
        events: ['order.created'],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'payment-capture',
        repo: 'mall-payment',
        entry: { type: 'api', method: 'POST', path: '/payments' },
        writes: [{ table: 'payments', operation: 'insert' }],
        events: ['payment.captured'],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-payment' }]
      },
      c(tmp)
    );

    // Step 2: business rules spanning both repos
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'payment-after-order',
        kind: 'compensation',
        description: 'payment service captures payment in response to order.created',
        applies_to: ['order-create', 'payment-capture'],
        repo: 'mall-payment',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/paymentService.ts', line: 1, repo: 'mall-payment' }]
      },
      c(tmp)
    );
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'payment-30s-sla',
        kind: 'sla',
        description: 'payment must be captured within 30 seconds of order.created',
        applies_to: ['order-create', 'payment-capture'],
        repo: 'mall-payment',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/paymentService.ts', line: 2, repo: 'mall-payment' }]
      },
      c(tmp)
    );

    // Step 3: cross-link — the engine reads rules and the index, no LLM
    const { result: clRes } = await core.runCapability('cdr.business.crosslink', {}, c(tmp));
    assert.equal(clRes.ok, true);
    assert.equal(clRes.data.total_rules, 2);
    assert.equal(clRes.data.cross_repo_rules, 2);
    assert.equal(clRes.data.by_kind.compensation, 1);
    assert.equal(clRes.data.by_kind.sla, 1);
    // The cross-links.yaml file must exist
    assert.ok(existsSync(join(tmp, 'docs/as-is/cross-repo/cross-links.yaml')));

    // Both rules' covered_repos must include both mall-order and mall-payment
    for (const rule of clRes.data.rules) {
      assert.deepEqual(rule.covered_repos.sort(), ['mall-order', 'mall-payment']);
    }

    // Step 4: portal render
    const { result: docRes } = await core.runCapability('cdr.crossrepo.doc.generate', {}, c(tmp));
    assert.equal(docRes.ok, true);
    const portalRoot = join(tmp, '.dapei/docs-portal');
    assert.ok(existsSync(join(portalRoot, 'cross-repo/index.md')));
    assert.ok(existsSync(join(portalRoot, 'cross-repo/payment-after-order.md')));
    assert.ok(existsSync(join(portalRoot, 'cross-repo/payment-30s-sla.md')));

    // The index page must contain the Mermaid diagram and a list grouped by kind
    const indexMd = readFileSync(join(portalRoot, 'cross-repo/index.md'), 'utf8');
    assert.match(indexMd, /```mermaid/);
    assert.match(indexMd, /graph LR/);
    assert.match(indexMd, /### compensation/);
    assert.match(indexMd, /### sla/);

    // Each per-rule page must include the applies_to table
    const slaPage = readFileSync(join(portalRoot, 'cross-repo/payment-30s-sla.md'), 'utf8');
    assert.match(slaPage, /mall-order/);
    assert.match(slaPage, /mall-payment/);
    assert.match(slaPage, /payment-capture/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
