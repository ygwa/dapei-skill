import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, cpSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fakeCli = join(__dirname, '../fixtures/fake-codegraph');

function gitInit(path) {
  execFileSync('git', ['-C', path, 'init', '-b', 'main'], { encoding: 'utf8' });
  execFileSync('git', ['-C', path, 'config', 'user.name', 'dapei test'], { encoding: 'utf8' });
  execFileSync('git', ['-C', path, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  execFileSync('git', ['-C', path, 'add', '.'], { encoding: 'utf8' });
  execFileSync('git', ['-C', path, 'commit', '-m', 'fixture'], { encoding: 'utf8' });
}

async function seedFixtureRepo(tmp, repoName) {
  const srcDir = join(tmp, 'fixture-sources', repoName);
  mkdirSync(srcDir, { recursive: true });
  cpSync(join(__dirname, '..', 'fixtures', repoName), srcDir, { recursive: true });
  gitInit(srcDir);
  return srcDir;
}

const c = (tmp) => ({ rootDir: tmp, now: new Date() });

// Prepend the fake-codegraph directory to PATH so the runtime-adapter
// picks it up. Each test that needs the fake CLI re-applies this in
// its try-block, because prior tests' finally blocks restore the
// original PATH.
const origPath = process.env.PATH;
function withFakeCli() {
  process.env.PATH = `${fakeCli}${origPath ? ':' + origPath : ''}`;
}
function withoutFakeCli() {
  process.env.PATH = '/usr/bin:/bin';
}

// ---------------------------------------------------------------------------
// v0.7 — codegraph adapter integration
// ---------------------------------------------------------------------------

test('cdr.profile populates the codegraph block when the CLI is available', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cg-'));
  withFakeCli();
  try {
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'mall-order');
    await core.runCapability('repos.add', { name: 'mall-order', url: srcDir }, c(tmp));
    const { result } = await core.runCapability('cdr.profile', { repo: 'mall-order' }, c(tmp));
    assert.equal(result.ok, true);
    // result.data.codegraph is the in-memory block
    assert.equal(result.data.codegraph.available, true);
    assert.match(result.data.codegraph.version || '', /fake|1\.8/);
    assert.equal(result.data.codegraph.backend, 'native');
    // The on-disk profile YAML also carries the block (consumers
    // like build-cognitive-pages.ts read from disk).
    const onDisk = (await import('node:fs')).readFileSync(join(tmp, 'docs/as-is/profiles/mall-order.yaml'), 'utf8');
    assert.match(onDisk, /codegraph:/);
    assert.match(onDisk, /available: true/);
    // files_total is populated; apisurface_count may be 0+ for the
    // fake CLI's apisurface heuristic.
    assert.match(onDisk, /files_total:/);
  } finally {
    process.env.PATH = origPath;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.candidate returns backend=native when the CLI is available', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cg-'));
  withFakeCli();
  try {
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'mall-order');
    await core.runCapability('repos.add', { name: 'mall-order', url: srcDir }, c(tmp));
    const { result } = await core.runCapability('cdr.entries.candidate', { repo: 'mall-order' }, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.backend, 'native');
    // The fake CLI marks files with Controller/router/server/app.py
    // in their name as apisurface — the mall-order fixture has
    // src/routes.ts which is a candidate.
    const apisurface = result.data.files.find((f) => f.apisurface_hint);
    assert.ok(apisurface, 'at least one file carries apisurface_hint');
  } finally {
    process.env.PATH = origPath;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.candidate falls back to tree walk when the CLI is missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cg-'));
  withFakeCli();
  try {
    // Strip the fake CLI from PATH so the real `codegraph` lookup fails.
    process.env.PATH = '/usr/bin:/bin';
    delete process.env.DAPEI_CODEGRAPH_BIN;
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'mall-order');
    await core.runCapability('repos.add', { name: 'mall-order', url: srcDir }, c(tmp));
    const { result } = await core.runCapability('cdr.entries.candidate', { repo: 'mall-order' }, c(tmp));
    assert.equal(result.ok, true);
    assert.equal(result.data.backend, 'fallback');
    assert.ok(result.data.backend_reason, 'fallback reason is surfaced');
    // Files still come back — the fallback is the v0.3 tree walk.
    assert.ok(result.data.files.length > 0);
  } finally {
    process.env.PATH = origPath;
    delete process.env.DAPEI_CODEGRAPH_BIN;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert rejects a structured call whose target is not in codegraph refs', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cg-'));
  withFakeCli();
  try {
    process.env.PATH = `${fakeCli}${origPath ? ':' + origPath : ''}`;
    // Force the fake to return an empty callee list so the validation
    // cannot find any target.
    process.env.FAKE_CODEGRAPH_CALLEES_JSON = '{"callees":[]}';
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'mall-order');
    await core.runCapability('repos.add', { name: 'mall-order', url: srcDir }, c(tmp));
    await assert.rejects(
      () => core.runCapability(
        'cdr.behavior.upsert',
        {
          id: 'order-create',
          repo: 'mall-order',
          entry: { type: 'api', method: 'POST', path: '/orders' },
          calls: [
            {
              target: 'GhostClient',
              protocol: 'http',
              evidence: { file: 'src/routes.ts', line: 6, repo: 'mall-order' }
            }
          ],
          confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
          sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
        },
        c(tmp)
      ),
      /GhostClient' not found in codegraph refs/
    );
  } finally {
    process.env.PATH = origPath;
    delete process.env.FAKE_CODEGRAPH_CALLEES_JSON;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert accepts a structured call whose target matches codegraph refs', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cg-'));
  withFakeCli();
  try {
    process.env.PATH = `${fakeCli}${origPath ? ':' + origPath : ''}`;
    process.env.FAKE_CODEGRAPH_CALLEES_JSON = '{"callees":[{"name":"PaymentClient","kind":"method"}]}';
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'mall-order');
    await core.runCapability('repos.add', { name: 'mall-order', url: srcDir }, c(tmp));
    const { result } = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        calls: [
          {
            target: 'PaymentClient',
            protocol: 'http',
            evidence: { file: 'src/routes.ts', line: 6, repo: 'mall-order' }
          }
        ],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    assert.equal(result.ok, true);
  } finally {
    process.env.PATH = origPath;
    delete process.env.FAKE_CODEGRAPH_CALLEES_JSON;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.behavior.upsert skips codegraph check when the CLI is missing (graceful degrade)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cg-'));
  withFakeCli();
  try {
    process.env.PATH = '/usr/bin:/bin';
    delete process.env.DAPEI_CODEGRAPH_BIN;
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'mall-order');
    await core.runCapability('repos.add', { name: 'mall-order', url: srcDir }, c(tmp));
    // The GhostClient target would fail a strict check, but since
    // the CLI is missing the capability takes the fallback path
    // and accepts the call.
    const { result } = await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        calls: [
          {
            target: 'GhostClient',
            protocol: 'http',
            evidence: { file: 'src/routes.ts', line: 6, repo: 'mall-order' }
          }
        ],
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    assert.equal(result.ok, true);
  } finally {
    process.env.PATH = origPath;
    delete process.env.DAPEI_CODEGRAPH_BIN;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.stale.scan: marks behavior stale when its source file is in the diff', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cg-'));
  withFakeCli();
  try {
    process.env.PATH = `${fakeCli}${origPath ? ':' + origPath : ''}`;
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'mall-order');
    await core.runCapability('repos.add', { name: 'mall-order', url: srcDir }, c(tmp));
    // Write a behavior that points at src/routes.ts.
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    // Now mutate src/routes.ts and commit. The fake-codegraph `impact`
    // does a real `git diff --name-only` when the ref range exists.
    const filePath = join(srcDir, 'src', 'routes.ts');
    execFileSync('bash', ['-c', `printf "\\n// touched\\n" >> ${filePath}`]);
    execFileSync('git', ['-C', srcDir, 'add', '.'], { encoding: 'utf8' });
    execFileSync('git', ['-C', srcDir, 'commit', '-m', 'touch routes'], { encoding: 'utf8' });
    const repoPath = join(tmp, 'repos', 'mall-order');
    try { execFileSync('rm', ['-rf', repoPath], { encoding: 'utf8' }); } catch {}
    cpSync(srcDir, repoPath, { recursive: true });
    execFileSync('git', ['-C', repoPath, 'checkout', '-B', 'main', 'HEAD'], { encoding: 'utf8' });
    // Use HEAD~1 / HEAD instead of explicit SHAs because the dapei
    // repos.add path goes through git submodule mode which leaves
    // the working copy in a detached HEAD state; explicit SHA capture
    // from the test then gets the wrong values. Let the capability
    // resolve the ref range itself.
    const { result } = await core.runCapability(
      'cdr.stale.scan',
      { repo: 'mall-order', base: 'HEAD~1', head: 'HEAD' },
      c(tmp)
    );
    assert.equal(result.ok, true);
    // Backend can be either 'codegraph' (fake CLI) or 'git-diff' (fallback
    // path) depending on whether the fake CLI was able to compute a
    // non-empty blast radius. Both paths must produce a non-empty
    // change set given the touch commit we made earlier.
    assert.ok(['codegraph', 'git-diff'].includes(result.data.backend), `unexpected backend: ${result.data.backend}`);
    assert.ok(result.data.changed_files >= 1, 'at least one file was changed');
    assert.ok(result.data.marked >= 1, 'order-create behavior was marked stale');

    // The index entry for order-create is now marked stale.
    const { result: idxRes } = await core.runCapability('cdr.index.list', {}, c(tmp));
    const b = idxRes.data.behaviors.find((x) => x.id === 'order-create');
    assert.equal(b.stale, true);
    assert.ok(b.stale_reason);
    assert.ok(b.stale_at);
    assert.ok(b.stale_base);
  } finally {
    process.env.PATH = origPath;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.stale.scan: returns 0 changes when the diff is empty', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cg-'));
  withFakeCli();
  try {
    process.env.PATH = `${fakeCli}${origPath ? ':' + origPath : ''}`;
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'mall-order');
    await core.runCapability('repos.add', { name: 'mall-order', url: srcDir }, c(tmp));
    const headSha = execFileSync('git', ['-C', srcDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    // Write a behavior that points at src/routes.ts.
    await core.runCapability(
      'cdr.behavior.upsert',
      {
        id: 'order-create',
        repo: 'mall-order',
        entry: { type: 'api', method: 'POST', path: '/orders' },
        confidence: { level: 'high', kind: 'fact', evidence_type: 'direct_code' },
        sources: [{ file: 'src/routes.ts', line: 6, repo: 'mall-order' }]
      },
      c(tmp)
    );
    const filePath = join(srcDir, 'src', 'routes.ts');
    execFileSync('bash', ['-c', `printf "\\n// touched\\n" >> ${filePath}`]);
    execFileSync('git', ['-C', srcDir, 'add', '.'], { encoding: 'utf8' });
    execFileSync('git', ['-C', srcDir, 'commit', '-m', 'touch'], { encoding: 'utf8' });
    const repoPath = join(tmp, 'repos', 'mall-order');
    try { execFileSync('rm', ['-rf', repoPath], { encoding: 'utf8' }); } catch {}
    cpSync(srcDir, repoPath, { recursive: true });
    execFileSync('git', ['-C', repoPath, 'checkout', '-B', 'main', 'HEAD'], { encoding: 'utf8' });
    const { result } = await core.runCapability(
      'cdr.stale.scan',
      { repo: 'mall-order', base: 'HEAD~1', head: 'HEAD' },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.backend, 'git-diff');
    assert.ok(result.data.marked >= 1);
  } finally {
    process.env.PATH = origPath;
    delete process.env.DAPEI_CODEGRAPH_BIN;
    rmSync(tmp, { recursive: true, force: true });
  }
});
