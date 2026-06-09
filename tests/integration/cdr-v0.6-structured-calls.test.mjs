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
// v0.6 — end-to-end structured calls across mall-order + mall-payment
//
// Asserts:
//   1. A behavior with a structured call (target + protocol + target_repo
//      + evidence) round-trips through cdr.behavior.upsert without
//      losing structure (the v0.5 map(String) bug is fixed).
//   2. cognitive-index records target_repos: ['mall-payment'].
//   3. doc-gen emits a "Cross-service calls" section on the behavior
//      page that names mall-payment as the target repo.
//   4. A legacy string call in the same workspace still works and
//      contributes NO target_repos.
// ---------------------------------------------------------------------------

test('cdr v0.6: structured calls + cross-service render in portal', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-v06-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    const orderSrc = join(tmp, 'mall-order-src');
    const paymentSrc = join(tmp, 'mall-payment-src');
    initFixtureRepo(mallOrderFixture, orderSrc);
    initFixtureRepo(mallPaymentFixture, paymentSrc);
    await core.runCapability('repos.add', { name: 'mall-order', url: orderSrc }, c(tmp));
    await core.runCapability('repos.add', { name: 'mall-payment', url: paymentSrc }, c(tmp));

    // Behavior with structured call
    const { result: b1 } = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        calls: [
          {
            target: 'PaymentClient',
            protocol: 'http',
            target_repo: 'mall-payment',
            evidence: { file: 'src/routes.ts', line: 6, repo: 'mall-order' }
          }
        ],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    assert.equal(b1.ok, true);

    // Behavior with legacy string call (backward compat)
    const { result: b2 } = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'payment-capture',
        repo: 'mall-payment',
        entry: { type: 'api', method: 'POST', path: '/payments' },
        calls: ['OrderService'],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-payment' }]
      },
      c(tmp)
    );
    assert.equal(b2.ok, true);

    // Index records target_repos only for the structured-call behavior
    const { result: idxRes } = await core.runCapability('cdr.index.list', {}, c(tmp));
    const orderCreate = idxRes.data.behaviors.find((b) => b.id === 'order-create');
    const paymentCapture = idxRes.data.behaviors.find((b) => b.id === 'payment-capture');
    assert.deepEqual(orderCreate.target_repos, ['mall-payment']);
    assert.equal(paymentCapture.target_repos, undefined,
      'legacy string calls do not contribute target_repos');

    // The behavior YAML on disk must preserve structure (the v0.5 bug fix)
    const onDisk = readFileSync(join(tmp, 'docs/as-is/behavior/mall-order/order-create.yaml'), 'utf8');
    assert.match(onDisk, /target: PaymentClient/);
    assert.match(onDisk, /protocol: http/);
    assert.match(onDisk, /target_repo: mall-payment/);
    assert.doesNotMatch(onDisk, /\[object Object\]/);

    // Portal render — Cross-service calls section appears on order-create page
    const { result: docRes } = await core.runCapability('cdr.doc.generate', {}, c(tmp));
    assert.equal(docRes.ok, true);
    const portalRoot = join(tmp, '.dapei/docs-portal');
    const orderCreatePage = readFileSync(
      join(portalRoot, 'behaviors/mall-order/order-create.md'),
      'utf8'
    );
    assert.match(orderCreatePage, /## Cross-service calls/);
    assert.match(orderCreatePage, /mall-payment/);
    assert.match(orderCreatePage, /PaymentClient/);
    // The payment-capture page has no Cross-service calls (only legacy string)
    const paymentCapturePage = readFileSync(
      join(portalRoot, 'behaviors/mall-payment/payment-capture.md'),
      'utf8'
    );
    assert.doesNotMatch(paymentCapturePage, /## Cross-service calls/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
