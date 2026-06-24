// YAML round-trip preservation test for provenance fields.
//
// M2 of feature/router-and-provenance-governance locks the invariant:
// every provenance field (created_by_feature, updated_by_feature,
// created_at, updated_at) survives a parse → validate → stringify →
// parse cycle through the engine's YAML pipeline. This file is pure
// JavaScript because --experimental-strip-types only processes .ts
// imports in this Node version; the test file is .mjs.
//
// TypeScript-side contract lives in packages/core/src/evidence.ts
// (EvidenceFields) and is enforced by `npm run typecheck`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateArtifact, validateBehaviorArtifact } from '../../packages/core/src/evidence.ts';
import { parseYamlDocument, stringifyYamlDocument } from '../../packages/core/src/yaml-doc.ts';

const PROVENANCE_KEYS = ['created_by_feature', 'updated_by_feature', 'created_at', 'updated_at'];
const PROVENANCE_TS = '2026-06-24T00:00:00.000Z';
const FEATURE = 'payment-refactor';

function withProvenance(doc, feature = FEATURE) {
  return {
    ...doc,
    created_by_feature: feature,
    updated_by_feature: feature,
    created_at: PROVENANCE_TS,
    updated_at: PROVENANCE_TS
  };
}

test('yaml round-trip: provenance fields survive parse → stringify → parse', () => {
  const original = withProvenance({
    id: 'order-create',
    repo: 'sample-app',
    entry: { type: 'api', method: 'POST', path: '/orders' },
    steps: [{ name: 'verify', action: 'check' }],
    confidence: { kind: 'fact', level: 'high' },
    sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
  });

  const serialized = stringifyYamlDocument(original);
  const roundTripped = parseYamlDocument(serialized);

  for (const key of PROVENANCE_KEYS) {
    assert.equal(roundTripped[key], original[key], `${key} lost during round-trip`);
  }
});

test('yaml round-trip: provenance fields survive validateArtifact (pass-through)', () => {
  const original = withProvenance({
    id: 'order-create',
    repo: 'sample-app',
    entry: { type: 'api', method: 'POST', path: '/orders' },
    steps: [{ name: 'verify', action: 'check' }],
    confidence: { kind: 'fact', level: 'high' },
    sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
  });

  const errors = validateArtifact('behavior', original);
  assert.deepEqual(errors, [], 'behavior with provenance should validate cleanly');

  const serialized = stringifyYamlDocument(original);
  const roundTripped = parseYamlDocument(serialized);

  const errorsAfter = validateArtifact('behavior', roundTripped);
  assert.deepEqual(errorsAfter, [], 'round-tripped behavior should still validate');

  for (const key of PROVENANCE_KEYS) {
    assert.equal(roundTripped[key], original[key], `${key} lost after validateArtifact + round-trip`);
  }
});

test('yaml round-trip: state-machine preserves provenance', () => {
  const original = withProvenance({
    entity: 'Order',
    repo: 'sample-app',
    states: [{ name: 'pending' }, { name: 'paid' }],
    transitions: [{ trigger: 'pay', from: 'pending', to: 'paid' }],
    confidence: { kind: 'fact', level: 'high' },
    sources: [{ file: 'src/services/order.ts', line: 12, repo: 'sample-app' }]
  });

  const errors = validateArtifact('state-machine', original);
  assert.deepEqual(errors, [], 'state-machine with provenance should validate cleanly');

  const roundTripped = parseYamlDocument(stringifyYamlDocument(original));
  for (const key of PROVENANCE_KEYS) {
    assert.equal(roundTripped[key], original[key], `state-machine ${key} lost`);
  }
});

test('yaml round-trip: business-rule preserves provenance', () => {
  const original = withProvenance({
    id: 'order-amount-positive',
    kind: 'invariant',
    repo: 'sample-app',
    description: 'Order amount must be positive.',
    applies_to: ['order-create'],
    confidence: { kind: 'fact', level: 'high' },
    sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }]
  });

  const errors = validateArtifact('business-rule', original);
  assert.deepEqual(errors, [], 'business-rule with provenance should validate cleanly');

  const roundTripped = parseYamlDocument(stringifyYamlDocument(original));
  for (const key of PROVENANCE_KEYS) {
    assert.equal(roundTripped[key], original[key], `business-rule ${key} lost`);
  }
});

test('yaml round-trip: domain preserves provenance', () => {
  const original = withProvenance({
    domain: 'transaction',
    description: 'Order handling domain',
    repo: 'sample-app',
    modules: [{ name: 'orders' }],
    derived_from: ['order-create'],
    confidence: { kind: 'inference', level: 'medium' }
  });

  const errors = validateArtifact('domain', original);
  assert.deepEqual(errors, [], 'domain with provenance should validate cleanly');

  const roundTripped = parseYamlDocument(stringifyYamlDocument(original));
  for (const key of PROVENANCE_KEYS) {
    assert.equal(roundTripped[key], original[key], `domain ${key} lost`);
  }
});

test('EvidenceFields: provenance fields are part of the v0.10 contract', () => {
  // The runtime contract is locked by the round-trip tests above. The
  // TypeScript shape is enforced by `npm run typecheck`. To assert the
  // surface here without importing the TS-only type, read the source
  // and check the four optional fields are declared on EvidenceFields.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(__dirname, '..', '..', 'packages', 'core', 'src', 'evidence.ts'), 'utf8');
  for (const key of PROVENANCE_KEYS) {
    assert.ok(
      src.includes(`${key}?:`),
      `EvidenceFields must declare ${key}?: (v0.10 contract)`
    );
  }
});

test('validateBehaviorArtifact: provenance-only fields do not produce errors', () => {
  const errors = validateBehaviorArtifact({
    id: 'order-create',
    entry: { type: 'api', method: 'POST', path: '/orders' },
    confidence: { kind: 'fact', level: 'high' },
    sources: [{ file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }],
    created_by_feature: FEATURE,
    updated_by_feature: FEATURE,
    created_at: PROVENANCE_TS,
    updated_at: PROVENANCE_TS
  });
  assert.deepEqual(errors, [], 'behavior with provenance-only fields should validate cleanly');
});
