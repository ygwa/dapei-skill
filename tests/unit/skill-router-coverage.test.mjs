// Skill <-> router coverage tests (L1/L2)
//
// Verifies that:
//   1. Every capability ID mentioned in skills/*/SKILL.md is implemented in
//      packages/core/src/capabilities.
//   2. Every capability declared by a skill's "用户入口" examples resolves
//      through the router to a real capability (or to a no-input status
//      fallback for genuinely ambiguous intents).
//   3. The router never returns a capability that is not implemented.
//
// Layer: L1 (static) + L2 (router invocation). No filesystem side effects.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SKILLS_DIR = join(REPO_ROOT, 'skills');

const capabilities = await import('../../packages/core/src/capabilities/index.ts');
const router = await import('../../packages/router/src/index.ts');

const REGISTERED_CAPABILITIES = new Set(Object.keys(capabilities.capabilities));

// Tokens that look like capability IDs in SKILL.md (e.g. `workspace.init`)
// but are actually file/identifier references and should be ignored.
const FILE_REFERENCE_TOKENS = new Set([
  'package.json', 'feature.yaml', 'workspace.yaml', 'repos.yaml', 'repo.yaml',
  'pom.xml', 'package-lock.json', 'tsconfig.json', 'go.mod', 'go.sum',
  'agents.md', 'README.md', 'index.yaml', 'cognitive.yaml', 'commands.yaml',
  'feature.schema.yaml', 'repos.schema.yaml', 'domain.yaml', 'behavior.schema.yaml',
  'state-machine.schema.yaml', 'evidence.schema.yaml',
  'runtime-context.md', 'related-cognitive-context.md', 'decision-log.md',
  'feature-progress.md', 'daily-report.md', 'architecture-review.md',
  'validation-report.md', 'test-plan.md', 'open-questions.md', 'risk.md',
  'business-context.md', 'architecture-context.md', 'repo-context.md',
  'feature-context.md', 'constraints.md', 'backlog.md', 'plan.md',
  'reports.md', 'feature-impact.md', 'order.yaml', 'order-create.yaml',
  'feature-lifecycle.yaml', 'naming.yaml', 'layering.yaml', 'ddd.yaml',
  '01-current-state.md', '02-gap-analysis.md', '03-business-design.md',
  '04-technical-design.md', '05-task-breakdown.md', '06-acceptance.md',
  'dapei-engine.ts', 'dapei-engine.js'
]);

// Looks like a capability id: "domain.name" or "domain.area.name" with lowercase
// letters and dots only. Used to filter the noise out of SKILL.md prose.
const CAPABILITY_LIKE = /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)?$/;

function listSkills() {
  return readdirSync(SKILLS_DIR).filter((d) => existsSync(join(SKILLS_DIR, d, 'SKILL.md')));
}

function extractCapRefs(skillContent) {
  // Pull backtick-quoted identifiers that look like capability ids.
  return [...skillContent.matchAll(/`([a-z][a-z0-9.]+)`/g)]
    .map((m) => m[1])
    .filter((tok) => CAPABILITY_LIKE.test(tok) && !FILE_REFERENCE_TOKENS.has(tok));
}

// ---------------------------------------------------------------------------
// 1. SKILL.md -> engine implementation
// ---------------------------------------------------------------------------

test('skill-router-coverage: every capability referenced in SKILL.md is registered in engine', () => {
  for (const name of listSkills()) {
    const content = readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    const refs = extractCapRefs(content);
    for (const cap of refs) {
      assert.ok(
        REGISTERED_CAPABILITIES.has(cap),
        `${name}/SKILL.md references capability "${cap}" which is not registered. ` +
        `Registered: ${[...REGISTERED_CAPABILITIES].sort().join(', ')}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 2. SKILL.md user examples -> router -> engine
// ---------------------------------------------------------------------------

function extractDapeiExamples(skillContent) {
  // Pick up user-facing examples of the form `@dapei <phrase>` from any code block.
  const out = [];
  const re = /@dapei\s+([^\n`]+)/g;
  let m;
  while ((m = re.exec(skillContent)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

test('skill-router-coverage: every @dapei example routes to a registered capability', () => {
  for (const name of listSkills()) {
    const content = readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    const examples = extractDapeiExamples(content);
    assert.ok(examples.length > 0, `${name}/SKILL.md should have at least one @dapei example`);

    for (const example of examples) {
      const route = router.routeIntent(example);
      assert.ok(
        REGISTERED_CAPABILITIES.has(route.capability),
        `${name}: example "@dapei ${example}" routed to "${route.capability}" which is not registered. ` +
        `Router reason: ${route.reason}, confidence: ${route.confidence}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Router never returns an unknown capability
// ---------------------------------------------------------------------------

test('skill-router-coverage: router never returns an unregistered capability for the in-repo intent corpus', () => {
  // A pragmatic corpus: every @dapei example across all skills, plus a few
  // common variants that real users might type.
  const corpus = [];
  for (const name of listSkills()) {
    const content = readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    corpus.push(...extractDapeiExamples(content));
  }
  corpus.push(
    'initialize workspace',
    'init workspace',
    'create feature foo --repos bar',
    'context build foo --stage implementation',
    'validate feature foo',
    'close feature foo',
    'analyze behavior for app',
    'list behaviors for app',
  );

  for (const intent of corpus) {
    const route = router.routeIntent(intent);
    assert.ok(
      REGISTERED_CAPABILITIES.has(route.capability),
      `intent "${intent}" routed to "${route.capability}" which is not registered`,
    );
  }
});

// ---------------------------------------------------------------------------
// 4. Stage names mentioned in skills must be in the router's stage list
// ---------------------------------------------------------------------------

test('skill-router-coverage: stages named in SKILL.md are recognised by the router', () => {
  const STAGES = [
    'analyze-current-state', 'gap-analysis', 'solution-design', 'task-breakdown',
    'implementation', 'local-validation', 'architecture-review', 'acceptance',
  ];
  // The router was refactored into extractors.ts + routes-table.ts +
  // index.ts. Walk every TS file under packages/router/src and assert
  // each stage literal appears in at least one of them. This keeps the
  // test honest as the package grows.
  const routerSrcDir = join(REPO_ROOT, 'packages', 'router', 'src');
  const files = readdirSync(routerSrcDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(routerSrcDir, f), 'utf8'));
  const routerSrc = files.join('\n');
  for (const stage of STAGES) {
    assert.ok(
      routerSrc.includes(`"${stage}"`) || routerSrc.includes(`'${stage}'`),
      `router package should mention stage "${stage}"`,
    );
  }
});
