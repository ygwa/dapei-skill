import { existsSync } from "node:fs";
import { join } from "node:path";
import { read, write, workspacePaths } from "../../runtime-adapters/src/system.ts";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml-doc.ts";
import type { ArtifactType } from "./evidence.ts";
import { parseConfidence } from "./evidence.ts";

/**
 * v0.4 — `stale` and `stale_reason` are reserved for `cdr.stale.scan` (planned
 * but not yet implemented). Adding the fields now keeps the index schema
 * stable across the next PR that lands `cdr.stale.scan`.
 */
export interface StaleFields {
  stale?: boolean;
  stale_reason?: string;
  stale_at?: string;
  stale_base?: string;
}

export interface IndexBehaviorEntry extends StaleFields {
  id: string;
  path: string;
  repo?: string;
  kind: string;
  level: string;
  /**
   * v0.6 — set of repo names this behavior calls into, derived from
   * structured `calls[]` entries that carry an explicit `target_repo`.
   * Strings and object calls without `target_repo` do not contribute.
   * Optional; pre-v0.6 index entries that lack the field keep working.
   */
  target_repos?: string[];
}

export interface IndexStateMachineEntry extends StaleFields {
  entity: string;
  path: string;
  repo?: string;
  kind: string;
  level: string;
}

export interface IndexDomainEntry extends StaleFields {
  domain: string;
  path: string;
  repo?: string;
  derived_from: string[];
}

export interface IndexCapabilityMapEntry extends StaleFields {
  product: string;
  path: string;
  capability_count: number;
}

export interface IndexBusinessRuleEntry extends StaleFields {
  id: string;
  kind: string;
  path: string;
  repo?: string;
  evidence_kind: string;
  evidence_level: string;
}

export interface CognitiveIndex {
  version: string;
  updated_at: string;
  behaviors: IndexBehaviorEntry[];
  state_machines: IndexStateMachineEntry[];
  domains: IndexDomainEntry[];
  capability_maps: IndexCapabilityMapEntry[];
  business_rules: IndexBusinessRuleEntry[];
  unknowns: Array<{ id: string; artifact_type?: string; reason: string; investigation_hint?: string }>;
}

export function cognitivePaths(rootDir: string) {
  const p = workspacePaths(rootDir);
  return {
    ...p,
    behaviorDir: join(p.docsDir, "as-is", "behavior"),
    stateMachineDir: join(p.docsDir, "as-is", "state-machines"),
    domainDir: join(p.docsDir, "as-is", "domains"),
    capabilityDir: join(p.docsDir, "as-is", "capabilities"),
    profilesDir: join(p.docsDir, "as-is", "profiles"),
    entriesDir: join(p.docsDir, "as-is", "entries"),
    businessRulesDir: join(p.docsDir, "as-is", "business-rules"),
    cognitiveDir: join(p.dapeiDir, "cognitive"),
    indexFile: join(p.dapeiDir, "cognitive", "index.yaml"),
    candidatesFile: join(p.docsDir, "as-is", "behavior", "_candidates.yaml")
  };
}

/**
 * v0.4 — per-repo namespace for `behavior` / `state-machine` / `business-rule`.
 * The path resolves to `docs/as-is/<section>/<repo>/<id>.yaml` when `repo`
 * is provided. Capabilities/domains stay global (single source of truth per
 * product / domain). Profiles/entries keep their existing per-repo layout.
 *
 * Existing flat files (`docs/as-is/behavior/<id>.yaml` written by pre-v0.4
 * capability calls) are still readable; `loadCognitiveIndex` does not enforce
 * the new path layout. New writes always go through this function.
 */
export function artifactRelativePath(type: ArtifactType, doc: Record<string, unknown>): string {
  const repo = typeof doc.repo === "string" && doc.repo.trim() ? doc.repo.trim() : undefined;
  if (type === "behavior") {
    const id = String(doc.id || "unknown");
    return repo
      ? `docs/as-is/behavior/${repo}/${id}.yaml`
      : `docs/as-is/behavior/${id}.yaml`;
  }
  if (type === "domain") {
    const domain = String(doc.domain || "unknown").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    return repo
      ? `docs/as-is/domains/${repo}/${domain}.yaml`
      : `docs/as-is/domains/${domain}.yaml`;
  }
  if (type === "capability-map") {
    return `docs/as-is/capabilities/product-map.yaml`;
  }
  if (type === "business-rule") {
    const id = String(doc.id || "unknown").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    return repo
      ? `docs/as-is/business-rules/${repo}/${id}.yaml`
      : `docs/as-is/business-rules/${id}.yaml`;
  }
  const entity = String(doc.entity || "unknown").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return repo
    ? `docs/as-is/state-machines/${repo}/${entity}.yaml`
    : `docs/as-is/state-machines/${entity}.yaml`;
}

