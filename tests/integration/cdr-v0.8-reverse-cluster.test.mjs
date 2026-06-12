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
// v0.8 — end-to-end reverse-cluster to L1 across mall-order + mall-payment
//
// Asserts:
//   1. Two behaviors sharing an event get clustered by cdr.domain.suggest.
//   2. The suggestions file is written, NOT any domain.yaml.
//   3. After AI composes a domain per cluster, cdr.capability.map.synth
//      reads the composed domains, back-fills spans_repos / behavior_count
//      / fact_ratio, and writes product-map.yaml.
//   4. cdr.reversecluster.doc.generate emits the L1 portal section,
//      with one page per capability.
//   5. cdr.doc.generate (the full portal) coexists with the new
//      reverse-cluster section.
//   6. business-rule co-apply edges contribute to clustering when no
//      events are shared.
// ---------------------------------------------------------------------------

test('cdr v0.8: end-to-end reverse-cluster pipeline → L1 portal', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-v08-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    const orderSrc = join(tmp, 'mall-order-src');
    const paymentSrc = join(tmp, 'mall-payment-src');
    initFixtureRepo(mallOrderFixture, orderSrc);
    initFixtureRepo(mallPaymentFixture, paymentSrc);
    await core.runCapability('repos.add', { name: 'mall-order', url: orderSrc }, c(tmp));
    await core.runCapability('repos.add', { name: 'mall-payment', url: paymentSrc }, c(tmp));

    // Two behaviors that share order.created → high-confidence cluster
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        events: ['order.created', 'order.audit'],
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
        events: ['order.created'],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-payment' }]
      },
      c(tmp)
    );

    // STEP 1 — cdr.domain.suggest
    const { result: sugRes } = await core.runCapability('cdr.domain.suggest', {}, c(tmp));
    assert.equal(sugRes.ok, true);
    assert.equal(sugRes.data.reported_cluster_count, 1);
    const cluster = sugRes.data.clusters[0];
    assert.equal(cluster.confidence, 'high');
    assert.equal(cluster.repos.length, 2);
    assert.match(cluster.suggested_name, /order/i);

    const sugYaml = readFileSync(join(tmp, 'docs/as-is/cross-repo/domain-suggestions.yaml'), 'utf8');
    assert.match(sugYaml, /These are SUGGESTIONS/);

    // The suggest capability must NOT have created a domain.yaml.
    // workspace.init pre-creates the domains directory as part of the
    // standard docs/ tree, so we check for yaml files inside it instead.
    const { listFilesRecursively } = await import('../../packages/runtime-adapters/src/system.ts');
    const domainFiles = listFilesRecursively(join(tmp, 'docs/as-is/domains'), ['.yaml', '.yml'], 50);
    assert.equal(domainFiles.length, 0,
      'suggest never creates a domain artifact — only suggestions file');

    // STEP 2 — AI composes the domain
    await core.runCapability(
      'cdr.domain.compose',
      {
        domain: 'Order & Payment Lifecycle',
        description: 'Order placement through payment capture',
        behaviors: ['order-create', 'payment-capture'],
        confidence: { level: 'medium', kind: 'inference' }
      },
      c(tmp)
    );

    // STEP 3 — cdr.capability.map.synth
    const { result: synthRes } = await core.runCapability(
      'cdr.capability.map.synth',
      { product: 'E-Commerce Mall' },
      c(tmp)
    );
    assert.equal(synthRes.ok, true);
    assert.equal(synthRes.data.capability_count, 1);
    assert.equal(synthRes.data.domain_sources.composed, 1);
    const cap = synthRes.data.capabilities[0];
    assert.deepEqual(cap.spans_repos.sort(), ['mall-order', 'mall-payment']);
    assert.equal(cap.behavior_count, 2);
    assert.equal(cap.fact_ratio, 1.0);

    const mapYaml = readFileSync(join(tmp, 'docs/as-is/capabilities/product-map.yaml'), 'utf8');
    assert.match(mapYaml, /product: E-Commerce Mall/);
    assert.match(mapYaml, /synthesized_by: cdr\.capability\.map\.synth/);

    // STEP 4 — cdr.reversecluster.doc.generate emits /l1/
    const { result: rcdRes } = await core.runCapability(
      'cdr.reversecluster.doc.generate',
      {},
      c(tmp)
    );
    assert.equal(rcdRes.ok, true);
    assert.equal(rcdRes.data.capabilities_rendered, 1);
    assert.equal(rcdRes.data.suggestions_rendered, 1);
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/l1/index.md')));
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/l1/cluster-suggestions.md')));
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/l1/domain-order-payment-lifecycle.md')));

    const l1Index = readFileSync(join(tmp, '.dapei/docs-portal/l1/index.md'), 'utf8');
    assert.match(l1Index, /# L1 Capability Map/);
    assert.match(l1Index, /mermaid/);
    assert.match(l1Index, /domain_order_payment_lifecycle/);

    const l1CapPage = readFileSync(
      join(tmp, '.dapei/docs-portal/l1/domain-order-payment-lifecycle.md'),
      'utf8'
    );
    assert.match(l1CapPage, /\*\*Behavior count:\*\* 2/);
    assert.match(l1CapPage, /\*\*Fact ratio:\*\* 1/);
    assert.match(l1CapPage, /mall-order/);

    // STEP 5 — cdr.doc.generate (full portal) still works after /l1/
    const { result: docRes } = await core.runCapability('cdr.doc.generate', {}, c(tmp));
    assert.equal(docRes.ok, true);
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/capabilities/index.md')));
    assert.ok(existsSync(join(tmp, '.dapei/docs-portal/l1/index.md')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr v0.8: business-rule co-apply clusters behaviors that share no events', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-v08-'));
  try {
    await core.runCapability('workspace.init', {}, c(tmp));
    const orderSrc = join(tmp, 'mall-order-src');
    const paymentSrc = join(tmp, 'mall-payment-src');
    initFixtureRepo(mallOrderFixture, orderSrc);
    initFixtureRepo(mallPaymentFixture, paymentSrc);
    await core.runCapability('repos.add', { name: 'mall-order', url: orderSrc }, c(tmp));
    await core.runCapability('repos.add', { name: 'mall-payment', url: paymentSrc }, c(tmp));

    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
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
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-payment' }]
      },
      c(tmp)
    );
    await core.runCapability(
      'cdr.business.compose',
      {
        id: 'payment-after-order',
        kind: 'compensation',
        description: 'payment captures after order',
        applies_to: ['order-create', 'payment-capture'],
        repo: 'mall-payment',
        confidence: { level: 'high', kind: 'fact' },
        sources: [{ file: 'src/paymentService.ts', line: 1, repo: 'mall-payment' }]
      },
      c(tmp)
    );

    const { result } = await core.runCapability('cdr.domain.suggest', {}, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.reported_cluster_count, 1);
    assert.equal(result.data.clusters[0].confidence, 'low');
    assert.ok(result.data.clusters[0].evidence.some((e) => e.type === 'business-rule'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr v0.8: router intents route to the right capability', async () => {
  const router = await import('../../packages/router/src/index.ts');
  assert.equal(router.routeIntent('suggest domains').capability, 'cdr.domain.suggest');
  assert.equal(router.routeIntent('synth capability map for E-Commerce Mall').capability,
    'cdr.capability.map.synth');
  assert.equal(router.routeIntent('build capability map for E-Commerce Mall').capability,
    'cdr.capability.map.init');
  assert.equal(router.routeIntent('render L1 portal').capability,
    'cdr.reversecluster.doc.generate');
  assert.equal(router.routeIntent('render cross-repo portal').capability,
    'cdr.crossrepo.doc.generate');
  assert.equal(router.routeIntent('推荐领域').capability, 'cdr.domain.suggest');
  assert.equal(router.routeIntent('聚类功能地图').capability, 'cdr.capability.map.synth');
  assert.equal(router.routeIntent('渲染能力地图门户').capability,
    'cdr.reversecluster.doc.generate');
});