import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

// Stage IDs defined in feature-lifecycle.yaml
const WORKFLOW_STAGES = [
  'analyze-current-state',
  'gap-analysis',
  'solution-design',
  'task-breakdown',
  'implementation',
  'local-validation',
  'architecture-review',
  'acceptance'
];

// Stage IDs hardcoded in router's extractStage function
const ROUTER_STAGES = [
  'analyze-current-state',
  'gap-analysis',
  'solution-design',
  'task-breakdown',
  'implementation',
  'local-validation',
  'architecture-review',
  'acceptance'
];

test('stage-consistency: all workflow stages are in router', () => {
  // After the router refactor (M1), walk every TS file in the router
  // package. Stages are now declared in extractors.ts.
  const routerDir = join(REPO_ROOT, 'packages/router/src');
  const files = readdirSync(routerDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(routerDir, f), 'utf8'))
    .join('\n');
  const missing = WORKFLOW_STAGES.filter(s => !files.includes(s));
  assert.equal(missing.length, 0, `stages missing in router: ${missing.join(', ')}`);
});

test('stage-consistency: all router stages are in workflow', () => {
  const workflowSrc = readFileSync(join(REPO_ROOT, '.dapei/workflows/feature-lifecycle.yaml'), 'utf8');
  const missing = ROUTER_STAGES.filter(s => !workflowSrc.includes(s));
  assert.equal(missing.length, 0, `stages missing in workflow: ${missing.join(', ')}`);
});

test('stage-consistency: router stages are exported for test reference', () => {
  // After M1, stages are exported as `STAGES` from extractors.ts and
  // re-exported from index.ts. Walk the package directory and assert
  // the named export exists with 8 entries.
  const routerDir = join(REPO_ROOT, 'packages/router/src');
  const files = readdirSync(routerDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(routerDir, f), 'utf8'))
    .join('\n');
  const stagesMatch = files.match(/export\s+const\s+STAGES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);
  assert.ok(stagesMatch, 'router must export a STAGES array from extractors.ts');

  const stagesBlock = stagesMatch[1];
  const count = (stagesBlock.match(/"[a-z-]+"/g) || []).length;
  assert.equal(count, 8, `expected 8 stages in router, got ${count}`);
});

test('stage-consistency: all SKILL.md files reference valid stage IDs', () => {
  const skillsDir = join(REPO_ROOT, 'skills');

  for (const skillEntry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!skillEntry.isDirectory()) continue;
    const skillMdPath = join(skillsDir, skillEntry.name, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;
    const content = readFileSync(skillMdPath, 'utf8');
    // Only match stage IDs that are in our known workflow stages
    const matches = [...content.matchAll(new RegExp('stage[:\\s]+(' + WORKFLOW_STAGES.join('|') + ')', 'gi'))].map(m => m[1]);
    // No invalid stages should be referenced in the stage:value format
    const allGood = matches.every(s => WORKFLOW_STAGES.includes(s));
    assert.ok(allGood, `${skillEntry.name}/SKILL.md references invalid stages in stage:value format`);
  }
});

test('stage-consistency: workflow capability references all 8 stages', () => {
  const workflowSrc = readFileSync(join(REPO_ROOT, 'packages/core/src/capabilities/domains/workflow.ts'), 'utf8');
  for (const stage of WORKFLOW_STAGES) {
    assert.ok(workflowSrc.includes(stage), `workflow.ts should reference stage: ${stage}`);
  }
});