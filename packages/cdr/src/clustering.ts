import { existsSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { CapabilityError } from "@dapei/core/types";
import { validateArtifact } from "@dapei/core/evidence";
import { cognitivePaths, loadCognitiveIndex, saveCognitiveIndex, upsertIndexEntry } from "@dapei/core/cognitive-index";
import { parseYamlDocument, stringifyYamlDocument, type YamlValue } from "@dapei/core/yaml-doc";
import { ensureDir, read, write, listFilesRecursively } from "@dapei/runtime-adapters/system";
import { toKebab, capabilitiesDir, type AnyCap } from "./internal/shared.ts";

// ---------------------------------------------------------------------------
// 15. cdr.domain.suggest — v0.8
//
// Read-only reverse-clustering: cluster the cognitive index's behaviors into
// suggested domain candidates. The engine does NOT touch any domain.yaml
// artifact — that is still the AI's job via `cdr.domain.compose`. The output
// is a YAML report at `docs/as-is/cross-repo/domain-suggestions.yaml` for
// the AI to read, edit, and turn into composed domains.
//
// Edge types considered (in priority order, ties broken by weight):
//   1. shared-events    — both behaviors publish any of the same event names
//   2. shared-writes    — both behaviors write any of the same table names
//   3. cross-repo-calls — A.calls[].target_repo == B.repo (or vice versa)
//   4. business-rule    — some business_rule's applies_to contains both ids
//
// Clusters are connected components of the resulting undirected graph. A
// cluster must satisfy `min_size` and not exceed `max_size` to be reported.
// Clusters over `max_size` are split per-repo to keep them scoped.
//
// Naming heuristic:
//   take the most-frequent event-name subject across the cluster's
//   behaviors (e.g., "order.created" → "order"), prefix with "Cross-Repo:"
//   when members span more than one repo. Always emits a `_reason` line
//   so the AI can see *why* the name was chosen.
//
// Capability does NOT write to the cognitive index and does NOT call
// `cdr.domain.compose`. Pure read + one report file.
// ---------------------------------------------------------------------------

const MIN_CLUSTER_SIZE_DEFAULT = 2;
const MAX_CLUSTER_SIZE_DEFAULT = 50;
const MAX_CLUSTERS_DEFAULT = 8;

interface BehaviorNode {
  readonly key: string;
  readonly id: string;
  readonly repo: string;
  readonly events: string[];
  readonly writes: string[];
  readonly targetRepos: string[];
}

interface Edge {
  readonly a: string;
  readonly b: string;
  readonly type: "shared-events" | "shared-writes" | "cross-repo-calls" | "business-rule";
  readonly weight: number;
  readonly detail: string;
}

function behaviorNodesFromIndex(
  index: ReturnType<typeof loadCognitiveIndex>,
  repoFilter?: string[]
): BehaviorNode[] {
  const allow = repoFilter && repoFilter.length > 0 ? new Set(repoFilter) : undefined;
  const out: BehaviorNode[] = [];
  for (const b of index.behaviors) {
    if (allow && (!b.repo || !allow.has(b.repo))) continue;
    out.push({
      key: `${b.id}@${b.repo || "unknown"}`,
      id: b.id,
      repo: b.repo || "unknown",
      events: b.events || [],
      writes: b.writes || [],
      targetRepos: b.target_repos || []
    });
  }
  return out;
}

function buildBehaviorEdges(nodes: BehaviorNode[], businessRuleEdges: Map<string, string[]>): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const sharedEvents = a.events.filter((e) => b.events.includes(e));
      if (sharedEvents.length > 0) {
        edges.push({
          a: a.key,
          b: b.key,
          type: "shared-events",
          weight: 4,
          detail: `shared event(s): ${sharedEvents.join(", ")}`
        });
      }
      const sharedWrites = a.writes.filter((w) => b.writes.includes(w));
      if (sharedWrites.length > 0) {
        edges.push({
          a: a.key,
          b: b.key,
          type: "shared-writes",
          weight: 3,
          detail: `shared write target(s): ${sharedWrites.join(", ")}`
        });
      }
      const aCallsBRepo = a.targetRepos.includes(b.repo);
      const bCallsARepo = b.targetRepos.includes(a.repo);
      if (aCallsBRepo || bCallsARepo) {
        const direction = aCallsBRepo ? `${a.repo}→${b.repo}` : `${b.repo}→${a.repo}`;
        edges.push({
          a: a.key,
          b: b.key,
          type: "cross-repo-calls",
          weight: 2,
          detail: `cross-repo call: ${direction}`
        });
      }
      const coAppliedRule = businessRuleEdges.get(a.key)?.includes(b.key);
      if (coAppliedRule) {
        edges.push({
          a: a.key,
          b: b.key,
          type: "business-rule",
          weight: 1,
          detail: "co-applied by some business-rule applies_to"
        });
      }
    }
  }
  return edges;
}

