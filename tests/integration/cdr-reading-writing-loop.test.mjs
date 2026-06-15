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
// End-to-end: walk the full CDR pipeline (write side) plus the new
// query / pipeline-status / feature-link surfaces (read side) in one
// test. Verifies the closed loop:
//   - write path: profile -> entries (cand/propose/confirm) -> behavior
//     -> state -> domain -> capability-map -> doc.generate
//   - read path: cdr.pipeline.status shows overall_status: complete;
//     cdr.query by entity / event / calls_target / created_by_feature
//     returns the right assets
//   - lifecycle: feature.close calls cdr.feature.link and tags every
//     asset with the feature name
// ---------------------------------------------------------------------------

test('cdr reading/writing loop: write pipeline → read APIs → feature close', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cdr-rw-loop-'));
  const repoPath = join(tmp, 'fixture-repo');
  try {
    // ---- write side: bootstrap workspace + feature ----
    await core.runCapability('workspace.init', {}, c(tmp));
    initFixtureRepo(repoPath);
    await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, c(tmp));
    await core.runCapability(
      'feature.create',
      { name: 'payment-refactor', objective: 'stabilize payment callback', repos: 'sample-app' },
      c(tmp)
    );

    // ---- write side: phase 0 (profile) ----
    const profile = await core.runCapability('cdr.profile', { repo: 'sample-app' }, c(tmp));
    assert.equal(profile.result.ok, true);
    assert.ok(existsSync(join(tmp, 'docs/as-is/profiles/sample-app.yaml')));

    // ---- read side: pipeline.status points at cdr.entries.candidate ----
    const statusAfterProfile = await core.runCapability(
      'cdr.pipeline.status', { repo: 'sample-app' }, c(tmp)
    );
    // After cdr.profile, profile phase is done; remaining 7 phases are
    // blocked or skipped, so overall_status is "partial".
    assert.equal(statusAfterProfile.result.data.overall_status, 'partial');
    const profilePhase = statusAfterProfile.result.data.phases.find((p) => p.id === 'profile');
    const entriesPhase = statusAfterProfile.result.data.phases.find((p) => p.id === 'entries');
    assert.equal(profilePhase.status, 'done');
    assert.equal(entriesPhase.status, 'blocked');
    assert.equal(entriesPhase.next_action?.capability, 'cdr.entries.candidate');

    // ---- write side: phase 1 (entries: candidate -> propose -> confirm) ----
    const candidate = await core.runCapability('cdr.entries.candidate', { repo: 'sample-app' }, c(tmp));
    assert.equal(candidate.result.ok, true);
    await core.runCapability('cdr.entries.propose', {
      repo: 'sample-app', id: 'order-create', type: 'api',
      method: 'POST', path: '/orders',
      file: 'src/routes/orders.ts', line: 6,
      sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
    }, c(tmp));
    const confirm = await core.runCapability('cdr.entries.confirm', {
      repo: 'sample-app', entry_id: 'order-create',
      summary: 'POST /orders is the primary order creation entry point',
      priority: 'high',
      sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
    }, c(tmp));
    assert.equal(confirm.result.ok, true);

    // ---- write side: phase 2 (behavior with semantic events / calls / writes) ----
    await core.runCapability('cdr.behavior.upsert', {
      id: 'order-create', repo: 'sample-app',
      entry: { type: 'api', method: 'POST', path: '/orders' },
      steps: [
        { name: 'Validate inventory', action: 'Check stock for each line item' },
        { name: 'Save order', action: 'Insert Order + OrderItem rows' }
      ],
      writes: [{ table: 'orders', operation: 'insert' }],
      events: ['order.created', 'order.payment_pending'],
      calls: [{ target: 'PaymentClient', target_repo: 'mall-payment', protocol: 'http' }],
      risks: ['partial_failure'],
      confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
      sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
    }, c(tmp));

    // ---- read side: cdr.query by event returns this behavior ----
    const byEvent = await core.runCapability('cdr.query', { event: 'order.cancelled' }, c(tmp));
    assert.equal(byEvent.result.data.total, 0, 'order.cancelled is emitted by a different behavior');

    const byEvent2 = await core.runCapability('cdr.query', { event: 'order.created' }, c(tmp));
    assert.equal(byEvent2.result.data.total, 1);
    assert.equal(byEvent2.result.data.results[0].id, 'order-create');

    // ---- read side: cdr.query by calls_target / target_repo (cross-repo) ----
    const byTarget = await core.runCapability('cdr.query', { calls_target: 'PaymentClient' }, c(tmp));
    assert.equal(byTarget.result.data.total, 1);
    const byRepo = await core.runCapability('cdr.query', { target_repo: 'mall-payment' }, c(tmp));
    assert.equal(byRepo.result.data.total, 1);

    // ---- write side: phase 3 (state) and 4 (domain) ----
    await core.runCapability('cdr.state.derive', { entity: 'Order', behaviors: ['order-create'], repo: 'sample-app' }, c(tmp));
    await core.runCapability('cdr.domain.compose', {
      domain: 'transaction', description: 'Order handling',
      behaviors: ['order-create'], repo: 'sample-app'
    }, c(tmp));

    // ---- write side: phase 5 (capability-map) and 6 (doc.generate) ----
    await core.runCapability('cdr.capability.map.init', {
      product: 'E-Commerce Mall',
      capabilities: [{ id: 'cap.orders', name: 'Orders', spans_repos: ['sample-app'] }]
    }, c(tmp));
    await core.runCapability('cdr.doc.generate', {}, c(tmp));

    // ---- read side: pipeline.status now shows overall_status: complete ----
    const finalStatus = await core.runCapability('cdr.pipeline.status', { repo: 'sample-app' }, c(tmp));
    assert.equal(finalStatus.result.data.overall_status, 'complete');
    for (const p of finalStatus.result.data.phases) {
      if (p.id === 'rule') continue; // rule is skipped by default
      assert.equal(p.status, 'done', `phase ${p.id} expected done, was ${p.status}`);
    }

    // ---- read side: cdr.query by entity returns the Order state machine ----
    const byEntity = await core.runCapability('cdr.query', { target: 'state-machine', entity: 'Order' }, c(tmp));
    assert.equal(byEntity.result.data.total, 1);
    assert.equal(byEntity.result.data.results[0].id, 'Order');

    // ---- read side: cdr.query for the domain returns the transaction domain ----
    const byDomain = await core.runCapability('cdr.query', { target: 'domain', id_contains: 'transaction' }, c(tmp));
    assert.equal(byDomain.result.data.total, 1);

    // ---- lifecycle: feature.close auto-invokes cdr.feature.link ----
    const close = await core.runCapability('feature.close', {
      feature: 'payment-refactor', confirmed: true
    }, c(tmp));
    assert.equal(close.result.ok, true);
    assert.ok(close.result.data.cdr_assets_tagged >= 4,
      `expected at least 4 tagged assets (behavior + state + domain + capmap), got ${close.result.data.cdr_assets_tagged}`);

    // ---- read side: cdr.query by created_by_feature returns the linked assets ----
    const byFeature = await core.runCapability(
      'cdr.query', { created_by_feature: 'payment-refactor' }, c(tmp)
    );
    const ids = byFeature.result.data.results.map((r) => r.id);
    assert.ok(ids.includes('order-create'), 'behavior should be findable via created_by_feature');
    assert.ok(ids.includes('Order'), 'state machine should be findable via created_by_feature');
    assert.ok(byFeature.result.data.results.some((r) => r.kind === 'domain'),
      'domain should be findable via created_by_feature');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
