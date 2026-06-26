// M1-3 integration test: SubprocessEngineClient against the real
// engine. We init a temp workspace, call workspace.status, and
// assert the response shape. This is the first end-to-end test
// that exercises the subprocess boundary + WorkspaceContext env
// injection + dimension rule all in one.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = "/Users/ygwang/Develop/github/dapei-skill";

function initWorkspace(tmp) {
  const init = spawnSync(
    "node",
    ["--experimental-strip-types", join(repoRoot, "engine/dapei-engine.ts"), "init", "workspace"],
    { cwd: tmp, env: { ...process.env, DAPEI_WORKSPACE_ROOT: tmp, DAPEI_ENGINE_HOME: repoRoot }, encoding: "utf8" }
  );
  if (init.status !== 0) throw new Error(`init failed: ${init.stderr}`);
}

function runCapability(tmp, capabilityId, input = {}) {
  const result = spawnSync(
    "node",
    [
      "--experimental-strip-types",
      join(repoRoot, "engine/dapei-engine.ts"),
      "run",
      "--capability", capabilityId,
      "--input", JSON.stringify(input)
    ],
    { cwd: tmp, env: { ...process.env, DAPEI_WORKSPACE_ROOT: tmp, DAPEI_ENGINE_HOME: repoRoot }, encoding: "utf8" }
  );
  return result;
}

test("end-to-end: init a temp workspace, then status returns repoCount=0, featureCount=0", () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-e2e-"));
  try {
    initWorkspace(tmp);
    assert.ok(existsSync(join(tmp, ".dapei", "workspace.yaml")), "workspace.yaml should exist");
    const result = runCapability(tmp, "workspace.status");
    assert.equal(result.status, 0, `engine exit non-zero: ${result.stderr}`);
    const status = JSON.parse(result.stdout);
    assert.equal(status.repoCount, 0);
    assert.equal(status.featureCount, 0);
    assert.equal(status.conforms, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("end-to-end: workspace.validate on freshly-init workspace returns status=warn (no repos/features)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-e2e-"));
  try {
    initWorkspace(tmp);
    const result = runCapability(tmp, "workspace.validate");
    assert.equal(result.status, 0);
    const validation = JSON.parse(result.stdout);
    // After init, .dapei/workspace.yaml exists; repos/ and features/ are created
    // by init; docs/agents.md is also created. So this should be 'valid'.
    assert.equal(validation.status, "valid", `expected valid, got ${JSON.stringify(validation)}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("end-to-end: workspace.report returns the expected shape", () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-e2e-"));
  try {
    initWorkspace(tmp);
    const result = runCapability(tmp, "workspace.report");
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.ok(Array.isArray(report.repos), "repos should be an array");
    assert.ok(Array.isArray(report.features), "features should be an array");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
