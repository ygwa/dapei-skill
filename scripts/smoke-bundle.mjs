#!/usr/bin/env node
/**
 * smoke-bundle.mjs — prove the shipped artifact works.
 *
 * `dist/dapei-engine.js` is the single-file engine bundle produced by
 * `npm run build` (esbuild). It is what a checkout-less consumer runs: no
 * TypeScript sources, no `--experimental-strip-types`, no workspace links.
 *
 * This script exercises that artifact with a plain `node` invocation:
 *   1. `workspace.init` in a temp dir → the workspace must be complete
 *      (commands.yaml + schemas + rules + templates), which also proves the
 *      engine found its template root without DAPEI_ENGINE_HOME lying about it.
 *   2. `cdr.index.list` → proves the CDR capabilities made it into the bundle
 *      (i.e. the composition root was followed, not just the core specs).
 *   3. `route --intent "audit query"` → proves the router is bundled too.
 *
 * Exit codes: 0 ok, 1 failure.
 */

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const BUNDLE = join(REPO_ROOT, "dist", "dapei-engine.js");

function fail(msg) {
  console.error(`[smoke:bundle] FAIL: ${msg}`);
  process.exit(1);
}

function runEngine(args, cwd, workspaceRoot) {
  return execFileSync(process.execPath, [BUNDLE, ...args], {
    cwd,
    env: { ...process.env, DAPEI_WORKSPACE_ROOT: workspaceRoot, DAPEI_ENGINE_HOME: REPO_ROOT },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

if (!existsSync(BUNDLE)) {
  fail(`${BUNDLE} is missing — run \`npm run build\` first`);
}

const workspace = mkdtempSync(join(tmpdir(), "dapei-bundle-"));
try {
  // 1. workspace.init through the bundle, with no TypeScript loader involved.
  const initOut = runEngine(["run", "--capability", "workspace.init", "--input", "{}"], workspace, workspace);
  if (!initOut.includes('"ok": true')) fail(`workspace.init did not report ok:true\n${initOut}`);

  const missing = [];
  if (!existsSync(join(workspace, ".dapei", "commands.yaml"))) missing.push(".dapei/commands.yaml");
  const count = (rel) => (existsSync(join(workspace, rel)) ? readdirSync(join(workspace, rel)).length : 0);
  for (const [rel, expected] of [[".dapei/schemas", 4], [".dapei/rules", 5], ["runtime/templates", 6]]) {
    const actual = count(rel);
    if (actual < expected) missing.push(`${rel} (${actual} < ${expected})`);
  }
  if (missing.length > 0) fail(`bundle produced an incomplete workspace: ${missing.join(", ")}`);

  // 2. A CDR capability — proves the composition root is inside the bundle.
  const indexOut = runEngine(["run", "--capability", "cdr.index.list", "--input", "{}"], workspace, workspace);
  if (!indexOut.includes("Cognitive Assets Index")) {
    fail(`cdr.index.list did not reach the CDR capability\n${indexOut.slice(0, 400)}`);
  }

  // 3. The router subcommand — proves routing is bundled.
  const routeOut = runEngine(["route", "--intent", "audit query"], workspace, workspace);
  if (!routeOut.includes("audit.query")) {
    fail(`route --intent "audit query" did not resolve to audit.query\n${routeOut.slice(0, 400)}`);
  }

  console.log("[smoke:bundle] PASS — workspace.init, cdr.index.list and route all work from dist/dapei-engine.js");
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
