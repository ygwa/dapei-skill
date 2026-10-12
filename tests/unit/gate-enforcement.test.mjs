// Gate enforcement tests — engine-level contracts for stage advances.
//
// Covers:
//   (a) feature.stage set to a stage not declared in the workflow YAML throws
//   (b) set to a stage whose prerequisite marker is missing throws
//   (c) set to a gate stage without confirmed=true throws
//   (d) guardrail_mode: enforce + a deliberately failing rule blocks the stage
//       advance and writes NO completion marker
//   (e) an unknown rule check.type produces a finding instead of silence, and
//       can actually escalate the guardrail status to FAIL
//
// The gate stage list lives in `.dapei/workflows/feature-lifecycle.yaml`
// (`gates:`); these tests pin that the engine reads it from there.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const core = await import("@dapei/core");

const WORKFLOW_WITH_GATES = `version: 0.1
name: feature-lifecycle
gates:
  - solution-design
  - implementation
  - acceptance
stages:
  - id: analyze-current-state
    requires: []
    outputs: []
  - id: gap-analysis
    requires: [analyze-current-state]
    outputs: []
  - id: solution-design
    requires: [gap-analysis]
    outputs: []
  - id: implementation
    requires: [solution-design]
    outputs: []
  - id: acceptance
    requires: [implementation]
    outputs: []
`;

// Same DAG but the workflow only marks `implementation` as a gate.
const WORKFLOW_NARROW_GATES = WORKFLOW_WITH_GATES.replace(
  "gates:\n  - solution-design\n  - implementation\n  - acceptance\n",
  "gates:\n  - implementation\n",
);

// No `gates:` block at all — the engine must fall back to the canonical gates.
const WORKFLOW_NO_GATES = WORKFLOW_WITH_GATES.replace(
  "gates:\n  - solution-design\n  - implementation\n  - acceptance\n",
  "",
);

// A rule that fails deterministically for any feature (evidence file is absent).
const FAILING_RULES = `version: 0.1
rule_set: gate-enforcement-test
mode: report
rules:
  - id: TEST-001
    title: deliberately failing rule
    severity: high
    check:
      type: evidence-required
      evidence_file: "features/<feature>/memory/decision-log.md"
      condition: "cross-domain-change=true"
    message: decision log must exist
`;

const UNKNOWN_TYPE_RULES = `version: 0.1
rule_set: unknown-check-type-test
mode: report
rules:
  - id: TEST-002
    title: unknown check type
    severity: medium
    check:
      type: totally-unknown
    message: engine cannot evaluate this rule
`;

// A high-severity FAIL followed by a low-severity failure: the low one must not
// downgrade the final status back to WARN.
const NO_DOWNGRADE_RULES = `version: 0.1
rule_set: no-downgrade-test
mode: report
rules:
  - id: TEST-010
    title: high severity failure
    severity: high
    check:
      type: file-required
      files:
        - "features/<feature>/memory/cannot-exist.md"
    message: required file missing
  - id: TEST-011
    title: low severity failure with unknown type
    severity: low
    check:
      type: another-unknown-type
    message: engine cannot evaluate this rule
`;

function ctx(tmp) {
  return { rootDir: tmp, now: new Date() };
}

function reportsDir(tmp) {
  return join(tmp, "features", "demo", "reports");
}

function markCompleted(tmp, stage) {
  mkdirSync(reportsDir(tmp), { recursive: true });
  writeFileSync(join(reportsDir(tmp), `stage-${stage}.completed`), `stage: ${stage}\n`);
}

/**
 * Workspace + feature fixture. When `rules` is given, `.dapei/rules` is
 * replaced by that single rules file so the guardrail outcome is deterministic
 * (workspace.init may otherwise copy the engine's own rule pack).
 */
async function setupFeature(tmp, { workflow = WORKFLOW_WITH_GATES, guardrailMode = null, rules = null } = {}) {
  await core.runCapability("workspace.init", {}, ctx(tmp));
  mkdirSync(reportsDir(tmp), { recursive: true });
  writeFileSync(
    join(tmp, "features", "demo", "feature.yaml"),
    `version: "0.2"\nfeature:\n  name: demo\n  repos: []\n`,
  );
  mkdirSync(join(tmp, ".dapei", "workflows"), { recursive: true });
  writeFileSync(join(tmp, ".dapei", "workflows", "feature-lifecycle.yaml"), workflow);

  if (guardrailMode) {
    const workspaceFile = join(tmp, ".dapei", "workspace.yaml");
    const content = readFileSync(workspaceFile, "utf8");
    assert.match(content, /guardrail_mode:\s*report/);
    writeFileSync(workspaceFile, content.replace(/guardrail_mode:\s*report/, `guardrail_mode: ${guardrailMode}`));
  }

  if (rules) {
    rmSync(join(tmp, ".dapei", "rules"), { recursive: true, force: true });
    mkdirSync(join(tmp, ".dapei", "rules"), { recursive: true });
    writeFileSync(join(tmp, ".dapei", "rules", "zz-gate-enforcement.yaml"), rules);
  }
}

