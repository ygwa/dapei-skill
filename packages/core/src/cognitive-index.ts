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
  /**
   * v0.8 — event names this behavior emits (from `events[]` on the
   * behavior YAML). The reverse-cluster pipeline uses these to find
   * behaviors that share the same event names as cross-repo signals.
   * Optional; pre-v0.8 entries without the field keep working.
   */
  events?: string[];
  /**
   * v0.8 — table / collection names this behavior writes (from
   * `writes[]` on the behavior YAML). Used as a secondary
   * reverse-cluster signal when events are missing.
   * Optional.
   */
  writes?: string[];
  /**
   * v0.10 — feature that produced this asset. Set by
   * `cdr.feature.link` (or `feature.close` which calls it on the
   * way out). Drives the `cdr.query` `created_by_feature` filter
   * and the closeout backfill to `docs/decisions/<feature>.md`.
   * Optional; pre-v0.10 entries without the field keep working
   * (the query filter yields empty rather than error).
   */
  created_by_feature?: string;
  updated_by_feature?: string;
  created_at?: string;
  updated_at?: string;
}

export interface IndexStateMachineEntry extends StaleFields {
  entity: string;
  path: string;
  repo?: string;
  kind: string;
  level: string;
  created_by_feature?: string;
  updated_by_feature?: string;
  created_at?: string;
  updated_at?: string;
}

export interface IndexDomainEntry extends StaleFields {
  domain: string;
  path: string;
  repo?: string;
  derived_from: string[];
  created_by_feature?: string;
  updated_by_feature?: string;
  created_at?: string;
  updated_at?: string;
}

export interface IndexCapabilityMapEntry extends StaleFields {
  product: string;
  path: string;
  capability_count: number;
  created_by_feature?: string;
  updated_by_feature?: string;
  created_at?: string;
  updated_at?: string;
}

