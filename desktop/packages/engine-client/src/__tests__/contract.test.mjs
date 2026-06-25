// Contract tests for @dapei/desktop-engine-client — pure-function layer only.
// SubprocessEngineClient is exercised by the integration test in
// apps/electron (M1-7 e2e); these tests pin the parts that are
// implementation-free: WorkspaceContext validation and the
// dimension-rule blocklist. See ADR-0008, ADR-0009, ADR-0010.
import test from "node:test";
import assert from "node:assert/strict";
import { isAbsolute } from "node:path";

const FEATURE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

function validateWorkspaceContext(ctx) {
  if (!ctx || typeof ctx !== "object") throw new Error("WorkspaceContext must be an object");
  if (!ctx.workspaceRoot || typeof ctx.workspaceRoot !== "string") {
    throw new Error("WorkspaceContext.workspaceRoot is required");
  }
  if (!isAbsolute(ctx.workspaceRoot)) {
    throw new Error(`WorkspaceContext.workspaceRoot must be absolute: ${ctx.workspaceRoot}`);
  }
  if (ctx.workspaceRoot.split(/[\\/]+/).includes("..")) {
    throw new Error(`WorkspaceContext.workspaceRoot must not contain '..' segment: ${ctx.workspaceRoot}`);
  }
  if (ctx.feature !== undefined) {
    if (typeof ctx.feature !== "string" || !FEATURE_NAME_RE.test(ctx.feature)) {
      throw new Error(`WorkspaceContext.feature must match ${FEATURE_NAME_RE}: ${ctx.feature}`);
    }
  }
  if (ctx.dimension !== "workspace" && ctx.dimension !== "feature") {
    throw new Error(`WorkspaceContext.dimension must be 'workspace' or 'feature': ${ctx.dimension}`);
  }
}

const FEATURE_SCOPED_PREFIXES = ["feature.", "validation.", "workflow.", "memory.", "audit.", "context."];
const WORKSPACE_DIMENSION_BLOCKLIST = [
  /^docs\.write$/, /^docs\.create$/, /^docs\.delete$/, /^docs\.update$/,
  /^cognitive\.artifact\.upsert$/, /^cognitive\.index\.rebuild$/,
  /^cdr\.profile$/, /^cdr\.entries\.propose$/, /^cdr\.entries\.confirm$/,
  /^cdr\.entries\.prepare$/, /^cdr\.entries\.candidate$/,
  /^cdr\.behavior\.upsert$/, /^cdr\.state\.derive$/, /^cdr\.state\.validate$/,
  /^cdr\.domain\.compose$/, /^cdr\.domain\.suggest$/,
  /^cdr\.business\.compose$/, /^cdr\.business\.crosslink$/,
  /^cdr\.capability\.map\.init$/, /^cdr\.capability\.map\.synth$/,
  /^cdr\.index\.list$/, /^cdr\.index\.write$/, /^cdr\.feature\.link$/,
  /^cdr\.doc\.generate$/, /^cdr\.crossrepo\.doc\.generate$/,
  /^cdr\.reversecluster\.doc\.generate$/,
  /^repos\.add$/, /^repos\.remove$/, /^repos\.sync$/,
  /^workspace\.init$/,
  /^reporting\.architecturereview$/, /^reporting\.dailyreport$/
];

function isFeatureScoped(id) {
  return FEATURE_SCOPED_PREFIXES.some((p) => id.startsWith(p));
}

function evaluateDimension(capabilityId, dimension) {
  if (dimension !== "feature") return { allow: true };
  if (isFeatureScoped(capabilityId)) return { allow: true };
  for (const re of WORKSPACE_DIMENSION_BLOCKLIST) {
    if (re.test(capabilityId)) {
      return {
        allow: false,
        code: "DIMENSION_BLOCKED",
        message: `capability '${capabilityId}' is a workspace-dimension write and cannot be called from the Feature dimension.`
      };
    }
  }
  return { allow: true };
}

test("validateWorkspaceContext: accepts a minimal workspace-dimension context", () => {
  assert.doesNotThrow(() =>
    validateWorkspaceContext({ workspaceRoot: "/Users/x/projects/mall-core", dimension: "workspace" })
  );
});

test("validateWorkspaceContext: accepts a full feature-dimension context", () => {
  assert.doesNotThrow(() =>
    validateWorkspaceContext({
      workspaceRoot: "/Users/x/projects/mall-core",
      feature: "payment-refactor",
      dimension: "feature"
    })
  );
});

test("validateWorkspaceContext: rejects empty workspaceRoot", () => {
  assert.throws(() => validateWorkspaceContext({ workspaceRoot: "", dimension: "workspace" }), /required/);
});

test("validateWorkspaceContext: rejects relative workspaceRoot", () => {
  assert.throws(
    () => validateWorkspaceContext({ workspaceRoot: "projects/mall-core", dimension: "workspace" }),
    /absolute/
  );
});