function connectedComponents(nodes: BehaviorNode[], edges: Edge[]): BehaviorNode[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x);
    if (!p || p === x) {
      parent.set(x, x);
      return x;
    }
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (x: string, y: string): void => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };
  for (const n of nodes) parent.set(n.key, n.key);
  for (const e of edges) union(e.a, e.b);
  const groups = new Map<string, BehaviorNode[]>();
  for (const n of nodes) {
    const root = find(n.key);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(n);
  }
  return [...groups.values()];
}

function businessRuleCoApplyMap(
  index: ReturnType<typeof loadCognitiveIndex>,
  rootDir: string
): Map<string, string[]> {
  // For each business rule, collect (behavior_id, repo) pairs from
  // applies_to. Then expand to pairwise membership so any two behaviors
  // that appear together in any rule's applies_to are linked.
  const out = new Map<string, Set<string>>();
  const cp = cognitivePaths(rootDir);
  if (!existsSync(cp.businessRulesDir)) return new Map();
  const files = listFilesRecursively(cp.businessRulesDir, [".yaml", ".yml"], 200);
  for (const f of files) {
    if (basename(f).startsWith("_")) continue;
    let doc: Record<string, unknown>;
    try {
      doc = parseYamlDocument(read(f)) as Record<string, unknown>;
    } catch {
      continue;
    }
    const appliesTo = Array.isArray(doc.applies_to) ? doc.applies_to : [];
    const keys: string[] = [];
    for (const a of appliesTo) {
      const id = String(a);
      const matched = index.behaviors.find((b) => b.id === id);
      const key = matched ? `${matched.id}@${matched.repo || "unknown"}` : `${id}@unknown`;
      if (id) keys.push(key);
    }
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];
        if (!out.has(a)) out.set(a, new Set());
        if (!out.has(b)) out.set(b, new Set());
        out.get(a)!.add(b);
        out.get(b)!.add(a);
      }
    }
  }
  const flat = new Map<string, string[]>();
  for (const [k, v] of out.entries()) flat.set(k, [...v]);
  return flat;
}

function suggestClusterName(cluster: BehaviorNode[], edges: Edge[]): { name: string; reason: string } {
  const subjects = new Map<string, number>();
  for (const n of cluster) {
    for (const ev of n.events) {
      const subject = ev.split(/[.:]/)[0].trim();
      if (!subject) continue;
      subjects.set(subject, (subjects.get(subject) || 0) + 1);
    }
  }
  let topSubject = "";
  let topCount = 0;
  for (const [s, c] of subjects.entries()) {
    if (c > topCount || (c === topCount && s.localeCompare(topSubject) < 0)) {
      topSubject = s;
      topCount = c;
    }
  }
  const repos = new Set(cluster.map((n) => n.repo));
  const isCross = repos.size > 1;
  const edgeKinds = new Set(edges.map((e) => e.type));
  const reasons: string[] = [];
  if (topSubject) reasons.push(`most-common event subject: '${topSubject}'`);
  if (isCross) reasons.push(`spans repos: ${[...repos].sort().join(", ")}`);
  if (edgeKinds.has("shared-events")) reasons.push("behaviors share event names");
  if (edgeKinds.has("cross-repo-calls")) reasons.push("cross-repo calls");
  if (edgeKinds.has("shared-writes")) reasons.push("behaviors write the same tables");
  if (edgeKinds.has("business-rule")) reasons.push("linked by business-rule applies_to");

  const prefix = isCross ? "Cross-Repo: " : "";
  const cap = topSubject ? topSubject.charAt(0).toUpperCase() + topSubject.slice(1) : "Cluster";
  return { name: `${prefix}${cap}`, reason: reasons.join("; ") || "no edge evidence recorded" };
}

