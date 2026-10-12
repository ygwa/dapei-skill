import { existsSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { cognitivePaths, loadCognitiveIndex, saveCognitiveIndex } from "@dapei/core/cognitive-index";
import { parseYamlDocument, stringifyYamlDocument, type YamlValue } from "@dapei/core/yaml-doc";
import { requireFields } from "@dapei/core/internal/shared";
import { read, write, listFilesRecursively } from "@dapei/runtime-adapters/system";
import type { AnyCap } from "./internal/shared.ts";

// ---------------------------------------------------------------------------
// Capability: cdr.feature.link
//
// Tag every CDR asset a feature actually produced with
// `created_by_feature = <feature>` so that
// `cdr.query --created_by_feature <feature>` can surface them later,
// and so the closeout backfill to `docs/decisions/<feature>.md` can
// list what the feature actually produced. Idempotent: re-running
// on the same feature is a no-op (the field is overwritten with the
// same value).
//
// v0.10 — the source of truth is now the audit log, not the cognitive
// index. The previous batch-tag implementation walked every entry in
// `index.behaviors` / `index.state_machines` / `index.business_rules`
// and tagged anything missing `created_by_feature` — this would
// silently re-claim artifacts that another feature (or workspace
// indexing) produced first. The audit log records, per call, which
// feature invoked it AND which `artifactPaths` it wrote, so the new
// implementation only tags the artifacts THIS feature wrote.
//
// Two modes:
//
//   mode: "audit"      (default)
//     Reads `.dapei/audit/capability.log`, filters to entries with
//     `feature === <feature>`, and tags the union of their
//     `artifactPaths[]`. No batch overreach. Workspace with no audit
//     log falls through to the legacy mode so pre-v0.10 workspaces
//     still work.
//
//   mode: "backfill"   (legacy)
//     The original batch-tag implementation. Used when the audit log
//     has no v0.10 entries with artifact paths (e.g. an existing
//     workspace upgrading from a pre-v0.10 install).
//
// `feature.close` calls this on the way out with `mode: "audit"`. It
// is also callable from `feature.review` if a team wants to surface
// the link before the feature is closed.
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  schema_version?: string;
  capability?: string;
  feature?: string;
  artifactPaths?: string[];
}

