import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const core = await import('../../packages/core/src/index.ts');
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(__dirname, '../fixtures/sample-node-repo');

function initFixtureRepo(targetPath) {
  execFileSync('cp', ['-R', fixtureRoot, targetPath], { encoding: 'utf8' });
  if (!existsSync(join(targetPath, '.git'))) {
    execFileSync('git', ['-C', targetPath, 'init', '-b', 'main'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.name', 'dapei test'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'add', '.'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'commit', '-m', 'fixture'], { encoding: 'utf8' });
  }
}

test('cognitive integration: discover, upsert, list, context', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cog-int-'));
  const repoPath = join(tmp, 'fixture-repo');
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    initFixtureRepo(repoPath);

    await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, { rootDir: tmp, now: new Date() });

    const { result: discoverResult } = await core.runCapability(
      'cognitive.discover',
      { target: 'sample-app' },
      { rootDir: tmp, now: new Date() }
    );
    assert.equal(discoverResult.data.candidateCount, 0);
    assert.ok(Array.isArray(discoverResult.data.repos));
    assert.ok(discoverResult.data.repos[0].manifest_files.includes('package.json'));
    assert.ok(String(discoverResult.data.repos[0].directory_tree).length > 0);
    assert.ok(existsSync(join(tmp, 'docs/as-is/behavior/_candidates.yaml')));

    const behaviorYaml = readFileSync(join(fixtureRoot, '__expected__/behavior/order-create.yaml'), 'utf8');
    await core.runCapability('cognitive.artifact.upsert', { type: 'behavior', content: behaviorYaml }, { rootDir: tmp, now: new Date() });

    const stateYaml = readFileSync(join(fixtureRoot, '__expected__/state-machines/order.yaml'), 'utf8');
    await core.runCapability('cognitive.artifact.upsert', { type: 'state-machine', content: stateYaml }, { rootDir: tmp, now: new Date() });

    const { result: listResult } = await core.runCapability('cognitive.artifact.list', { repo: 'sample-app' }, { rootDir: tmp, now: new Date() });
    assert.equal(listResult.data.behaviors.length, 1);
    assert.equal(listResult.data.state_machines.length, 1);

    await core.runCapability('feature.create', { name: 'cog-feature', repos: 'sample-app', objective: 'cognitive runtime test objective' }, { rootDir: tmp, now: new Date() });

    const { result: ctxResult } = await core.runCapability(
      'context.build',
      { feature: 'cog-feature', stage: 'analyze-current-state' },
      { rootDir: tmp, now: new Date() }
    );
    assert.ok(existsSync(join(tmp, 'features/cog-feature/context/runtime-context.md')));
    const ctx = readFileSync(join(tmp, 'features/cog-feature/context/runtime-context.md'), 'utf8');
    assert.ok(ctx.includes('Cognitive Behavior Summary'));
    assert.ok(ctx.includes('order-create'));
    assert.equal(ctxResult.ok, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