function clusterConfidence(cluster: BehaviorNode[], edges: Edge[]): "high" | "medium" | "low" {
  const repos = new Set(cluster.map((n) => n.repo));
  const isCross = repos.size > 1;
  const edgeKinds = new Set(edges.map((e) => e.type));
  if (edgeKinds.has("shared-events") && isCross) return "high";
  if (edgeKinds.has("shared-events") || edgeKinds.has("shared-writes")) return "medium";
  return "low";
}

function splitClusterByRepo(cluster: BehaviorNode[]): BehaviorNode[][] {
  const byRepo = new Map<string, BehaviorNode[]>();
  for (const n of cluster) {
    if (!byRepo.has(n.repo)) byRepo.set(n.repo, []);
    byRepo.get(n.repo)!.push(n);
  }
  return [...byRepo.values()];
}

export const cdrDomainSuggest: AnyCap = {
  id: "cdr.domain.suggest",
  version: "1.0.0",
  inputSchema: {
    properties: {
      repos: { type: "array" },
      min_size: { type: "number" },
      max_size: { type: "number" },
      max_clusters: { type: "number" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const index = loadCognitiveIndex(ctx.rootDir);
    const repoFilter = Array.isArray(input.repos) ? (input.repos as unknown[]).map((r) => String(r)) : undefined;
    const minSize = typeof input.min_size === "number" ? Number(input.min_size) : MIN_CLUSTER_SIZE_DEFAULT;
    const maxSize = typeof input.max_size === "number" ? Number(input.max_size) : MAX_CLUSTER_SIZE_DEFAULT;
    const maxClusters = typeof input.max_clusters === "number" ? Number(input.max_clusters) : MAX_CLUSTERS_DEFAULT;

    const nodes = behaviorNodesFromIndex(index, repoFilter);
    const coApply = businessRuleCoApplyMap(index, ctx.rootDir);
    const edges = buildBehaviorEdges(nodes, coApply);
    const rawClusters = connectedComponents(nodes, edges);

    const filtered: BehaviorNode[][] = [];
    const oversizedSplit: BehaviorNode[][] = [];
    for (const c of rawClusters) {
      if (c.length < minSize) continue;
      if (c.length > maxSize) {
        for (const sub of splitClusterByRepo(c)) {
          if (sub.length >= minSize) oversizedSplit.push(sub);
        }
      } else {
        filtered.push(c);
      }
    }
    filtered.sort((a, b) => b.length - a.length);
    const top = filtered.slice(0, maxClusters);

    const reportClusters = top.map((cluster) => {
      const clusterEdges = edges.filter((e) => cluster.some((n) => n.key === e.a) && cluster.some((n) => n.key === e.b));
      const evidenceTypes = new Set(clusterEdges.map((e) => e.type));
      const { name, reason } = suggestClusterName(cluster, clusterEdges);
      const confidence = clusterConfidence(cluster, clusterEdges);
      const repos = [...new Set(cluster.map((n) => n.repo))].sort();
      const behaviorKeys = cluster.map((n) => n.key).sort();
      const evidence: Array<{ type: string; detail: string; behaviors?: string[]; rules?: string[] }> = [];
      if (evidenceTypes.has("shared-events")) {
        const eventToKeys = new Map<string, string[]>();
        for (const n of cluster) {
          for (const ev of n.events) {
            if (!eventToKeys.has(ev)) eventToKeys.set(ev, []);
            eventToKeys.get(ev)!.push(n.key);
          }
        }
        for (const [ev, keys] of [...eventToKeys.entries()].sort()) {
          if (keys.length >= 2) evidence.push({ type: "shared-events", detail: ev, behaviors: keys });
        }
      }
      if (evidenceTypes.has("cross-repo-calls")) {
        for (const e of clusterEdges.filter((e) => e.type === "cross-repo-calls")) {
          evidence.push({ type: "cross-repo-calls", detail: e.detail, behaviors: [e.a, e.b] });
        }
      }
      if (evidenceTypes.has("shared-writes")) {
        const wToKeys = new Map<string, string[]>();
        for (const n of cluster) {
          for (const w of n.writes) {
            if (!wToKeys.has(w)) wToKeys.set(w, []);
            wToKeys.get(w)!.push(n.key);
          }
        }
        for (const [w, keys] of [...wToKeys.entries()].sort()) {
          if (keys.length >= 2) evidence.push({ type: "shared-writes", detail: w, behaviors: keys });
        }
      }
      if (evidenceTypes.has("business-rule")) {
        evidence.push({ type: "business-rule", detail: "co-applied by business rules" });
      }
      return {
        suggested_name: name,
        suggested_domain_slug: toKebab(name),
        naming_reason: reason,
        confidence,
        behavior_keys: behaviorKeys,
        repos,
        evidence,
        size: cluster.length
      };
    });

    const productName = readProductName(ctx.rootDir);

    const outDoc: Record<string, YamlValue> = {
      generated_at: ctx.now.toISOString(),
      product: productName,
      algorithm_version: "1.0.0",
      parameters: {
        repos: repoFilter || [],
        min_size: minSize,
        max_size: maxSize,
        max_clusters: maxClusters
      },
      behavior_count: nodes.length,
      edge_count: edges.length,
      raw_cluster_count: rawClusters.length,
      reported_cluster_count: reportClusters.length,
      clusters: reportClusters as unknown as YamlValue,
      note:
        "These are SUGGESTIONS, not committed domains. To turn a cluster into a real domain, the AI reviews it, picks a stable name, and calls `cdr.domain.compose` with the cluster's behavior keys as `behaviors[]`. The suggestion file is overwritten on each `cdr.domain.suggest` call; composed domains under `docs/as-is/domains/` are never touched."
    };

    const outDir = join(ctx.rootDir, "docs", "as-is", "cross-repo");
    ensureDir(outDir);
    const outFile = join(outDir, "domain-suggestions.yaml");
    const content = stringifyYamlDocument(outDoc);
    write(outFile, content.endsWith("\n") ? content : `${content}\n`);

    return {
      ok: true,
      data: {
        path: relative(ctx.rootDir, outFile),
        behavior_count: nodes.length,
        edge_count: edges.length,
        raw_cluster_count: rawClusters.length,
        reported_cluster_count: reportClusters.length,
        clusters: reportClusters
      },
      sideEffects: [`domain-suggestions written: ${relative(ctx.rootDir, outFile)}`],
      reportFragments: [
        `cdr.domain.suggest: ${reportClusters.length} cluster(s) reported from ${nodes.length} behavior(s) (${edges.length} edge(s))`,
        `${rawClusters.length - reportClusters.length} cluster(s) dropped (below min_size or capped)`
      ]
    };
  }
};

function readProductName(rootDir: string): string {
  const wsFile = join(rootDir, ".dapei", "workspace.yaml");
  if (existsSync(wsFile)) {
    try {
      const doc = parseYamlDocument(read(wsFile));
      const ws = doc.workspace as Record<string, unknown> | undefined;
      if (ws && typeof ws.name === "string") return String(ws.name);
    } catch {
      // ignore — fall back to directory name below
    }
  }
  return basename(rootDir);
}

// ---------------------------------------------------------------------------
// 16. cdr.capability.map.synth — v0.8
//
// Engine-driven clustering of *domains* into a capability map. Distinct
// from v0.3 `cdr.capability.map.init` (which is a thin pass-through of
// capabilities the AI hands it). The synth variant:
//
//   1. collects domains from one of three sources, in priority order:
//      a) input.manual_domains[]  (the AI pre-staged a curated list)
//      b) docs/as-is/domains/**/*.yaml (composed via cdr.domain.compose)
//      c) docs/as-is/cross-repo/domain-suggestions.yaml (from
//         cdr.domain.suggest) — only when use_suggested_domains=true
//   2. for each domain, resolves its derived_from[] behaviors back to
//      the cognitive index to compute spans_repos[], behavior_count,
//      and the fact_ratio (fraction of behaviors with kind=fact).
//   3. emits docs/as-is/capabilities/product-map.yaml — the same file
//      cdr.capability.map.init writes, but with each capability
//      carrying the engine-computed spans_repos and fact_ratio so the
//      AI has objective metrics to grade its L1 hypothesis on.
//
// If the AI passes both manual_domains[] and the workspace has composed
// domains, the manual list wins for those domain names. Conflicting
// entries on either side are kept, never silently merged.
//
// Output schema is a strict superset of the v0.3 schema. Existing
// capability-map consumers (doc-gen, cdr.doc.generate) keep working
// because the v0.3 fields are unchanged.
// ---------------------------------------------------------------------------

interface ResolvedDomain {
  readonly name: string;
  readonly description: string;
  readonly behavior_ids: string[];
  readonly repos: string[];
  readonly behavior_count: number;
  readonly fact_ratio: number;
  readonly source: "manual" | "composed" | "suggested";
}

function resolveBehaviorRepos(
  index: ReturnType<typeof loadCognitiveIndex>,
  behaviorIds: string[]
): { repos: string[]; behaviorCount: number; factRatio: number } {
  const repos = new Set<string>();
  let fact = 0;
  let total = 0;
  for (const id of behaviorIds) {
    const matched = index.behaviors.find((b) => b.id === id);
    if (!matched) continue;
    if (matched.repo) repos.add(matched.repo);
    total++;
    if (matched.kind === "fact") fact++;
  }
  const factRatio = total > 0 ? fact / total : 0;
  return { repos: [...repos].sort(), behaviorCount: total, factRatio };
}

function loadComposedDomains(
  ctxRootDir: string,
  cp: ReturnType<typeof cognitivePaths>
): ResolvedDomain[] {
  if (!existsSync(cp.domainDir)) return [];
  const out: ResolvedDomain[] = [];
  const files = listFilesRecursively(cp.domainDir, [".yaml", ".yml"], 200);
  for (const f of files) {
    if (basename(f).startsWith("_")) continue;
    let doc: Record<string, unknown>;
    try {
      doc = parseYamlDocument(read(f)) as Record<string, unknown>;
    } catch {
      continue;
    }
    // v0.8 — domain YAML carries `domain` (kebab slug, used for the
    // filesystem name) and `name` (the human label). When looking up
    // a domain from a capability's domains[] list, the AI writes the
    // human label ("Order"), not the slug. Prefer `name` so the
    // back-fill metrics step actually finds the composed domain.
    const name = String(doc.name || doc.domain || basename(f, ".yaml"));
    if (!name) continue;
    const behaviorIds = Array.isArray(doc.derived_from)
      ? (doc.derived_from as unknown[]).map((x) => String(x))
      : [];
    out.push({
      name,
      description: String(doc.description || ""),
      behavior_ids: behaviorIds,
      repos: [],
      behavior_count: behaviorIds.length,
      fact_ratio: 0,
      source: "composed"
    });
  }
  return out;
}

function loadSuggestedDomains(
  ctxRootDir: string,
  cp: ReturnType<typeof cognitivePaths>
): ResolvedDomain[] {
  const file = join(cp.docsDir, "as-is", "cross-repo", "domain-suggestions.yaml");
  if (!existsSync(file)) return [];
  let doc: Record<string, unknown>;
  try {
    doc = parseYamlDocument(read(file)) as Record<string, unknown>;
  } catch {
    return [];
  }
  const clusters = Array.isArray(doc.clusters) ? doc.clusters : [];
  const out: ResolvedDomain[] = [];
  for (const c of clusters) {
    const co = c as Record<string, unknown>;
    const keys = Array.isArray(co.behavior_keys) ? (co.behavior_keys as unknown[]).map((x) => String(x)) : [];
    out.push({
      name: String(co.suggested_name || co.suggested_domain_slug || "Cluster"),
      description: `Suggested from cluster: ${String(co.naming_reason || "(no reason recorded)")}`,
      behavior_ids: keys,
      repos: Array.isArray(co.repos) ? (co.repos as unknown[]).map((x) => String(x)) : [],
      behavior_count: keys.length,
      fact_ratio: 0,
      source: "suggested"
    });
  }
  return out;
}

function mergeDomainSources(
  manual: ResolvedDomain[],
  composed: ResolvedDomain[],
  suggested: ResolvedDomain[]
): ResolvedDomain[] {
  const byName = new Map<string, ResolvedDomain>();
  for (const d of manual) byName.set(d.name, d);
  for (const d of composed) if (!byName.has(d.name)) byName.set(d.name, d);
  for (const d of suggested) if (!byName.has(d.name)) byName.set(d.name, d);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function validateCapabilityId(id: string): { ok: boolean; error?: string } {
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i.test(id)) {
    return { ok: false, error: `capability id '${id}' must be lowercase, multi-segment (e.g., 'core.checkout'), no underscores` };
  }
  return { ok: true };
}

export const cdrCapabilityMapSynth: AnyCap = {
  id: "cdr.capability.map.synth",
  version: "1.0.0",
  inputSchema: {
    required: ["product"],
    properties: {
      product: { type: "string", minLength: 1 },
      capabilities: { type: "array" },
      manual_domains: { type: "array" },
      use_suggested_domains: { type: "boolean" },
      include_cross_repo_rules: { type: "boolean" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const product = String(input.product);
    const manualCapabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
    const manualDomains = Array.isArray(input.manual_domains) ? input.manual_domains : [];
    const useSuggested = input.use_suggested_domains === true;

    const cp = cognitivePaths(ctx.rootDir);
    const index = loadCognitiveIndex(ctx.rootDir);

    const manualDomainEntries: ResolvedDomain[] = manualDomains.map((raw: unknown) => {
      const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      return {
        name: String(m.name || m.domain || ""),
        description: String(m.description || ""),
        behavior_ids: Array.isArray(m.behavior_ids)
          ? (m.behavior_ids as unknown[]).map((x) => String(x))
          : [],
        repos: [],
        behavior_count: 0,
        fact_ratio: 0,
        source: "manual"
      };
    }).filter((d: ResolvedDomain) => d.name);

    const composed = loadComposedDomains(ctx.rootDir, cp);
    const suggested = useSuggested ? loadSuggestedDomains(ctx.rootDir, cp) : [];
    const domains = mergeDomainSources(manualDomainEntries, composed, suggested);

    const domainByName = new Map<string, ResolvedDomain>();
    for (const d of domains) {
      const stats = resolveBehaviorRepos(index, d.behavior_ids);
      domainByName.set(d.name, {
        ...d,
        repos: stats.repos,
        behavior_count: stats.behaviorCount,
        fact_ratio: stats.factRatio
      });
    }

    const capabilities: Array<Record<string, YamlValue>> = [];
    const errors: string[] = [];

    if (manualCapabilities.length === 0) {
      // Synthesize one capability per domain. The id follows the
      // `<surface>.<noun>` convention used elsewhere (matches the v0.5
      // regex: lowercase, multi-segment, no underscores).
      for (const d of domainByName.values()) {
        const id = `domain.${toKebab(d.name)}`;
        capabilities.push({
          id,
          name: d.name,
          description: d.description || `Capability synthesized from domain '${d.name}'`,
          domains: [d.name] as unknown as YamlValue,
          spans_repos: d.repos as unknown as YamlValue,
          behavior_count: d.behavior_count,
          fact_ratio: Number(d.fact_ratio.toFixed(2)),
          source: d.source
        });
      }
    } else {
      // AI handed us curated capabilities. We validate each id and
      // back-fill spans_repos / behavior_count / fact_ratio by
      // unioning the metrics across the capability's named domains.
      for (const raw of manualCapabilities) {
        const cap = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
        const id = String(cap.id || "");
        const idCheck = validateCapabilityId(id);
        if (!idCheck.ok) {
          errors.push(idCheck.error || `invalid capability id: ${id}`);
          continue;
        }
        const domainNames = Array.isArray(cap.domains)
          ? (cap.domains as unknown[]).map((x) => String(x))
          : [];
        const matchedDomains = domainNames
          .map((n) => domainByName.get(n))
          .filter((d): d is ResolvedDomain => !!d);
        const repos = new Set<string>();
        let totalBehaviors = 0;
        let factCount = 0;
        const behaviorSet = new Set<string>();
        for (const d of matchedDomains) {
          for (const r of d.repos) repos.add(r);
          for (const b of d.behavior_ids) {
            if (!behaviorSet.has(b)) {
              behaviorSet.add(b);
              const m = index.behaviors.find((bb) => bb.id === b);
              if (m) {
                totalBehaviors++;
                if (m.kind === "fact") factCount++;
              }
            }
          }
        }
        const factRatio = totalBehaviors > 0 ? factCount / totalBehaviors : 0;
        capabilities.push({
          id,
          name: String(cap.name || id),
          description: String(cap.description || ""),
          domains: domainNames as unknown as YamlValue,
          spans_repos: [...repos].sort() as unknown as YamlValue,
          behavior_count: totalBehaviors,
          fact_ratio: Number(factRatio.toFixed(2)),
          source: "manual"
        });
      }
    }

    if (errors.length > 0) {
      throw new CapabilityError("INVALID_INPUT", errors.join("; "));
    }

    const outDir = capabilitiesDir(ctx.rootDir);
    ensureDir(outDir);
    const outFile = join(outDir, "product-map.yaml");

    // v0.8 — empty workspace is a legitimate state (no domains yet, AI
    // hasn't composed anything). Write the header so the AI can see the
    // product name and "no domains yet" status, but skip the strict
    // artifact validator which requires a non-empty capabilities[]. The
    // shape on disk is a deliberate superset that the doc-gen portal
    // can render as "L1 not yet synthesized".
    if (capabilities.length === 0) {
      const emptyDoc: Record<string, YamlValue> = {
        product,
        generated_at: ctx.now.toISOString(),
        synthesized_by: "cdr.capability.map.synth@1.0.0",
        status: "empty",
        message: "no domains composed yet — run cdr.domain.compose (or cdr.domain.suggest) before cdr.capability.map.synth",
        capabilities: [] as unknown as YamlValue
      };
      write(outFile, stringifyYamlDocument(emptyDoc));
      return {
        ok: true,
        data: {
          product,
          path: relative(ctx.rootDir, outFile),
          capability_count: 0,
          domain_count: domainByName.size,
          domain_sources: {
            manual: manualDomainEntries.length,
            composed: composed.length,
            suggested: suggested.length
          },
          capabilities: []
        },
        sideEffects: [`empty capability map written: ${relative(ctx.rootDir, outFile)}`],
        reportFragments: [
          `cdr.capability.map.synth: 0 capability(s) — no domains available for '${product}'`,
          "run cdr.domain.compose or cdr.domain.suggest to seed domains first"
        ]
      };
    }

    const mapDoc: Record<string, YamlValue> = {
      product,
      generated_at: ctx.now.toISOString(),
      synthesized_by: "cdr.capability.map.synth@1.0.0",
      capabilities: capabilities as unknown as YamlValue
    };

    const validationErrors = validateArtifact("capability-map", mapDoc as Record<string, unknown>);
    if (validationErrors.length) {
      throw new CapabilityError("INVALID_ARTIFACT", validationErrors.join("; "));
    }

    write(outFile, stringifyYamlDocument(mapDoc));

    const updatedIndex = loadCognitiveIndex(ctx.rootDir);
    upsertIndexEntry(updatedIndex, "capability-map", relative(ctx.rootDir, outFile), mapDoc as Record<string, unknown>);
    saveCognitiveIndex(ctx.rootDir, index);

    return {
      ok: true,
      data: {
        product,
        path: relative(ctx.rootDir, outFile),
        capability_count: capabilities.length,
        domain_count: domainByName.size,
        domain_sources: {
          manual: manualDomainEntries.length,
          composed: composed.length,
          suggested: suggested.length
        },
        capabilities
      },
      sideEffects: [`capability map synthesized: ${relative(ctx.rootDir, outFile)}`],
      reportFragments: [
        `cdr.capability.map.synth: ${capabilities.length} capability(s) from ${domainByName.size} domain(s) for '${product}'`,
        `domain sources — manual: ${manualDomainEntries.length}, composed: ${composed.length}, suggested: ${suggested.length}`
      ]
    };
  }
};