export function loadCognitiveIndex(rootDir: string): CognitiveIndex {
  const { indexFile } = cognitivePaths(rootDir);
  if (!existsSync(indexFile)) {
    return {
      version: "1.0",
      updated_at: new Date(0).toISOString(),
      behaviors: [],
      state_machines: [],
      domains: [],
      capability_maps: [],
      business_rules: [],
      unknowns: []
    };
  }
  const doc = parseYamlDocument(read(indexFile));
  return {
    version: String(doc.version || "1.0"),
    updated_at: String(doc.updated_at || new Date(0).toISOString()),
    behaviors: Array.isArray(doc.behaviors) ? (doc.behaviors as unknown as IndexBehaviorEntry[]) : [],
    state_machines: Array.isArray(doc.state_machines) ? (doc.state_machines as unknown as IndexStateMachineEntry[]) : [],
    domains: Array.isArray(doc.domains) ? (doc.domains as unknown as IndexDomainEntry[]) : [],
    capability_maps: Array.isArray(doc.capability_maps) ? (doc.capability_maps as unknown as IndexCapabilityMapEntry[]) : [],
    business_rules: Array.isArray(doc.business_rules) ? (doc.business_rules as unknown as IndexBusinessRuleEntry[]) : [],
    unknowns: Array.isArray(doc.unknowns) ? (doc.unknowns as unknown as CognitiveIndex["unknowns"]) : []
  };
}

export function saveCognitiveIndex(rootDir: string, index: CognitiveIndex): void {
  const { indexFile } = cognitivePaths(rootDir);
  index.updated_at = new Date().toISOString();
  write(indexFile, stringifyYamlDocument(index as unknown as Record<string, import("./yaml-doc.ts").YamlValue>));
}

export function upsertIndexEntry(
  index: CognitiveIndex,
  type: ArtifactType,
  relPath: string,
  doc: Record<string, unknown>
): CognitiveIndex {
  const confidence = parseConfidence(doc.confidence);
  const repo = doc.repo ? String(doc.repo) : undefined;

  if (type === "behavior") {
    const id = String(doc.id);
    // v0.4 — per-repo dedup: the same behavior id from two different repos
    // is two distinct index entries. We key on (id, repo); behavior without
    // a repo (legacy) is treated as the global namespace and still de-duped
    // by id alone.
    index.behaviors = index.behaviors.filter((b) => !(b.id === id && (b.repo || "") === (repo || "")));
    // v0.6 — extract target_repos from structured calls[]. Only object
    // calls with an explicit `target_repo` field contribute. We do not
    // attempt to infer target_repo from a free-form target string.
    let targetRepos: string[] | undefined;
    if (Array.isArray(doc.calls)) {
      const set = new Set<string>();
      for (const c of doc.calls as unknown[]) {
        if (c && typeof c === "object" && !Array.isArray(c)) {
          const co = c as Record<string, unknown>;
          const tr = typeof co.target_repo === "string" ? co.target_repo.trim() : "";
          if (tr) set.add(tr);
        }
      }
      if (set.size > 0) targetRepos = [...set].sort();
    }
    const entry: IndexBehaviorEntry = { id, path: relPath, repo, kind: confidence.kind, level: confidence.level };
    if (targetRepos) entry.target_repos = targetRepos;
    index.behaviors.push(entry);
    if (confidence.kind === "unknown" && doc.reason) {
      index.unknowns = index.unknowns.filter((u) => u.id !== id);
      index.unknowns.push({
        id,
        artifact_type: "behavior",
        reason: String(doc.reason),
        investigation_hint: doc.investigation_hint ? String(doc.investigation_hint) : undefined
      });
    }
  } else if (type === "state-machine") {
    const entity = String(doc.entity);
    // v0.4 — same per-repo dedup rule for state machines.
    index.state_machines = index.state_machines.filter((s) => !(s.entity === entity && (s.repo || "") === (repo || "")));
    index.state_machines.push({ entity, path: relPath, repo, kind: confidence.kind, level: confidence.level });
    if (confidence.kind === "unknown" && doc.reason) {
      index.unknowns = index.unknowns.filter((u) => u.id !== entity);
      index.unknowns.push({
        id: entity,
        artifact_type: "state-machine",
        reason: String(doc.reason),
        investigation_hint: doc.investigation_hint ? String(doc.investigation_hint) : undefined
      });
    }
  } else if (type === "domain") {
    const domain = String(doc.domain);
    // v0.4 — domain: same id across repos is now a single domain if no repo,
    // two domains if they differ by repo. Legacy global domains still
    // dedupe on id alone.
    index.domains = index.domains.filter((d) => !(d.domain === domain && (d.repo || "") === (repo || "")));
    const derived_from = Array.isArray(doc.derived_from)
      ? doc.derived_from.map((x: unknown) => String(x))
      : [];
    index.domains.push({ domain, path: relPath, repo, derived_from });
  } else if (type === "capability-map") {
    const product = String(doc.product);
    const capCount = Array.isArray(doc.capabilities) ? doc.capabilities.length : 0;
    index.capability_maps = index.capability_maps.filter((c) => c.product !== product);
    index.capability_maps.push({ product, path: relPath, capability_count: capCount });
  } else if (type === "business-rule") {
    const id = String(doc.id);
    const kind = optionalString(doc.kind) || "unknown";
    // v0.4 — per-repo dedup for business rules.
    index.business_rules = index.business_rules.filter((b) => !(b.id === id && (b.repo || "") === (repo || "")));
    index.business_rules.push({
      id,
      kind,
      path: relPath,
      repo,
      evidence_kind: confidence.kind,
      evidence_level: confidence.level
    });
  }

  return index;
}

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
