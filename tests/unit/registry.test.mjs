import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../../packages/core/src/capability-registry.ts');

test('registry rejects duplicate ids', () => {
  const r = new mod.CapabilityRegistry();
  const spec = { id: 'x', version: '1', inputSchema: {}, execute: async () => ({ ok: true, data: {}, sideEffects: [], reportFragments: [] }) };
  r.register(spec);
  assert.throws(() => r.register(spec), /duplicate capability/);
});