function cleanTmp(tmp) {
  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// (a) unknown stage
// ---------------------------------------------------------------------------

test("gate-enforcement: stage set to a stage not in the workflow YAML throws INVALID_STAGE", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gate-"));
  try {
    await setupFeature(tmp);

    await assert.rejects(
      () => core.runCapability("feature.stage", { feature: "demo", action: "set", stage: "solution-desing" }, ctx(tmp)),
      (err) => err.code === "INVALID_STAGE" && /not declared in workflow/.test(err.message),
    );

    assert.equal(
      existsSync(join(reportsDir(tmp), "stage-solution-desing.completed")),
      false,
      "a typo'd stage must not write a marker",
    );
    assert.equal(
      existsSync(join(reportsDir(tmp), "feature-progress.md")),
      false,
      "a typo'd stage must not poison the progress stage line",
    );
  } finally {
    cleanTmp(tmp);
  }
});

// ---------------------------------------------------------------------------
// (b) missing prerequisite marker
// ---------------------------------------------------------------------------

test("gate-enforcement: stage set without the prerequisite marker throws STAGE_PREREQ_MISSING", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gate-"));
  try {
    await setupFeature(tmp);

    await assert.rejects(
      () => core.runCapability("feature.stage", { feature: "demo", action: "set", stage: "gap-analysis" }, ctx(tmp)),
      (err) => err.code === "STAGE_PREREQ_MISSING" && /required stage 'analyze-current-state' not completed/.test(err.message),
    );
    assert.equal(existsSync(join(reportsDir(tmp), "stage-gap-analysis.completed")), false);
  } finally {
    cleanTmp(tmp);
  }
});

// ---------------------------------------------------------------------------
// (c) gate confirmation
// ---------------------------------------------------------------------------

test("gate-enforcement: stage set to a gate stage requires confirmed=true", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gate-"));
  try {
    await setupFeature(tmp);
    markCompleted(tmp, "analyze-current-state");
    markCompleted(tmp, "gap-analysis");

    await assert.rejects(
      () => core.runCapability("feature.stage", { feature: "demo", action: "set", stage: "solution-design" }, ctx(tmp)),
      (err) => err.code === "CONFIRMATION_REQUIRED" && /confirmation gate/.test(err.message),
    );
    assert.equal(existsSync(join(reportsDir(tmp), "stage-solution-design.completed")), false, "unconfirmed gate must not write a marker");

    const { result } = await core.runCapability(
      "feature.stage",
      { feature: "demo", action: "set", stage: "solution-design", confirmed: true },
      ctx(tmp),
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.stage, "solution-design");
    assert.ok(existsSync(join(reportsDir(tmp), "stage-solution-design.completed")));
  } finally {
    cleanTmp(tmp);
  }
});

test("gate-enforcement: the gate list is read from the workflow YAML, not hardcoded", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gate-"));
  try {
    await setupFeature(tmp, { workflow: WORKFLOW_NARROW_GATES });
    markCompleted(tmp, "analyze-current-state");
    markCompleted(tmp, "gap-analysis");

    // solution-design is NOT a gate in this workflow -> no confirmation needed.
    const { result } = await core.runCapability(
      "feature.stage",
      { feature: "demo", action: "set", stage: "solution-design" },
      ctx(tmp),
    );
    assert.equal(result.ok, true);

    // implementation IS a gate in this workflow -> confirmation required.
    await assert.rejects(
      () => core.runCapability("feature.stage", { feature: "demo", action: "set", stage: "implementation" }, ctx(tmp)),
      (err) => err.code === "CONFIRMATION_REQUIRED",
    );
  } finally {
    cleanTmp(tmp);
  }
});

test("gate-enforcement: a workflow without a gates: block falls back to the canonical three gates", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gate-"));
  try {
    await setupFeature(tmp, { workflow: WORKFLOW_NO_GATES });
    markCompleted(tmp, "analyze-current-state");
    markCompleted(tmp, "gap-analysis");

    await assert.rejects(
      () => core.runCapability("feature.stage", { feature: "demo", action: "set", stage: "solution-design" }, ctx(tmp)),
      (err) => err.code === "CONFIRMATION_REQUIRED",
    );
  } finally {
    cleanTmp(tmp);
  }
});

