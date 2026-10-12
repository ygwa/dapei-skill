// Rule-engine + codegraph adapter regression tests.
//
// Covers:
//   (a) every `check.type` declared by the shipped `.dapei/rules/*.yaml` packs
//       is evaluated by the registry (no "unsupported check.type" finding), or
//       explicitly listed as known-unsupported;
//   (b) a rule file with a bogus `check.type` still produces the unsupported
//       finding (the registry did not silently swallow unknown types);
//   (c) CodeGraphAdapter honours the `.dapei/graph/.no-codegraph` marker
//       (skipping the CLI probe), with DAPEI_CODEGRAPH_BIN overriding it;
//   (d) `fullDoctor()` probes the workspace root, not the marker directory.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";

const core = await import("@dapei/catalog");
const { RULE_CHECKS, SUPPORTED_RULE_CHECK_TYPES, KNOWN_UNSUPPORTED_RULE_CHECK_TYPES } = await import(
  "@dapei/core/guardrail"
);
const { CodeGraphAdapter } = await import("@dapei/runtime-adapters/codegraph");

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const SHIPPED_RULES_DIR = join(REPO_ROOT, ".dapei", "rules");
const FAKE_CLI_DIR = join(__dirname, "..", "fixtures", "fake-codegraph");

const ctx = (tmp) => ({ rootDir: tmp, now: new Date() });

async function setupFeature(tmp, { rulesFiles = null } = {}) {
  await core.runCapability("workspace.init", {}, ctx(tmp));
  mkdirSync(join(tmp, "features", "demo", "reports"), { recursive: true });
  writeFileSync(
    join(tmp, "features", "demo", "feature.yaml"),
    `version: "0.2"\nfeature:\n  name: demo\n  repos: []\n`,
  );
  if (rulesFiles) {
    rmSync(join(tmp, ".dapei", "rules"), { recursive: true, force: true });
    mkdirSync(join(tmp, ".dapei", "rules"), { recursive: true });
    for (const [name, content] of Object.entries(rulesFiles)) {
      writeFileSync(join(tmp, ".dapei", "rules", name), content);
    }
  }
}

function reportText(tmp) {
  return readFileSync(join(tmp, "features", "demo", "reports", "guardrail-report.md"), "utf8");
}

// ---------------------------------------------------------------------------
// (a) shipped rule packs use only supported check types
// ---------------------------------------------------------------------------

