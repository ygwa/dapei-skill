import { existsSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { CapabilityError } from "@dapei/core/types";
import { cognitivePaths, loadCognitiveIndex } from "@dapei/core/cognitive-index";
import { requireFields } from "@dapei/core/internal/shared";
import { read, workspacePaths } from "@dapei/runtime-adapters/system";
import type { AnyCap } from "./internal/shared.ts";
import { cdrProfile, cdrEntriesCandidate } from "./entry-discovery.ts";

// ---------------------------------------------------------------------------
// Capability: cdr.bootstrap (one-shot repos→docs bootstrap)
//
// Runs the engine-side phase 0 + phase 1 in a single call so the AI does
// not have to orchestrate them manually. The AI still owns phase 1b
// (reading code, proposing entries with evidence) — see P3 red line in
// skills/cdr/SKILL.md.
// ---------------------------------------------------------------------------

export const cdrBootstrap: AnyCap = {
  id: "cdr.bootstrap",
  version: "1.0.0",
  inputSchema: {
    required: ["repo"],
    properties: {
      repo: { type: "string", minLength: 1 },
      profile: { type: "boolean" },
      entry_discovery: { type: "boolean" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["repo"]);
    const p = workspacePaths(ctx.rootDir);
    const repo = String(input.repo);
    const wantProfile = input.profile === undefined ? true : Boolean(input.profile);
    const wantEntryDiscovery = input.entry_discovery === undefined ? true : Boolean(input.entry_discovery);

    if (!existsSync(p.dapeiDir)) {
      throw new CapabilityError("WORKSPACE_MISSING", `workspace not initialized at ${p.rootDir}`);
    }
    const repoPath = join(p.reposDir, repo);
    if (!existsSync(join(repoPath, ".git"))) {
      throw new CapabilityError("REPO_MISSING", `repos/${repo} not found in workspace`);
    }

    let profilePath: string | null = null;
    if (wantProfile) {
      const r = await cdrProfile.execute(ctx, { repo });
      const d = r.data as { path: string };
      profilePath = d.path;
    }

    let fileCount = 0;
    if (wantEntryDiscovery) {
      const r = await cdrEntriesCandidate.execute(ctx, { repo });
      const d = r.data as { file_count?: number; files?: unknown[] };
      fileCount = typeof d.file_count === "number" ? d.file_count : Array.isArray(d.files) ? d.files.length : 0;
    }

    const nextStep = wantEntryDiscovery
      ? `AI: read candidate files, then call cdr.entries.propose with sources[] for each entry`
      : "done; next: cdr.entries.candidate or skip to behavior mining";

    return {
      ok: true,
      data: {
        repo,
        profile_path: profilePath,
        candidate_files_count: fileCount,
        next_step: nextStep
      },
      sideEffects: [
        ...(wantProfile ? [`profile written: ${profilePath}`] : []),
        ...(wantEntryDiscovery ? [`entry discovery: ${fileCount} files`] : [])
      ],
      reportFragments: [
        `bootstrap ${repo} ${wantProfile ? "+ profile" : ""} ${wantEntryDiscovery ? "+ entry discovery" : ""}`.trim()
      ]
    };
  }
};

// ---------------------------------------------------------------------------
// 24. cdr.context.envelope — v1.0.0
//
// Build a structured "context envelope" for a single cognitive asset so an
// agent session can inject it without dumping the entire YAML. Read-only;
// never writes any docs/as-is/* or .dapei/cognitive/*. Persists nothing on
// disk.
//
// ADR-0018 (M3-4 / M3-5).
// ---------------------------------------------------------------------------

const ENVELOPE_SUMMARY_MAX_CHARS = 500;
const ENVELOPE_EVIDENCE_MAX_ITEMS = 10;
const ENVELOPE_RELATED_MAX_ITEMS = 5;
const ENVELOPE_TOTAL_MAX_BYTES = 8 * 1024;

/**
 * Read the first paragraph of an asset's yaml body. The cognitive index
 * only stores frontmatter metadata; the actual `summary` / `description`
 * / `notes` field lives in the yaml file. Returns a single string trimmed
 * to `ENVELOPE_SUMMARY_MAX_CHARS`.
 */
function readAssetSummary(absPath: string): string {
  if (!existsSync(absPath)) return "";
  let raw: string;
  try {
    raw = read(absPath);
  } catch {
    return "";
  }
  // Strip frontmatter block (--- ... ---) if present.
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const body = fmMatch ? raw.slice(fmMatch[0].length) : raw;
  // First non-empty line(s) until first blank line.
  const paragraphs: string[] = [];
  const lines = body.split(/\r?\n/);
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length) {
        paragraphs.push(current.join(" ").trim());
        current = [];
        if (paragraphs.length >= 3) break;
      }
      continue;
    }
    current.push(line.trim());
  }
  if (current.length) paragraphs.push(current.join(" ").trim());
  const summary = paragraphs.slice(0, 2).join(" / ");
  if (summary.length <= ENVELOPE_SUMMARY_MAX_CHARS) return summary;
  return summary.slice(0, ENVELOPE_SUMMARY_MAX_CHARS - 1) + "…";
}

