// AI behavior compliance tests (L4)
//
// Drives the mock-LLM harness over each fixture conversation, runs the
// engine, and asserts that the resulting trace satisfies the expected
// behavioral contract. Default backend is the mock; set
// DAPEI_AI_BEHAVIOR_USE_REAL_LLM=1 to fail loudly (no real provider
// configured yet — see harness/real-llm.ts).
//
// Layer: L4 — AI collaboration contract. The harness executes the real
// dapei engine, so the engine state is verified end-to-end; what this
// layer adds is the *agent behavior* shape (action order, output format,
// boundary observance, pause-at-confirmation).

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const FIXTURE_REPO_SRC = join(REPO_ROOT, 'tests', 'fixtures', 'sample-node-repo');

if (!process.env.DAPEI_ENGINE_HOME) process.env.DAPEI_ENGINE_HOME = REPO_ROOT;

const { loadTranscript, listTranscripts } = await import('./harness/transcript-loader.ts');
const { runWithCurrentBackend, USING_REAL_LLM } = await import('./harness/real-llm.ts');
const { validate } = await import('./harness/output-validators.ts');

function cleanTmp(t) { rmSync(t, { recursive: true, force: true }); }

function initFixtureRepo(targetPath) {
  cpSync(FIXTURE_REPO_SRC, targetPath, { recursive: true });
  if (!existsSync(join(targetPath, '.git'))) {
    execFileSync('git', ['-C', targetPath, 'init', '-b', 'main'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.name', 'dapei test'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    execFileSync('git', ['-C', targetPath, 'add', '.']);
    execFileSync('git', ['-C', targetPath, 'commit', '-m', 'fixture']);
  }
  return targetPath;
}

// Discover all .yaml fixture files and run each as its own test
const FIXTURE_NAMES = listTranscripts();

test('ai-behavior: backend is the mock harness by default', () => {
  if (process.env.DAPEI_AI_BEHAVIOR_USE_REAL_LLM === '1') {
    // Real LLM mode requires a real-llm.ts implementation; we don't have one yet.
    assert.fail('DAPEI_AI_BEHAVIOR_USE_REAL_LLM=1 is set but no real-LLM provider is wired up');
  }
  assert.equal(USING_REAL_LLM, false);
});

test('ai-behavior: at least one transcript fixture is shipped', () => {
  assert.ok(FIXTURE_NAMES.length >= 1, 'tests/ai-behavior/fixtures/conversations/ must contain at least one .yaml');
});

for (const name of FIXTURE_NAMES) {
  test(`ai-behavior: ${name} satisfies its contract`, async () => {
    const transcript = loadTranscript(name);
    const tmp = mkdtempSync(join(tmpdir(), `dapei-ai-${name}-`));
    const cleanupExtras = [];
    try {
      // For fixtures that need a real sample-app repo, copy the fixture into a
      // sibling dir (outside the workspace tmp) and substitute the path. The
      // workspace tmp must stay effectively empty until workspace.init runs.
      const needsFixtureRepo = transcript.actions.some(
        (a) => a.kind === 'tool_call' && a.input && a.input.url === '{{fixture_repo_path}}',
      );
      if (needsFixtureRepo) {
        const fixtureRepo = join(tmpdir(), `dapei-ai-fixture-${name}-${Date.now()}`);
        initFixtureRepo(fixtureRepo);
        for (const action of transcript.actions) {
          if (action.kind === 'tool_call' && action.input && action.input.url === '{{fixture_repo_path}}') {
            action.input.url = fixtureRepo;
          }
        }
        cleanupExtras.push(fixtureRepo);
      }

      const trace = await runWithCurrentBackend(transcript, { rootDir: tmp, now: new Date() });

      // Surface harness errors as test failures with the full trace
      if (!trace.ok) {
        assert.fail(`harness errors: ${trace.errors.join('; ')}\nTrace: ${JSON.stringify(trace.events, null, 2)}`);
      }

      const violations = validate(trace, transcript.asserts);
      if (transcript.expect_violations) {
        if (violations.length === 0) {
          assert.fail(`expected violations but got none; negative fixture did not detect a rule break`);
        }
        // OK: harness correctly caught the violation
      } else if (violations.length > 0) {
        assert.fail(`contract violations:\n  - ${violations.join('\n  - ')}\nTrace events: ${JSON.stringify(trace.events.map((e) => e.kind), null, 2)}`);
      }
    } finally {
      cleanTmp(tmp);
      for (const extra of cleanupExtras) cleanTmp(extra);
    }
  });
}
