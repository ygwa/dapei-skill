// Skill contract tests (L1 - Static contract)
//
// Verifies that every skills/<name>/SKILL.md follows a consistent anatomy,
// and that the cross-cutting facts (stage list, confirmation gates,
// capability surface) agree across skills and engine code.
//
// Layer: L1 - static analysis only, no LLM, no filesystem side effects.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SKILLS_DIR = join(REPO_ROOT, 'skills');
const ROUTER_SRC = join(REPO_ROOT, 'packages', 'router', 'src', 'index.ts');
const TYPES_SRC = join(REPO_ROOT, 'packages', 'core', 'src', 'types.ts');

// Single source of truth for the workflow stage DAG.
// The router, the workflow SKILL, and the types module must all agree.
const EXPECTED_STAGES = [
  'analyze-current-state',
  'gap-analysis',
  'solution-design',
  'task-breakdown',
  'implementation',
  'local-validation',
  'architecture-review',
  'acceptance'
];

// Stages that require explicit user confirmation.
// Must match confirmGate enum in packages/core/src/types.ts and
// the confirmation-point table in skills/feature/SKILL.md.
const CONFIRMATION_GATES = ['solution-design', 'implementation', 'acceptance'];

const SKILL_NAMES = ['workspace', 'feature', 'repos', 'workflow', 'validation', 'cognitive'];

