#!/usr/bin/env node
/**
 * smoke-bundle.mjs — prove the shipped artifact works, on its own.
 *
 * `dist/dapei-engine.js` is the single-file engine bundle produced by
 * `npm run build` (esbuild). It is what a checkout-less consumer runs: no
 * TypeScript sources, no `--experimental-strip-types`, no workspace links.
 *
 * Two runs, because they prove different things:
 *   1. **in-repo**: the bundle, run from the repo, resolves templates from
 *      `runtime/templates/**` on disk (the dev path) and initialises a complete
 *      workspace.
 *   2. **copied out**: the same bundle copied to a directory with nothing next
 *      to it, `DAPEI_ENGINE_HOME` unset — it must still initialise a complete
 *      workspace, because the template assets are embedded in the bundle
 *      (`npm run gen:assets`). Without this, "ship one file" is a claim.
 *
 * Both runs also exercise a CDR capability (`cdr.index.list`) and the router
 * (`route`), which proves the whole composition root — not just the kernel
 * specs — made it into the bundle.
 *
 * Exit codes: 0 ok, 1 failure.
 */

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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

function runEngine(bundlePath, args, cwd, env) {
  return execFileSync(process.execPath, [bundlePath, ...args], {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

/** Assert the workspace at `ws` was initialised completely. */
function assertCompleteWorkspace(ws, label) {
  const problems = [];
  if (!existsSync(join(ws, ".dapei", "commands.yaml"))) problems.push(".dapei/commands.yaml");
  if (!existsSync(join(ws, ".dapei", "workflows", "feature-lifecycle.yaml"))) problems.push(".dapei/workflows/feature-lifecycle.yaml");
  const count = (rel) => (existsSync(join(ws, rel)) ? readdirSync(join(ws, rel)).length : 0);
  for (const [rel, expected] of [[".dapei/rules", 5], ["runtime/templates", 6]]) {
    const actual = count(rel);
    if (actual < expected) problems.push(`${rel} (${actual} < ${expected})`);
  }
  if (problems.length > 0) fail(`${label}: incomplete workspace — missing ${problems.join(", ")}`);
}

/** Assert the full capability set and the router are inside the bundle. */
function assertFullEngine(bundlePath, ws, env, label) {
  const indexOut = runEngine(bundlePath, ["run", "--capability", "cdr.index.list", "--input", "{}"], ws, env);
  if (!indexOut.includes("Cognitive Assets Index")) {
    fail(`${label}: cdr.index.list did not reach the CDR capability\n${indexOut.slice(0, 400)}`);
  }
  const routeOut = runEngine(bundlePath, ["route", "--intent", "audit query"], ws, env);
  if (!routeOut.includes("audit.query")) {
    fail(`${label}: route --intent "audit query" did not resolve to audit.query\n${routeOut.slice(0, 400)}`);
  }
}

if (!existsSync(BUNDLE)) {
  fail(`${BUNDLE} is missing — run \`npm run build\` first`);
}

const root = mkdtempSync(join(tmpdir(), "dapei-bundle-"));
try {
  // 1. In-repo: disk templates, engine home present.
  const ws1 = join(root, "ws-in-repo");
  mkdirSync(ws1, { recursive: true });
  const env1 = { ...process.env, DAPEI_WORKSPACE_ROOT: ws1, DAPEI_ENGINE_HOME: REPO_ROOT };
  const initOut = runEngine(BUNDLE, ["run", "--capability", "workspace.init", "--input", "{}"], ws1, env1);
  if (!initOut.includes('"ok": true')) fail(`in-repo workspace.init did not report ok:true\n${initOut}`);
  assertCompleteWorkspace(ws1, "in-repo");
  assertFullEngine(BUNDLE, ws1, env1, "in-repo");

  // 2. Copied out: no templates, no engine home — only the file itself.
  const foreignDir = join(root, "shipped");
  mkdirSync(foreignDir, { recursive: true });
  const foreignBundle = join(foreignDir, "dapei-engine.js");
  copyFileSync(BUNDLE, foreignBundle);
  const ws2 = join(root, "ws-shipped");
  mkdirSync(ws2, { recursive: true });
  const env2 = { ...process.env, DAPEI_WORKSPACE_ROOT: ws2 };
  delete env2.DAPEI_ENGINE_HOME;
  const shippedOut = runEngine(foreignBundle, ["run", "--capability", "workspace.init", "--input", "{}"], ws2, env2);
  if (!shippedOut.includes('"ok": true')) fail(`shipped workspace.init did not report ok:true\n${shippedOut}`);
  assertCompleteWorkspace(ws2, "shipped-out");
  assertFullEngine(foreignBundle, ws2, env2, "shipped-out");

  console.log(
    "[smoke:bundle] PASS — dist/dapei-engine.js initialises a complete workspace, reaches cdr.index.list and routes, both in-repo and copied out with no engine home (embedded templates)"
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
