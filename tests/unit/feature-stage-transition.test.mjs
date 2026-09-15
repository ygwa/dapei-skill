import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const core = await import("../../packages/core/src/index.ts");

const WORKFLOW_YAML = `
- id: analyze-current-state
  name: Analyze Current State
  stage: analyze-current-state
  outputs: []
- id: gap-analysis
  name: Gap Analysis
  stage: gap-analysis
  requires: [analyze-current-state]
  outputs: []
- id: solution-design
  name: Solution Design
  stage: solution-design
  requires: [gap-analysis]
  outputs: []
- id: implementation
  name: Implementation
  stage: implementation
  requires: [solution-design]
  outputs: []
- id: local-validation
  name: Local Validation
  stage: local-validation
  requires: [implementation]
  outputs: []
- id: architecture-review
  name: Architecture Review
  stage: architecture-review
  requires: [local-validation]
  outputs: []
- id: acceptance
  name: Acceptance
  stage: acceptance
  requires: [architecture-review]
  outputs: []
`;

async function setupFeature(tmp) {
  await core.runCapability("workspace.init", {}, { rootDir: tmp, now: new Date() });
  mkdirSync(join(tmp, "features", "demo", "reports"), { recursive: true });
  writeFileSync(
    join(tmp, "features", "demo", "feature.yaml"),
    `version: "0.2"\nfeature:\n  name: demo\n  objective: "ship it"\n  owner: alice\n  repos: []\n`
  );
  mkdirSync(join(tmp, ".dapei", "workflows"), { recursive: true });
  writeFileSync(join(tmp, ".dapei", "workflows", "feature-lifecycle.yaml"), WORKFLOW_YAML);
}

test("feature.stage.transition: refuses when stage is not declared in workflow", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-trans-"));
  try {
    await setupFeature(tmp);
    await assert.rejects(
      core.runCapability(
        "feature.stage.transition",
        { feature: "demo", stage: "ghost-stage" },
        { rootDir: tmp, now: new Date() }
      ),
      /not declared in workflow/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("feature.stage.transition: refuses when prereq stage marker is missing", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-trans-"));
  try {
    await setupFeature(tmp);
    await assert.rejects(
      core.runCapability(
        "feature.stage.transition",
        { feature: "demo", stage: "gap-analysis" },
        { rootDir: tmp, now: new Date() }
      ),
      /required stage 'analyze-current-state' not completed/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("feature.stage.transition: writes stage marker when prereqs satisfied", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-trans-"));
  try {
    await setupFeature(tmp);
    writeFileSync(
      join(tmp, "features", "demo", "reports", "stage-analyze-current-state.completed"),
      "ok\n"
    );
    const { result } = await core.runCapability(
      "feature.stage.transition",
      { feature: "demo", stage: "gap-analysis" },
      { rootDir: tmp, now: new Date() }
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.stage, "gap-analysis");
    assert.ok(
      existsSync(join(tmp, "features", "demo", "reports", "stage-gap-analysis.completed")),
      "stage marker must be written"
    );
    assert.ok(
      existsSync(join(tmp, "features", "demo", "reports", "feature-progress.md")),
      "feature-progress.md must be created/updated"
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("feature.stage.transition: solution-design gate requires --yes", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-trans-"));
  try {
    await setupFeature(tmp);
    writeFileSync(
      join(tmp, "features", "demo", "reports", "stage-analyze-current-state.completed"),
      "ok\n"
    );
    writeFileSync(join(tmp, "features", "demo", "reports", "stage-gap-analysis.completed"), "ok\n");

    await assert.rejects(
      core.runCapability(
        "feature.stage.transition",
        { feature: "demo", stage: "solution-design" },
        { rootDir: tmp, now: new Date() }
      ),
      /confirmation gate/
    );

    const { result } = await core.runCapability(
      "feature.stage.transition",
      { feature: "demo", stage: "solution-design", confirmed: true },
      { rootDir: tmp, now: new Date() }
    );
    assert.equal(result.ok, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("feature.stage.transition: refuses when feature.yaml missing", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-trans-"));
  try {
    await core.runCapability("workspace.init", {}, { rootDir: tmp, now: new Date() });
    await assert.rejects(
      core.runCapability(
        "feature.stage.transition",
        { feature: "ghost", stage: "analyze-current-state" },
        { rootDir: tmp, now: new Date() }
      ),
      /feature.yaml not found/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});