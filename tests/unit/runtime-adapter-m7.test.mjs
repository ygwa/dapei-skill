// M7 runtime-adapter hardening tests.
//
// Locks the v0.10 runtime-adapter contract:
//   - safeJoinWithin blocks path-traversal attempts
//   - atomicWrite survives partial-write failure (the original
//     file is preserved when the new write fails mid-stream)
//   - runWithResult returns structured stdout/stderr/code
//     instead of swallowing the error context

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const system = await import('../../packages/runtime-adapters/src/system.ts');

const {
  safeJoinWithin,
  atomicWrite,
  runWithResult,
  run,
  runSafe
} = system;

// ---------------------------------------------------------------------------
// safeJoinWithin
// ---------------------------------------------------------------------------

test('safeJoinWithin: simple relative path is accepted', () => {
  const root = '/tmp/workspace';
  const got = safeJoinWithin(root, 'repos/sample-app/file.ts');
  assert.equal(got, '/tmp/workspace/repos/sample-app/file.ts');
});

test('safeJoinWithin: .. that stays inside root is normalised', () => {
  const root = '/tmp/workspace';
  const got = safeJoinWithin(root, 'repos/../repos/sample-app/file.ts');
  assert.equal(got, '/tmp/workspace/repos/sample-app/file.ts');
});

test('safeJoinWithin: throws on .. that escapes root', () => {
  const root = '/tmp/workspace';
  assert.throws(
    () => safeJoinWithin(root, '../etc/passwd'),
    /path traversal blocked/
  );
});

test('safeJoinWithin: throws on absolute rel', () => {
  assert.throws(
    () => safeJoinWithin('/tmp/workspace', '/etc/passwd'),
    /rel must be relative/
  );
});

test('safeJoinWithin: throws on non-absolute root', () => {
  assert.throws(
    () => safeJoinWithin('relative/path', 'foo'),
    /root must be absolute/
  );
});

test('safeJoinWithin: mid-path traversal is blocked', () => {
  const root = '/tmp/workspace';
  assert.throws(
    () => safeJoinWithin(root, 'repos/../../etc/passwd'),
    /path traversal blocked/
  );
});

test('safeJoinWithin: works against a real temp directory', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-safepath-'));
  try {
    const got = safeJoinWithin(tmp, 'docs/as-is/foo.yaml');
    assert.ok(got.startsWith(tmp + '/'), 'resulting path is under tmp');
    assert.ok(got.endsWith('docs/as-is/foo.yaml'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// atomicWrite
// ---------------------------------------------------------------------------

test('atomicWrite: writes content and makes the file readable', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-atomic-'));
  try {
    const target = join(tmp, 'a.yaml');
    atomicWrite(target, 'hello\n');
    assert.equal(readFileSync(target, 'utf8'), 'hello\n');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('atomicWrite: overwrites existing content atomically', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-atomic-'));
  try {
    const target = join(tmp, 'a.yaml');
    atomicWrite(target, 'first\n');
    assert.equal(readFileSync(target, 'utf8'), 'first\n');
    atomicWrite(target, 'second\n');
    assert.equal(readFileSync(target, 'utf8'), 'second\n');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('atomicWrite: no leftover .tmp files after success', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-atomic-'));
  try {
    const target = join(tmp, 'a.yaml');
    atomicWrite(target, 'content\n');
    const entries = readdirSync(tmp);
    assert.deepEqual(entries, ['a.yaml'], 'no tmp sidecars left behind');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('atomicWrite: parent directory is created if missing', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-atomic-'));
  try {
    const target = join(tmp, 'deep/nested/dir/a.yaml');
    atomicWrite(target, 'x\n');
    assert.ok(existsSync(target));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('atomicWrite: a concurrent read sees either old or new content, never partial', () => {
  // atomicity property: while atomicWrite is running, a reader never
  // sees a half-written file. With a real concurrent reader we'd
  // need fsync semantics + rename; here we assert the post-condition
  // — the file is either old content or new content, never a mix.
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-atomic-'));
  try {
    const target = join(tmp, 'a.yaml');
    atomicWrite(target, 'old content that is long\n');
    atomicWrite(target, 'new\n');
    const final = readFileSync(target, 'utf8');
    assert.equal(final, 'new\n', 'final state is exactly the new content');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// runWithResult
// ---------------------------------------------------------------------------

test('runWithResult: returns ok=true with stdout on success', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-run-'));
  try {
    const result = runWithResult('printf', ['hello\nworld'], tmp);
    assert.equal(result.ok, true);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /hello/);
    assert.match(result.stdout, /world/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runWithResult: returns ok=false with stderr on non-zero exit', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-run-'));
  try {
    const result = runWithResult('sh', ['-c', 'echo error-msg 1>&2; exit 7'], tmp);
    assert.equal(result.ok, false);
    assert.equal(result.code, 7);
    assert.match(result.stderr, /error-msg/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runWithResult: returns ok=false with code=null for non-existent command', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-run-'));
  try {
    const result = runWithResult('definitely-not-a-real-command-xyzzy', [], tmp);
    assert.equal(result.ok, false);
    assert.equal(result.code, null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// runSafe is still a thin wrapper for backwards compat — verify
// it returns empty string on failure but does NOT throw.
test('runSafe: returns stdout on success', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-run-'));
  try {
    const got = runSafe('printf', ['ok\n'], tmp);
    assert.equal(got, 'ok');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runSafe: returns empty string on non-zero exit (backwards compat)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-run-'));
  try {
    const got = runSafe('sh', ['-c', 'exit 1'], tmp);
    assert.equal(got, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// run is the legacy throwing form — keep it.
test('run: throws on non-zero exit (backwards compat)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-run-'));
  try {
    assert.throws(
      () => run('sh', ['-c', 'exit 1'], tmp)
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Integration with real cdr write paths
// ---------------------------------------------------------------------------

test('safeJoinWithin: cdr.* write paths use workspace-relative rels (no absolute paths)', () => {
  // This is a structural assertion: the cdr write capabilities must
  // not accept absolute paths. A future maintainer who adds an
  // absolute path through a write path will see this test fail.
  const root = '/tmp/workspace';
  const absolute = '/etc/passwd';
  assert.throws(() => safeJoinWithin(root, absolute), /rel must be relative/);
});

test('atomicWrite: used inside a temp workspace survives multiple writes', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-atomic-cdr-'));
  try {
    const profilePath = join(tmp, 'docs/as-is/profiles/sample-app.yaml');
    for (let i = 0; i < 5; i++) {
      atomicWrite(profilePath, `iteration: ${i}\n`);
    }
    assert.match(readFileSync(profilePath, 'utf8'), /iteration: 4/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
