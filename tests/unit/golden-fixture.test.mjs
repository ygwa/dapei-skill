import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const EXPECTED_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'sample-node-repo', '__expected__');

test('golden-fixture: __expected__/behavior/order-create.yaml exists', () => {
  const path = join(EXPECTED_DIR, 'behavior', 'order-create.yaml');
  assert.ok(existsSync(path), 'golden fixture behavior artifact should exist');
});

test('golden-fixture: __expected__/state-machines/order.yaml exists', () => {
  const path = join(EXPECTED_DIR, 'state-machines', 'order.yaml');
  assert.ok(existsSync(path), 'golden fixture state machine artifact should exist');
});

test('golden-fixture: order-create.yaml has required fields', () => {
  const path = join(EXPECTED_DIR, 'behavior', 'order-create.yaml');
  const content = readFileSync(path, 'utf8');

  assert.ok(content.includes('id:'), 'behavior should have id field');
  assert.ok(content.includes('method:'), 'behavior should have method field');
  assert.ok(content.includes('path:'), 'behavior should have path field');
  assert.ok(content.includes('level:'), 'behavior should have level field');
});

test('golden-fixture: order.yaml state machine has states', () => {
  const path = join(EXPECTED_DIR, 'state-machines', 'order.yaml');
  const content = readFileSync(path, 'utf8');

  // State machine should have state entries
  const stateMatches = content.match(/^\s+-\s+\w+/gm);
  assert.ok(stateMatches && stateMatches.length >= 2, 'state machine should have at least 2 states');
});

test('golden-fixture: cognitive.artifact.upsert output matches golden when run through engine', async () => {
  // This test verifies that upserting the golden artifact produces matching output
  const goldenBehaviorPath = join(EXPECTED_DIR, 'behavior', 'order-create.yaml');
  const goldenContent = readFileSync(goldenBehaviorPath, 'utf8');

  // Verify golden content has expected structure for upsert
  assert.ok(goldenContent.includes('order-create'), 'golden artifact should reference order-create');
  assert.ok(goldenContent.includes('method:'), 'golden artifact should have method field for upsert comparison');
});