#!/usr/bin/env node
/**
 * first-run.mjs — dapei-skill bootstrap script
 *
 * Idempotent. Safe to re-run on existing workspace.
 *
 * 7-step state machine (D4):
 *   S1. Detect workspace root (cwd or nearest ancestor containing .dapei/ or repos/)
 *   S2. Probe required tools (node >= 22.6, npm, git)
 *   S3. Verify workspace contracts (repos/, docs/, features/ exist)
 *   S4. Ensure .dapei/cognitive/ exists (create if missing)
 *   S5. Optionally seed sample CDR artifacts (--with-samples only; default writes nothing)
 *   S6. Validate the workspace's cognitive index through the engine CLI (cdr.index.list)
 *   S7. Generate the documentation portal through the engine CLI (cdr.doc.generate)
 *
 * All engine work goes through `dapei-engine run --capability ...` as a
 * subprocess: the bootstrap never imports engine TypeScript directly, so it
 * needs no build step and no `--experimental-strip-types` on this file. The
 * engine itself is resolved like everywhere else — source when the checkout
 * has `engine/dapei-engine.ts`, otherwise the built `dist/dapei-engine.js`
 * (force with DAPEI_USE_BUNDLE=1).
 *
 * Exit codes:
 *   0 — success
 *   1 — pre-flight failure (missing tool, missing dir)
 *   2 — engine failure (capability threw or engine missing)
 */

import { existsSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SOURCE_ENGINE = join(REPO_ROOT, "engine/dapei-engine.ts");
const BUNDLE_ENGINE = join(REPO_ROOT, "dist/dapei-engine.js");

const COGNITIVE_DIR = ".dapei/cognitive";
const PORTAL_DIR = ".dapei/docs-portal";
const SAMPLE_SRC = join(REPO_ROOT, "tests/fixtures/sample-node-repo/docs/as-is");

const REQUIRED_DIRS = ["repos", "docs", "features"];

function step(msg) {
  console.log(`[first-run] ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`[first-run] FAIL: ${msg}`);
  process.exit(code);
}

/**
 * Resolve the engine invocation prefix: source mode when the checkout has the
 * TypeScript entry, otherwise the built single-file bundle.
 */
function engineInvocation() {
  if (process.env.DAPEI_USE_BUNDLE !== "1" && existsSync(SOURCE_ENGINE)) {
    return ["--experimental-strip-types", SOURCE_ENGINE];
  }
  if (existsSync(BUNDLE_ENGINE)) return [BUNDLE_ENGINE];
  throw new Error(`no engine found: need ${SOURCE_ENGINE} or ${BUNDLE_ENGINE} (run 'npm run build')`);
}

/**
 * Run one capability through the engine CLI and return its stdout.
 * Throws on a non-zero exit (unknown capability, schema failure, capability error).
 */
function runCapability(capability, input, workspace) {
  return execFileSync(
    process.execPath,
    [...engineInvocation(), "run", "--capability", capability, "--input", JSON.stringify(input)],
    {
      cwd: workspace,
      env: { ...process.env, DAPEI_WORKSPACE_ROOT: workspace, DAPEI_ENGINE_HOME: REPO_ROOT },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
}

// S1: detect workspace root
function s1_detectWorkspace() {
  step("S1: detect workspace root");
  let cwd = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(cwd, "repos")) || existsSync(join(cwd, ".dapei"))) {
      return cwd;
    }
    const parent = dirname(cwd);
    if (parent === cwd) break;
    cwd = parent;
  }
  return process.cwd();
}

// S2: probe required tools
function s2_probeTools() {
  step("S2: probe required tools");
  try {
    const nodeVer = process.versions.node;
    const [major] = nodeVer.split(".").map(Number);
    if (major < 22 || (major === 22 && nodeVer.split(".")[1] < 6)) {
      fail(`Node >= 22.6 required (have ${nodeVer})`);
    }
    step(`  node ${nodeVer} OK`);
  } catch (e) {
    fail(`node check failed: ${e.message}`);
  }
  for (const tool of ["npm", "git"]) {
    try {
      execSync(`command -v ${tool}`, { stdio: "ignore" });
      step(`  ${tool} OK`);
    } catch {
      fail(`${tool} not found in PATH`);
    }
  }
}

// S3: verify workspace contracts
function s3_verifyContracts(workspace) {
  step("S3: verify workspace contracts");
  for (const dir of REQUIRED_DIRS) {
    const p = join(workspace, dir);
    if (!existsSync(p)) {
      step(`  creating missing dir: ${dir}`);
      mkdirSync(p, { recursive: true });
    }
  }
}

// S4: ensure .dapei/cognitive/
function s4_ensureCognitive(workspace) {
  step("S4: ensure .dapei/cognitive/");
  const p = join(workspace, COGNITIVE_DIR);
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true });
    step(`  created ${COGNITIVE_DIR}`);
  } else {
    step(`  exists: ${COGNITIVE_DIR}`);
  }
}

// S5: optionally seed sample CDR artifacts (opt-in via --with-samples)
function s5_seedSamples(workspace, withSamples) {
  step("S5: seed sample artifacts (opt-in)");
  if (!withSamples) {
    step("  skipped (pass --with-samples to copy the sample-node-repo artifacts)");
    return false;
  }
  const cog = join(workspace, COGNITIVE_DIR);
  const entries = readdirSync(cog);
  if (entries.length > 0) {
    step(`  cognitive/ not empty (${entries.length} entries); skip seed`);
    return false;
  }
  if (!existsSync(SAMPLE_SRC)) {
    step(`  sample source missing: ${SAMPLE_SRC}; skip seed`);
    return false;
  }
  cpSync(SAMPLE_SRC, cog, { recursive: true });
  step(`  seeded from ${SAMPLE_SRC}`);
  return true;
}

// S6: validate the workspace's cognitive index through the engine CLI
function s6_validateCognitive(workspace) {
  step("S6: validate cognitive index via cdr.index.list");
  try {
    const out = runCapability("cdr.index.list", {}, workspace);
    const summary = out.trim().split("\n")[0] ?? "";
    step(`  engine reached${summary ? `: ${summary.slice(0, 120)}` : ""}`);
  } catch (e) {
    fail(`cdr.index.list failed: ${String(e.stderr || e.message).trim()}`, 2);
  }
}

// S7: generate the documentation portal through the engine (skip if present)
function s7_generatePortal(workspace) {
  step("S7: generate documentation portal via cdr.doc.generate");
  const p = join(workspace, PORTAL_DIR);
  if (existsSync(p) && readdirSync(p).length > 0) {
    step(`  ${PORTAL_DIR} exists and non-empty; skip generation`);
    return;
  }
  try {
    runCapability("cdr.doc.generate", {}, workspace);
    step(`  portal generated at ${PORTAL_DIR}`);
  } catch (e) {
    fail(`cdr.doc.generate failed: ${String(e.stderr || e.message).trim()}`, 2);
  }
}

async function main() {
  console.log("[first-run] dapei-skill bootstrap starting...");
  const withSamples = process.argv.includes("--with-samples");
  const workspace = s1_detectWorkspace();
  step(`  workspace: ${workspace}`);
  s2_probeTools();
  s3_verifyContracts(workspace);
  s4_ensureCognitive(workspace);
  const seeded = s5_seedSamples(workspace, withSamples);
  s6_validateCognitive(workspace);
  s7_generatePortal(workspace);
  console.log(`[first-run] done.${seeded ? " samples seeded." : " workspace unchanged beyond .dapei/."}`);
  console.log("[first-run] next: @dapei initialize the current project workspace");
}

main().catch((e) => {
  console.error(`[first-run] FATAL: ${e.message}`);
  console.error(e.stack);
  process.exit(2);
});