function readSkill(name) {
  const p = join(SKILLS_DIR, name, 'SKILL.md');
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

function listSkills() {
  return readdirSync(SKILLS_DIR).filter((d) => existsSync(join(SKILLS_DIR, d, 'SKILL.md')));
}

// ---------------------------------------------------------------------------
// Section anatomy
// ---------------------------------------------------------------------------

test('skill-contracts: every skill declares 边界 / 路由能力 / 用户入口 / 与其他 skill 的协作 sections', () => {
  for (const name of SKILL_NAMES) {
    const content = readSkill(name);
    assert.ok(content, `${name}/SKILL.md must exist`);

    for (const section of [
      '## 边界',
      '## 路由能力',
      '## 用户入口',
      '## 与其他 skill 的协作',
    ]) {
      assert.ok(
        content.includes(section),
        `${name}/SKILL.md must declare section "${section}"`,
      );
    }
  }
});

test('skill-contracts: feature/workflow/cognitive skills must declare 红线 (red lines) section', () => {
  // These three skills encode hard behavioral constraints on the AI.
  // A missing 红线 section means the AI has no documented boundary to defend.
  for (const name of ['feature', 'workflow', 'cognitive']) {
    const content = readSkill(name);
    assert.ok(content, `${name}/SKILL.md must exist`);
    assert.ok(
      /##\s+红线/.test(content),
      `${name}/SKILL.md must declare a "红线" (red lines) section`,
    );
  }
});

test('skill-contracts: workflow SKILL.md must declare the Stage DAG diagram', () => {
  const content = readSkill('workflow');
  assert.ok(content, 'workflow/SKILL.md must exist');
  assert.match(content, /###\s+Stage DAG/, 'workflow SKILL must contain "### Stage DAG" subsection');
  assert.match(content, /analyze-current-state\s*→.*acceptance/s, 'workflow SKILL must show the full stage chain in order');
});

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

test('skill-contracts: SKILL.md files that include YAML frontmatter must have valid name/description', () => {
  for (const name of listSkills()) {
    const content = readSkill(name);
    const m = content.match(/^---\n([\s\S]*?)\n---/);
    if (!m) continue; // no frontmatter is allowed (workspace/repos/validation currently omit it)

    const fm = m[1];
    assert.match(fm, /^name:\s+\S+/m, `${name}: frontmatter must have a non-empty "name" field`);
    assert.match(fm, /^description:\s+\S+/m, `${name}: frontmatter must have a non-empty "description" field`);

    // If name follows the dapei-X convention, the X should match the directory name
    const nameMatch = fm.match(/^name:\s+(.+)$/m);
    if (nameMatch) {
      const declaredName = nameMatch[1].trim();
      const expectedPrefix = `dapei-${name}`;
      assert.ok(
        declaredName === expectedPrefix,
        `${name}: frontmatter "name" (${declaredName}) should equal "${expectedPrefix}"`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Stage list consistency (cross-file drift detector)
// ---------------------------------------------------------------------------

test('skill-contracts: workflow SKILL.md mentions all 8 standard stages', () => {
  const content = readSkill('workflow');
  for (const stage of EXPECTED_STAGES) {
    assert.ok(
      content.includes(stage),
      `workflow/SKILL.md must mention stage "${stage}"`,
    );
  }
});

test('skill-contracts: router source has the same 8 stages in the same order', () => {
  // After the router refactor (M1), stages live in extractors.ts as
  // `export const STAGES`. Walk every TS file under packages/router/src
  // and pull the STAGES array out of whichever file declares it. We
  // assert the array exists, contains the expected values, and that the
  // order matches EXPECTED_STAGES — same contract as before, just
  // sourced from the package directory instead of a single file.
  const routerDir = join(REPO_ROOT, 'packages', 'router', 'src');
  const files = readdirSync(routerDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(routerDir, f), 'utf8'))
    .join('\n');

  const stagesArrayMatch = files.match(
    /export\s+const\s+STAGES\s*=\s*\[(.*?)\]\s*as\s+const/s,
  );
  assert.ok(stagesArrayMatch, 'router must export a STAGES array');

  const stagesInRouter = stagesArrayMatch[1]
    .split(',')
    .map((s) => s.trim().replace(/['"]/g, ''))
    .filter(Boolean);

  assert.deepEqual(
    stagesInRouter,
    EXPECTED_STAGES,
    'router stages list drifted from EXPECTED_STAGES',
  );
});

test('skill-contracts: confirmGate enum in types.ts matches the confirmation stage list', () => {
  const typesSrc = readFileSync(TYPES_SRC, 'utf8');
  const gateMatch = typesSrc.match(/confirmGate\?:\s*"([^"]+)"\s*\|\s*"([^"]+)"\s*\|\s*"([^"]+)"/);
  assert.ok(gateMatch, 'types.ts must define confirmGate as a 3-value union of string literals');
  const gatesInTypes = [gateMatch[1], gateMatch[2], gateMatch[3]];
  assert.deepEqual(
    gatesInTypes,
    CONFIRMATION_GATES,
    'confirmGate enum drifted from CONFIRMATION_GATES',
  );
});

test('skill-contracts: feature SKILL.md mentions all 3 confirmation points', () => {
  const content = readSkill('feature');
  for (const stage of CONFIRMATION_GATES) {
    assert.ok(
      content.includes(stage),
      `feature/SKILL.md must mention confirmation stage "${stage}"`,
    );
  }
  // Must contain a 确认点 table or equivalent marker
  assert.match(
    content,
    /确认点|confirmation point/i,
    'feature/SKILL.md must have an explicit 确认点 marker',
  );
});

// ---------------------------------------------------------------------------
// Cross-skill collaboration references
// ---------------------------------------------------------------------------

test('skill-contracts: cross-skill references in 与其他 skill 的协作 section point to existing skills', () => {
  const KNOWN_SKILL_NAMES = new Set(SKILL_NAMES);

  for (const name of SKILL_NAMES) {
    const content = readSkill(name);
    // Find the 与其他 skill 的协作 section and parse bold-skill names
    // Pattern: **skillName**: ... or **- skillName**: ...
    const section = content.split('## 与其他 skill 的协作')[1]?.split('## ')[0];
    if (!section) continue;

    const refs = [...section.matchAll(/\*\*([a-z-]+)\*\*:/g)].map((m) => m[1]);
    for (const ref of refs) {
      // Skip false positives (e.g. bold tokens that are not skill names)
      if (!/[a-z]/.test(ref)) continue;
      assert.ok(
        KNOWN_SKILL_NAMES.has(ref),
        `${name}/SKILL.md references skill "${ref}" in 与其他 skill 的协作 but no such skill directory exists. ` +
        `Known: ${[...KNOWN_SKILL_NAMES].join(', ')}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Skill content must not contradict the engine's "do not decide for agent" rule
// ---------------------------------------------------------------------------

test('skill-contracts: every skill has a 禁止 (forbidden) declaration in 边界 or 红线', () => {
  // The "禁止" marker is how each skill tells the AI what the platform guarantees
  // and what the AI must not silently do. Missing marker = unstated boundary.
  for (const name of SKILL_NAMES) {
    const content = readSkill(name);
    assert.ok(
      /\*\*(禁止|平台)\*\*/.test(content) || /禁止[:：]/.test(content),
      `${name}/SKILL.md must contain an explicit 禁止 declaration`,
    );
  }
});
