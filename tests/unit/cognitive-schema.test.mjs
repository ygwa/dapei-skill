import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArtifact, validateEvidenceFields, parseConfidence } from '../../packages/core/src/evidence.ts';
import { parseYamlDocument } from '../../packages/core/src/yaml-doc.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(__dirname, '../fixtures/sample-node-repo');

test('parseConfidence accepts valid block', () => {
  const c = parseConfidence({ level: 'high', kind: 'fact', evidence_type: 'direct_code' });
  assert.equal(c.level, 'high');
  assert.equal(c.kind, 'fact');
});

test('validateEvidenceFields rejects fact without sources', () => {
  const errors = validateEvidenceFields(
    { confidence: { level: 'high', kind: 'fact' }, sources: [] },
    'behavior:test'
  );
  assert.ok(errors.some((e) => e.includes('kind=fact requires sources')));
});

test('validateEvidenceFields rejects inference without derived_from', () => {
  const errors = validateEvidenceFields(
    { confidence: { level: 'medium', kind: 'inference' }, derived_from: [] },
    'behavior:test'
  );
  assert.ok(errors.some((e) => e.includes('kind=inference requires derived_from')));
});

test('validateEvidenceFields rejects unknown without reason', () => {
  const errors = validateEvidenceFields(
    { confidence: { level: 'low', kind: 'unknown' } },
    'behavior:test'
  );
  assert.ok(errors.some((e) => e.includes('kind=unknown requires reason')));
});

test('validateBehaviorArtifact passes expected fixture', () => {
  const content = readFileSync(join(fixtureRoot, 'expected/behavior/order-create.yaml'), 'utf8');
  const doc = parseYamlDocument(content);
  const errors = validateArtifact('behavior', doc);
  assert.deepEqual(errors, []);
});

test('validateStateMachineArtifact passes expected fixture', () => {
  const content = readFileSync(join(fixtureRoot, 'expected/state-machines/order.yaml'), 'utf8');
  const doc = parseYamlDocument(content);
  const errors = validateArtifact('state-machine', doc);
  assert.deepEqual(errors, []);
});

test('validateBehaviorArtifact rejects fact without sources', () => {
  const errors = validateArtifact('behavior', {
    id: 'bad-behavior',
    entry: { type: 'api', method: 'POST', path: '/x' },
    confidence: { level: 'high', kind: 'fact' }
  });
  assert.ok(errors.length > 0);
});

test('parseYamlDocument parses behavior fixture', () => {
  const content = readFileSync(join(fixtureRoot, 'expected/behavior/order-create.yaml'), 'utf8');
  const doc = parseYamlDocument(content);
  assert.equal(doc.id, 'order-create');
  assert.equal(doc.repo, 'sample-app');
  assert.ok(Array.isArray(doc.events));
});
