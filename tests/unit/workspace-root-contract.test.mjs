import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';

const core = await import('../../packages/core/src/index.ts');

function cleanTmp(tmp) {
  rmSync(tmp, { recursive: true, force: true });
}

test('workspace.init does NOT create nested workspace/ directory', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-root-contract-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    // .dapei/ must be directly under root, NOT under workspace/
    assert.ok(existsSync(join(tmp, '.dapei', 'workspace.yaml')), '.dapei/workspace.yaml should exist directly under root');
    assert.ok(!existsSync(join(tmp, 'workspace', '.dapei', 'workspace.yaml')), 'nested workspace/.dapei/ should NOT exist');
    assert.ok(!existsSync(join(tmp, 'workspace')), 'no workspace/ directory should be created');

    // Core structural dirs should be at root level
    assert.ok(existsSync(join(tmp, 'repos')), 'repos/ should be at root');
    assert.ok(existsSync(join(tmp, 'features')), 'features/ should be at root');
    assert.ok(existsSync(join(tmp, 'docs')), 'docs/ should be at root');
  } finally {
    cleanTmp(tmp);
  }
});

test('workspace.init creates .dapei/ directly under root', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-root-contract-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    // Verify .dapei is at root level
    assert.ok(existsSync(join(tmp, '.dapei')), '.dapei/ should exist at root');
    assert.ok(existsSync(join(tmp, '.dapei', 'workspace.yaml')), '.dapei/workspace.yaml should exist');

    // NOTE: commands.yaml and other template files are only copied when DAPEI_ENGINE_HOME
    // is set to the project root (they come from .dapei/ in the engine home).
    // Without DAPEI_ENGINE_HOME set, only the hardcoded workspace.yaml is created.
  } finally {
    cleanTmp(tmp);
  }
});

test('workspace.init writes root: . in workspace.yaml', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-root-contract-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    const wsYaml = readFileSync(join(tmp, '.dapei', 'workspace.yaml'), 'utf8');
    assert.ok(wsYaml.includes('root: .'), 'workspace.yaml should have root: .');
    // Should NOT have root: workspace or root: ./workspace
    assert.ok(!wsYaml.includes('root: workspace'), 'root should not be "workspace"');
    assert.ok(!wsYaml.match(/root:\s+"\.\/workspace"/), 'root should not be "./workspace"');
  } finally {
    cleanTmp(tmp);
  }
});