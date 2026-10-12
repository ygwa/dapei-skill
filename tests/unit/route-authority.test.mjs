// Route authority — the executable contract between the four places that
// describe "which user intent runs which capability":
//
//   1. packages/*/src/**/capabilities.ts  the registry (source of truth for ids)
//   2. packages/router/src/routes-table.ts the executable intent -> id map
//   3. .dapei/commands.yaml               the CLI catalogue
//   4. SKILL.md + skills/**/*.md          the prose the user actually reads
//
// Before v3.2 only (2) existed at runtime and it disagreed with the rest:
// 30 of the 64 registered ids had no route at all (so the CLI fell through
// to the 0.1 `feature.status` fallback while the skills advertised them),
// `workspace validate` hit validation.run, `list assets --repo x` hit
// repos.list, and nothing consumed .dapei/commands.yaml. The assertions
// below pin each of those relationships:
//
//   (a) every registered capability id has a route, or is listed in the
//       explicit UNROUTED allowlist below;
//   (b) every .dapei/commands.yaml entry routes to the capability it
//       declares (via its `intent:` sample when present, else its `cli:`);
//   (c) no route names an unregistered capability;
//   (d) every `@dapei ...` example in SKILL.md / skills/**/*.md resolves to
//       a real route instead of the fallback (placeholder examples excepted);
//   (e) introspectConflicts() reports no precedence conflict outside the
//       explicit CONFLICT_ALLOWLIST below.
//
// Plus a precedence battery (f) of the pre-v3.2 vocabulary, so that a new
// route can never silently steal an existing capability's intents.
//
// Layer: L1 (static) + L2 (router invocation). No filesystem side effects.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const router = await import('../../packages/router/src/index.ts');

// ---------------------------------------------------------------------------
// Registry: the union of the capability spec modules.
// ---------------------------------------------------------------------------
//
// The id source of truth at runtime is the registry. It is composed from
// these three spec modules; they are imported directly (rather than through
// packages/catalog's composition root or core's runner index) so this test
// survives reorganisation of the composition root, and so it never pulls
// the engine runner into the unit suite.
//
// Each module exports capability specs as named consts / arrays, and every
// spec carries `id` plus at least one of `inputSchema` / `execute` /
// `version`, which is what the walk below keys on.
const SPEC_MODULES = [
  '../../packages/core/src/capabilities/index.ts',
  '../../packages/cdr/src/capabilities.ts',
  '../../packages/doc-gen/src/doc-gen.ts'
];

// Capability ids are dotted lower-camel words: workspace.init,
// workflow.runStage, cdr.capability.map.init.
const ID_SHAPE = /^[a-z][a-z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/;

function collectSpecIds(value, out, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectSpecIds(item, out, depth + 1);
    return;
  }
  if (
    typeof value.id === 'string' &&
    ID_SHAPE.test(value.id) &&
    (value.inputSchema !== undefined ||
      typeof value.execute === 'function' ||
      typeof value.version === 'string')
  ) {
    out.add(value.id);
    return;
  }
  for (const item of Object.values(value)) collectSpecIds(item, out, depth + 1);
}

const REGISTERED = new Set();
for (const specModule of SPEC_MODULES) {
  collectSpecIds(await import(specModule), REGISTERED);
}

// Anchors: if a spec module is reshaped so the walk finds nothing, (a) would
// pass vacuously. These four ids must always be present.
const REGISTRY_ANCHORS = [
  'workspace.init',      // core domain spec
  'feature.create',      // core domain spec
  'cdr.profile',         // packages/cdr spec
  'cdr.doc.generate'     // packages/doc-gen spec
];

const ROUTES = router.routes;
const ROUTED = new Set(ROUTES.map((route) => route.capability));
const FALLBACK = router.FALLBACK_ROUTE;

// ---------------------------------------------------------------------------
// (a) allowlist: registered ids that intentionally have NO route.
// ---------------------------------------------------------------------------
//
// Empty by design as of v3.2: every registered capability is reachable from
// a user intent, and `.dapei/commands.yaml` / SKILL.md advertise all of the
// ones that used to be missing. Add an id here (with a comment explaining
// why it must not be triggerable from prose) only as a deliberate decision;
// the test also fails when an allowlisted id becomes routable again.
const UNROUTED_ALLOWLIST = new Set([]);

