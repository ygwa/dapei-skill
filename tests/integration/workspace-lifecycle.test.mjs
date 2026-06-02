import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

const repoRoot = process.cwd();
const dapei = join(repoRoot, 'scripts', 'dapei');

function runDapei(args, cwd) {
  try {
    return execFileSync(dapei, args, {
      cwd,
      env: { ...process.env, DAPEI_WORKSPACE_ROOT: cwd },
      encoding: 'utf8'
    });
  } catch (err) {
    return err.stderr || err.message;
  }
}

function cleanTmp(tmp) {
  rmSync(tmp, { recursive: true, force: true });
}

test('workspace-lifecycle: workspace init creates correct structure (root:., no nested workspace/)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-lifecycle-'));
  try {
    // Workspace init via CLI
    const out = runDapei(['init', 'workspace'], tmp);
    assert.match(out, /workspace initialized/i);

    // Verify .dapei/ is directly at root (not nested workspace/)
    assert.ok(existsSync(join(tmp, '.dapei', 'workspace.yaml')), '.dapei/workspace.yaml at root');
    assert.ok(!existsSync(join(tmp, 'workspace')), 'no nested workspace/ dir');
    assert.ok(!existsSync(join(tmp, 'workspace', '.dapei')), 'no workspace/.dapei/');

    // Core directories at root level
    assert.ok(existsSync(join(tmp, 'repos')), 'repos/ at root');
    assert.ok(existsSync(join(tmp, 'features')), 'features/ at root');
    assert.ok(existsSync(join(tmp, 'docs')), 'docs/ at root');

    // workspace.yaml has root: .
    const wsYaml = readFileSync(join(tmp, '.dapei', 'workspace.yaml'), 'utf8');
    assert.ok(wsYaml.includes('root: .'), 'workspace.yaml should have root: .');
  } finally {
    cleanTmp(tmp);
  }
});