export interface IndexBusinessRuleEntry extends StaleFields {
  id: string;
  kind: string;
  path: string;
  repo?: string;
  evidence_kind: string;
  evidence_level: string;
  created_by_feature?: string;
  updated_by_feature?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RepoSnapshot {
  repo: string;
  commit_hash: string;
  committed_at: string;
  analyzed_at: string;
  /** Maps source file relpath → last commit hash when artifact was validated */
  source_snapshots: Record<string, string>;
}

export interface StaleSource {
  file: string;
  /** Commit hash when this source was last valid in the artifact */
  last_valid_commit: string;
  /** Current commit hash of the file (if different) */
  current_commit?: string;
  reason: "file_changed" | "file_deleted" | "line_out_of_range" | "new_commits";
}

export interface StaleAsset {
  id: string;
  artifact_type: "behavior" | "state-machine" | "domain" | "business-rule";
  path: string;
  repo?: string;
  stale_sources: StaleSource[];
  checked_at: string;
  /** If true, the artifact has been manually confirmed despite staleness */
  acknowledged?: boolean;
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
  /** Per-repo snapshots used for stale detection */
  repo_snapshots: RepoSnapshot[];
  /** Assets whose sources have changed since last analysis */
  stale_assets: StaleAsset[];
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
      unknowns: [],
      repo_snapshots: [],
      stale_assets: []
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
    unknowns: Array.isArray(doc.unknowns) ? (doc.unknowns as unknown as CognitiveIndex["unknowns"]) : [],
    repo_snapshots: Array.isArray(doc.repo_snapshots) ? (doc.repo_snapshots as unknown as RepoSnapshot[]) : [],
    stale_assets: Array.isArray(doc.stale_assets) ? (doc.stale_assets as unknown as StaleAsset[]) : []
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
  // v0.8 — capability-map artifacts do not carry a confidence block
  // (their validity is decided by the engine from product+capabilities),
  // so skip parseConfidence for that type. All other artifact types
  // (behavior, state-machine, domain, business-rule) still require it.
  const confidence = type === "capability-map"
    ? { level: "unknown" as const, kind: "unknown" as const }
    : parseConfidence(doc.confidence);
  const repo = doc.repo ? String(doc.repo) : undefined;
  // v0.10 — lift provenance fields from the artifact doc onto the
  // index entry. The capability layer applies `applyProvenance` to the
  // doc before calling `upsertIndexEntry`; we just propagate the four
  // fields so the index stays in sync with the artifact file.
  const createdByFeature = typeof doc.created_by_feature === "string" && doc.created_by_feature.trim()
    ? doc.created_by_feature.trim()
    : undefined;
  const updatedByFeature = typeof doc.updated_by_feature === "string" && doc.updated_by_feature.trim()
    ? doc.updated_by_feature.trim()
    : undefined;
  const createdAt = typeof doc.created_at === "string" && doc.created_at.trim()
    ? doc.created_at.trim()
    : undefined;
  const updatedAt = typeof doc.updated_at === "string" && doc.updated_at.trim()
    ? doc.updated_at.trim()
    : undefined;

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
    // v0.8 — extract events[] and writes[] straight from the behavior doc.
    // Both fields are simple string arrays. Sorting keeps the index diff
    // stable across calls that pass the same content in different order.
    let events: string[] | undefined;
    if (Array.isArray(doc.events)) {
      const evs = (doc.events as unknown[])
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((x) => x.length > 0);
      if (evs.length > 0) events = [...new Set(evs)].sort();
    }
    let writes: string[] | undefined;
    if (Array.isArray(doc.writes)) {
      // writes[] entries are { table?, target?, ... } — we project to the
      // resource name (table or target) because that is the field
      // reverse-cluster uses to match behaviors that touch the same store.
      const ws = (doc.writes as unknown[])
        .map((x) => {
          if (typeof x === "string") return x.trim();
          if (x && typeof x === "object") {
            const o = x as Record<string, unknown>;
            const t = typeof o.table === "string" ? o.table.trim() : "";
            const g = typeof o.target === "string" ? o.target.trim() : "";
            return t || g;
          }
          return "";
        })
        .filter((x) => x.length > 0);
      if (ws.length > 0) writes = [...new Set(ws)].sort();
    }
    const entry: IndexBehaviorEntry = { id, path: relPath, repo, kind: confidence.kind, level: confidence.level };
    if (targetRepos) entry.target_repos = targetRepos;
    if (events) entry.events = events;
    if (writes) entry.writes = writes;
    if (createdByFeature) entry.created_by_feature = createdByFeature;
    if (updatedByFeature) entry.updated_by_feature = updatedByFeature;
    if (createdAt) entry.created_at = createdAt;
    if (updatedAt) entry.updated_at = updatedAt;
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
    const smEntry: IndexStateMachineEntry = { entity, path: relPath, repo, kind: confidence.kind, level: confidence.level };
    if (createdByFeature) smEntry.created_by_feature = createdByFeature;
    if (updatedByFeature) smEntry.updated_by_feature = updatedByFeature;
    if (createdAt) smEntry.created_at = createdAt;
    if (updatedAt) smEntry.updated_at = updatedAt;
    index.state_machines.push(smEntry);
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
    const domainEntry: IndexDomainEntry = { domain, path: relPath, repo, derived_from };
    if (createdByFeature) domainEntry.created_by_feature = createdByFeature;
    if (updatedByFeature) domainEntry.updated_by_feature = updatedByFeature;
    if (createdAt) domainEntry.created_at = createdAt;
    if (updatedAt) domainEntry.updated_at = updatedAt;
    index.domains.push(domainEntry);
  } else if (type === "capability-map") {
    const product = String(doc.product);
    const capCount = Array.isArray(doc.capabilities) ? doc.capabilities.length : 0;
    index.capability_maps = index.capability_maps.filter((c) => c.product !== product);
    const capEntry: IndexCapabilityMapEntry = { product, path: relPath, capability_count: capCount };
    if (createdByFeature) capEntry.created_by_feature = createdByFeature;
    if (updatedByFeature) capEntry.updated_by_feature = updatedByFeature;
    if (createdAt) capEntry.created_at = createdAt;
    if (updatedAt) capEntry.updated_at = updatedAt;
    index.capability_maps.push(capEntry);
  } else if (type === "business-rule") {
    const id = String(doc.id);
    const kind = optionalString(doc.kind) || "unknown";
    // v0.4 — per-repo dedup for business rules.
    index.business_rules = index.business_rules.filter((b) => !(b.id === id && (b.repo || "") === (repo || "")));
    const ruleEntry: IndexBusinessRuleEntry = {
      id,
      kind,
      path: relPath,
      repo,
      evidence_kind: confidence.kind,
      evidence_level: confidence.level
    };
    if (createdByFeature) ruleEntry.created_by_feature = createdByFeature;
    if (updatedByFeature) ruleEntry.updated_by_feature = updatedByFeature;
    if (createdAt) ruleEntry.created_at = createdAt;
    if (updatedAt) ruleEntry.updated_at = updatedAt;
    index.business_rules.push(ruleEntry);
  }

  return index;
}

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function getRepoSnapshot(index: CognitiveIndex, repo: string): RepoSnapshot | undefined {
  return index.repo_snapshots.find((s) => s.repo === repo);
}

export function upsertRepoSnapshot(index: CognitiveIndex, snapshot: RepoSnapshot): CognitiveIndex {
  index.repo_snapshots = index.repo_snapshots.filter((s) => s.repo !== snapshot.repo);
  index.repo_snapshots.push(snapshot);
  return index;
}

export function markAssetStale(index: CognitiveIndex, asset: StaleAsset): CognitiveIndex {
  index.stale_assets = index.stale_assets.filter((a) => !(a.id === asset.id && (a.repo || "") === (asset.repo || "")));
  index.stale_assets.push(asset);
  return index;
}

export function clearAssetStale(index: CognitiveIndex, assetId: string): CognitiveIndex {
  index.stale_assets = index.stale_assets.filter((a) => a.id !== assetId);
  return index;
}
