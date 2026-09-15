import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const core = await import("../../packages/core/src/index.ts");

async function setupFeature(tmp, opts = {}) {
  await core.runCapability("workspace.init", {}, { rootDir: tmp, now: new Date() });
  mkdirSync(join(tmp, "features", "demo", "reports"), { recursive: true });
  writeFileSync(
    join(tmp, "features", "demo", "feature.yaml"),
    `version: "0.2"\nfeature:\n  name: demo\n  objective: "ship it"\n  owner: alice\n  repos: []\n`
  );
  mkdirSync(join(tmp, ".dapei", "workflows"), { recursive: true });
  writeFileSync(
    join(tmp, ".dapei", "workflows", "feature-lifecycle.yaml"),
    `
- id: architecture-review
  name: Architecture Review
  stage: architecture-review
  outputs: []
- id: acceptance
  name: Acceptance
  stage: acceptance
  requires: [architecture-review]
  outputs: []
`
  );
  if (opts.archReviewDone !== false) {
    writeFileSync(
      join(tmp, "features", "demo", "reports", "stage-architecture-review.completed"),
      "ok\n"
    );
  }
}

test("feature.accept: refuses without --yes (confirmation gate enforced)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-accept-"));
  try {
    await setupFeature(tmp);
    await assert.rejects(
      core.runCapability(
        "feature.accept",
        { feature: "demo" },
        { rootDir: tmp, now: new Date() }
      ),
      /stage confirmation required/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("feature.accept: refuses when architecture-review marker is missing", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-accept-"));
  try {
    await setupFeature(tmp, { archReviewDone: false });
    await assert.rejects(
      core.runCapability(
        "feature.accept",
        { feature: "demo", confirmed: true },
        { rootDir: tmp, now: new Date() }
      ),
      /requires 'architecture-review' to be completed/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("feature.accept: writes acceptance report and stage marker when confirmed", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-accept-"));
  try {
    await setupFeature(tmp);
    const { result } = await core.runCapability(
      "feature.accept",
      { feature: "demo", confirmed: true, notes: "all gates passed" },
      { rootDir: tmp, now: new Date() }
    );
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(tmp, result.data.report)), "acceptance-report.md should exist");
    const body = readFileSync(join(tmp, result.data.report), "utf8");
    assert.ok(body.includes("# Acceptance Report — demo"));
    assert.ok(body.includes("## Notes"));
    assert.ok(body.includes("all gates passed"));
    assert.ok(
      existsSync(join(tmp, result.data.marker)),
      "stage-acceptance.completed marker should exist"
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("feature.accept: refuses when feature.yaml missing", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-accept-"));
  try {
    await core.runCapability("workspace.init", {}, { rootDir: tmp, now: new Date() });
    await assert.rejects(
      core.runCapability(
        "feature.accept",
        { feature: "ghost", confirmed: true },
        { rootDir: tmp, now: new Date() }
      ),
      /feature.yaml not found/
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});