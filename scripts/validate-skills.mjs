#!/usr/bin/env node
// Zero-dependency SKILL.md / commands.md / plugin.json validator.
// Inspired by pm-skills/validate_plugins.py.
//
// Usage:
//   node scripts/validate-skills.mjs                 # validate this repo
//   node scripts/validate-skills.mjs --dir <path>    # validate another repo
//
// Exit codes:
//   0 — no errors (warnings allowed)
//   1 — one or more errors

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename, resolve } from "node:path";

const COLOR = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
};

function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---\n", 4);
  if (end < 0) return null;
  const block = content.slice(4, end);
  const fields = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (m) fields[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  const body = content.slice(end + 5);
  return { fields, body };
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

export function validateSkillsDir(skillsDir, opts = {}) {
  const errors = [];
  const warnings = [];
  const info = [];
  const knownCapabilities = opts.knownCapabilities || null;

  if (!existsSync(skillsDir)) {
    errors.push({ path: skillsDir, message: "skills directory does not exist" });
    return { errors, warnings, info };
  }

  const entries = readdirSync(skillsDir).filter((name) => {
    try { return statSync(join(skillsDir, name)).isDirectory(); } catch { return false; }
  });

  for (const name of entries) {
    const skillDir = join(skillsDir, name);
    const skillFile = join(skillDir, "SKILL.md");

    if (!existsSync(skillFile)) {
      errors.push({ path: skillDir, message: "missing SKILL.md" });
      continue;
    }

    const raw = readFileSync(skillFile, "utf8");
    const parsed = parseFrontmatter(raw);

    if (!parsed) {
      errors.push({ path: skillFile, message: "missing or malformed YAML frontmatter (expected '---' delimited block)" });
      continue;
    }

    const { fields, body } = parsed;

    // Required fields
    if (!fields.name) errors.push({ path: skillFile, message: "frontmatter missing required field: name" });
    if (!fields.description) errors.push({ path: skillFile, message: "frontmatter missing required field: description" });

    // Name matches directory (allow optional "dapei-" prefix for convention)
    if (fields.name && fields.name !== name && fields.name !== `dapei-${name}`) {
      errors.push({
        path: skillFile,
        message: `frontmatter 'name: ${fields.name}' must match directory '${name}' (or 'dapei-${name}' if using the namespace prefix)`
      });
    }

    // Description quality
    if (fields.description) {
      if (fields.description.length < 30) {
        warnings.push({ path: skillFile, message: `description is short (${fields.description.length} chars); aim for ≥ 30 chars` });
      }
      if (!/use when/i.test(fields.description)) {
        warnings.push({
          path: skillFile,
          message: "description should include a 'Use when X, Y, or Z.' phrase to help AI auto-routing"
        });
      }
    }

    // Body quality
    const wc = countWords(body);
    info.push({ path: skillFile, message: `body word count: ${wc}` });
    if (wc < 50) warnings.push({ path: skillFile, message: `body is very short (${wc} words); consider adding examples or workflow` });
    if (wc > 3000) warnings.push({ path: skillFile, message: `body is long (${wc} words); consider progressive disclosure via separate reference files` });

    // Capability reference check
    if (knownCapabilities) {
      const refs = new Set();
      const re = /runCapability\(\s*['"`]([a-z][a-z0-9.-]*)['"`]/gi;
      let m;
      while ((m = re.exec(body))) refs.add(m[1]);
      const reInline = /`([a-z][a-z0-9.-]*)`/g;
      while ((m = reInline.exec(body))) {
        const id = m[1];
        if (id.includes(".") && /^(cdr|cognitive|feature|workspace|workflow|repos|context|validation|memory|audit)\./.test(id)) {
          refs.add(id);
        }
      }
      for (const ref of refs) {
        if (!knownCapabilities.has(ref)) {
          warnings.push({ path: skillFile, message: `references unknown capability id: '${ref}'` });
        }
      }
    }

    // Plugin manifest validation
    const manifestFile = join(skillDir, ".claude-plugin", "plugin.json");
    if (existsSync(manifestFile)) {
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
      } catch (err) {
        errors.push({ path: manifestFile, message: `invalid JSON: ${err.message}` });
        continue;
      }
      for (const required of ["name", "version", "description"]) {
        if (!manifest[required]) {
          errors.push({ path: manifestFile, message: `manifest missing required field: ${required}` });
        }
      }
      if (manifest.name && manifest.name !== fields?.name) {
        errors.push({
          path: manifestFile,
          message: `manifest 'name: ${manifest.name}' must match SKILL.md frontmatter 'name: ${fields?.name}'`
        });
      }
      if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
        warnings.push({ path: manifestFile, message: `version '${manifest.version}' is not strict semver` });
      }
    }
  }

  return { errors, warnings, info };
}

export function validateCommandsDir(commandsDir, opts = {}) {
  const errors = [];
  const warnings = [];
  const info = [];
  const knownCapabilities = opts.knownCapabilities || null;

  if (!existsSync(commandsDir)) {
    errors.push({ path: commandsDir, message: "commands directory does not exist" });
    return { errors, warnings, info };
  }

  const entries = readdirSync(commandsDir).filter((name) => name.endsWith(".md"));

  for (const file of entries) {
    const cmdFile = join(commandsDir, file);
    const raw = readFileSync(cmdFile, "utf8");
    const parsed = parseFrontmatter(raw);

    if (!parsed) {
      errors.push({ path: cmdFile, message: "missing or malformed YAML frontmatter (expected '---' delimited block)" });
      continue;
    }

    const { fields, body } = parsed;

    if (!fields.description) {
      errors.push({ path: cmdFile, message: "frontmatter missing required field: description" });
    }
    if (!fields["argument-hint"]) {
      warnings.push({ path: cmdFile, message: "frontmatter missing recommended field: argument-hint" });
    }

    // Capability reference check (bold **cap.id** or backtick `cap.id` references)
    if (knownCapabilities && fields.description) {
      const re = /`([a-z][a-z0-9.-]*)`/g;
      let m;
      const refs = new Set();
      while ((m = re.exec(body + "\n" + (fields.description || "")))) {
        const id = m[1];
        if (id.includes(".") && /^(cdr|cognitive|feature|workspace|workflow|repos|context|validation|memory|audit)\./.test(id)) {
          refs.add(id);
        }
      }
      for (const ref of refs) {
        if (!knownCapabilities.has(ref)) {
          warnings.push({ path: cmdFile, message: `references unknown capability id: '${ref}'` });
        }
      }
    }

    const wc = countWords(body);
    info.push({ path: cmdFile, message: `body word count: ${wc}` });
  }

  return { errors, warnings, info };
}

function loadCapabilityIds(repoRoot) {
  // Best-effort static parse of capability files (no TS imports needed).
  // We cannot evaluate TS; fall back to scanning capability files for `id:` patterns.
  // Source directories cover the legacy `packages/core` layout AND any extracted
  // package (e.g. `packages/cdr`).
  const sourceDirs = [
    join(repoRoot, "packages/core/src/capabilities/domains"),
    join(repoRoot, "packages/cdr/src"),
  ];
  const ids = new Set();
  for (const dir of sourceDirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".ts")) continue;
      const content = readFileSync(join(dir, f), "utf8");
      const re = /\bid:\s*['"`]([a-z][a-z0-9.-]+)['"`]/gi;
      let m;
      while ((m = re.exec(content))) ids.add(m[1]);
    }
  }
  if (ids.size === 0) return null;
  return ids;
}

