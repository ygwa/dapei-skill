import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const core = await import('../../packages/core/src/index.ts');
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(__dirname, '../fixtures/sample-node-repo');

test('cognitive.artifact.upsert writes behavior and updates index', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cog-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    const behaviorYaml = readFileSync(join(fixtureRoot, '__expected__/behavior/order-create.yaml'), 'utf8');
    const { result } = await core.runCapability(
      'cognitive.artifact.upsert',
      { type: 'behavior', content: behaviorYaml },
      { rootDir: tmp, now: new Date() }
    );

    assert.equal(result.ok, true);
    assert.equal(result.data.id, 'order-create');
    assert.ok(existsSync(join(tmp, 'docs/as-is/behavior/order-create.yaml')));
    assert.ok(existsSync(join(tmp, '.dapei/cognitive/index.yaml')));

    const { result: listResult } = await core.runCapability('cognitive.artifact.list', {}, { rootDir: tmp, now: new Date() });
    assert.equal(listResult.data.behaviors.length, 1);
    assert.equal(listResult.data.behaviors[0].kind, 'fact');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cognitive.artifact.upsert rejects invalid fact artifact', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cog-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    const badYaml = `id: bad-one
entry:
  type: api
  method: POST
  path: /bad
confidence:
  level: high
  kind: fact
`;

    await assert.rejects(
      () => core.runCapability('cognitive.artifact.upsert', { type: 'behavior', content: badYaml }, { rootDir: tmp, now: new Date() }),
      /kind=fact requires sources|INVALID_ARTIFACT/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cognitive.artifact.validate returns errors for invalid artifact', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-cog-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });

    const { result } = await core.runCapability(
      'cognitive.artifact.validate',
      {
        type: 'behavior',
        content: `id: x\nentry:\n  type: api\nconfidence:\n  level: high\n  kind: fact\n`
      },
      { rootDir: tmp, now: new Date() }
    );

    assert.equal(result.data.valid, false);
    assert.ok(result.data.errors.length > 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
