// Tests for the pure-string extractors extracted from the router.
//
// These tests pin the existing behavior of extractors so the M1
// refactor does not silently regress field extraction in any route.

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  extractFeatureName,
  extractName,
  extractUrl,
  extractTarget,
  extractRepos,
  extractObjective,
  extractStage,
  extractRepoFromBehavior,
  extractCdrRepoName,
  extractCdrEntryId,
  extractCdrEntityName,
  extractCdrDomainName,
  extractCdrProductName,
  extractCdrDescription,
  STAGES
} = await import('../../packages/router/src/extractors.ts');

test('extractFeatureName: explicit feature: prefix wins', () => {
  assert.equal(extractFeatureName('feature: payment-refactor stuff'), 'payment-refactor');
});

test('extractName: name prefix', () => {
  assert.equal(extractName('add name my-repo'), 'my-repo');
});

test('extractUrl: git@host', () => {
  assert.equal(extractUrl('repos add x git@example.com/repo.git'), 'git@example.com/repo.git');
});

test('extractUrl: https', () => {
  assert.equal(extractUrl('see https://example.com/x'), 'https://example.com/x');
});

test('extractTarget: --target flag', () => {
  assert.equal(extractTarget('sync --target my-repo'), 'my-repo');
});

test('extractTarget: --all literal', () => {
  assert.equal(extractTarget('sync --all'), '--all');
});

test('extractRepos: --repos flag', () => {
  assert.equal(extractRepos('--repos mall-payment,mall-order'), 'mall-payment,mall-order');
});

test('extractObjective: objective: prefix', () => {
  assert.equal(extractObjective('objective: stabilize callbacks'), 'stabilize callbacks');
});

test('extractStage: matches known stages', () => {
  assert.equal(extractStage('context build f --stage implementation'), 'implementation');
  assert.equal(extractStage('context build f --stage analyze-current-state'), 'analyze-current-state');
});

test('extractStage: returns "" on unknown stage', () => {
  assert.equal(extractStage('nothing stage-like here'), '');
});

test('extractCdrRepoName: "for X" extracts X', () => {
  assert.equal(extractCdrRepoName('discover entries for sample-app'), 'sample-app');
});

test('extractCdrRepoName: ignores noise word "domain"', () => {
  assert.equal(extractCdrRepoName('compose domain Transaction'), '');
});

test('extractCdrRepoName: bug fix — was extracting "repo" literal before "sample-app"', () => {
  // Old regex captured "repo" because of an optional keyword group
  // followed by a generic capture. After M1, the Chinese cdr.profile
  // route uses a tighter pattern. Here we verify the English helper
  // still works on the english phrasing.
  assert.equal(extractCdrRepoName('repo sample-app'), 'sample-app');
});

test('extractCdrEntryId: "confirm entry X" extracts X', () => {
  assert.equal(extractCdrEntryId('confirm entry order-create'), 'order-create');
});

test('extractCdrEntityName: capitalized identifier after "for"', () => {
  assert.equal(extractCdrEntityName('discover states for Order'), 'Order');
});

test('extractCdrDomainName: "compose domain X" extracts X', () => {
  assert.equal(extractCdrDomainName('compose domain Transaction'), 'Transaction');
});

test('extractCdrProductName: capability map "for X"', () => {
  assert.equal(extractCdrProductName('capability map for E-Commerce Mall'), 'E-Commerce Mall');
});

test('STAGES: lists exactly 8 entries in canonical order', () => {
  assert.deepEqual([...STAGES], [
    'analyze-current-state',
    'gap-analysis',
    'solution-design',
    'task-breakdown',
    'implementation',
    'local-validation',
    'architecture-review',
    'acceptance'
  ]);
});
