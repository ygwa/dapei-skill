import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const core = await import("../../packages/core/src/index.ts");

const WORKFLOW_YAML = `
- id: analyze-current-state
  name: Analyze Current State
  stage: analyze-current-state
  outputs:
    - reports/current-state.md
- id: gap-analysis
  name: Gap Analysis
  stage: gap-analysis
  requires: [analyze-current-state]
  outputs:
    - docs/02-gap-analysis.md
`;

async function setupFeature(tmp, opts = {}) {
  await core.runCapability("workspace.init", {}, { rootDir: tmp, now: new Date() });
  mkdirSync(join(tmp, "features", "demo"), { recursive: true });
  writeFileSync(
    join(tmp, "features", "demo", "feature.yaml"),
    `version: "0.2"\nfeature:\n  name: demo\n  objective: "${opts.objective ?? "stabilize payment callback chain"}"\n  owner: alice\n  repos: []\n`
  );
  mkdirSync(join(tmp, "features", "demo", "reports"), { recursive: true });
  mkdirSync(join(tmp, ".dapei", "workflows"), { recursive: true });
  writeFileSync(join(tmp, ".dapei", "workflows", "feature-lifecycle.yaml"), WORKFLOW_YAML);
  if (opts.withCurrentStateMarker !== false) {
    writeFileSync(join(tmp, "features", "demo", "reports", "stage-analyze-current-state.completed"), "ok\n");
  }
  if (opts.withIndex) {
    mkdirSync(join(tmp, ".dapei", "cognitive"), { recursive: true });
    writeFileSync(
      join(tmp, ".dapei", "cognitive", "index.yaml"),
      `version: '0.10'\nupdated_at: '2026-09-01T00:00:00Z'\nbehaviors:\n  - id: payment-callback\n    path: docs/as-is/behavior/payment/payment-callback.yaml\n    repo: payment\n    kind: behavior\n    level: fact\nstate_machines: []\ndomains: []\ncapability_maps: []\nbusiness_rules: []\nunknowns: []\nrepo_snapshots: []\nstale_assets: []\n`
    );
    // The envelope capability reads from disk, not the index, so the
    // behavior yaml must actually exist for cdr.context.envelope to return ok.
    mkdirSync(join(tmp, "docs", "as-is", "behavior", "payment"), { recursive: true });
    writeFileSync(
      join(tmp, "docs", "as-is", "behavior", "payment", "payment-callback.yaml"),
      `---\nid: payment-callback\nkind: behavior\nlevel: fact\nrepo: payment\nsources:\n  - file: src/PaymentService.ts\n    line: 10\n---\n\n# Payment Callback\n\nThe callback handler retries failed payments up to 3 times.\n`
    );
  }
}

test("feature.gap-analysis: scaffolds docs/02-gap-analysis.md with stage header", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gap-"));
  try {
    await setupFeature(tmp, { withIndex: false });
    const { result } = await core.runCapability(
      "feature.gap-analysis",
      { feature: "demo" },
      { rootDir: tmp, now: new Date() }
    );
    assert.equal(result.ok, true);
    const gapPath = join(tmp, result.data.gapAnalysis);
    assert.ok(existsSync(gapPath), "scaffold file should exist");
    const body = readFileSync(gapPath, "utf8");
    assert.ok(body.includes("# Gap Analysis — demo"));
    assert.ok(body.includes("## Objective"));
    assert.ok(body.includes("## Gaps"));
    assert.ok(body.includes("Prereq satisfied: analyze-current-state ✓"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("feature.gap-analysis: refuses when analyze-current-state marker is missing", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gap-"));
  try {
    await setupFeature(tmp, { withCurrentStateMarker: false });
    await assert.rejects(
      core.runCapability("feature.gap-analysis", { feature: "demo" }, { rootDir: tmp, now: new Date() }),
      /gap-analysis requires 'analyze-current-state'/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("feature.gap-analysis: refuses for missing feature.yaml", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gap-"));
  try {
    await core.runCapability("workspace.init", {}, { rootDir: tmp, now: new Date() });
    await assert.rejects(
      core.runCapability("feature.gap-analysis", { feature: "ghost" }, { rootDir: tmp, now: new Date() }),
      /feature.yaml not found/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("feature.gap-analysis: with index, auto-injects at most max_envelopes related behaviors", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gap-"));
  try {
    await setupFeature(tmp, {
      withIndex: true,
      objective: "stabilize payment callback chain"
    });
    const { result } = await core.runCapability(
      "feature.gap-analysis",
      { feature: "demo", max_envelopes: 2 },
      { rootDir: tmp, now: new Date() }
    );
    assert.equal(result.ok, true);
    assert.ok(result.data.injectedEnvelopes >= 1, "expected at least 1 related envelope, got " + result.data.injectedEnvelopes);
    const body = readFileSync(join(tmp, result.data.gapAnalysis), "utf8");
    assert.ok(body.includes("payment-callback"), "should mention payment-callback in injected envelopes");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});