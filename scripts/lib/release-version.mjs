#!/usr/bin/env node
// scripts/lib/release-version.mjs
//
// Single source of truth for reading/writing version across the dapei-skill repo.
//
// Version sources (15):
//   - package.json (root)
//   - engine/package.json
//   - packages/core/package.json
//   - packages/router/package.json
//   - packages/runtime-adapters/package.json
//   - SKILL.md (YAML frontmatter)
//   - .claude-plugin/plugin.json (root meta)
//   - skills/workspace/.claude-plugin/plugin.json
//   - skills/repos/.claude-plugin/plugin.json
//   - skills/feature/.claude-plugin/plugin.json
//   - skills/workflow/.claude-plugin/plugin.json
//   - skills/validation/.claude-plugin/plugin.json
//   - skills/cognitive/.claude-plugin/plugin.json
//   - skills/cdr/.claude-plugin/plugin.json
//
// Subcommand `check`  : assert all 15 sources currently agree; exit 0 / 1.
// Subcommand `set`    : write `NEW_VERSION` into all 15 sources; update CHANGELOG.
//
// Exit codes:
//   0  ok
//   1  generic error
//   2  version drift detected (check only)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");

export const VERSION_SOURCES = [
  { key: "root", file: "package.json", kind: "json" },
  { key: "engine", file: "engine/package.json", kind: "json" },
  { key: "packages/core", file: "packages/core/package.json", kind: "json" },
  { key: "packages/cdr", file: "packages/cdr/package.json", kind: "json" },
  { key: "packages/router", file: "packages/router/package.json", kind: "json" },
  { key: "packages/runtime-adapters", file: "packages/runtime-adapters/package.json", kind: "json" },
  { key: "SKILL.md", file: "SKILL.md", kind: "skill-md" },
  { key: "plugin-root", file: ".claude-plugin/plugin.json", kind: "json" },
  { key: "plugin-workspace", file: "skills/workspace/.claude-plugin/plugin.json", kind: "json" },
  { key: "plugin-repos", file: "skills/repos/.claude-plugin/plugin.json", kind: "json" },
  { key: "plugin-feature", file: "skills/feature/.claude-plugin/plugin.json", kind: "json" },
  { key: "plugin-workflow", file: "skills/workflow/.claude-plugin/plugin.json", kind: "json" },
  { key: "plugin-validation", file: "skills/validation/.claude-plugin/plugin.json", kind: "json" },
  { key: "plugin-cognitive", file: "skills/cognitive/.claude-plugin/plugin.json", kind: "json" },
  { key: "plugin-cdr", file: "skills/cdr/.claude-plugin/plugin.json", kind: "json" },
];

function readVersion(source) {
  const path = join(REPO_ROOT, source.file);
  if (source.kind === "json") {
    const pkg = JSON.parse(readFileSync(path, "utf8"));
    if (typeof pkg.version !== "string") {
      throw new Error(`Missing "version" field in ${source.file}`);
    }
    return pkg.version;
  }
  if (source.kind === "skill-md") {
    const content = readFileSync(path, "utf8");
    if (!content.startsWith("---")) {
      throw new Error(`${source.file} does not start with YAML frontmatter`);
    }
    const end = content.indexOf("\n---", 3);
    if (end < 0) throw new Error(`${source.file} frontmatter is not closed`);
    const frontmatter = content.slice(3, end);
    const match = frontmatter.match(/^version:\s*(\S+)/m);
    if (!match) throw new Error(`${source.file} frontmatter missing "version:"`);
    return match[1];
  }
  throw new Error(`unknown source kind: ${source.kind}`);
}

function writeVersion(source, newVersion) {
  const path = join(REPO_ROOT, source.file);
  if (source.kind === "json") {
    const pkg = JSON.parse(readFileSync(path, "utf8"));
    pkg.version = newVersion;
    writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
    return;
  }
  if (source.kind === "skill-md") {
    const content = readFileSync(path, "utf8");
    const end = content.indexOf("\n---", 3);
    if (end < 0) throw new Error(`${source.file} frontmatter is not closed`);
    const frontmatter = content.slice(3, end);
    if (!/^version:\s*\S+/m.test(frontmatter)) {
      throw new Error(`${source.file} frontmatter missing "version:"`);
    }
    const newFrontmatter = frontmatter.replace(/^version:\s*\S+/m, `version: ${newVersion}`);
    writeFileSync(path, `---${newFrontmatter}\n---${content.slice(end + 4)}`);
    return;
  }
  throw new Error(`unknown source kind: ${source.kind}`);
}

export function readAllVersions() {
  const out = {};
  for (const s of VERSION_SOURCES) {
    out[s.key] = readVersion(s);
  }
  return out;
}

export function checkConsistency() {
  const versions = readAllVersions();
  const unique = new Set(Object.values(versions));
  if (unique.size === 1) {
    return { ok: true, version: [...unique][0], versions };
  }
  return { ok: false, versions };
}

function isValidSemver(v) {
  return /^\d+\.\d+\.\d+([-.+].+)?$/.test(v);
}

function bumpVersion(current, kind) {
  const m = current.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error(`current version "${current}" is not semver`);
  let [_, major, minor, patch] = m;
  major = Number(major);
  minor = Number(minor);
  patch = Number(patch);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`unknown bump kind: ${kind}`);
}

