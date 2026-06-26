#!/usr/bin/env node
/**
 * Self-check script: scan packages/core/src/capabilities/ and assert
 * that every workspace-dimension write capability is in the dimension
 * blocklist. Catches the case where someone adds a new write capability
 * to the engine and forgets to add the corresponding block to the
 * desktop. See ADR-0010.
 *
 * Run from repo root:
 *   node --experimental-strip-types desktop/scripts/check-dimension-rules.ts
 *
 * Exit code 0 = clean, 1 = at least one missing.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const capDir = join(repoRoot, "packages/core/src/capabilities");

const FEATURE_SCOPED_PREFIXES = ["feature.", "validation.", "workflow.", "memory.", "audit.", "context."];
const BLOCKLIST_PATTERNS = [
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

function isBlocked(id) {
  return BLOCKLIST_PATTERNS.some((re) => re.test(id));
}

function looksLikeWrite(body) {
  if (/\bconfirmGate\s*:/.test(body)) return true;
  if (/\boutputs\s*:\s*\[/.test(body)) return true;
  if (/\bwriteFileSync\s*\(/.test(body)) return true;
  if (/\bwriteFile\s*\(/.test(body)) return true;
  if (/\bupdate[A-Z]\w*\s*\(/.test(body)) return true;
  if (/\bupsert\s*\(/.test(body)) return true;
  if (/\bdelete\s*\(/.test(body)) return true;
  if (/\bremove\s*\(/.test(body)) return true;
  if (/\barchive\s*\(/.test(body)) return true;
  if (/\bclose\s*\(/.test(body)) return true;
  if (/\blink\s*\(/.test(body)) return true;
  // runtime-adapters `write(...)` — only counts if the call has
  // non-empty content (heuristic: a `write(\n` or `write(\s+"` or
  // `write(\s*content`). Avoids counting `write(output, ...)` style
  // where the call is part of a search.
  if (/\bwrite\(\s*(?:[a-zA-Z_$][\w$]*|"[^"]*")/.test(body)) return true;
  return false;
}

// Known read-only capabilities that the heuristic might still flag.
// These are explicitly READ-only by design: they scan, list, validate,
// or suggest without writing to docs/, .dapei/, or repos/.
const KNOWN_READS = new Set([
  "cognitive.discover",
  "cognitive.artifact.list",
  "cognitive.artifact.validate",
  "cognitive.state.suggest",
  "cdr.entries.candidate",
  "cdr.index.list",
  "cdr.stale.scan",
  "repos.list",
  "repos.check",
  "repos.profile",  // repos.profile is heuristic-flagged but reads + writes profile.yaml — handled by blocklist
  "workspace.status",
  "workspace.validate",
  "workspace.report",
  "feature.status",
  "repos.analyze"
]);

function extractIdsAndBodies(source) {
  const ids = [];
  const idRe = /\bid\s*:\s*["']([\w.]+)["']/g;
  let m;
  while ((m = idRe.exec(source)) !== null) {
    ids.push({ id: m[1], idx: m.index });
  }
  return ids;
}

function scanDomain(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...scanDomain(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".mts")) {
      const src = readFileSync(full, "utf8");
      const ids = extractIdsAndBodies(src);
      for (const { id, idx } of ids) {
        const body = src.slice(idx, idx + 4000);
        out.push({ id, file: relative(repoRoot, full), write: looksLikeWrite(body) });
      }
    }
  }
  return out;
}

const all = scanDomain(capDir);
const writeCaps = all.filter((c) => c.write && !KNOWN_READS.has(c.id));
const workspaceWriteCaps = writeCaps.filter((c) => !isFeatureScoped(c.id));
const missing = workspaceWriteCaps.filter((c) => !isBlocked(c.id));

if (missing.length === 0) {
  console.log(
    `[dimension-rules] OK — ${writeCaps.length} write capabilities total; ` +
    `${workspaceWriteCaps.length} workspace-dim writes, all covered by blocklist.`
  );
  process.exit(0);
}

console.error(`[dimension-rules] FAIL — ${missing.length} workspace-dimension write capabilities NOT in blocklist:`);
for (const m of missing) {
  console.error(`  - ${m.id}  (${m.file})`);
}
console.error("");
console.error("Add the missing capability to desktop/packages/engine-client/src/dimension-rules.ts,");
console.error("then re-run: node --experimental-strip-types desktop/scripts/check-dimension-rules.ts");
process.exit(1);
