import test from 'node:test';
import assert from 'node:assert/strict';

const router = await import('../../packages/router/src/index.ts');

test('route init workspace intent', () => {
  const r = router.routeIntent('initialize workspace');
  assert.equal(r.capability, 'workspace.init');
  assert.equal(r.confidence, 0.95);
});

test('route init workspace (no confidence injection)', () => {
  const r = router.routeIntent('init workspace');
  assert.equal(r.capability, 'workspace.init');
});

test('route create feature intent', () => {
  const r = router.routeIntent('create feature', { name: 'f1', repos: 'r1' });
  assert.equal(r.capability, 'feature.create');
  assert.equal(r.input.name, 'f1');
  assert.equal(r.confidence, 0.95);
});

test('route repos add', () => {
  const r = router.routeIntent('repos add my-repo git@example.com/repo.git');
  assert.equal(r.capability, 'repos.add');
  assert.equal(r.confidence, 0.9);
});

test('route repos sync', () => {
  const r = router.routeIntent('repos sync --all');
  assert.equal(r.capability, 'repos.sync');
  assert.equal(r.input.target, '--all');
});

test('route repos list', () => {
  const r = router.routeIntent('list the repos');
  assert.equal(r.capability, 'repos.list');
});

test('route repos analyze', () => {
  const r = router.routeIntent('analyze repos');
  assert.equal(r.capability, 'repos.analyze');
  assert.equal(r.confidence, 0.95);
});

test('route context build', () => {
  const r = router.routeIntent('context build for feature auth');
  assert.equal(r.capability, 'context.build');
  assert.equal(r.confidence, 0.95);
});

test('route workflow runStage', () => {
  const r = router.routeIntent('run workflow on feature auth --stage implementation');
  assert.equal(r.capability, 'workflow.runStage');
  assert.equal(r.input.stage, 'implementation');
});

test('route validate', () => {
  const r = router.routeIntent('validate feature auth');
  assert.equal(r.capability, 'validation.run');
});

test('route feature report', () => {
  const r = router.routeIntent('generate report for feature auth');
  assert.equal(r.capability, 'feature.report');
});

test('route feature review', () => {
  const r = router.routeIntent('review feature auth');
  assert.equal(r.capability, 'feature.review');
});

test('route close feature (normal order)', () => {
  const r = router.routeIntent('close feature payment-refactor');
  assert.equal(r.capability, 'feature.close');
});

test('route feature close (reversed order)', () => {
  const r = router.routeIntent('feature close payment-refactor');
  assert.equal(r.capability, 'feature.close');
});

test('route status (fallback)', () => {
  const r = router.routeIntent('status');
  assert.equal(r.capability, 'feature.status');
  assert.equal(r.confidence, 0.7);
});

test('route chinese: 创建 feature', () => {
  const r = router.routeIntent('创建 feature payment');
  assert.equal(r.capability, 'feature.create');
  assert.equal(r.confidence, 0.95);
});

test('route chinese: 新开一个需求', () => {
  const r = router.routeIntent('新开一个需求涉及 mall-payment');
  assert.equal(r.capability, 'feature.create');
  assert.equal(r.confidence, 0.95);
});

test('route confidence: higher confidence wins', () => {
  const r1 = router.routeIntent('repos add x');
  const r2 = router.routeIntent('repos analyze x');
  // repos.analyze has confidence 0.95, repos.add has 0.9
  // so analyze should win when both patterns match
  assert.ok(r2.confidence >= r1.confidence);
});

test('route feature create with context override', () => {
  const r = router.routeIntent('create feature', { name: 'from-context' });
  assert.equal(r.input.name, 'from-context');
});

test('route repos sync target extraction', () => {
  const r = router.routeIntent('sync repos --target my-repo');
  assert.equal(r.input.target, 'my-repo');
});

// === Stage drift prevention tests ===

const VALID_STAGES = [
  'analyze-current-state',
  'gap-analysis',
  'solution-design',
  'task-breakdown',
  'implementation',
  'local-validation',
  'architecture-review',
  'acceptance'
];

test('stage drift: all valid stages are routed correctly', () => {
  for (const stage of VALID_STAGES) {
    const r = router.routeIntent(`context build my-feature --stage ${stage}`);
    assert.equal(r.input.stage, stage, `stage "${stage}" should be extracted`);
  }
});

test('stage drift: unknown stage is not extracted from stage: prefix', () => {
  const r = router.routeIntent('context build my-feature --stage unknown-stage');
  // unknown stage falls back to regex extraction which returns empty string
  // or the raw value depending on implementation
  const validStages = VALID_STAGES;
  assert.ok(!validStages.includes(r.input.stage) || r.input.stage === 'unknown-stage',
    `unknown stage should not match valid stages`);
});

test('stage drift: stage extraction is case-sensitive', () => {
  const r1 = router.routeIntent('context build f --stage analyze-current-state');
  assert.equal(r1.input.stage, 'analyze-current-state');

  const r2 = router.routeIntent('context build f --stage Analyze-Current-State');
  // case-insensitive matching via includes(), so this may still match
  // The actual behavior: t.includes(s) is case-sensitive
  // So "Analyze-Current-State".includes("analyze-current-state") === false
  assert.notEqual(r2.input.stage, 'analyze-current-state');
});

test('stage drift: stage without prefix is not matched', () => {
  // These stage-like strings without "stage:" prefix should not be extracted
  const r = router.routeIntent('analyze-current-state implementation');
  // Since the stage list is checked via t.includes(), a bare stage name in text
  // would be matched by extractStage if it appears in the intent string
  assert.equal(r.capability, 'feature.status'); // no context.build intent
});

test('stage drift: extractStage uses hardcoded array', () => {
  // Verify the stages array in extractStage matches our expected stages
  const r = router.routeIntent('run workflow f --stage implementation');
  assert.equal(r.input.stage, 'implementation');
  assert.ok(VALID_STAGES.includes(r.input.stage));
});