// ---------------------------------------------------------------------------
// (d) guardrail_mode enforcement
// ---------------------------------------------------------------------------

test("gate-enforcement: guardrail_mode enforce + FAIL blocks the stage advance and writes no marker", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gate-"));
  try {
    await setupFeature(tmp, { guardrailMode: "enforce", rules: FAILING_RULES });

    await assert.rejects(
      () => core.runCapability("feature.stage", { feature: "demo", action: "set", stage: "analyze-current-state" }, ctx(tmp)),
      (err) => err.code === "GUARDRAIL_FAILED" && /TEST-001/.test(err.message) && /guardrail_mode=enforce/.test(err.message),
    );

    assert.equal(existsSync(join(reportsDir(tmp), "stage-analyze-current-state.completed")), false, "blocked advance must not write a marker");
    assert.equal(existsSync(join(reportsDir(tmp), "feature-progress.md")), false, "blocked advance must not update progress");
    // The guardrail report itself is still written (evidence for the block).
    assert.ok(existsSync(join(reportsDir(tmp), "guardrail-report.md")));
  } finally {
    cleanTmp(tmp);
  }
});

test("gate-enforcement: guardrail enforce also blocks feature.stage.transition and workflow.runStage", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gate-"));
  try {
    await setupFeature(tmp, { guardrailMode: "enforce", rules: FAILING_RULES });
    markCompleted(tmp, "analyze-current-state");
    markCompleted(tmp, "gap-analysis");

    await assert.rejects(
      () => core.runCapability("feature.stage.transition", { feature: "demo", stage: "solution-design", confirmed: true }, ctx(tmp)),
      (err) => err.code === "GUARDRAIL_FAILED" && /TEST-001/.test(err.message),
    );
    assert.equal(existsSync(join(reportsDir(tmp), "stage-solution-design.completed")), false);

    await assert.rejects(
      () => core.runCapability("workflow.runStage", { feature: "demo", stage: "solution-design", confirmed: true }, ctx(tmp)),
      (err) => err.code === "GUARDRAIL_FAILED" && /TEST-001/.test(err.message),
    );
    assert.equal(existsSync(join(reportsDir(tmp), "stage-solution-design.completed")), false);
  } finally {
    cleanTmp(tmp);
  }
});

test("gate-enforcement: guardrail_mode report keeps advancing and surfaces the summary fragment", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gate-"));
  try {
    await setupFeature(tmp, { guardrailMode: "report", rules: FAILING_RULES });

    const { result } = await core.runCapability(
      "feature.stage",
      { feature: "demo", action: "set", stage: "analyze-current-state" },
      ctx(tmp),
    );

    assert.equal(result.ok, true);
    assert.ok(existsSync(join(reportsDir(tmp), "stage-analyze-current-state.completed")), "report mode must still advance");
    assert.ok(
      result.reportFragments.some((f) => f.includes("guardrail: FAIL")),
      `reportFragments should carry the guardrail finding summary, got ${JSON.stringify(result.reportFragments)}`,
    );
  } finally {
    cleanTmp(tmp);
  }
});

// ---------------------------------------------------------------------------
// (e) unknown check.type
// ---------------------------------------------------------------------------

test("gate-enforcement: unknown check.type produces a finding and at least WARN", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gate-"));
  try {
    await setupFeature(tmp, { rules: UNKNOWN_TYPE_RULES });

    const { result } = await core.runCapability("feature.guardrail", { feature: "demo" }, ctx(tmp));
    assert.equal(result.data.status, "WARN", "an unsupported check.type must not pass silently");

    const report = readFileSync(join(reportsDir(tmp), "guardrail-report.md"), "utf8");
    assert.match(report, /TEST-002: unsupported check\.type 'totally-unknown'/);
  } finally {
    cleanTmp(tmp);
  }
});

test("gate-enforcement: unknown check.type never downgrades a FAIL", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-gate-"));
  try {
    await setupFeature(tmp, { rules: NO_DOWNGRADE_RULES });

    const { result } = await core.runCapability("feature.guardrail", { feature: "demo" }, ctx(tmp));
    assert.equal(result.data.status, "FAIL", "a low-severity finding must not downgrade an existing FAIL");

    const report = readFileSync(join(reportsDir(tmp), "guardrail-report.md"), "utf8");
    assert.match(report, /TEST-010/);
    assert.match(report, /TEST-011: unsupported check\.type 'another-unknown-type'/);
  } finally {
    cleanTmp(tmp);
  }
});