function readAuditLog(rootDir: string): AuditLogEntry[] {
  const auditFile = join(rootDir, ".dapei", "audit", "capability.log");
  if (!existsSync(auditFile)) return [];
  const lines = read(auditFile).split("\n").filter(Boolean);
  const out: AuditLogEntry[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as AuditLogEntry;
      out.push(entry);
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

export const cdrFeatureLink: AnyCap = {
  id: "cdr.feature.link",
  version: "2.0.0",
  inputSchema: {
    required: ["feature"],
    properties: {
      feature: { type: "string", minLength: 1 },
      repo: { type: "string" },
      mode: { type: "string", enum: ["audit", "backfill"] }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["feature"]);
    const feature = String(input.feature);
    const repo = input.repo ? String(input.repo) : undefined;
    const mode = input.mode ? String(input.mode) : "audit";
    const now = ctx.now.toISOString();

    const index = loadCognitiveIndex(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    let tagged = 0;

    if (mode === "audit") {
      const auditEntries = readAuditLog(ctx.rootDir);
      // Collect workspace-relative paths that THIS feature wrote, per
      // the audit log. The audit log is the index of provenance
      // claims; the on-disk `created_by_feature` is the source of
      // truth. tagArtifactFile below short-circuits when the artifact
      // is already claimed by a different feature, so passing
      // feature-a's paths to feature-b's link is a no-op (no
      // overclaim) — the opposite of the v0.9 batch-tag bug.
      const candidatePaths = new Set<string>();
      let auditBased = false;
      for (const entry of auditEntries) {
        if (entry.feature !== feature) continue;
        if (entry.schema_version !== "2.0") continue;
        if (!Array.isArray(entry.artifactPaths) || entry.artifactPaths.length === 0) continue;
        auditBased = true;
        for (const p of entry.artifactPaths) {
          if (typeof p === "string" && p.length > 0) candidatePaths.add(p);
        }
      }
      if (auditBased) {
        for (const rel of candidatePaths) {
          const abs = isAbsolute(rel) ? rel : join(ctx.rootDir, rel);
          if (!existsSync(abs)) continue;
          if (tagArtifactFile(abs, feature, now, repo)) tagged++;
        }
      } else {
        const backfillResult = tagBackfill(ctx, index, cp, feature, repo, now);
        tagged = backfillResult;
      }
    } else {
      const backfillResult = tagBackfill(ctx, index, cp, feature, repo, now);
      tagged = backfillResult;
    }

    saveCognitiveIndex(ctx.rootDir, index);

    return {
      ok: true,
      data: {
        feature,
        repo: repo || "*",
        mode,
        assets_tagged: tagged
      },
      sideEffects: ["cognitive index updated", "docs/as-is tagged"],
      reportFragments: [`linked ${tagged} asset(s) to feature ${feature} (mode=${mode})`],
      artifactPaths: []
    };
  }
};

// ---------------------------------------------------------------------------
// Internal helpers for cdr.feature.link
// ---------------------------------------------------------------------------

function tagArtifactFile(absPath: string, feature: string, now: string, repo: string | undefined): boolean {
  try {
    const doc = parseYamlDocument(read(absPath));
    if (repo) {
      const docRepo = String((doc as { repo?: string }).repo || "");
      if (docRepo && docRepo !== repo) return false;
    }
    if ((doc as { created_by_feature?: string }).created_by_feature === feature) return false;
    (doc as Record<string, unknown>).created_by_feature = feature;
    (doc as Record<string, unknown>).updated_by_feature = feature;
    (doc as Record<string, unknown>).created_at = now;
    (doc as Record<string, unknown>).updated_at = now;
    write(absPath, stringifyYamlDocument(doc));
    return true;
  } catch {
    return false;
  }
}

function tagBackfill(
  ctx: { rootDir: string },
  index: ReturnType<typeof loadCognitiveIndex>,
  cp: ReturnType<typeof cognitivePaths>,
  feature: string,
  repo: string | undefined,
  now: string
): number {
  let tagged = 0;

  const tagInList = <T extends { created_by_feature?: string; created_at?: string; path: string; repo?: string }>(list: T[]): T[] => {
    let touched = 0;
    const out = list.map((entry) => {
      if (repo && entry.repo && entry.repo !== repo) return entry;
      // Skip entries already claimed by ANY feature (not just this
      // one). The legacy v0.9 batch-tag would re-claim any entry
      // whose created_by_feature was not the current feature; that
      // silently stole artifacts from earlier features. Backfill
      // mode only tags truly unclaimed entries.
      if (entry.created_by_feature && entry.created_by_feature !== feature) return entry;
      if (entry.created_by_feature === feature) return entry;
      touched++;
      return { ...entry, created_by_feature: feature, created_at: now };
    });
    tagged += touched;
    return out;
  };

  index.behaviors = tagInList(index.behaviors);
  index.state_machines = tagInList(index.state_machines);
  index.business_rules = tagInList(index.business_rules);

  const root = ctx.rootDir;
  const walkYamlDir = (dir: string, onDoc: (doc: Record<string, unknown>, absPath: string) => void) => {
    if (!existsSync(dir)) return;
    for (const f of listFilesRecursively(dir, [".yaml", ".yml"], 200)) {
      try {
        const doc = parseYamlDocument(read(f));
        onDoc(doc, f);
      } catch {
        // skip malformed
      }
    }
  };

  walkYamlDir(cp.domainDir, (doc, abs) => {
    if (repo) {
      const docRepo = String((doc as { repo?: string }).repo || "");
      if (docRepo && docRepo !== repo) return;
    }
    if ((doc as { created_by_feature?: string }).created_by_feature === feature) return;
    (doc as Record<string, unknown>).created_by_feature = feature;
    (doc as Record<string, unknown>).created_at = now;
    write(abs, stringifyYamlDocument(doc as unknown as Record<string, YamlValue>));
    tagged++;
  });

  walkYamlDir(cp.capabilityDir, (doc, abs) => {
    if ((doc as { created_by_feature?: string }).created_by_feature === feature) return;
    (doc as Record<string, unknown>).created_by_feature = feature;
    (doc as Record<string, unknown>).created_at = now;
    write(abs, stringifyYamlDocument(doc as unknown as Record<string, YamlValue>));
    tagged++;
  });

  walkYamlDir(cp.businessRulesDir, (doc, abs) => {
    if (repo) {
      const docRepo = String((doc as { repo?: string }).repo || "");
      if (docRepo && docRepo !== repo) return;
    }
    if ((doc as { created_by_feature?: string }).created_by_feature === feature) return;
    (doc as Record<string, unknown>).created_by_feature = feature;
    (doc as Record<string, unknown>).created_at = now;
    write(abs, stringifyYamlDocument(doc as unknown as Record<string, YamlValue>));
    tagged++;
  });

  walkYamlDir(cp.profilesDir, (doc, abs) => {
    if (repo) {
      const docRepo = String((doc as { repo?: string }).repo || "");
      if (docRepo && docRepo !== repo) return;
    }
    if ((doc as { created_by_feature?: string }).created_by_feature === feature) return;
    (doc as Record<string, unknown>).created_by_feature = feature;
    (doc as Record<string, unknown>).created_at = now;
    write(abs, stringifyYamlDocument(doc as unknown as Record<string, YamlValue>));
    tagged++;
  });

  return tagged;
}