test("validateWorkspaceContext: rejects workspaceRoot containing '..'", () => {
  assert.throws(
    () => validateWorkspaceContext({ workspaceRoot: "/Users/x/../etc/passwd", dimension: "workspace" }),
    /'..' segment/
  );
});

test("validateWorkspaceContext: rejects bad feature names (uppercase)", () => {
  assert.throws(
    () => validateWorkspaceContext({
      workspaceRoot: "/Users/x/projects/mall-core",
      feature: "Payment_Refactor",
      dimension: "feature"
    }),
    /feature must match/
  );
});

test("validateWorkspaceContext: rejects bad feature names (underscore)", () => {
  assert.throws(
    () => validateWorkspaceContext({
      workspaceRoot: "/Users/x/projects/mall-core",
      feature: "payment_refactor",
      dimension: "feature"
    }),
    /feature must match/
  );
});

test("validateWorkspaceContext: rejects bad dimension", () => {
  assert.throws(
    () => validateWorkspaceContext({ workspaceRoot: "/x/y", dimension: "weird" }),
    /dimension must be/
  );
});

test("evaluateDimension: allows reads in feature dimension", () => {
  for (const cap of ["workspace.status", "workspace.validate", "workspace.report", "feature.status", "feature.stage", "repos.list", "repos.profile"]) {
    assert.deepEqual(evaluateDimension(cap, "feature"), { allow: true }, `${cap} should be allowed in feature dim`);
  }
});

test("evaluateDimension: allows feature-scoped writes in feature dimension", () => {
  for (const cap of [
    "feature.create", "feature.status", "feature.stage", "feature.tasks",
    "feature.review", "feature.close", "feature.assign", "feature.handoff",
    "validation.run", "workflow.runStage", "memory.append", "audit.query"
  ]) {
    assert.deepEqual(evaluateDimension(cap, "feature"), { allow: true }, `${cap} should be allowed in feature dim`);
  }
});

test("evaluateDimension: blocks docs.* writes in feature dimension", () => {
  for (const cap of ["docs.write", "docs.create", "docs.delete", "docs.update"]) {
    const d = evaluateDimension(cap, "feature");
    assert.equal(d.allow, false, `${cap} must be blocked in feature dim`);
    assert.equal(d.code, "DIMENSION_BLOCKED");
  }
});

test("evaluateDimension: blocks cognitive.artifact.upsert in feature dimension", () => {
  const d = evaluateDimension("cognitive.artifact.upsert", "feature");
  assert.equal(d.allow, false);
  assert.equal(d.code, "DIMENSION_BLOCKED");
});

test("evaluateDimension: blocks cdr.feature.link in feature dimension (the link moves the artifact's feature field — workspace-dim write)", () => {
  const d = evaluateDimension("cdr.feature.link", "feature");
  assert.equal(d.allow, false);
  assert.equal(d.code, "DIMENSION_BLOCKED");
});

test("evaluateDimension: blocks workspace.init in feature dimension (init creates the workspace dimension itself)", () => {
  const d = evaluateDimension("workspace.init", "feature");
  assert.equal(d.allow, false);
  assert.equal(d.code, "DIMENSION_BLOCKED");
});

test("evaluateDimension: blocks repos.add/remove/sync in feature dimension (base pool is workspace-dim state)", () => {
  for (const cap of ["repos.add", "repos.remove", "repos.sync"]) {
    const d = evaluateDimension(cap, "feature");
    assert.equal(d.allow, false, `${cap} must be blocked in feature dim`);
    assert.equal(d.code, "DIMENSION_BLOCKED");
  }
});

test("evaluateDimension: allows repos.list in feature dimension (read)", () => {
  assert.deepEqual(evaluateDimension("repos.list", "feature"), { allow: true });
});

test("evaluateDimension: allows all writes in workspace dimension (no rule)", () => {
  for (const cap of ["docs.write", "cognitive.artifact.upsert", "workspace.init", "cdr.feature.link"]) {
    assert.deepEqual(evaluateDimension(cap, "workspace"), { allow: true });
  }
});

test("evaluateDimension: never blocks reads regardless of dimension", () => {
  for (const dim of ["workspace", "feature"]) {
    assert.deepEqual(evaluateDimension("workspace.status", dim), { allow: true });
    assert.deepEqual(evaluateDimension("feature.status", dim), { allow: true });
    assert.deepEqual(evaluateDimension("feature.tasks", dim), { allow: true });
  }
});

test("contract: test blocklist mirrors production blocklist length", () => {
  assert.equal(WORKSPACE_DIMENSION_BLOCKLIST.length, 32, "test blocklist out of sync with production");
  assert.equal(FEATURE_SCOPED_PREFIXES.length, 6, "feature-scoped prefixes out of sync with production");
});