test("guardrail-rules: every shipped .dapei/rules check.type is evaluated, not reported unsupported", async () => {
  const ruleFiles = readdirSync(SHIPPED_RULES_DIR).filter((f) => f.endsWith(".yaml"));
  assert.ok(ruleFiles.length > 0, "the repo must ship at least one rule pack");

  // Every declared check.type must be one the registry implements or is
  // explicitly documented as known-unsupported.
  const declaredTypes = new Set();
  for (const f of ruleFiles) {
    const doc = parseYaml(readFileSync(join(SHIPPED_RULES_DIR, f), "utf8"));
    for (const rule of doc.rules ?? []) {
      if (rule?.check?.type) declaredTypes.add(rule.check.type);
    }
  }
  assert.ok(declaredTypes.size > 0, "shipped rules declare at least one check.type");
  for (const type of declaredTypes) {
    assert.ok(
      SUPPORTED_RULE_CHECK_TYPES.includes(type) || KNOWN_UNSUPPORTED_RULE_CHECK_TYPES.includes(type),
      `check.type '${type}' is neither implemented nor explicitly known-unsupported`,
    );
    assert.ok(Object.hasOwn(RULE_CHECKS, type), `RULE_CHECKS is missing an evaluator for '${type}'`);
  }

  // Run the real guardrail against a workspace seeded with exactly these packs.
  const tmp = mkdtempSync(join(tmpdir(), "dapei-guardrail-rules-"));
  try {
    const rules = Object.fromEntries(ruleFiles.map((f) => [f, readFileSync(join(SHIPPED_RULES_DIR, f), "utf8")]));
    await setupFeature(tmp, { rulesFiles: rules });

    const { result } = await core.runCapability("feature.guardrail", { feature: "demo" }, ctx(tmp));
    assert.equal(result.ok, true);
    const report = reportText(tmp);
    assert.doesNotMatch(
      report,
      /unsupported check\.type/,
      `shipped rule packs must not produce unsupported check.type findings:\n${report}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// (b) bogus check.type still fails loudly
// ---------------------------------------------------------------------------

test("guardrail-rules: a bogus check.type produces the unsupported finding and at least WARN", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-guardrail-rules-"));
  try {
    await setupFeature(tmp, {
      rulesFiles: {
        "zz-bogus.yaml": `version: 0.1
rule_set: bogus
mode: report
rules:
  - id: BOGUS-001
    title: bogus check type
    severity: medium
    check:
      type: bogus-check-type
    message: engine cannot evaluate this rule
`,
      },
    });

    const { result } = await core.runCapability("feature.guardrail", { feature: "demo" }, ctx(tmp));
    assert.equal(result.data.status, "WARN", "an unknown check.type must not pass silently");
    assert.match(reportText(tmp), /BOGUS-001: unsupported check\.type 'bogus-check-type'/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// (c) codegraph no-CLI marker is honoured
// ---------------------------------------------------------------------------

const origPath = process.env.PATH;
function withFakeCli() {
  process.env.PATH = `${FAKE_CLI_DIR}${origPath ? ":" + origPath : ""}`;
}
function withoutFakeCli() {
  process.env.PATH = "/usr/bin:/bin";
}

function writeMarker(tmp) {
  mkdirSync(join(tmp, ".dapei", "graph"), { recursive: true });
  writeFileSync(join(tmp, ".dapei", "graph", ".no-codegraph"), "codegraph CLI not in PATH.\n");
}

test("guardrail-rules: the .no-codegraph marker suppresses CLI detection (override still wins)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-cg-marker-"));
  try {
    // Marker present + fake CLI on PATH. Without the marker the adapter would
    // find the CLI, so an unavailable adapter proves the marker skipped the probe.
    withFakeCli();
    delete process.env.DAPEI_CODEGRAPH_BIN;
    writeMarker(tmp);

    const marked = new CodeGraphAdapter(tmp);
    assert.equal(marked.isAvailable(), false, "marker must suppress the CLI probe");
    assert.equal(marked.isMarkedUnavailable(), true);
    assert.match(marked.getDoctor().reason, /marked unavailable/);

    // Removing the marker re-enables detection.
    rmSync(join(tmp, ".dapei", "graph", ".no-codegraph"), { force: true });
    const unmarked = new CodeGraphAdapter(tmp);
    assert.equal(unmarked.isAvailable(), true, "without the marker the fake CLI must be found");

    // DAPEI_CODEGRAPH_BIN overrides the marker.
    const overrideBinary = join(FAKE_CLI_DIR, "codegraph");
    process.env.DAPEI_CODEGRAPH_BIN = overrideBinary;
    writeMarker(tmp);
    const overridden = new CodeGraphAdapter(tmp);
    assert.equal(overridden.isAvailable(), true, "DAPEI_CODEGRAPH_BIN must override the marker");
    assert.equal(overridden.getDoctor().binary, overrideBinary);

    // Marker + no CLI on PATH -> fallback (and the marker stays put).
    delete process.env.DAPEI_CODEGRAPH_BIN;
    withoutFakeCli();
    const fallback = new CodeGraphAdapter(tmp);
    assert.equal(fallback.isAvailable(), false);
    assert.equal(existsSync(join(tmp, ".dapei", "graph", ".no-codegraph")), true);
  } finally {
    process.env.PATH = origPath;
    delete process.env.DAPEI_CODEGRAPH_BIN;
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// (d) fullDoctor probes the workspace root
// ---------------------------------------------------------------------------

test("guardrail-rules: fullDoctor refreshes status against the workspace root", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-cg-doctor-"));
  try {
    withFakeCli();
    delete process.env.DAPEI_CODEGRAPH_BIN;
    // A code file under the workspace root: the fake CLI counts code files
    // recursively from the path it is handed.
    mkdirSync(join(tmp, "repos", "app", "src"), { recursive: true });
    writeFileSync(join(tmp, "repos", "app", "src", "index.ts"), "export const x = 1;\n");

    const adapter = new CodeGraphAdapter(tmp);
    assert.equal(adapter.isAvailable(), true);
    const constructed = adapter.getDoctor();

    const refreshed = adapter.fullDoctor();
    // The old bug passed `<workspace>/.dapei/graph` (the marker dir), which
    // holds no code files, so files_total collapsed to 0.
    assert.ok(refreshed.files_total > 0, `fullDoctor must count files under the workspace root, got ${refreshed.files_total}`);
    assert.equal(refreshed.files_total, constructed.files_total, "refresh must agree with the constructor's probe");
  } finally {
    process.env.PATH = origPath;
    delete process.env.DAPEI_CODEGRAPH_BIN;
    rmSync(tmp, { recursive: true, force: true });
  }
});