/**
 * Pull `evidence` / `sources` from an asset's yaml frontmatter. Returns a
 * normalized list of {file, line?, symbol?, repo?}.
 */
function readAssetEvidence(absPath: string): Array<{ file: string; line?: number; symbol?: string; repo?: string }> {
  if (!existsSync(absPath)) return [];
  let raw: string;
  try {
    raw = read(absPath);
  } catch {
    return [];
  }
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) return [];
  // Minimal yaml-ish key:value extraction (no full parser needed for sources[]).
  const block = fmMatch[1];
  const items: Array<{ file: string; line?: number; symbol?: string; repo?: string }> = [];
  const inSources = /^sources:\s*$/m.test(block);
  if (!inSources) {
    // also accept `evidence:` (newer alias)
    const inEvidence = /^evidence:\s*$/m.test(block);
    if (!inEvidence) return [];
  }
  const listRe = /^\s*-\s+(.+?)$/gm;
  let m: RegExpExecArray | null;
  const lines: string[] = [];
  while ((m = listRe.exec(block)) !== null) {
    lines.push(m[1]);
  }
  for (const raw of lines) {
    // raw looks like `{ file: "x", line: 1, symbol: "y", repo: "z" }` or `file: "x"`
    const fileMatch = raw.match(/file:\s*["']?([^"',}\s]+)/);
    if (!fileMatch) continue;
    const lineMatch = raw.match(/line:\s*(\d+)/);
    const symbolMatch = raw.match(/symbol(?:_handle)?:\s*["']?([^"',}\s]+)/);
    const repoMatch = raw.match(/repo:\s*["']?([^"',}\s]+)/);
    items.push({
      file: fileMatch[1],
      line: lineMatch ? Number(lineMatch[1]) : undefined,
      symbol: symbolMatch ? symbolMatch[1] : undefined,
      repo: repoMatch ? repoMatch[1] : undefined
    });
    if (items.length >= ENVELOPE_EVIDENCE_MAX_ITEMS) break;
  }
  return items;
}

/**
 * 1-hop related assets for a behavior / state-machine / domain.
 *
 * The cognitive index (v0.10) is mostly metadata; it does NOT carry
 * cross-references between assets (no behavior_ids on state_machines,
 * no behavior_keys on domains, no applies_to on business_rules).
 * Those references live in the on-disk yaml files. To stay read-only
 * and avoid a full graph scan for every envelope call, we use a
 * heuristic: for a target behavior, list state-machines / domains /
 * business-rules from the SAME repo that mention the id in their
 * frontmatter. For other targets, we fall back to listing same-repo
 * siblings (so the related[] is at least non-empty when the index is
 * populated).
 *
 * Returns a list of string ids (no content).
 */
function findRelatedIds(
  index: ReturnType<typeof loadCognitiveIndex>,
  kind: "behavior" | "state-machine" | "domain" | "business-rule" | "capability-map" | "entry",
  id: string,
  repo: string | undefined
): string[] {
  const out = new Set<string>();
  const sameRepo = <T extends { repo?: string }>(e: T): boolean => !repo || e.repo === repo;

  if (kind === "behavior") {
    // Heuristic: state_machines + domains + business_rules in same repo.
    // (The real ref-based walk is follow-up work; v1.0.0 keeps the
    // id/keyword heuristic and lets callers show a "siblings" hint
    // rather than a precise cross-link.)
    for (const sm of index.state_machines) {
      if (sameRepo(sm)) out.add(`sm:${sm.entity}`);
    }
    for (const dom of index.domains) {
      if (sameRepo(dom)) out.add(`domain:${dom.domain}`);
    }
    for (const br of index.business_rules) {
      if (sameRepo(br)) out.add(`rule:${br.id}`);
    }
  } else if (kind === "state-machine") {
    // Sibling state_machines + state-machine's likely author behaviors.
    for (const sm of index.state_machines) {
      if (sm.entity !== id && sameRepo(sm)) out.add(`sm:${sm.entity}`);
    }
    for (const b of index.behaviors) {
      if (sameRepo(b)) out.add(`behavior:${b.id}`);
    }
  } else if (kind === "domain") {
    for (const dom of index.domains) {
      if (dom.domain !== id && sameRepo(dom)) out.add(`domain:${dom.domain}`);
    }
    for (const b of index.behaviors) {
      if (sameRepo(b)) out.add(`behavior:${b.id}`);
    }
  } else if (kind === "business-rule") {
    for (const br of index.business_rules) {
      if (br.id !== id && sameRepo(br)) out.add(`rule:${br.id}`);
    }
  } else if (kind === "capability-map") {
    for (const cm of index.capability_maps) {
      if (cm.product !== id && sameRepo(cm)) out.add(`cm:${cm.product}`);
    }
  } else if (kind === "entry") {
    for (const b of index.behaviors) {
      if (sameRepo(b)) out.add(`behavior:${b.id}`);
    }
  }
  // Drop self references.
  out.delete(id);
  void repo;
  return Array.from(out).slice(0, ENVELOPE_RELATED_MAX_ITEMS);
}

export const cdrContextEnvelope: AnyCap = {
  id: "cdr.context.envelope",
  version: "1.0.0",
  inputSchema: {
    required: ["target", "id"],
    properties: {
      target: {
        type: "string",
        enum: ["behavior", "state-machine", "domain", "business-rule", "entry", "capability-map"]
      },
      id: { type: "string", minLength: 1 },
      repo: { type: "string" },
      include_evidence: { type: "boolean" },
      include_related: { type: "number" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input as Record<string, import("@dapei/core/types").Json>, ["target", "id"]);
    const target = String(input.target);
    const id = String(input.id);
    const repo = input.repo ? String(input.repo) : undefined;
    const includeEvidence = input.include_evidence === false ? false : true;
    const includeRelatedRaw = input.include_related;
    const includeRelated = typeof includeRelatedRaw === "number" ? includeRelatedRaw : 1;

    const cp = cognitivePaths(ctx.rootDir);
    const index = loadCognitiveIndex(ctx.rootDir);

    // 1. Resolve on-disk yaml path by walking the index first, then the
    //    flat legacy path. Behavior and business-rule support per-repo
    //    v0.4 layout.
    const indexEntry =
      target === "behavior" ? index.behaviors.find((b) => b.id === id && (!repo || b.repo === repo)) :
      target === "state-machine" ? index.state_machines.find((s) => s.entity === id) :
      target === "domain" ? index.domains.find((d) => d.domain === id) :
      target === "business-rule" ? index.business_rules.find((b) => b.id === id) :
      target === "capability-map" ? index.capability_maps.find((c) => c.product === id) :
      undefined;

    let absPath: string | undefined;
    let indexPath: string | undefined;
    if (indexEntry) {
      // IndexEntry stores relative path
      indexPath =
        target === "behavior" ? (indexEntry as { path: string }).path :
        target === "state-machine" ? (indexEntry as { path: string }).path :
        target === "domain" ? (indexEntry as { path: string }).path :
        target === "business-rule" ? (indexEntry as { path: string }).path :
        target === "capability-map" ? (indexEntry as { path: string }).path :
        undefined;
      if (indexPath) absPath = isAbsolute(indexPath) ? indexPath : join(ctx.rootDir, indexPath);
    }
    if (!absPath) {
      // Flat legacy path fallback.
      const dir =
        target === "behavior" ? cp.behaviorDir :
        target === "state-machine" ? cp.stateMachineDir :
        target === "domain" ? cp.domainDir :
        target === "business-rule" ? cp.businessRulesDir :
        target === "capability-map" ? cp.capabilityDir :
        target === "entry" ? cp.entriesDir :
        undefined;
      if (!dir) {
        throw new CapabilityError("INVALID_INPUT", `unknown target: ${target}`);
      }
      const idSlug =
        target === "state-machine" || target === "domain" ? id.toLowerCase().replace(/[^a-z0-9-]+/g, "-") : id;
      absPath = repo
        ? join(dir, repo, `${idSlug}.yaml`)
        : join(dir, `${idSlug}.yaml`);
    }

    if (!existsSync(absPath)) {
      return {
        ok: false,
        data: null,
        sideEffects: [],
        reportFragments: [],
        error: {
          code: "ENVELOPE_NOT_FOUND",
          message: `envelope target not found: ${target}.${id}${repo ? ` (repo=${repo})` : ""}`
        }
      };
    }

    // 2. Build summary + evidence (from disk; never from cognitive index
    //    frontmatter, since the index only carries metadata, not the body).
    const summary = readAssetSummary(absPath);
    const evidence = includeEvidence ? readAssetEvidence(absPath) : [];
    const related = includeRelated > 0
      ? findRelatedIds(index, target as Parameters<typeof findRelatedIds>[1], id, repo)
      : [];

    const envelope: Record<string, unknown> = {
      kind: "cognitive-asset-context",
      target: { type: target, id, ...(repo ? { repo } : {}) },
      summary,
      evidence,
      related_ids: related,
      generated_at: new Date().toISOString()
    };

    // 3. Total size guard. If serialized JSON exceeds 8KB, drop related_ids
    //    progressively and finally truncate summary.
    let serialized = JSON.stringify(envelope);
    if (serialized.length > ENVELOPE_TOTAL_MAX_BYTES) {
      envelope.related_ids = [];
      serialized = JSON.stringify(envelope);
    }
    if (serialized.length > ENVELOPE_TOTAL_MAX_BYTES && typeof envelope.summary === "string") {
      const overshoot = serialized.length - ENVELOPE_TOTAL_MAX_BYTES + 16;
      envelope.summary = envelope.summary.slice(0, Math.max(0, envelope.summary.length - overshoot)) + "…";
      serialized = JSON.stringify(envelope);
    }
    if (serialized.length > ENVELOPE_TOTAL_MAX_BYTES) {
      // Hard fallback: only target + summary.
      const minimal = {
        kind: "cognitive-asset-context",
        target: envelope.target,
        summary: String(envelope.summary).slice(0, 200),
        evidence: [],
        related_ids: [],
        generated_at: envelope.generated_at
      };
      serialized = JSON.stringify(minimal);
    }

    return {
      ok: true,
      data: { envelope: JSON.parse(serialized) },
      sideEffects: [],
      reportFragments: [
        `cdr.context.envelope: ${target}.${id} (${serialized.length} bytes, ${evidence.length} evidence, ${related.length} related)`
      ]
    };
  }
};
