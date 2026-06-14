import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
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

const c = (tmp) => ({ rootDir: tmp, now: new Date() });

async function setupWorkspaceWithFeature() {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-context-cdr-'));
  const repoPath = join(tmp, 'fixture-repo');
  await core.runCapability('workspace.init', {}, c(tmp));
  initFixtureRepo(repoPath);
  await core.runCapability('repos.add', { name: 'sample-app', url: repoPath }, c(tmp));
  await core.runCapability(
    'feature.create',
    {
      name: 'test-feature',
      objective: 'context CDR injection test',
      repos: 'sample-app'
    },
    c(tmp)
  );
  return tmp;
}

test('context.build analyze-current-state: empty workspace emits cdr.bootstrap hint', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    const { result } = await core.runCapability(
      'context.build',
      { feature: 'test-feature', stage: 'analyze-current-state' },
      c(tmp)
    );
    assert.equal(result.ok, true);
    const out = readFileSync(join(tmp, result.data.runtimeContext), 'utf8');
    assert.match(out, /## Cognitive Assets Available/);
    assert.match(out, /No cognitive assets yet/);
    assert.match(out, /@dapei cdr bootstrap <repo>/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('context.build analyze-current-state: after cdr.bootstrap shows profiles count', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    // Simulate the post-cdr.bootstrap state by writing a profile yaml
    // directly (this branch is based on main which doesn't yet ship
    // cdr.bootstrap; the merge will land both PRs together).
    const profilesDir = join(tmp, 'docs', 'as-is', 'profiles');
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(
      join(profilesDir, 'sample-app.yaml'),
      'repo: sample-app\nlanguage: nodejs\n'
    );
    const { result } = await core.runCapability(
      'context.build',
      { feature: 'test-feature', stage: 'analyze-current-state' },
      c(tmp)
    );
    const out = readFileSync(join(tmp, result.data.runtimeContext), 'utf8');
    assert.match(out, /- profiles: 1/);
    assert.match(out, /- confirmed entries: 0/);
    assert.match(out, /- candidate entries: 0/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('context.build analyze-current-state: confirmed entry is counted separately', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    const entriesDir = join(tmp, 'docs', 'as-is', 'entries');
    mkdirSync(entriesDir, { recursive: true });
    writeFileSync(
      join(entriesDir, 'sample-app.yaml'),
      "id: order-create\nstatus: confirmed\n"
    );
    const { result } = await core.runCapability(
      'context.build',
      { feature: 'test-feature', stage: 'analyze-current-state' },
      c(tmp)
    );
    const out = readFileSync(join(tmp, result.data.runtimeContext), 'utf8');
    assert.match(out, /- confirmed entries: 1/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('context.build solution-design: emits behaviors + state_machines + business_rules counts', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    const indexDir = join(tmp, '.dapei', 'cognitive');
    mkdirSync(indexDir, { recursive: true });
    writeFileSync(
      join(indexDir, 'index.yaml'),
      [
        'version: "0.2"',
        'updated_at: "2026-06-14"',
        'behaviors:',
        '  - { id: order-create, kind: fact, level: high, repo: sample-app, path: docs/as-is/behavior/order-create.yaml }',
        '  - { id: order-cancel, kind: inference, level: medium, repo: sample-app, path: docs/as-is/behavior/order-cancel.yaml }',
        'state_machines:',
        '  - { entity: Order, kind: inference, level: medium, repo: sample-app, path: docs/as-is/state-machines/Order.yaml }',
        'domains: []',
        'capability_maps: []',
        'business_rules:',
        '  - { id: order-amount-positive, kind: invariant, repo: sample-app, path: docs/as-is/business-rules/order-amount-positive.yaml }',
        'unknowns: []',
        'repo_snapshots: []',
        'stale_assets: []',
        ''
      ].join('\n')
    );
    const { result } = await core.runCapability(
      'context.build',
      { feature: 'test-feature', stage: 'solution-design' },
      c(tmp)
    );
    const out = readFileSync(join(tmp, result.data.runtimeContext), 'utf8');
    assert.match(out, /- behaviors: 2/);
    assert.match(out, /- state machines: 1/);
    assert.match(out, /- business rules: 1/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('context.build acceptance: emits domains + capability map + portal status', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    const indexDir = join(tmp, '.dapei', 'cognitive');
    mkdirSync(indexDir, { recursive: true });
    writeFileSync(
      join(indexDir, 'index.yaml'),
      [
        'version: "0.2"',
        'updated_at: "2026-06-14"',
        'behaviors: []',
        'state_machines: []',
        'domains:',
        '  - { name: Transaction, domain: transaction, derived_from: [order-create], path: docs/as-is/domains/transaction.yaml }',
        'capability_maps: []',
        'business_rules: []',
        'unknowns: []',
        'repo_snapshots: []',
        'stale_assets: []',
        ''
      ].join('\n')
    );
    const capDir = join(tmp, 'docs', 'as-is', 'capabilities');
    mkdirSync(capDir, { recursive: true });
    writeFileSync(join(capDir, 'product-map.yaml'), 'product: E-Commerce Mall\n');
    const { result } = await core.runCapability(
      'context.build',
      { feature: 'test-feature', stage: 'acceptance' },
      c(tmp)
    );
    const out = readFileSync(join(tmp, result.data.runtimeContext), 'utf8');
    assert.match(out, /- domains: 1/);
    assert.match(out, /docs\/as-is\/capabilities\/product-map\.yaml/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('context.build unknown stage: no Cognitive Assets section is emitted', async () => {
  const tmp = await setupWorkspaceWithFeature();
  try {
    const { result } = await core.runCapability(
      'context.build',
      { feature: 'test-feature', stage: 'general' },
      c(tmp)
    );
    const out = readFileSync(join(tmp, result.data.runtimeContext), 'utf8');
    assert.doesNotMatch(out, /## Cognitive Assets Available/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});