test('route-authority (a): every registered capability is routable or explicitly allowlisted', () => {
  for (const anchor of REGISTRY_ANCHORS) {
    assert.ok(REGISTERED.has(anchor), `capability registry scan missed the anchor id "${anchor}"`);
  }

  const unrouted = [...REGISTERED].filter((id) => !ROUTED.has(id)).sort();
  const undocumented = unrouted.filter((id) => !UNROUTED_ALLOWLIST.has(id));
  assert.deepEqual(
    undocumented,
    [],
    `registered capabilities with no route in routes-table.ts: ${undocumented.join(', ')}. ` +
    `Add a route, or add the id to UNROUTED_ALLOWLIST with a reason.`
  );

  const staleAllowlist = [...UNROUTED_ALLOWLIST].filter((id) => ROUTED.has(id));
  assert.deepEqual(
    staleAllowlist,
    [],
    `UNROUTED_ALLOWLIST entries that are now routed (drop them): ${staleAllowlist.join(', ')}`
  );

  const bogusAllowlist = [...UNROUTED_ALLOWLIST].filter((id) => !REGISTERED.has(id));
  assert.deepEqual(
    bogusAllowlist,
    [],
    `UNROUTED_ALLOWLIST entries that are not registered capability ids: ${bogusAllowlist.join(', ')}`
  );
});

// ---------------------------------------------------------------------------
// (c) no route may name an id the registry does not implement.
// ---------------------------------------------------------------------------

test('route-authority (c): every route names a registered capability', () => {
  const unknown = ROUTES
    .filter((route) => !REGISTERED.has(route.capability))
    .map((route) => `${route.id} -> ${route.capability}`);
  assert.deepEqual(
    [...new Set(unknown)],
    [],
    `routes naming an unregistered capability: ${unknown.join(', ')}`
  );

  const duplicateIds = ROUTES
    .map((route) => route.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  assert.deepEqual(
    [...new Set(duplicateIds)],
    [],
    `duplicate route ids make diagnostics ambiguous: ${[...new Set(duplicateIds)].join(', ')}`
  );
});

// ---------------------------------------------------------------------------
// (b) .dapei/commands.yaml entries must route to their declared capability.
// ---------------------------------------------------------------------------

const COMMANDS_PATH = join(REPO_ROOT, '.dapei', 'commands.yaml');
const COMMANDS_DOC = load(readFileSync(COMMANDS_PATH, 'utf8'));
const COMMANDS = Array.isArray(COMMANDS_DOC?.commands) ? COMMANDS_DOC.commands : [];

/**
 * The text a user types for a catalogue entry: the explicit `intent:` sample
 * when the entry carries one (used where the `cli:` line is not a usable
 * routing sample), else the `cli:` line. The leading `@dapei ` marker is
 * stripped because routes match the intent body.
 */
function routingSample(entry) {
  return String(entry.intent ?? entry.cli ?? '').replace(/^@dapei\s+/, '').trim();
}

test('route-authority (b): every commands.yaml entry routes to the capability it declares', () => {
  assert.ok(COMMANDS.length >= 30, `expected at least 30 commands.yaml entries, found ${COMMANDS.length}`);

  const failures = [];
  for (const entry of COMMANDS) {
    assert.equal(typeof entry.name, 'string', 'commands.yaml entry without a name');
    assert.equal(
      typeof entry.capability,
      'string',
      `commands.yaml entry "${entry.name}" declares no capability`
    );
    assert.ok(
      REGISTERED.has(entry.capability),
      `commands.yaml entry "${entry.name}" declares unregistered capability "${entry.capability}"`
    );

    const sample = routingSample(entry);
    assert.ok(sample.length > 0, `commands.yaml entry "${entry.name}" has no routing sample`);
    const got = router.routeIntent(sample);
    if (got.capability !== entry.capability) {
      failures.push(
        `"${entry.name}": sample "${sample}" routed to ${got.capability} ` +
        `(confidence ${got.confidence}), declared ${entry.capability}`
      );
    }
  }
  assert.deepEqual(failures, [], `commands.yaml entries that misroute:\n  ${failures.join('\n  ')}`);
});

test('route-authority (b): commands.yaml covers the CLI-facing core capabilities', () => {
  // The catalogue is the user's discovery surface; these ids are the
  // sub-commands it is expected to expose. Keep this list in sync with
  // .dapei/commands.yaml when a new core capability ship as a command.
  const declared = new Set(COMMANDS.map((entry) => entry.capability));
  const expected = [
    'workspace.init', 'workspace.validate', 'workspace.status', 'workspace.report',
    'repos.analyze', 'repos.remove',
    'feature.create', 'feature.close', 'feature.status', 'feature.stage', 'feature.tasks',
    'feature.report', 'workflow.runStage', 'workflow.status', 'context.build',
    'validation.run', 'validation.detect', 'validation.execute',
    'memory.append', 'audit.query'
  ];
  const missing = expected.filter((id) => !declared.has(id));
  assert.deepEqual(missing, [], `commands.yaml does not expose: ${missing.join(', ')}`);
});

// ---------------------------------------------------------------------------
// (d) every `@dapei ...` example in the skills must resolve to a real route.
// ---------------------------------------------------------------------------

/** Every markdown document that carries user-facing examples. */
function collectSkillDocs() {
  const docs = [];
  const rootSkill = join(REPO_ROOT, 'SKILL.md');
  if (existsSync(rootSkill)) docs.push('SKILL.md');

  const skillsDir = join(REPO_ROOT, 'skills');
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.md')) docs.push(relative(REPO_ROOT, full));
    }
  };
  if (existsSync(skillsDir)) walk(skillsDir);
  return docs.sort();
}

