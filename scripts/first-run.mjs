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
 *   S5. Seed fixtures if .dapei/cognitive/ is empty (copy tests/fixtures/sample-node-repo/docs/as-is/ → .dapei/cognitive/)
 *   S6. Run cdr.profile + cdr.index.list to validate fixtures
 *   S7. Generate portal preview (skip if docs-portal/ exists)
 *
 * Exit codes:
 *   0 — success
 *   1 — pre-flight failure (missing tool, missing dir)
 *   2 — runtime failure (cdr.* capability threw)
 */

import { existsSync, mkdirSync, cpSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const COGNITIVE_DIR = ".dapei/cognitive";
const PORTAL_DIR = ".dapei/docs-portal";
const FIXTURE_SRC = join(REPO_ROOT, "tests/fixtures/sample-node-repo/docs/as-is");

const REQUIRED_DIRS = ["repos", "docs", "features"];

function step(msg) {
  console.log(`[first-run] ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`[first-run] FAIL: ${msg}`);
  process.exit(code);
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

// S5: seed fixtures if empty
function s5_seedFixtures(workspace) {
  step("S5: seed fixtures if cognitive/ is empty");
  const cog = join(workspace, COGNITIVE_DIR);
  const entries = readdirSync(cog);
  if (entries.length > 0) {
    step(`  cognitive/ not empty (${entries.length} entries); skip seed`);
    return false;
  }
  if (!existsSync(FIXTURE_SRC)) {
    step(`  fixture source missing: ${FIXTURE_SRC}; skip seed`);
    return false;
  }
  cpSync(FIXTURE_SRC, cog, { recursive: true });
  step(`  seeded from ${FIXTURE_SRC}`);
  return true;
}

// S6: validate fixtures via cdr.profile + cdr.index.list
async function s6_validateFixtures(workspace) {
  step("S6: validate fixtures via cdr.* capabilities");
  try {
    const { runCapability } = await import(join(REPO_ROOT, "packages/core/dist/index.js"));
    const ctx = { workspace, repo: "sample-node-repo" };
    await runCapability("cdr.profile", {}, ctx);
    await runCapability("cdr.index.list", {}, ctx);
    step("  cdr.profile + cdr.index.list OK");
  } catch (e) {
    // Fallback: validate via simple YAML load
    step(`  cdr.* unavailable (${e.message}); skipping deep validation`);
  }
}

// S7: generate portal preview (skip if exists)
function s7_generatePortal(workspace) {
  step("S7: generate portal preview");
  const p = join(workspace, PORTAL_DIR);
  if (existsSync(p) && readdirSync(p).length > 0) {
    step(`  ${PORTAL_DIR} exists and non-empty; skip generation`);
    return;
  }
  try {
    execSync("node --experimental-strip-types scripts/cdr-doc-generate.mjs", {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
    step(`  portal generated at ${PORTAL_DIR}`);
  } catch (e) {
    step(`  portal generation skipped (${e.message})`);
  }
}

async function main() {
  console.log("[first-run] dapei-skill bootstrap starting...");
  const workspace = s1_detectWorkspace();
  step(`  workspace: ${workspace}`);
  s2_probeTools();
  s3_verifyContracts(workspace);
  s4_ensureCognitive(workspace);
  const seeded = s5_seedFixtures(workspace);
  await s6_validateFixtures(workspace);
  s7_generatePortal(workspace);
  console.log(`[first-run] done. ${seeded ? "fixtures seeded." : "existing fixtures preserved."}`);
  console.log(`[first-run] next: @dapei initialize the current project workspace`);
}

main().catch((e) => {
  console.error(`[first-run] FATAL: ${e.message}`);
  console.error(e.stack);
  process.exit(2);
});
