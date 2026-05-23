import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const core = await import('../../packages/core/src/index.ts');

test('cognitive.discover provides tree and manifests without prescribing entry search', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dapei-disc-'));
  try {
    await core.runCapability('workspace.init', {}, { rootDir: tmp, now: new Date() });
    mkdirSync(join(tmp, 'repos', 'sample-app', 'src'), { recursive: true });
    writeFileSync(join(tmp, 'repos', 'sample-app', 'package.json'), '{"name":"sample-app"}\n');
    writeFileSync(join(tmp, 'repos', 'sample-app', 'src', 'main.rb'), 'class OrdersController; end\n');

    const { result } = await core.runCapability(
      'cognitive.discover',
      { target: 'sample-app' },
      { rootDir: tmp, now: new Date() }
    );

    assert.equal(result.data.candidateCount, 0);
    assert.ok(Array.isArray(result.data.workflow));
    assert.equal(result.data.workflow.length, 4);
    assert.ok(result.data.repos[0].manifest_files.includes('package.json'));
    assert.ok(String(result.data.repos[0].directory_tree).includes('src'));
    assert.equal(result.data.repos[0].source_files, undefined);

    const candidates = readFileSync(join(tmp, 'docs/as-is/behavior/_candidates.yaml'), 'utf8');
    assert.ok(candidates.includes('awaiting_agent_analysis'));
    assert.ok(candidates.includes('repo_context'));
    assert.ok(candidates.includes('workflow'));
    assert.ok(!existsSync(join(tmp, 'docs/as-is/behavior/_hints.yaml')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
