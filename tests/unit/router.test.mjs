import test from 'node:test';
import assert from 'node:assert/strict';

const router = await import('../../packages/router/src/index.ts');

test('route init workspace intent', () => {
  const r = router.routeIntent('initialize workspace');
  assert.equal(r.capability, 'workspace.init');
});

test('route feature create intent', () => {
  const r = router.routeIntent('create feature', { name: 'f1', repos: 'r1' });
  assert.equal(r.capability, 'feature.create');
  assert.equal(r.input.name, 'f1');
});
