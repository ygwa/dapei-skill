import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const core = await import('../../packages/core/src/index.ts');

test('workspace.init creates workspace metadata', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dapei-core-'));
  const { result } = await core.runCapability('workspace.init', {}, { rootDir: dir, now: new Date() });
  assert.equal(result.ok, true);
});
