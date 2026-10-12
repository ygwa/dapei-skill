import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../../packages/catalog/src/index.ts');

test('schema validator rejects wrong input type', async () => {
  await assert.rejects(
    () => core.runCapability('repos.add', { name: 'x', url: 123 }, { rootDir: process.cwd(), now: new Date() }),
    /must be string/
  );
});
