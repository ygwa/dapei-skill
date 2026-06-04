import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

const core = await import('../../packages/core/src/index.ts');

function cleanTmp(tmp) {
  rmSync(tmp, { recursive: true, force: true });
}

function setupGitRepo(tmp, name) {
  const repoDir = join(tmp, 'repos', name);
  const remoteDir = join(tmp, `remote-${name}.git`);
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(remoteDir, { recursive: true });

  execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
  execSync('git init -b main', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com" && git config user.name "test"', { cwd: repoDir, stdio: 'pipe' });
  execSync('git remote add origin file://' + remoteDir, { cwd: repoDir, stdio: 'pipe' });
  writeFileSync(join(repoDir, 'README.md'), `# test ${name}`);
  execSync('git add . && git commit -m "init"', { cwd: repoDir, stdio: 'pipe' });
  execSync('git push -u origin main', { cwd: repoDir, stdio: 'pipe' });
}

test('feature.create queries global cognitive index and injects related context', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-feat-context-'));
  try {
    // 1. Init workspace
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    // 2. Setup repos with remotes to support checkout & fetch
    setupGitRepo(tmp, 'payment-service');
    setupGitRepo(tmp, 'billing-core');

    // 3. Create dummy cognitive index and behavior artifact
    mkdirSync(join(tmp, 'docs', 'as-is', 'behavior'), { recursive: true });
    mkdirSync(join(tmp, 'docs', 'as-is', 'state-machines'), { recursive: true });
    mkdirSync(join(tmp, '.dapei', 'cognitive'), { recursive: true });

    const behaviorContent = `id: payment-callback
repo: payment-service
entry:
  type: api
  method: POST
  path: /v1/payment/callback
confidence:
  level: high
  kind: fact
sources:
  - file: src/callback.js
    line: 12
`;
    writeFileSync(join(tmp, 'docs', 'as-is', 'behavior', 'payment-callback.yaml'), behaviorContent);

    const indexContent = `version: "1.0"
updated_at: "${new Date().toISOString()}"
behaviors:
  - id: payment-callback
    path: docs/as-is/behavior/payment-callback.yaml
    repo: payment-service
    kind: fact
    level: high
state_machines: []
unknowns: []
`;
    writeFileSync(join(tmp, '.dapei', 'cognitive', 'index.yaml'), indexContent);

    // 4. Run feature.create
    const { result } = await core.runCapability('feature.create', {
      name: 'payment-refactor',
      repos: 'payment-service,billing-core',
      objective: 'Refactor payment callback'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);

    // 5. Verify context injection
    const contextPath = join(tmp, 'features', 'payment-refactor', 'context', 'related-cognitive-context.md');
    assert.ok(existsSync(contextPath), 'related-cognitive-context.md should exist');

    const contextText = readFileSync(contextPath, 'utf8');
    assert.ok(contextText.includes('payment-callback'), 'should link to payment-callback behavior');

    const currentStatePath = join(tmp, 'features', 'payment-refactor', 'docs', '01-current-state.md');
    const currentStateText = readFileSync(currentStatePath, 'utf8');
    assert.ok(currentStateText.includes('related-cognitive-context.md'), '01-current-state should reference injected context');

  } finally {
    cleanTmp(tmp);
  }
});
