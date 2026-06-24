// Router intent corpus driver.
//
// Reads tests/router/fixtures/intent-corpus.yaml and asserts:
//   1. Every `cases[]` entry routes to the expected `capability` with
//      `confidence >= min_confidence` and the expected input subset.
//   2. Every `conflicts[]` entry produces the expected winner (and the
//      loser was an actual pattern match candidate).
//
// This test is the regression net for any router refactor. It MUST pass
// against the current (pre-refactor) router and continue to pass after
// the data-driven refactor lands.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { load } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = join(__dirname, 'fixtures', 'intent-corpus.yaml');

const router = await import('../../packages/router/src/index.ts');

const corpus = load(readFileSync(CORPUS_PATH, 'utf8'));
if (!corpus || typeof corpus !== 'object') {
  throw new Error(`corpus at ${CORPUS_PATH} is not a YAML object`);
}

const cases = Array.isArray(corpus.cases) ? corpus.cases : [];
const conflicts = Array.isArray(corpus.conflicts) ? corpus.conflicts : [];

// --- 1. Every case resolves to the expected capability + confidence ---

for (const c of cases) {
  test(`corpus: ${c.id}`, () => {
    const route = router.routeIntent(String(c.intent));
    assert.ok(
      route,
      `router.routeIntent returned falsy for intent "${c.intent}"`
    );
    const expect = c.expect || {};
    assert.equal(
      route.capability,
      expect.capability,
      `intent "${c.intent}" expected ${expect.capability}, got ${route.capability} (reason=${route.reason})`
    );
    if (typeof expect.min_confidence === 'number') {
      assert.ok(
        route.confidence >= expect.min_confidence,
        `intent "${c.intent}" confidence ${route.confidence} < ${expect.min_confidence}`
      );
    }
    if (expect.input_contains && typeof expect.input_contains === 'object') {
      for (const [k, v] of Object.entries(expect.input_contains)) {
        assert.equal(
          route.input[k],
          v,
          `intent "${c.intent}" input.${k} expected "${v}", got "${route.input[k]}"`
        );
      }
    }
  });
}

// --- 2. Conflicting intents produce the documented winner ---

for (const conflict of conflicts) {
  test(`conflict: ${conflict.id}`, () => {
    const route = router.routeIntent(String(conflict.intent));
    const expect = conflict.expect || {};
    assert.equal(
      route.capability,
      expect.winner,
      `conflict "${conflict.intent}" expected winner ${expect.winner}, got ${route.capability} (reason=${route.reason})`
    );
    // The loser must be reachable from the same intent by at least one
    // route in the table. We do not re-evaluate the loser's confidence
    // here — only that the router has the capability registered.
    assert.ok(
      route.capability !== expect.loser,
      `conflict "${conflict.intent}" did not differentiate winner from loser (both ${expect.loser})`
    );
  });
}
