import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_SRC = join(__dirname, '..', 'fixtures', 'sample-spring');

function gitInit(path) {
  execFileSync('git', ['-C', path, 'init', '-b', 'main'], { encoding: 'utf8' });
  execFileSync('git', ['-C', path, 'config', 'user.name', 'dapei test'], { encoding: 'utf8' });
  execFileSync('git', ['-C', path, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  execFileSync('git', ['-C', path, 'add', '.'], { encoding: 'utf8' });
  execFileSync('git', ['-C', path, 'commit', '-m', 'fixture'], { encoding: 'utf8' });
}

async function seedFixtureRepo(tmp, repoName) {
  const srcDir = join(tmp, 'fixture-sources', repoName);
  cpSync(join(__dirname, '..', 'fixtures', repoName), srcDir, { recursive: true });
  gitInit(srcDir);
  return srcDir;
}

const c = (tmp) => ({ rootDir: tmp, now: new Date() });

// ---------------------------------------------------------------------------
// v1.0 (ADR-0006) — cdr.entries.expand
// ---------------------------------------------------------------------------

test('cdr.entries.expand resolves a symbol_handle to its line range', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-expand-'));
  try {
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'sample-spring');
    await core.runCapability('repos.add', { name: 'sample-spring', url: srcDir }, c(tmp));
    const { result } = await core.runCapability(
      'cdr.entries.expand',
      { repo: 'sample-spring', file: 'src/main/java/com/example/order/OrderController.java', symbol_handle: 'OrderController' },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.ok(result.data.content, 'content should be populated');
    assert.ok(result.data.content.includes('class OrderController'), 'content should include the class body');
    assert.equal(result.data.truncated, true, 'content should be truncated (not at EOF)');
    assert.ok(result.data.range.start >= 1);
    assert.ok(result.data.range.end >= result.data.range.start);
    assert.ok(result.data.line_count > 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.expand accepts an arbitrary line_range', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-expand-'));
  try {
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'sample-spring');
    await core.runCapability('repos.add', { name: 'sample-spring', url: srcDir }, c(tmp));
    const { result } = await core.runCapability(
      'cdr.entries.expand',
      { repo: 'sample-spring', file: 'src/main/java/com/example/order/OrderController.java', line_range: [1, 5] },
      c(tmp)
    );
    assert.equal(result.ok, true);
    assert.ok(result.data.content, 'content should be populated');
    assert.equal(result.data.range.start, 1);
    assert.equal(result.data.range.end, 5);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.expand rejects when both line_range and symbol_handle are provided', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-expand-'));
  try {
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'sample-spring');
    await core.runCapability('repos.add', { name: 'sample-spring', url: srcDir }, c(tmp));
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.expand',
        { repo: 'sample-spring', file: 'src/main/java/com/example/order/OrderController.java', line_range: [1, 5], symbol_handle: 'OrderController' },
        c(tmp)
      ),
      /not both|INVALID_INPUT/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.expand rejects when neither line_range nor symbol_handle is provided', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-expand-'));
  try {
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'sample-spring');
    await core.runCapability('repos.add', { name: 'sample-spring', url: srcDir }, c(tmp));
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.expand',
        { repo: 'sample-spring', file: 'src/main/java/com/example/order/OrderController.java' },
        c(tmp)
      ),
      /line_range or symbol_handle|INVALID_INPUT/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.expand rejects out-of-range line_range', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-expand-'));
  try {
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'sample-spring');
    await core.runCapability('repos.add', { name: 'sample-spring', url: srcDir }, c(tmp));
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.expand',
        { repo: 'sample-spring', file: 'src/main/java/com/example/order/OrderController.java', line_range: [1, 99999] },
        c(tmp)
      ),
      /exceeds|INVALID_INPUT/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.expand rejects when symbol_handle does not resolve', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-expand-'));
  try {
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'sample-spring');
    await core.runCapability('repos.add', { name: 'sample-spring', url: srcDir }, c(tmp));
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.expand',
        { repo: 'sample-spring', file: 'src/main/java/com/example/order/OrderController.java', symbol_handle: 'NoSuchSymbol' },
        c(tmp)
      ),
      /not found|NOT_FOUND/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cdr.entries.expand rejects non-existent file', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-expand-'));
  try {
    const core = await import('../../packages/core/src/index.ts');
    await core.runCapability('workspace.init', {}, c(tmp));
    const srcDir = await seedFixtureRepo(tmp, 'sample-spring');
    await core.runCapability('repos.add', { name: 'sample-spring', url: srcDir }, c(tmp));
    await assert.rejects(
      () => core.runCapability(
        'cdr.entries.expand',
        { repo: 'sample-spring', file: 'does/not/exist.java', line_range: [1, 5] },
        c(tmp)
      ),
      /not found|FILE_MISSING/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});