function printReport(label, { errors, warnings, info }) {
  console.log(COLOR.bold(`\n=== ${label} ===`));
  if (errors.length === 0 && warnings.length === 0) {
    console.log(COLOR.green("OK"));
  }
  for (const e of errors) console.log(COLOR.red(`  ERROR ${e.path}\n        ${e.message}`));
  for (const w of warnings) console.log(COLOR.yellow(`  WARN  ${w.path}\n        ${w.message}`));
  for (const i of info) console.log(COLOR.dim(`  info  ${i.path}: ${i.message}`));
}

function main() {
  const args = process.argv.slice(2);
  let repoRoot = process.cwd();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" && args[i + 1]) repoRoot = resolve(args[i + 1]);
  }

  const knownCapabilities = loadCapabilityIds(repoRoot);
  const skillsDir = join(repoRoot, "skills");
  const result = validateSkillsDir(skillsDir, { knownCapabilities });

  printReport(`skills/ (${basename(repoRoot)})`, result);

  const commandsDir = join(repoRoot, "commands");
  const cmdResult = validateCommandsDir(commandsDir, { knownCapabilities });
  printReport(`commands/ (${basename(repoRoot)})`, cmdResult);

  const totalErrors = result.errors.length + cmdResult.errors.length;
  const totalWarnings = result.warnings.length + cmdResult.warnings.length;
  const totalInfo = result.info.length + cmdResult.info.length;
  console.log(COLOR.bold(`\nSummary: ${totalErrors} errors, ${totalWarnings} warnings, ${totalInfo} info`));
  process.exit(totalErrors > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
