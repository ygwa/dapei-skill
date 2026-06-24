// Tests for the static route-conflict detector.

import test from 'node:test';
import assert from 'node:assert/strict';

const router = await import('../../packages/router/src/index.ts');

test('introspectConflicts: returns a structured result', () => {
  const { conflicts, text } = router.introspectConflicts();
  assert.ok(Array.isArray(conflicts), 'conflicts must be an array');
  assert.equal(typeof text, 'string');
  // Empty conflict set would be a surprise given the routing table we
  // ship today; assert at least one documented conflict from the
  // corpus surfaces here.
  assert.ok(conflicts.length >= 1, 'expected at least one documented conflict');
});

test('introspectConflicts: every conflict has sample intents and a winner', () => {
  const { conflicts } = router.introspectConflicts();
  for (const c of conflicts) {
    assert.ok(c.sampleIntents.length >= 1, `conflict ${c.routeA.id}/${c.routeB.id} has no sample intents`);
    assert.ok(c.winner === "A" || c.winner === "B", `conflict winner must be A or B, got ${c.winner}`);
  }
});

test('introspectConflicts: winner agrees with routeIntent on every sample intent', () => {
  const { conflicts } = router.introspectConflicts();
  for (const c of conflicts) {
    const winnerRoute = c.winner === "A" ? c.routeA : c.routeB;
    for (const intent of c.sampleIntents) {
      const result = router.routeIntent(intent);
      assert.equal(
        result.capability,
        winnerRoute.capability,
        `intent "${intent}" routed to ${result.capability}, but conflict declared ${winnerRoute.capability} as winner`
      );
    }
  }
});
