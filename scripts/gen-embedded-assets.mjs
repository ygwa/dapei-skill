#!/usr/bin/env node
/**
 * gen-embedded-assets.mjs — bake `runtime/templates/**` into the engine.
 *
 * The shipped engine is a single file (`dist/dapei-engine.js`). It must be able
 * to initialise a workspace anywhere, with no source tree next to it, so the
 * template assets travel inside it: this script writes them into
 * `packages/core/src/generated/embedded-assets.ts`, which `workspace.init`
 * falls back to when there is no engine home on disk (see ADR-0024).
 *
 *   node scripts/gen-embedded-assets.mjs           # regenerate the file
 *   node scripts/gen-embedded-assets.mjs --check   # fail if the file is stale
 *
 * The generated file is committed and CI runs `--check`, so a template edit
 * cannot silently ship a stale bundle.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const TEMPLATE_ROOT = join(REPO_ROOT, "runtime", "templates");
const OUTPUT = join(REPO_ROOT, "packages", "core", "src", "generated", "embedded-assets.ts");
const HEADER = `// GENERATED FILE — do not edit by hand.
//
// The contents of \`runtime/templates/**\` at build time, baked in so the
// single-file engine bundle can initialise a workspace with no source tree
// beside it. Regenerate with \`npm run gen:assets\`; CI runs
// \`npm run check:assets\` so a template edit cannot ship a stale copy.
`;

/** Every file under runtime/templates, as POSIX-style relative paths. */
function collectTemplates(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      out.push(...collectTemplates(abs));
    } else {
      out.push(relative(TEMPLATE_ROOT, abs).split(sep).join("/"));
    }
  }
  return out.sort();
}

function render() {
  if (!existsSync(TEMPLATE_ROOT)) {
    console.error(`[gen:assets] FAIL: ${TEMPLATE_ROOT} does not exist`);
    process.exit(1);
  }
  const files = collectTemplates(TEMPLATE_ROOT);
  const entries = files
    .map((rel) => `  ${JSON.stringify(rel)}: ${JSON.stringify(readFileSync(join(TEMPLATE_ROOT, rel), "utf8"))}`)
    .join(",\n");
  return `${HEADER}
export const EMBEDDED_TEMPLATE_ASSETS: Record<string, string> = {
${entries}
};
`;
}

const next = render();
const check = process.argv.includes("--check");

if (check) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : "";
  if (current === next) {
    console.log("[gen:assets] OK — embedded-assets.ts matches runtime/templates/**");
    process.exit(0);
  }
  console.error(
    "[gen:assets] FAIL: packages/core/src/generated/embedded-assets.ts is stale — run `npm run gen:assets` and commit the result"
  );
  process.exit(1);
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, next);
const count = next.split("\n").filter((l) => l.startsWith("  \"")).length;
console.log(`[gen:assets] wrote ${count} template assets to ${relative(REPO_ROOT, OUTPUT)}`);
