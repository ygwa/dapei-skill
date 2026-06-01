import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');

function cleanTmp(tmp) {
  rmSync(tmp, { recursive: true, force: true });
}

async function setupWorkspace(tmp) {
  await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
  mkdirSync(join(tmp, 'repos'), { recursive: true });
  mkdirSync(join(tmp, '.dapei', 'repos'), { recursive: true });
  writeFileSync(join(tmp, '.dapei', 'repos.yaml'), 'version: "0.2"\nrepos: []\n');
}

function setupGitRepo(repoPath) {
  execFileSync('git', ['init', repoPath], { encoding: 'utf8' });
  execFileSync('git', ['-C', repoPath, 'config', 'user.name', 'test'], { encoding: 'utf8' });
  execFileSync('git', ['-C', repoPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  writeFileSync(join(repoPath, 'README.md'), '# test repo');
  execFileSync('git', ['-C', repoPath, 'add', '.'], { encoding: 'utf8' });
  execFileSync('git', ['-C', repoPath, 'commit', '-m', 'init'], { encoding: 'utf8' });
}

test('repos.remove deletes repo directory', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-rem-'));
  try {
    await setupWorkspace(tmp);
    const repoPath = join(tmp, 'repos', 'sample-app');
    setupGitRepo(repoPath);
    mkdirSync(join(tmp, '.dapei', 'repos'), { recursive: true });
    writeFileSync(join(tmp, '.dapei', 'repos.yaml'), `version: "0.2"\nrepos:\n  - name: sample-app\n    path: repos/sample-app\n`);

    const { result } = await core.runCapability('repos.remove', {
      name: 'sample-app'
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.equal(result.data.name, 'sample-app');
    assert.ok(!existsSync(repoPath), 'repo directory should be deleted');
  } finally {
    cleanTmp(tmp);
  }
});

test('repos.remove fails when repo does not exist', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-rem-'));
  try {
    await setupWorkspace(tmp);
    mkdirSync(join(tmp, '.dapei', 'repos'), { recursive: true });
    writeFileSync(join(tmp, '.dapei', 'repos.yaml'), `version: "0.2"\nrepos: []\n`);

    await assert.rejects(
      () => core.runCapability('repos.remove', {
        name: 'nonexistent'
      }, { rootDir: tmp, now: new Date() }),
      /REPO_MISSING|not found/i
    );
  } finally {
    cleanTmp(tmp);
  }
});

test('repos.remove fails when repo is in use by feature worktree', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-rem-'));
  try {
    await setupWorkspace(tmp);
    const repoPath = join(tmp, 'repos', 'sample-app');
    setupGitRepo(repoPath);
    mkdirSync(join(tmp, '.dapei', 'repos'), { recursive: true });
    writeFileSync(join(tmp, '.dapei', 'repos.yaml'), `version: "0.2"\nrepos:\n  - name: sample-app\n    path: repos/sample-app\n`);

    // Create a feature worktree using the repo - needs actual .git directory
    const wtPath = join(tmp, 'features', 'test-feature', 'repos', 'sample-app');
    mkdirSync(wtPath, { recursive: true });
    execFileSync('git', ['init', wtPath], { encoding: 'utf8' });

    await assert.rejects(
      () => core.runCapability('repos.remove', {
        name: 'sample-app'
      }, { rootDir: tmp, now: new Date() }),
      /REPO_IN_USE|in use/i
    );
  } finally {
    cleanTmp(tmp);
  }
});

test('repos.remove succeeds with force when repo is in use', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-rem-'));
  try {
    await setupWorkspace(tmp);
    const repoPath = join(tmp, 'repos', 'sample-app');
    setupGitRepo(repoPath);
    mkdirSync(join(tmp, '.dapei', 'repos'), { recursive: true });
    writeFileSync(join(tmp, '.dapei', 'repos.yaml'), `version: "0.2"\nrepos:\n  - name: sample-app\n    path: repos/sample-app\n`);

    // Create a feature worktree using the repo
    const wtPath = join(tmp, 'features', 'test-feature', 'repos', 'sample-app');
    mkdirSync(wtPath, { recursive: true });
    execFileSync('git', ['init', wtPath], { encoding: 'utf8' });

    const { result } = await core.runCapability('repos.remove', {
      name: 'sample-app',
      force: true
    }, { rootDir: tmp, now: new Date() });

    assert.equal(result.ok, true);
    assert.ok(!existsSync(repoPath), 'repo directory should be deleted with force');
  } finally {
    cleanTmp(tmp);
  }
});

test('repos.remove removes from repos.yaml', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-rem-'));
  try {
    await setupWorkspace(tmp);
    const repoPath = join(tmp, 'repos', 'sample-app');
    setupGitRepo(repoPath);
    mkdirSync(join(tmp, '.dapei', 'repos'), { recursive: true });
    writeFileSync(join(tmp, '.dapei', 'repos.yaml'), `version: "0.2"\nrepos:\n  - name: sample-app\n    path: repos/sample-app\n`);

    await core.runCapability('repos.remove', {
      name: 'sample-app'
    }, { rootDir: tmp, now: new Date() });

    const content = readFileSync(join(tmp, '.dapei', 'repos.yaml'), 'utf8');
    assert.ok(!content.includes('sample-app'), 'repo should be removed from repos.yaml');
  } finally {
    cleanTmp(tmp);
  }
});