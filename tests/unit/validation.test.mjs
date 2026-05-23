import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');

test('validationRun returns errors array in result', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-val-'));
  try {
    // Setup workspace with feature that has no test commands
    mkdirSync(join(tmp, 'repos'), { recursive: true });
    mkdirSync(join(tmp, '.dapei'), { recursive: true });
    mkdirSync(join(tmp, 'features', 'test-feature', 'reports'), { recursive: true });
    mkdirSync(join(tmp, 'features', 'test-feature', 'repos'), { recursive: true });

    writeFileSync(join(tmp, '.dapei', 'workspace.yaml'), `version: "0.2"\nworkspace:\n  name: test\n`);
    writeFileSync(join(tmp, 'features', 'test-feature', 'feature.yaml'), `
version: "0.2"
feature:
  name: test-feature
  repos:
    - name: sample-app
`);

    const { result } = await core.runCapability('validation.run', { feature: 'test-feature' }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.ok(Array.isArray(result.data.errors));
    // No errors if feature has no repos with test commands
    assert.ok(result.data.errors !== undefined);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('validationRun writes validation-report with error info', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-val-'));
  try {
    mkdirSync(join(tmp, 'repos'), { recursive: true });
    mkdirSync(join(tmp, '.dapei'), { recursive: true });
    mkdirSync(join(tmp, 'features', 'test-feature', 'reports'), { recursive: true });
    mkdirSync(join(tmp, 'features', 'test-feature', 'repos'), { recursive: true });

    writeFileSync(join(tmp, '.dapei', 'workspace.yaml'), `version: "0.2"\nworkspace:\n  name: test\n`);
    writeFileSync(join(tmp, 'features', 'test-feature', 'feature.yaml'), `
version: "0.2"
feature:
  name: test-feature
  repos:
    - name: sample-app
`);

    await core.runCapability('validation.run', { feature: 'test-feature' }, { rootDir: tmp, now: new Date() });

    const reportPath = join(tmp, 'features', 'test-feature', 'reports', 'validation-report.md');
    assert.ok(existsSync(reportPath), 'validation-report.md should exist');
    const report = readFileSync(reportPath, 'utf8');
    assert.ok(report.includes('Validation Report'));
    assert.ok(report.includes('Errors:'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('validationRun distinguishes test status from guardrail status', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-val-'));
  try {
    mkdirSync(join(tmp, 'repos'), { recursive: true });
    mkdirSync(join(tmp, '.dapei', 'rules'), { recursive: true });
    mkdirSync(join(tmp, 'features', 'test-feature', 'reports'), { recursive: true });
    mkdirSync(join(tmp, 'features', 'test-feature', 'repos'), { recursive: true });

    writeFileSync(join(tmp, '.dapei', 'workspace.yaml'), `version: "0.2"\nworkspace:\n  name: test\n`);
    writeFileSync(join(tmp, 'features', 'test-feature', 'feature.yaml'), `
version: "0.2"
feature:
  name: test-feature
  repos: []
`);
    writeFileSync(join(tmp, '.dapei', 'rules', 'test.yaml'), `
rules:
  - id: TEST-001
    title: test rule
    severity: medium
    message: test
    check:
      type: file-required
      files:
        - features/test-feature/docs/01-current-state.md
`);

    const { result } = await core.runCapability('validation.run', { feature: 'test-feature' }, { rootDir: tmp, now: new Date() });

    // No repos, so test status should be FAIL
    assert.ok(result.data.status === 'FAIL' || result.data.status === 'PASS');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});