// Move [Unreleased] content into a dated version section, then reset [Unreleased].
// If [Unreleased] has no body lines (only the standard subsection headers),
// the new version section is created with no subsections.
function updateChangelog(newVersion, date) {
  const path = join(REPO_ROOT, "CHANGELOG.md");
  const content = readFileSync(path, "utf8");

  // Locate the "## [Unreleased]" header.
  const unreleasedMatch = content.match(/^(## \[Unreleased\][ \t]*\r?\n)/m);
  if (!unreleasedMatch) {
    throw new Error(`CHANGELOG.md is missing "## [Unreleased]" section`);
  }
  const unreleasedHeaderIdx = unreleasedMatch.index;
  const unreleasedHeaderEnd = unreleasedHeaderIdx + unreleasedMatch[0].length;

  // Find the next top-level (##) section after Unreleased to bound the body.
  const tailMatch = content.slice(unreleasedHeaderEnd).match(/^## /m);
  const unreleasedBodyEnd = tailMatch
    ? unreleasedHeaderEnd + tailMatch.index
    : content.length;
  const unreleasedBody = content.slice(unreleasedHeaderEnd, unreleasedBodyEnd);

  // Detect whether the body contains any actual bullet entries (`- ...`).
  // Empty subsection headers like `### Added` alone do not count.
  const hasRealEntries = unreleasedBody
    .split("\n")
    .some((line) => /^\s*-\s+\S/.test(line));

  // Locate insertion point: just before the first existing `## [X.Y.Z]` section.
  const firstVersionMatch = content.match(/^## \[\d+\.\d+\.\d+/m);
  const insertAt = firstVersionMatch ? firstVersionMatch.index : content.length;

  const newVersionHeader = `## [${newVersion}] - ${date}`;
  const newSection = hasRealEntries
    ? `${newVersionHeader}\n\n${unreleasedBody.trimEnd()}\n\n`
    : `${newVersionHeader}\n\n`;

  // Reset [Unreleased] to standard empty template.
  const resetUnreleased = `## [Unreleased]\n\n### Added\n### Changed\n### Fixed\n### Removed\n\n`;

  // Cut at the start of the original [Unreleased] header (not at insertAt) so we
  // do not duplicate the section. Final order: [intro] [Unreleased] [X.Y.Z] [oldest..].
  const before = content.slice(0, unreleasedHeaderIdx);
  const after = content.slice(unreleasedBodyEnd);
  const next = before + resetUnreleased + newSection + after;
  writeFileSync(path, next);
  return { hasRealEntries };
}

function cmdCheck() {
  const result = checkConsistency();
  if (result.ok) {
    console.log(`OK  all version sources agree on ${result.version}`);
    for (const [k, v] of Object.entries(result.versions)) {
      console.log(`     ${k.padEnd(28)} ${v}`);
    }
    process.exit(0);
  }
  console.error(`FAIL  version drift detected:`);
  for (const [k, v] of Object.entries(result.versions)) {
    console.error(`     ${k.padEnd(28)} ${v}`);
  }
  process.exit(2);
}

function cmdSet({ newVersion, updateChangelog: doChangelog, date }) {
  if (!newVersion) {
    console.error("set requires --version <X.Y.Z>");
    process.exit(1);
  }
  if (!isValidSemver(newVersion)) {
    console.error(`not a valid semver: ${newVersion}`);
    process.exit(1);
  }
  for (const s of VERSION_SOURCES) {
    writeVersion(s, newVersion);
  }
  console.log(`wrote ${newVersion} to ${VERSION_SOURCES.length} sources`);
  if (doChangelog) {
    const r = updateChangelog(newVersion, date);
    if (r.hasRealEntries) {
      console.log(`CHANGELOG: moved [Unreleased] entries to [${newVersion}] - ${date}`);
    } else {
      console.log(`CHANGELOG: created empty [${newVersion}] - ${date} section`);
    }
  }
}

function cmdBump({ kind, doChangelog, date }) {
  const current = readVersion(VERSION_SOURCES[0]);
  const next = bumpVersion(current, kind);
  cmdSet({ newVersion: next, updateChangelog: doChangelog, date });
  console.log(`bumped ${current} -> ${next} (${kind})`);
}

function parseArgs(argv) {
  const out = { cmd: null, kind: null, newVersion: null, doChangelog: false, date: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "check") out.cmd = "check";
    else if (a === "set") out.cmd = "set";
    else if (a === "bump") out.cmd = "bump";
    else if (a === "patch" || a === "minor" || a === "major") out.kind = a;
    else if (a === "--version") out.newVersion = argv[++i];
    else if (a === "--changelog") out.doChangelog = true;
    else if (a === "--date") out.date = argv[++i];
    else if (a === "--help" || a === "-h") out.cmd = "help";
  }
  return out;
}

function help() {
  console.log(`Usage:
  release-version.mjs check
  release-version.mjs bump <patch|minor|major> [--changelog] [--date YYYY-MM-DD]
  release-version.mjs set --version <X.Y.Z> [--changelog] [--date YYYY-MM-DD]
`);
}

const args = parseArgs(process.argv.slice(2));
if (args.cmd === "check") cmdCheck();
else if (args.cmd === "bump") {
  if (!args.kind) {
    console.error("bump requires patch|minor|major");
    process.exit(1);
  }
  cmdBump({
    kind: args.kind,
    doChangelog: args.doChangelog,
    date: args.date || new Date().toISOString().slice(0, 10),
  });
} else if (args.cmd === "set") {
  cmdSet({
    newVersion: args.newVersion,
    updateChangelog: args.doChangelog,
    date: args.date || new Date().toISOString().slice(0, 10),
  });
} else {
  help();
  process.exit(args.cmd ? 1 : 0);
}