/** `@dapei <phrase>` examples, in the same shape skill-router-coverage uses. */
function extractExamples(content) {
  return [...content.matchAll(/@dapei\s+([^\n`|]+)/g)].map((match) => match[1].trim());
}

// Examples that are deliberately not routable. Both are placeholders rather
// than user intents: `@dapei ...` is the prose ellipsis for "any command" and
// `@dapei cdr bootstrap <repo>` keeps its angle-bracket argument, so routing
// either of them would mean routing a metavariable. Keyed as
// `${file}|${example}`; the test fails if an entry goes stale.
const EXAMPLE_EXCEPTIONS = new Set([
  'SKILL.md|...',
  'skills/workflow/SKILL.md|cdr bootstrap <repo>'
]);

test('route-authority (d): every @dapei skill example resolves to a real route', () => {
  const docs = collectSkillDocs();
  assert.ok(docs.length >= 7, `expected SKILL.md plus skills/**/*.md, found ${docs.length}`);

  const seen = new Set();
  const failures = [];
  let checked = 0;

  for (const doc of docs) {
    for (const example of extractExamples(readFileSync(join(REPO_ROOT, doc), 'utf8'))) {
      const key = `${doc}|${example}`;
      seen.add(key);
      if (EXAMPLE_EXCEPTIONS.has(key)) continue;
      checked++;

      const got = router.routeIntent(example);
      if (got.confidence <= FALLBACK.confidence || got.reason === FALLBACK.reason) {
        failures.push(`${doc}: "@dapei ${example}" fell through to the fallback route`);
        continue;
      }
      if (!REGISTERED.has(got.capability)) {
        failures.push(`${doc}: "@dapei ${example}" -> ${got.capability} is not a registered capability`);
      }
    }
  }

  assert.deepEqual(failures, [], `unroutable skill examples:\n  ${failures.join('\n  ')}`);
  assert.ok(checked >= 40, `expected to check at least 40 examples, checked ${checked}`);

  const staleExceptions = [...EXAMPLE_EXCEPTIONS].filter((key) => !seen.has(key));
  assert.deepEqual(
    staleExceptions,
    [],
    `EXAMPLE_EXCEPTIONS entries that no longer exist (drop them): ${staleExceptions.join(', ')}`
  );
});

// ---------------------------------------------------------------------------
// (e) conflict allowlist.
// ---------------------------------------------------------------------------
//
// describeConflicts() only reports a pair when both routes match a shared
// probe intent AND that pair owns the winner. The one remaining pair is real
// precedence, not an accident: a cross-repo portal is also a documentation
// portal, so `render cross-repo portal` matches both, and the cross-repo
// route wins on priority (50 < 100). tests/router/conflict.test.mjs requires
// at least one documented conflict to exist.
const CONFLICT_ALLOWLIST = new Set([
  'cdr.crossrepo.doc.generate.english|cdr.doc.generate.english'
]);

test('route-authority (e): introspectConflicts reports only allowlisted precedence pairs', () => {
  const { conflicts, text } = router.introspectConflicts();
  assert.ok(Array.isArray(conflicts), 'conflicts must be an array');
  assert.equal(typeof text, 'string');

  const seen = new Set();
  for (const conflict of conflicts) {
    const key = `${conflict.routeA.id}|${conflict.routeB.id}`;
    seen.add(key);
    assert.ok(
      CONFLICT_ALLOWLIST.has(key),
      `undocumented route conflict:\n${router.summarizeConflict(conflict)}\n` +
      'Either tighten the patterns or add the pair to CONFLICT_ALLOWLIST with a reason.'
    );

    assert.ok(conflict.sampleIntents.length >= 1, `conflict ${key} has no shared sample intent`);
    const winner = conflict.winner === 'A'
      ? conflict.routeA
      : conflict.winner === 'B'
        ? conflict.routeB
        : undefined;
    assert.ok(winner, `conflict ${key} has no single winner; make the precedence explicit`);
    for (const intent of conflict.sampleIntents) {
      assert.equal(
        router.routeIntent(intent).capability,
        winner.capability,
        `intent "${intent}" routes to ${router.routeIntent(intent).capability}, ` +
        `but the conflict declares ${winner.capability}`
      );
    }
  }

  const stale = [...CONFLICT_ALLOWLIST].filter((key) => !seen.has(key));
  assert.deepEqual(
    stale,
    [],
    `CONFLICT_ALLOWLIST entries that no longer conflict (drop them): ${stale.join(', ')}`
  );
});

// ---------------------------------------------------------------------------
// (f) precedence battery: the v3.1 vocabulary must keep routing where it did.
// ---------------------------------------------------------------------------
//
// Every pair below was the router's behaviour before the v3.2 route-authority
// additions; the point of the battery is that adding routes for the 30
// orphaned capabilities did not steal any of these intents. It overlaps
// tests/router/fixtures/intent-corpus.yaml on purpose: this list is the
// subset that the new routes are most likely to collide with.
const PRECEDENCE_BATTERY = [
  // core domains
  ['initialize workspace', 'workspace.init'],
  ['init workspace', 'workspace.init'],
  ['repos add my-repo git@example.com/repo.git', 'repos.add'],
  ['repos sync --all', 'repos.sync'],
  ['list the repos', 'repos.list'],
  ['repos check', 'repos.check'],
  ['analyze repos', 'repos.analyze'],
  ['create feature payment-refactor --repos payment-service --owner alice', 'feature.create'],
  ['context build for feature auth', 'context.build'],
  ['run workflow on feature auth --stage implementation', 'workflow.runStage'],
  ['validate feature payment-refactor --stage local-validation', 'validation.run'],
  ['generate report for feature auth', 'feature.report'],
  ['review feature auth', 'feature.review'],
  ['close feature payment-refactor', 'feature.close'],
  ['status feature payment-refactor', 'feature.status'],
  ['accept feature payment-refactor', 'feature.accept'],
  ['gap analysis for feature auth', 'feature.gap.analysis'],
  // cdr / cognitive
  ['analyze behaviors for sample-app', 'cognitive.discover'],
  ['list behaviors for sample-app', 'cognitive.artifact.list'],
  ['list behaviors created by feature payment-refactor', 'cdr.query'],
  ['profile repo sample-app', 'cdr.profile'],
  ['discover entries for sample-app', 'cdr.entries.prepare'],
  ['confirm entry order-create', 'cdr.entries.confirm'],
  ['discover states for Order', 'cognitive.state.suggest'],
  ['compose domain Transaction', 'cdr.domain.compose'],
  ['compose business rule order-amount-positive', 'cdr.business.compose'],
  ['init capability map for E-Commerce Mall', 'cdr.capability.map.init'],
  ['synth capability map for E-Commerce Mall', 'cdr.capability.map.synth'],
  ['bootstrap sample-app', 'cdr.bootstrap'],
  ['suggest domains', 'cdr.domain.suggest'],
  ['render L1 portal', 'cdr.reversecluster.doc.generate'],
  ['render cross-repo portal', 'cdr.crossrepo.doc.generate'],
  ['generate documentation portal', 'cdr.doc.generate'],
  ['list assets', 'cdr.index.list'],
  ['list assets --repo mall-order', 'cdr.index.list'],
  ['build cross-repo rules', 'cdr.business.crosslink'],
  // pinned by tests/integration/cdr-v0.8-reverse-cluster.test.mjs
  ['build capability map for E-Commerce Mall', 'cdr.capability.map.init'],
  ['聚类功能地图', 'cdr.capability.map.synth'],
  ['渲染能力地图门户', 'cdr.reversecluster.doc.generate'],
  // chinese
  ['创建 feature payment', 'feature.create'],
  ['引导 sample-app', 'cdr.bootstrap'],
  ['分析 repo sample-app', 'cdr.profile'],
  ['扫描入口 for sample-app', 'cdr.entries.prepare'],
  ['确认入口 order-create', 'cdr.entries.confirm'],
  ['推导状态 for Order', 'cognitive.state.suggest'],
  ['组合领域 Transaction', 'cdr.domain.compose'],
  ['初始化功能地图', 'cdr.capability.map.init'],
  ['合成功能地图', 'cdr.capability.map.synth'],
  ['推荐领域', 'cdr.domain.suggest'],
  ['渲染 L1 门户', 'cdr.reversecluster.doc.generate'],
  ['生成跨仓库门户', 'cdr.crossrepo.doc.generate'],
  ['生成文档门户', 'cdr.doc.generate'],
  ['列出资产', 'cdr.index.list']
];

test('route-authority (f): new routes did not steal the existing vocabulary', () => {
  const failures = [];
  for (const [intent, expected] of PRECEDENCE_BATTERY) {
    const got = router.routeIntent(intent);
    if (got.capability !== expected) {
      failures.push(`"${intent}" -> ${got.capability} (${got.reason}), expected ${expected}`);
    }
  }
  assert.deepEqual(failures, [], `precedence regressions:\n  ${failures.join('\n  ')}`);
});
