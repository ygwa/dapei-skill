import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');

function setupTestRepos(tmp) {
  const remote = join(tmp, 'remote.git');
  execFileSync('git', ['init', '--bare', '-b', 'main', remote], { encoding: 'utf8' });

  const local = join(tmp, 'local-repo');
  execFileSync('git', ['clone', remote, local], { encoding: 'utf8' });
  execFileSync('git', ['-C', local, 'config', 'user.name', 'test'], { encoding: 'utf8' });
  execFileSync('git', ['-C', local, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  // Force the default branch to 'main' on this checkout — without this, the
  // CI Ubuntu runner's `git init --bare` (without -b) leaves the cloned
  // repo on whatever init.defaultBranch is (typically 'master'), and the
  // subsequent `git push -u origin main` fails.
  execFileSync('git', ['-C', local, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { encoding: 'utf8' });

  // Create a commit in the cloned repo (empty repo has no commits)
  writeFileSync(join(local, 'README.md'), '# test\n');
  execFileSync('git', ['-C', local, 'add', '.'], { encoding: 'utf8' });
  execFileSync('git', ['-C', local, 'commit', '-m', 'init'], { encoding: 'utf8' });
  execFileSync('git', ['-C', local, 'push', '-u', 'origin', 'main'], { encoding: 'utf8' });

  return { remote, local };
}

test('reposSync returns structured results', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-repos-sync-'));
  try {
    const { local } = setupTestRepos(tmp);

    // Create workspace structure: tmp/repos/local-repo
    mkdirSync(join(tmp, 'repos'), { recursive: true });
    execFileSync('git', ['clone', local, join(tmp, 'repos', 'local-repo')], { encoding: 'utf8' });

    // Create minimal workspace.yaml in .dapei
    mkdirSync(join(tmp, '.dapei'), { recursive: true });
    writeFileSync(join(tmp, '.dapei', 'repos.yaml'), 'version: "0.2"\nrepos:\n  - name: local-repo\n    path: repos/local-repo\n');

    const { result } = await core.runCapability('repos.sync', { target: 'local-repo' }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.ok(Array.isArray(result.data.results));
    assert.ok(result.data.results.length > 0);
    assert.ok(result.data.results[0].includes('local-repo'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('reposSync reports pull or rebased status', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-repos-sync-'));
  try {
    const { local } = setupTestRepos(tmp);

    mkdirSync(join(tmp, 'repos'), { recursive: true });
    execFileSync('git', ['clone', local, join(tmp, 'repos', 'local-repo')], { encoding: 'utf8' });

    mkdirSync(join(tmp, '.dapei'), { recursive: true });
    writeFileSync(join(tmp, '.dapei', 'repos.yaml'), 'version: "0.2"\nrepos:\n  - name: local-repo\n    path: repos/local-repo\n');

    const { result } = await core.runCapability('repos.sync', { target: 'local-repo' }, { rootDir: tmp, now: new Date() });

    const firstResult = result.data.results[0];
    // reposSync can produce: update (hash changed), up-to-date (no change), or error
    assert.ok(
      firstResult.includes('up-to-date') ||
      firstResult.includes('->') ||
      firstResult.includes('update'),
      `Expected up-to-date or update format, got: ${firstResult}`
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});