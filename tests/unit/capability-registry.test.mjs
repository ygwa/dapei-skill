import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');

const capabilities = await import('../../packages/core/src/capabilities/index.ts');
const core = await import('../../packages/core/src/index.ts');
const tsCapabilities = Object.keys(capabilities.capabilities);

test('all registered TS capabilities have unique IDs', () => {
  const ids = tsCapabilities;
  const unique = new Set(ids);
  assert.equal(ids.length, unique.size, 'duplicate capability IDs found: ' + [...ids.filter((id, i, arr) => arr.indexOf(id) !== i)].join(', '));
});

test('no TS capability ID has spaces or special chars', () => {
  for (const id of tsCapabilities) {
    assert.ok(/^[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/i.test(id) || /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i.test(id), `capability ID "${id}" should match pattern domain.name`);
  }
});

test('all TS capabilities have inputSchema', () => {
  for (const id of tsCapabilities) {
    const cap = capabilities.capabilities[id];
    assert.ok(cap.inputSchema, `capability ${id} missing inputSchema`);
    assert.ok(typeof cap.inputSchema === 'object', `capability ${id} inputSchema must be object`);
  }
});

test('all TS capabilities have version string', () => {
  for (const id of tsCapabilities) {
    const cap = capabilities.capabilities[id];
    assert.ok(cap.version, `capability ${id} missing version`);
    assert.ok(typeof cap.version === 'string', `capability ${id} version must be string`);
    assert.ok(cap.version.match(/^\d+\.\d+\.\d+$/), `capability ${id} version "${cap.version}" should be semver`);
  }
});

test('commands.yaml exists and is non-empty', () => {
  const yamlPath = join(repoRoot, '.dapei', 'commands.yaml');
  assert.ok(existsSync(yamlPath), 'commands.yaml not found');
  const content = readFileSync(yamlPath, 'utf8');
  assert.ok(content.length > 100, 'commands.yaml is too short');
  assert.ok(content.includes('commands:'), 'commands.yaml missing commands section');
});

test('commands.yaml has version field', () => {
  const yamlPath = join(repoRoot, '.dapei', 'commands.yaml');
  const content = readFileSync(yamlPath, 'utf8');
  assert.ok(content.match(/^version:\s*.+/m), 'commands.yaml missing version');
});

test('commands.yaml has at least 10 commands', () => {
  const yamlPath = join(repoRoot, '.dapei', 'commands.yaml');
  const content = readFileSync(yamlPath, 'utf8');
  const count = (content.match(/^\s+- name:/gm) || []).length;
  assert.ok(count >= 10, `expected at least 10 commands, found ${count}`);
});

test('commands.yaml all have name and cli fields', () => {
  const yamlPath = join(repoRoot, '.dapei', 'commands.yaml');
  const content = readFileSync(yamlPath, 'utf8');
  const names = content.match(/^\s+- name:\s*(.+)/gm) || [];
  const clis = content.match(/^\s+cli:\s*(.+)/gm) || [];
  assert.ok(names.length > 0, 'no command names found');
  assert.ok(clis.length > 0, 'no command clis found');
  assert.equal(names.length, clis.length, `mismatch: ${names.length} names but ${clis.length} clis`);
});

test('commands.yaml has commands for workspace and feature capabilities', () => {
  const yamlPath = join(repoRoot, '.dapei', 'commands.yaml');
  const content = readFileSync(yamlPath, 'utf8');
  assert.ok(content.includes('workspace-validate'), 'commands.yaml missing workspace-validate');
  assert.ok(content.includes('workspace-report'), 'commands.yaml missing workspace-report');
  assert.ok(content.includes('feature-status'), 'commands.yaml missing feature-status');
  assert.ok(content.includes('feature-stage'), 'commands.yaml missing feature-stage');
  assert.ok(content.includes('feature-tasks'), 'commands.yaml missing feature-tasks');
});

test('commands.yaml has commands for repos and validation', () => {
  const yamlPath = join(repoRoot, '.dapei', 'commands.yaml');
  const content = readFileSync(yamlPath, 'utf8');
  assert.ok(content.includes('repos-remove'), 'commands.yaml missing repos-remove');
  assert.ok(content.includes('validation-detect'), 'commands.yaml missing validation-detect');
  assert.ok(content.includes('validation-execute'), 'commands.yaml missing validation-execute');
});

test('capabilities that exist in TS are in capabilitySpecs array', () => {
  const specs = capabilities.capabilitySpecs;
  const specIds = specs.map(s => s.id);
  for (const id of tsCapabilities) {
    assert.ok(specIds.includes(id), `capability ${id} in capabilities but not in capabilitySpecs`);
  }
});

test('all capabilitySpecs have matching capabilities entry', () => {
  const specs = capabilities.capabilitySpecs;
  for (const spec of specs) {
    assert.ok(tsCapabilities.includes(spec.id), `capability ${spec.id} in capabilitySpecs but not in capabilities`);
  }
});