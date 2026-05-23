import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();
const dapei = join(repoRoot, 'scripts', 'dapei');

function run(args, cwd, env = {}) {
  return execFileSync(dapei, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
}

test('engine run and route interfaces work in workspace', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-int-'));
  const ws = join(tmp, 'ws');
  const fixture = join(tmp, 'fixture');

  cpSync(join(repoRoot, 'tests', 'fixtures', 'sample-node-repo'), fixture, { recursive: true });
  execFileSync('git', ['-C', fixture, 'init', '-b', 'main']);
  execFileSync('git', ['-C', fixture, 'add', '.']);
  execFileSync('git', ['-C', fixture, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);

  const initOut = run(['init', 'workspace'], repoRoot, { DAPEI_WORKSPACE_ROOT: ws });
  assert.match(initOut, /workspace initialized/i);

  assert.ok(existsSync(join(ws, '.gitignore')));
  assert.ok(readFileSync(join(ws, '.gitignore'), 'utf8').includes('features/*/repos/'));
  assert.ok(existsSync(join(ws, '.git')));

  run(['repos', 'add', 'sample-app', fixture], repoRoot, { DAPEI_WORKSPACE_ROOT: ws });

  assert.ok(existsSync(join(ws, '.gitmodules')));
  assert.ok(readFileSync(join(ws, '.gitmodules'), 'utf8').includes('[submodule "repos/sample-app"]'));
  run(['create', 'feature', 'f1', '--repos', 'sample-app'], repoRoot, { DAPEI_WORKSPACE_ROOT: ws });

  const routeOut = execFileSync('node', ['--experimental-strip-types', join(repoRoot, 'engine', 'dapei-engine.ts'), 'route', '--intent', 'validate feature', '--context', '{"feature":"f1"}'], {
    cwd: repoRoot,
    env: { ...process.env, DAPEI_WORKSPACE_ROOT: ws },
    encoding: 'utf8'
  });
  assert.match(routeOut, /"capability":\s*"validation.run"/);

  const guardrailOut = run(['run', '--capability', 'guardrail.run', '--input', '{"feature":"f1"}'], repoRoot, { DAPEI_WORKSPACE_ROOT: ws });
  assert.match(guardrailOut, /status/i);
});
