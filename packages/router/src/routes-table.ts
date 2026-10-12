// Data-driven route table.
//
// Each entry is a Route record with:
//   - id: stable identifier for diagnostics and conflict detection
//   - capability: the engine capability to invoke
//   - pattern: regex matched against the raw intent (case-insensitive)
//   - inputBuilder: pure function (intent, ctx) -> RouteInput
//   - reason: human-readable explanation
//   - confidence: numeric priority 0..1; higher wins on overlap
//   - tags: short labels used by the conflict detector and by tooling
//   - priority: integer tie-breaker used when two routes match the same
//     intent with equal confidence. Lower priority number wins. This
//     replaces the old "route declaration order matters" coupling —
//     previously the array order was load-bearing; now it is explicit.
//
// Bug fixes versus the monolithic index.ts:
//   1. The Chinese `cdr.profile` regex used `.*?(?:repo|仓库|项目|repos?)?`
//      which, on input `分析 repo sample-app`, captured the literal `repo`
//      instead of `sample-app`. The fix is to drop the optional keyword
//      group and require the trailing repo-name token directly.
//   2. The Chinese `cdr.crossrepo.doc.generate` route was declared AFTER
//      `cdr.doc.generate` Chinese, so `生成跨仓库门户` got swallowed by the
//      broader `生成 ... 文档门户` pattern. Reordered: the cross-repo route
//      now appears first so the more-specific pattern wins on equal
//      confidence.

import {
  extractFeatureName,
  extractName,
  extractUrl,
  extractTarget,
  extractRepos,
  extractObjective,
  extractStage,
  extractRepoFromBehavior,
  extractCdrRepoName,
  extractCdrEntryId,
  extractCdrEntityName,
  extractCdrDomainName,
  extractCdrProductName,
  extractCdrDescription
} from "./extractors.ts";

/**
 * First capture group of `re` in `t`, or `""` when it does not match.
 * Used by the route-authority routes below, whose argument follows a
 * sub-command keyword (`feature tasks my-feature list` → `my-feature`).
 */
function capture(t: string, re: RegExp): string {
  const m = t.match(re);
  return (m && m[1]) || "";
}

/**
 * Map the noun of a `context envelope` intent onto the target enum of
 * cdr.context.envelope. Returns `""` when the intent names no artifact
 * kind, so the route never invents a target the user did not ask for.
 */
function detectEnvelopeTarget(t: string): string {
  if (/\bstate[\s-]?machines?\b/i.test(t) || /状态机/.test(t)) return "state-machine";
  if (/\bdomains?\b/i.test(t) || /领域/.test(t)) return "domain";
  if (/\b(?:business[\s-]?rules?|rules?)\b/i.test(t) || /业务规则/.test(t)) return "business-rule";
  if (/\bentr(?:y|ies)\b/i.test(t) || /入口/.test(t)) return "entry";
  if (/\bcapability[\s-]?maps?\b/i.test(t) || /能力地图/.test(t)) return "capability-map";
  if (/\bbehaviors?\b/i.test(t) || /行为/.test(t)) return "behavior";
  return "";
}

/**
 * Values a route may attach to the routed capability input. Capability
 * schemas use string, number and boolean scalars (e.g. feature.accept
 * `confirmed: boolean`, feature.gap.analysis `max_envelopes: number`,
 * repos.remove `force: boolean`), so the route table produces all three.
 */
export type RouteInput = Record<string, string | number | boolean>;

/**
 * Feature name for intents phrased as `<verb> ... for <feature>`: prefers an
 * explicit `--feature X`, then the `for X` argument (skipping the literal
 * word `feature`, as in `drift for feature payment-refactor`), and only then
 * falls back to the generic extractFeatureName heuristic — which would
 * otherwise answer `architecture` for `architecture drift for X`.
 */
function extractFeatureRef(t: string): string {
  return (
    capture(t, /--feature[=\s]+([a-zA-Z0-9_-]+)/i) ||
    capture(t, /\b(?:for|of)\s+(?!feature\b)([a-zA-Z0-9_-]+)/i) ||
    extractFeatureName(t)
  );
}

export interface Route {
  id: string;
  capability: string;
  pattern: RegExp;
  inputBuilder: (t: string, ctx: Record<string, string>) => RouteInput;
  reason: string;
  confidence: number;
  tags: string[];
  /** Integer tie-breaker. Lower wins when confidence ties. Default 100. */
  priority?: number;
}

export const routes: Route[] = [
  {
    id: "workspace.init.english",
    capability: "workspace.init",
    pattern: /^(?=.*(?:^|\s)(?:init|initialize)\b)(?=.*\bworkspace\b).*/i,
    inputBuilder: () => ({}),
    reason: "workspace init intent",
    confidence: 0.95,
    tags: ["workspace"],
    priority: 100
  },
  {
    id: "repos.add.english",
    capability: "repos.add",
    pattern: /^(?=.*(?<!-)\brepos?\b)(?=.*\badd\b).*/i,
    inputBuilder: (t, ctx) => ({ name: ctx.name || extractName(t), url: ctx.url || extractUrl(t) }),
    reason: "repo add intent",
    confidence: 0.9,
    tags: ["repos"],
    priority: 100
  },
  {
    id: "cognitive.discover.english",
    capability: "cognitive.discover",
    pattern: /^(?=.*\bbehaviors?\b)(?=.*\b(?:analyze|discover)\b).*/i,
    inputBuilder: (t, ctx) => ({ target: ctx.target || extractRepoFromBehavior(t) || "--all" }),
    reason: "cognitive behavior discover intent (Agent reads code)",
    confidence: 0.92,
    tags: ["cognitive"],
    priority: 100
  },
  {
    id: "cognitive.artifact.list.english",
    capability: "cognitive.artifact.list",
    pattern: /^(?=.*\bbehaviors?\b)(?=.*\blist\b).*/i,
    inputBuilder: (t, ctx) => ({ repo: ctx.repo || extractRepoFromBehavior(t) }),
    reason: "cognitive artifact list intent",
    confidence: 0.9,
    tags: ["cognitive"],
    priority: 100
  },
  // === CDR (Cognitive Discovery Runtime) routes ===
  {
    id: "cdr.profile.english",
    capability: "cdr.profile",
    // `(?<!-)` keeps the `--auto-profile` flag of `repos add` out of this
    // route: `@dapei repos add x --auto-profile` is a repos.add intent, and
    // both patterns used to match it at 0.9 with this one winning by
    // declaration order.
    pattern: /^(?=.*(?<!-)\bprofile\b).*/i,
    inputBuilder: (t, ctx) => ({ repo: ctx.repo || extractCdrRepoName(t) || "" }),
    reason: "cdr profile repo intent",
    confidence: 0.9,
    tags: ["cdr", "profile"],
    priority: 100
  },
  {
    id: "cdr.entries.prepare.english",
    capability: "cdr.entries.prepare",
    pattern: /^(?=.*\bdiscover\b)(?=.*\bentries?\b).*/i,
    inputBuilder: (t, ctx) => ({ repo: ctx.repo || extractCdrRepoName(t) || "" }),
    reason: "cdr entries prepare intent",
    confidence: 0.93,
    tags: ["cdr", "entries"],
    priority: 100
  },
  {
    id: "cdr.entries.confirm.english",
    capability: "cdr.entries.confirm",
    pattern: /^(?=.*\bconfirm\b)(?=.*\bentry\b).*/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || "",
      entry_id: ctx.entry_id || extractCdrEntryId(t) || ""
    }),
    reason: "cdr entries confirm intent",
    confidence: 0.92,
    tags: ["cdr", "entries"],
    priority: 100
  },
  {
    id: "cognitive.state.suggest.english",
    capability: "cognitive.state.suggest",
    pattern: /^(?=.*\bdiscover\b)(?=.*\bstates?\b).*/i,
    inputBuilder: (t, ctx) => {
      const entity = ctx.entity || extractCdrEntityName(t);
      const textWithoutEntity = entity ? t.replace(new RegExp(`\\b${entity}\\b`, "g"), "") : t;
      return {
        entity: entity || "all",
        repo: ctx.repo || extractCdrRepoName(textWithoutEntity) || ""
      };
    },
    reason: "cognitive state suggest intent",
    confidence: 0.93,
    tags: ["cognitive", "state"],
    priority: 100
  },
  {
    id: "cdr.domain.compose.english",
    capability: "cdr.domain.compose",
    pattern: /^(?=.*\bcompose\b)(?=.*\bdomain\b).*/i,
    inputBuilder: (t, ctx) => ({
      domain: ctx.domain || extractCdrDomainName(t) || "",
      description: ctx.description || extractCdrDescription(t) || ""
    }),
    reason: "cdr domain compose intent",
    confidence: 0.92,
    tags: ["cdr", "domain"],
    priority: 100
  },
  {
    id: "cdr.capability.map.init.english",
    capability: "cdr.capability.map.init",
    pattern: /^(?=.*\binit\b)(?=.*\bcapability\b)(?=.*\bmap\b).*/i,
    inputBuilder: (t, ctx) => ({ product: ctx.product || extractCdrProductName(t) || "" }),
    reason: "cdr capability map init intent",
    confidence: 0.92,
    tags: ["cdr", "capability-map"],
    priority: 100
  },
  // === CDR v0.8 — reverse-cluster to L1 ===
  // Priority is set so that v0.8 routes beat v0.3 init / doc.generate
  // routes on equal confidence. `synth capability map` wins over
  // `init capability map`; `render L1 portal` wins over
  // `generate documentation portal`.
  {
    id: "cdr.bootstrap.english",
    pattern: /^bootstrap\s+(?:repo\s+)?([a-z0-9][a-z0-9._-]*)/i,
    capability: "cdr.bootstrap",
    inputBuilder: (t, ctx) => {
      const m = t.match(/^bootstrap\s+(?:repo\s+)?([a-z0-9][a-z0-9._-]*)/i);
      return { repo: (m && m[1]) || ctx.repo || "" };
    },
    reason: "cdr.bootstrap one-shot intent",
    confidence: 0.9,
    tags: ["cdr", "bootstrap", "v0.8"],
    priority: 50
  },
  {
    id: "cdr.bootstrap.chinese",
    pattern: /^(?:引导)\s+([a-z0-9][a-z0-9._-]*)/i,
    capability: "cdr.bootstrap",
    inputBuilder: (t, ctx) => {
      const m = t.match(/(?:引导)\s+([a-z0-9][a-z0-9._-]*)/i);
      return { repo: (m && m[1]) || ctx.repo || "" };
    },
    reason: "cdr.bootstrap one-shot intent (chinese)",
    confidence: 0.88,
    tags: ["cdr", "bootstrap", "v0.8", "chinese"],
    priority: 50
  },
  {
    id: "cdr.domain.suggest.english",
    pattern: /^(?=.*\b(?:suggest|cluster|reverse[\s_-]?cluster)\b)(?=.*\b(?:domains?)\b).*/i,
    capability: "cdr.domain.suggest",
    inputBuilder: (t, ctx) => ({
      repos: ctx.repos || "",
      min_size: ctx.min_size || "",
      max_size: ctx.max_size || "",
      max_clusters: ctx.max_clusters || ""
    }),
    reason: "cdr domain suggest intent (v0.8)",
    confidence: 0.9,
    tags: ["cdr", "domain", "v0.8"],
    priority: 50
  },
  {
    id: "cdr.capability.map.synth.english",
    pattern: /^(?=.*\b(?:synth(?:esize)?)\b)(?=.*\bcapability\b)(?=.*\bmap\b).*/i,
    capability: "cdr.capability.map.synth",
    inputBuilder: (t, ctx) => ({
      product: ctx.product || extractCdrProductName(t) || "",
      use_suggested_domains: ctx.use_suggested_domains || ""
    }),
    reason: "cdr capability map synth intent (v0.8)",
    confidence: 0.92,
    tags: ["cdr", "capability-map", "v0.8"],
    priority: 50
  },
  {
    id: "cdr.reversecluster.doc.generate.english",
    pattern: /^(?=.*\b(?:render|build|generate)\b)(?=.*\b(?:l1|capability[\s_-]?map|reverse[\s_-]?cluster)\b)(?=.*\b(?:portal|docs|documentation)\b).*/i,
    capability: "cdr.reversecluster.doc.generate",
    inputBuilder: (t, ctx) => ({ output_dir: ctx.output_dir || ".dapei/docs-portal" }),
    reason: "cdr reverse_cluster doc generate intent (v0.8)",
    confidence: 0.92,
    tags: ["cdr", "doc", "v0.8"],
    priority: 50
  },
  // v0.5 cross-repo portal must precede the v0.3 catch-all
  // "render ... portal" → cdr.doc.generate. The English version wins
  // by priority; the Chinese version wins by explicit reordering in
  // the Chinese block below.
  {
    id: "cdr.crossrepo.doc.generate.english",
    pattern: /^(?=.*\b(?:cross[_-]?repo|cross[_-]?repository)\b)(?=.*\b(?:portal|docs|documentation)\b).*/i,
    capability: "cdr.crossrepo.doc.generate",
    inputBuilder: (t, ctx) => ({ output_dir: ctx.output_dir || ".dapei/docs-portal" }),
    reason: "cdr cross_repo doc generate intent (precedence over cdr.doc.generate)",
    confidence: 0.92,
    tags: ["cdr", "doc", "cross-repo"],
    priority: 50
  },
  // `cdr.doc.generate` is the plain "render ... portal" catch-all. The
  // negative lookahead keeps it out of the v0.8 (L1 / capability map /
  // reverse cluster) vocabulary, which has its own more specific route.
  // `cross-repo` is deliberately still claimed by this route: that overlap
  // is real precedence (the cross-repo route wins on priority) and is
  // reported by introspectConflicts() as a documented pair.
  {
    id: "cdr.doc.generate.english",
    pattern: /^(?!.*\b(?:l1|capability[\s_-]?map|reverse[\s_-]?cluster)\b)(?=.*\b(?:generate|build|render)\b)(?=.*\b(?:documentation|docs|portal)\b).*/i,
    capability: "cdr.doc.generate",
    inputBuilder: (t, ctx) => ({ output_dir: ctx.output_dir || ".dapei/docs-portal" }),
    reason: "cdr doc generate intent",
    confidence: 0.92,
    tags: ["cdr", "doc"],
    priority: 100
  },
  {
    id: "cdr.index.list.english",
    pattern: /^(?=.*\b(?:list|show)\b)(?=.*\b(?:assets|cognitive|index)\b).*/i,
    capability: "cdr.index.list",
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || "",
      kind: ctx.kind || ""
    }),
    reason: "cdr index list intent",
    confidence: 0.85,
    tags: ["cdr", "index"],
    priority: 100
  },
  // === CDR Chinese intent patterns ===
  // The Chinese block is ordered by precedence: more-specific patterns
  // (cross-repo, bootstrap, business rules) appear before the
  // catch-all `cdr.doc.generate` Chinese pattern, mirroring the
  // English ordering rule.
  //
  // FIX #1 (cdr.profile Chinese): the old regex was
  //   /分析.*?(?:repo|仓库|项目|repos?)?\s*([a-zA-Z0-9_-]+)/i
  // On `分析 repo sample-app`, the optional keyword group matched the
  // literal `repo`, then `\s*([a-zA-Z0-9_-]+)` captured `repo` again
  // and `sample-app` was lost. The new regex requires a leading repo
  // keyword (Chinese or English) before the trailing name, which keeps
  // the parser stable across input orderings.
  {
    id: "cdr.profile.chinese",
    pattern: /分析\s*(?:repo|仓库|项目|repos?)?\s*([a-zA-Z][a-zA-Z0-9_-]+)/i,
    capability: "cdr.profile",
    inputBuilder: (t, ctx) => {
      const m = t.match(/分析\s*(?:repo|仓库|项目|repos?)?\s*([a-zA-Z][a-zA-Z0-9_-]+)/i);
      return { repo: ctx.repo || (m && m[1]) || "" };
    },
    reason: "cdr profile repo intent (chinese)",
    confidence: 0.88,
    tags: ["cdr", "profile", "chinese"],
    priority: 100
  },
  {
    id: "cdr.entries.prepare.chinese",
    pattern: /扫描.*?(?:入口|entries?)\s+(?:for\s+|in\s+)?([a-zA-Z0-9_-]+)/i,
    capability: "cdr.entries.prepare",
    inputBuilder: (t, ctx) => {
      const m = t.match(/扫描.*?(?:入口|entries?)\s+(?:for\s+|in\s+)?([a-zA-Z0-9_-]+)/i);
      return { repo: ctx.repo || (m && m[1]) || "" };
    },
    reason: "cdr entries prepare intent (chinese)",
    confidence: 0.91,
    tags: ["cdr", "entries", "chinese"],
    priority: 100
  },
  {
    id: "cdr.entries.confirm.chinese",
    pattern: /(?:确认|标记).*?(?:入口|entry)\s+([a-zA-Z0-9_-]+)/i,
    capability: "cdr.entries.confirm",
    inputBuilder: (t, ctx) => {
      const m = t.match(/(?:确认|标记).*?(?:入口|entry)\s+([a-zA-Z0-9_-]+)/i);
      return {
        repo: ctx.repo || extractCdrRepoName(t) || "",
        entry_id: ctx.entry_id || (m && m[1]) || ""
      };
    },
    reason: "cdr entries confirm intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "entries", "chinese"],
    priority: 100
  },
  {
    id: "cognitive.state.suggest.chinese",
    pattern: /推导.*(?:状态|state)\s+(?:for\s+|of\s+)?([A-Z][a-zA-Z0-9]+)?/i,
    capability: "cognitive.state.suggest",
    inputBuilder: (t, ctx) => {
      const m = t.match(/(?:状态|state)\s+(?:for\s+|of\s+)?([A-Z][a-zA-Z0-9]+)/);
      const entity = ctx.entity || (m && m[1]) || "all";
      return { entity, repo: ctx.repo || extractCdrRepoName(t) || "" };
    },
    reason: "cognitive state suggest intent (chinese)",
    confidence: 0.91,
    tags: ["cognitive", "state", "chinese"],
    priority: 100
  },
  {
    id: "cdr.domain.compose.chinese",
    pattern: /(?:组合|聚类|compose).*(?:领域|domain)\s+([a-zA-Z0-9_-]+)/i,
    capability: "cdr.domain.compose",
    inputBuilder: (t, ctx) => {
      const m = t.match(/(?:组合|聚类|compose)\s*(?:领域|domain)\s+([a-zA-Z0-9_-]+)/i);
      return {
        domain: ctx.domain || (m && m[1]) || "",
        description: ctx.description || ""
      };
    },
    reason: "cdr domain compose intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "domain", "chinese"],
    priority: 100
  },
  {
    id: "cdr.business.compose.chinese",
    pattern: /(?:组合|聚类|compose).*(?:业务规则?|business[\s_-]?rule?)\s+([a-zA-Z0-9_-]+)/i,
    capability: "cdr.business.compose",
    inputBuilder: (t, ctx) => ({
      id: ctx.id || (t.match(/(?:业务规则?|business[\s_-]?rule?)\s+([a-zA-Z0-9_-]+)/i)?.[1] || ""),
      kind: ctx.kind || "invariant",
      description: ctx.description || ""
    }),
    reason: "cdr business compose intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "business-rule", "chinese"],
    priority: 100
  },
  {
    id: "cdr.capability.map.init.chinese",
    pattern: /初始化.*(?:功能|能力)\s*(?:地图|全景)/i,
    capability: "cdr.capability.map.init",
    inputBuilder: (t, ctx) => ({ product: ctx.product || extractCdrProductName(t) || "" }),
    reason: "cdr capability map init intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "capability-map", "chinese"],
    priority: 100
  },
  // FIX #2: cross-repo portal Chinese pattern must precede the
  // catch-all `cdr.doc.generate` Chinese pattern. Previously
  // `生成跨仓库门户` was swallowed by the broader `生成 ... 文档门户`
  // pattern at confidence 0.9. The cross-repo pattern is more specific
  // and is now placed first so the matcher sees it before the
  // catch-all (which still exists for plain `生成文档门户`).
  {
    id: "cdr.crossrepo.doc.generate.chinese",
    pattern: /(?:生成|渲染|构建)\s*(?:跨[_-]?仓库?|跨[_-]?服务?)\s*(?:门户|视图|页面|文档)/i,
    capability: "cdr.crossrepo.doc.generate",
    inputBuilder: (t, ctx) => ({ output_dir: ctx.output_dir || ".dapei/docs-portal" }),
    reason: "cdr cross_repo doc generate intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "doc", "cross-repo", "chinese"],
    priority: 50
  },
  {
    id: "cdr.doc.generate.chinese",
    pattern: /(?!.*跨越?)(?:生成|渲染|构建).*(?:文档|docs|documentation|门户|portal)/i,
    capability: "cdr.doc.generate",
    inputBuilder: (t, ctx) => ({ output_dir: ctx.output_dir || ".dapei/docs-portal" }),
    reason: "cdr doc generate intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "doc", "chinese"],
    priority: 100
  },
  {
    id: "cdr.index.list.assets.english",
    capability: "cdr.index.list",
    // Misroute fix (v3.2): `list assets --repo mall-order` used to land on
    // repos.list, because `--repo` / `<repo>` also satisfies the repos
    // keyword. `assets` is unambiguous cdr.index.list vocabulary, so this
    // higher-confidence route wins and the repos routes only claim intents
    // that actually talk about the repo registry.
    pattern: /^(?=.*\b(?:list|show)\b)(?=.*\b(?:assets|cognitive)\b).*/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || "",
      kind: ctx.kind || ""
    }),
    reason: "cdr index list assets intent (precedence over repos.list)",
    confidence: 0.93,
    tags: ["cdr", "index"],
    priority: 100
  },
  {
    id: "cdr.index.list.chinese",
    pattern: /(?:列出|list)\s*(?:资产|assets|认知|cognitive|索引|index)/i,
    capability: "cdr.index.list",
    inputBuilder: (t, ctx) => ({ repo: ctx.repo || extractCdrRepoName(t) || "", kind: ctx.kind || "" }),
    reason: "cdr index list intent (chinese)",
    confidence: 0.85,
    tags: ["cdr", "index", "chinese"],
    priority: 100
  },
  // === CDR v0.5 — cross-repo business rules ===
  {
    id: "cdr.business.crosslink.english",
    pattern: /^(?=.*\b(?:cross[_-]?repo|cross[_-]?repository)\b)(?=.*\b(?:link|rules?|ruleset|view|map)\b).*/i,
    capability: "cdr.business.crosslink",
    inputBuilder: (t, ctx) => ({ min_confidence: ctx.min_confidence || "" }),
    reason: "cdr business cross-link intent",
    confidence: 0.9,
    tags: ["cdr", "business-rule", "cross-repo"],
    priority: 100
  },
  {
    id: "cdr.business.crosslink.chinese",
    pattern: /(?:建立|构建|汇总|推导|生成)\s*(?:跨[_-]?仓库?|跨[_-]?服务?)\s*(?:业务规则|关系|规则集)/i,
    capability: "cdr.business.crosslink",
    inputBuilder: (t, ctx) => ({ min_confidence: ctx.min_confidence || "" }),
    reason: "cdr business cross-link intent (chinese)",
    confidence: 0.88,
    tags: ["cdr", "business-rule", "cross-repo", "chinese"],
    priority: 100
  },
  // === CDR v0.8 — Chinese intents ===
  {
    id: "cdr.domain.suggest.chinese",
    pattern: /(?:推荐|聚类|建议|reverse[\s_-]?cluster|suggest).*(?:领域|domain)/i,
    capability: "cdr.domain.suggest",
    inputBuilder: (t, ctx) => ({
      repos: ctx.repos || "",
      min_size: ctx.min_size || "",
      max_size: ctx.max_size || "",
      max_clusters: ctx.max_clusters || ""
    }),
    reason: "cdr domain suggest intent (chinese)",
    confidence: 0.88,
    tags: ["cdr", "domain", "chinese", "v0.8"],
    priority: 100
  },
  {
    id: "cdr.capability.map.synth.chinese",
    pattern: /(?:聚类|生成|推导|合成).*(?:功能|能力|capability)\s*(?:地图|map|全景)/i,
    capability: "cdr.capability.map.synth",
    inputBuilder: (t, ctx) => ({
      product: ctx.product || extractCdrProductName(t) || "",
      use_suggested_domains: ctx.use_suggested_domains || ""
    }),
    reason: "cdr capability map synth intent (chinese)",
    confidence: 0.88,
    tags: ["cdr", "capability-map", "chinese", "v0.8"],
    priority: 100
  },
  {
    id: "cdr.reversecluster.doc.generate.chinese",
    pattern: /(?:渲染|生成|构建).*(?:L1|能力地图|功能全景|capability[\s_-]?map)/i,
    capability: "cdr.reversecluster.doc.generate",
    inputBuilder: (t, ctx) => ({ output_dir: ctx.output_dir || ".dapei/docs-portal" }),
    reason: "cdr reverse_cluster doc generate intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "doc", "chinese", "v0.8"],
    // Same precedence trick as the English sibling: on `渲染 L1 门户` both
    // this route and cdr.doc.generate.chinese match at 0.9, and the lower
    // priority number (50) makes the more specific route win.
    priority: 50
  },
  {
    id: "repos.analyze.english",
    capability: "repos.analyze",
    pattern: /^(?=.*(?<!-)\brepos?\b)(?=.*\banalyze\b).*/i,
    inputBuilder: (t, ctx) => ({ target: ctx.target || extractTarget(t) || "--all" }),
    reason: "repo analyze intent",
    confidence: 0.95,
    tags: ["repos"],
    priority: 100
  },
  {
    id: "repos.sync.english",
    capability: "repos.sync",
    pattern: /^(?=.*(?<!-)\brepos?\b)(?=.*\bsync\b).*/i,
    inputBuilder: (t, ctx) => ({ target: ctx.target || extractTarget(t) || "--all" }),
    reason: "repo sync intent",
    confidence: 0.95,
    tags: ["repos"],
    priority: 100
  },
  {
    id: "repos.list.english",
    capability: "repos.list",
    pattern: /^(?=.*(?<!-)\brepos?\b)(?=.*\blist\b).*/i,
    inputBuilder: () => ({}),
    reason: "repo list intent",
    confidence: 0.9,
    tags: ["repos"],
    priority: 100
  },
  {
    id: "repos.check.english",
    capability: "repos.check",
    pattern: /^(?=.*(?<!-)\brepos?\b)(?=.*\bcheck\b).*/i,
    inputBuilder: (t, ctx) => ({ target: ctx.target || extractTarget(t) || "--all" }),
    reason: "repo check intent",
    confidence: 0.92,
    tags: ["repos"],
    priority: 100
  },
  {
    id: "feature.create.english",
    capability: "feature.create",
    pattern: /^(?=.*\bcreate\b)(?=.*\bfeature\b).*/i,
    inputBuilder: (t, ctx) => ({ name: ctx.name || extractFeatureName(t), repos: ctx.repos || extractRepos(t), objective: ctx.objective || extractObjective(t) || "TBD" }),
    reason: "feature create intent",
    confidence: 0.95,
    tags: ["feature"],
    priority: 100
  },
  {
    id: "feature.create.chinese.direct",
    pattern: /创建.*feature|feature.*创建/i,
    capability: "feature.create",
    inputBuilder: (t, ctx) => ({ name: ctx.name || extractFeatureName(t), repos: ctx.repos || extractRepos(t), objective: ctx.objective || extractObjective(t) || "TBD" }),
    reason: "feature create intent (chinese)",
    confidence: 0.95,
    tags: ["feature", "chinese"],
    priority: 100
  },
  {
    id: "feature.create.chinese.indirect",
    pattern: /新开.*需求|需求.*新开/i,
    capability: "feature.create",
    inputBuilder: (t, ctx) => ({ name: ctx.name || extractFeatureName(t), repos: ctx.repos || extractRepos(t), objective: ctx.objective || extractObjective(t) || "TBD" }),
    reason: "feature create intent (chinese)",
    confidence: 0.95,
    tags: ["feature", "chinese"],
    priority: 100
  },
  {
    id: "context.build.english",
    capability: "context.build",
    pattern: /^(?=.*\bcontext\b)(?=.*\bbuild\b).*/i,
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t), stage: ctx.stage || extractStage(t) || "general" }),
    reason: "context build intent",
    confidence: 0.95,
    tags: ["feature", "context"],
    priority: 100
  },
  {
    id: "workflow.runStage.english",
    capability: "workflow.runStage",
    pattern: /^(?=.*\brun\b)(?=.*\bworkflow\b).*/i,
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t), stage: ctx.stage || extractStage(t) || "" }),
    reason: "workflow run intent",
    confidence: 0.9,
    tags: ["feature", "workflow"],
    priority: 100
  },
  {
    id: "validation.run.english",
    capability: "validation.run",
    pattern: /^(?=.*\bvalidate\b).*/i,
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t) }),
    reason: "validation intent",
    confidence: 0.85,
    tags: ["feature", "validation"],
    priority: 100
  },
  {
    id: "feature.report.english",
    capability: "feature.report",
    pattern: /^(?=.*\breport\b).*/i,
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t) }),
    reason: "report intent",
    confidence: 0.8,
    tags: ["feature", "report"],
    priority: 100
  },
  {
    id: "feature.review.english",
    capability: "feature.review",
    pattern: /^(?=.*\breview\b).*/i,
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t) }),
    reason: "review intent",
    confidence: 0.8,
    tags: ["feature", "review"],
    priority: 100
  },
  {
    id: "feature.close.normal",
    capability: "feature.close",
    pattern: /^(?=.*\bclose\b)(?=.*\bfeature\b).*/i,
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t) }),
    reason: "close feature intent",
    confidence: 0.9,
    tags: ["feature", "close"],
    priority: 100
  },
  {
    id: "feature.close.reversed",
    capability: "feature.close",
    pattern: /^(?=.*\bfeature\b)(?=.*\bclose\b).*/i,
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t) }),
    reason: "close feature intent (reversed)",
    confidence: 0.9,
    tags: ["feature", "close"],
    priority: 100
  },
  {
    id: "feature.status.fallback",
    capability: "feature.status",
    pattern: /^(?=.*\bstatus\b).*$/i,
    inputBuilder: () => ({}),
    reason: "status intent",
    confidence: 0.7,
    tags: ["feature", "status"],
    priority: 100
  },
  {
    id: "feature.gap-analysis.english",
    capability: "feature.gap.analysis",
    pattern: /^(?=.*\bgap\b)(?=.*\banalysis\b).*/i,
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t), max_envelopes: 3 }),
    reason: "gap-analysis intent",
    confidence: 0.9,
    tags: ["feature", "gap-analysis"],
    priority: 100
  },
  {
    id: "feature.gap-analysis.chinese",
    capability: "feature.gap.analysis",
    pattern: /差距分析|gap\s*分析|分析.*差距/i,
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t), max_envelopes: 3 }),
    reason: "gap-analysis intent (chinese)",
    confidence: 0.9,
    tags: ["feature", "gap-analysis", "chinese"],
    priority: 100
  },
  {
    id: "feature.stage.transition.english",
    capability: "feature.stage.transition",
    pattern: /^(?=.*\btransition\b)(?=.*\bstage\b).*/i,
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t), stage: ctx.stage || extractStage(t) || "" }),
    reason: "stage transition intent",
    confidence: 0.9,
    tags: ["feature", "stage"],
    priority: 100
  },
  {
    id: "feature.accept.english",
    capability: "feature.accept",
    pattern: /^(?=.*\baccept\b)(?=.*\bfeature\b).*/i,
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t), confirmed: ctx.confirmed ?? true }),
    reason: "feature accept intent",
    confidence: 0.9,
    tags: ["feature", "accept"],
    priority: 100
  },
  {
    id: "feature.accept.chinese",
    capability: "feature.accept",
    pattern: /接受.*feature|验收.*feature|feature.*接受/i,
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t), confirmed: ctx.confirmed ?? true }),
    reason: "feature accept intent (chinese)",
    confidence: 0.9,
    tags: ["feature", "accept", "chinese"],
    priority: 100
  },

  // === Route authority (v3.2) — core domains ===
  //
  // 30 of the 64 registered capability ids used to have no route at all:
  // `@dapei workspace status`, `@dapei memory append ...`, `@dapei
  // repos remove ...` and friends fell through to the 0.1
  // `feature.status` fallback even though SKILL.md and
  // `.dapei/commands.yaml` advertise them. The two blocks below give every
  // registered id a route (the route-authority test asserts that, plus that
  // no route names an unregistered id, plus that each commands.yaml entry
  // routes to the capability it declares).
  //
  // Precision rules for these entries:
  //   - a route only claims the nouns of its own capability; the broader
  //     siblings (`feature.status` on `status`, `feature.report` on
  //     `report`, `validation.run` on `validate`) are outranked by
  //     confidence, never by declaration order;
  //   - negative lookaheads block the vocabulary of a *sibling* capability
  //     (`feature stage` must not swallow `transition stage`);
  //   - after editing, re-run introspectConflicts() and the precedence
  //     battery in tests/unit/route-authority.test.mjs to prove no intent
  //     was stolen.
  {
    id: "workspace.validate.english",
    capability: "workspace.validate",
    pattern: /^(?=.*\b(?:workspace|工作区)\b)(?=.*\b(?:validate|validation|conform|conformance|check)\b).*/i,
    inputBuilder: () => ({}),
    reason: "workspace validate intent",
    confidence: 0.93,
    tags: ["workspace", "validation"],
    priority: 100
  },
  {
    id: "workspace.validate.chinese",
    capability: "workspace.validate",
    pattern: /(?:校验|检查).*(?:workspace|工作区)|(?:workspace|工作区).*(?:校验|检查)/i,
    inputBuilder: () => ({}),
    reason: "workspace validate intent (chinese)",
    confidence: 0.92,
    tags: ["workspace", "validation", "chinese"],
    priority: 100
  },
  {
    id: "workspace.status.english",
    capability: "workspace.status",
    pattern: /^(?=.*\b(?:workspace|工作区)\b)(?=.*\b(?:status|overview|summary)\b).*/i,
    inputBuilder: () => ({}),
    reason: "workspace status intent",
    confidence: 0.93,
    tags: ["workspace", "status"],
    priority: 100
  },
  {
    id: "workspace.status.chinese",
    capability: "workspace.status",
    pattern: /(?:workspace|工作区).*(?:状态|概览|总览)/i,
    inputBuilder: () => ({}),
    reason: "workspace status intent (chinese)",
    confidence: 0.92,
    tags: ["workspace", "status", "chinese"],
    priority: 100
  },
  {
    id: "workspace.report.english",
    capability: "workspace.report",
    pattern: /^(?=.*\b(?:workspace|工作区)\b)(?=.*\b(?:report|health)\b).*/i,
    inputBuilder: () => ({}),
    reason: "workspace report intent",
    confidence: 0.93,
    tags: ["workspace", "report"],
    priority: 100
  },
  {
    id: "workspace.report.chinese",
    capability: "workspace.report",
    pattern: /(?:workspace|工作区).*(?:报告|健康)/i,
    inputBuilder: () => ({}),
    reason: "workspace report intent (chinese)",
    confidence: 0.92,
    tags: ["workspace", "report", "chinese"],
    priority: 100
  },
  {
    id: "workflow.status.english",
    capability: "workflow.status",
    pattern: /^(?=.*\bworkflow\b)(?=.*\b(?:status|progress)\b).*/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || capture(t, /\bworkflow\s+(?:status|progress)\s+(?:for\s+)?([a-zA-Z0-9_-]+)/i) || extractFeatureName(t)
    }),
    reason: "workflow status intent",
    confidence: 0.92,
    tags: ["feature", "workflow", "status"],
    priority: 100
  },
  {
    id: "workflow.status.chinese",
    capability: "workflow.status",
    pattern: /(?:workflow|工作流).*(?:状态|进度)/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t)
    }),
    reason: "workflow status intent (chinese)",
    confidence: 0.9,
    tags: ["feature", "workflow", "status", "chinese"],
    priority: 100
  },
  {
    id: "feature.stage.english",
    capability: "feature.stage",
    // Only the `feature stage ...` sub-command form (commands.yaml
    // `feature-stage`). A loose `feature` + `stage` match would outrank
    // both workflow.runStage and validation.run on `... --stage <s>`
    // intents, so the looser phrasing gets its own lower-confidence route
    // below with the sibling vocabularies excluded.
    pattern: /^(?=.*\bfeature\s+stage\b).*/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || capture(t, /\bfeature\s+stage\s+([a-zA-Z0-9_-]+)/i) || extractFeatureName(t),
      action: /\b(?:set|update|设置|更新|推进)\b/i.test(t) ? "set" : "get",
      stage: ctx.stage || extractStage(t)
    }),
    reason: "feature stage get/set intent",
    confidence: 0.9,
    tags: ["feature", "stage"],
    priority: 100
  },
  {
    id: "feature.stage.getset.english",
    capability: "feature.stage",
    // `transition` belongs to feature.stage.transition; `workflow` to
    // workflow.runStage; `validate`/`validation` to validation.run;
    // `accept` to feature.accept. All four also speak of a `stage`, so the
    // lookahead keeps this route from outranking them on their own intents.
    pattern: /^(?!.*\b(?:transition|workflow|validate|validation|accept)\b)(?=.*\bfeature\b)(?=.*\bstage\b).*/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      action: /\b(?:set|update|推进)\b/i.test(t) ? "set" : "get",
      stage: ctx.stage || extractStage(t)
    }),
    reason: "feature stage get/set intent (loose phrasing)",
    confidence: 0.89,
    tags: ["feature", "stage"],
    priority: 100
  },
  {
    id: "feature.stage.chinese",
    capability: "feature.stage",
    pattern: /(?:获取|设置|查看|查询|切换).*(?:stage|阶段)|(?:stage|阶段).*(?:获取|设置|查看|查询|切换)/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      action: /\b(?:set|update)\b|设置|更新/i.test(t) ? "set" : "get",
      stage: ctx.stage || extractStage(t)
    }),
    reason: "feature stage get/set intent (chinese)",
    confidence: 0.9,
    tags: ["feature", "stage", "chinese"],
    priority: 100
  },
  {
    id: "feature.tasks.english",
    capability: "feature.tasks",
    pattern: /^(?=.*\bfeature\b)(?=.*\b(?:tasks?|backlog)\b).*/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || capture(t, /\bfeature\s+(?:tasks?|backlog)\s+([a-zA-Z0-9_-]+)/i) || extractFeatureName(t),
      action: /\b(?:append|add|新增|添加|追加)\b/i.test(t) ? "append" : "list",
      content: ctx.content || capture(t, /--content\s+(.+)$/i)
    }),
    reason: "feature tasks list/append intent",
    confidence: 0.9,
    tags: ["feature", "tasks"],
    priority: 100
  },
  {
    id: "feature.tasks.chinese",
    capability: "feature.tasks",
    pattern: /(?:feature|特性).*(?:任务|backlog|待办|清单)/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      action: /新增|添加|追加|append/i.test(t) ? "append" : "list",
      content: ctx.content || capture(t, /--content\s+(.+)$/i)
    }),
    reason: "feature tasks list/append intent (chinese)",
    confidence: 0.9,
    tags: ["feature", "tasks", "chinese"],
    priority: 100
  },
  {
    id: "feature.guardrail.english",
    capability: "feature.guardrail",
    pattern: /^(?=.*\bfeature\b)(?=.*\bguardrails?\b).*/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || capture(t, /\bfeature\s+guardrails?\s+([a-zA-Z0-9_-]+)/i) || extractFeatureName(t)
    }),
    reason: "feature guardrail intent",
    confidence: 0.9,
    tags: ["feature", "guardrail"],
    priority: 100
  },
  {
    id: "feature.guardrail.chinese",
    capability: "feature.guardrail",
    pattern: /guardrails?|护栏|守卫/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t)
    }),
    reason: "feature guardrail intent (chinese)",
    confidence: 0.89,
    tags: ["feature", "guardrail", "chinese"],
    priority: 100
  },
  {
    id: "feature.assign.english",
    capability: "feature.assign",
    // Confidence stays below feature.create (0.95) so that
    // `create feature X --owner alice` keeps routing to create.
    pattern: /^(?=.*\bfeature\b)(?=.*\b(?:assign|assignee|owner|ownership)\b).*/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      owner: ctx.owner || capture(t, /\bto\s+@?([a-zA-Z0-9_-]+)/i) || capture(t, /(?:owner|assignee)[:\s]+@?([a-zA-Z0-9_-]+)/i)
    }),
    reason: "feature assign intent",
    confidence: 0.88,
    tags: ["feature", "assign"],
    priority: 100
  },
  {
    id: "feature.assign.chinese",
    capability: "feature.assign",
    pattern: /(?:分配|指派).*(?:feature|特性|负责人)|(?:feature|特性).*(?:分配|指派)/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      owner: ctx.owner || capture(t, /(?:给|指派|分配给)\s*@?([a-zA-Z0-9_-]+)/i)
    }),
    reason: "feature assign intent (chinese)",
    confidence: 0.87,
    tags: ["feature", "assign", "chinese"],
    priority: 100
  },
  {
    id: "feature.handoff.english",
    capability: "feature.handoff",
    pattern: /^(?=.*\bfeature\b)(?=.*\b(?:handoff|hand[\s-]?off)\b).*/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      to: ctx.to || capture(t, /\bto\s+@?([a-zA-Z0-9_-]+)/i),
      note: ctx.note || capture(t, /--note\s+(.+)$/i)
    }),
    reason: "feature handoff intent",
    confidence: 0.9,
    tags: ["feature", "handoff"],
    priority: 100
  },
  {
    id: "feature.handoff.chinese",
    capability: "feature.handoff",
    pattern: /(?:移交|交接).*(?:feature|特性)|(?:feature|特性).*(?:移交|交接)/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      to: ctx.to || capture(t, /(?:给|移交给|交接给)\s*@?([a-zA-Z0-9_-]+)/i)
    }),
    reason: "feature handoff intent (chinese)",
    confidence: 0.89,
    tags: ["feature", "handoff", "chinese"],
    priority: 100
  },
  {
    id: "feature.teamstatus.english",
    capability: "feature.teamstatus",
    pattern: /^(?=.*\bteam\b)(?=.*\b(?:status|progress|overview)\b).*/i,
    inputBuilder: () => ({}),
    reason: "feature team status intent",
    confidence: 0.92,
    tags: ["feature", "status", "team"],
    priority: 100
  },
  {
    id: "feature.teamstatus.chinese",
    capability: "feature.teamstatus",
    pattern: /团队.*(?:状态|进度|概览)/i,
    inputBuilder: () => ({}),
    reason: "feature team status intent (chinese)",
    confidence: 0.9,
    tags: ["feature", "status", "team", "chinese"],
    priority: 100
  },
  {
    id: "validation.detect.english",
    capability: "validation.detect",
    pattern: /^(?=.*\b(?:detect|discover)\b)(?=.*\b(?:tests?|validation|commands?|checks?)\b).*/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractTarget(t) || capture(t, /(?:detect|discover)\s+(?:tests?\s+|validation\s+)?(?:commands?\s+)?(?:for\s+|in\s+|on\s+)?([a-zA-Z0-9_.-]+)/i) || extractCdrRepoName(t)
    }),
    reason: "validation detect intent",
    confidence: 0.92,
    tags: ["validation", "detect"],
    priority: 100
  },
  {
    id: "validation.detect.chinese",
    capability: "validation.detect",
    pattern: /(?:发现|识别|探测).*(?:测试|验证).*命令|(?:测试|验证)命令.*(?:发现|识别|探测)/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t)
    }),
    reason: "validation detect intent (chinese)",
    confidence: 0.9,
    tags: ["validation", "detect", "chinese"],
    priority: 100
  },
  {
    id: "validation.execute.english",
    capability: "validation.execute",
    pattern: /^(?=.*\bvalidation\b)(?=.*\b(?:execute|executing|execution|run)\b).*/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractTarget(t) || capture(t, /\b(?:execut(?:e|ing)|run)\s+([a-zA-Z0-9_.-]+)/i) || extractCdrRepoName(t),
      command: ctx.command || capture(t, /"([^"]+)"/) || capture(t, /--command[=\s]+(.+)$/i)
    }),
    reason: "validation execute intent",
    confidence: 0.92,
    tags: ["validation", "execute"],
    priority: 100
  },
  {
    id: "validation.execute.tests",
    capability: "validation.execute",
    pattern: /^(?=.*\b(?:run|execute)\b)(?=.*\b(?:tests?|checks?)\b)(?=.*\b(?:for|in|on)\b).*/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractTarget(t) || capture(t, /(?:for|in|on)\s+([a-zA-Z0-9_.-]+)/i) || extractCdrRepoName(t),
      command: ctx.command || capture(t, /"([^"]+)"/)
    }),
    reason: "validation execute (run tests) intent",
    confidence: 0.9,
    tags: ["validation", "execute"],
    priority: 100
  },
  {
    id: "validation.execute.chinese",
    capability: "validation.execute",
    pattern: /执行.*测试|测试.*执行/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t),
      command: ctx.command || capture(t, /"([^"]+)"/)
    }),
    reason: "validation execute intent (chinese)",
    confidence: 0.9,
    tags: ["validation", "execute", "chinese"],
    priority: 100
  },
  {
    id: "validation.report.english",
    capability: "validation.report",
    pattern: /^(?=.*\bvalidation\b)(?=.*\breport\b).*/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || capture(t, /\bvalidation\s+report\s+(?:for\s+)?([a-zA-Z0-9_-]+)/i) || extractFeatureName(t)
    }),
    reason: "validation report intent",
    confidence: 0.92,
    tags: ["validation", "report"],
    priority: 100
  },
  {
    id: "validation.report.chinese",
    capability: "validation.report",
    pattern: /(?:验证|校验|测试)报告/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t)
    }),
    reason: "validation report intent (chinese)",
    confidence: 0.9,
    tags: ["validation", "report", "chinese"],
    priority: 100
  },
  {
    id: "memory.append.english",
    capability: "memory.append",
    pattern: /^(?=.*\bmemory\b)(?=.*\b(?:append|record|add|log|write|note)\b).*/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || capture(t, /\bmemory\s+(?:append|add|record)\s+([a-zA-Z0-9_-]+)/i) || extractFeatureName(t),
      type: (capture(t, /\b(decision|risk|question|note)\b/i) || "note").toLowerCase(),
      content: ctx.content || capture(t, /--content\s+(.+)$/i) || capture(t, /\b(?:decision|risk|question|note)\b[:\s]+(.+)$/i)
    }),
    reason: "memory append intent",
    confidence: 0.92,
    tags: ["memory", "feature"],
    priority: 100
  },
  {
    id: "memory.append.entry",
    capability: "memory.append",
    // `record the decision` / `log a risk` without the word `memory`.
    pattern: /^(?=.*\b(?:record|log|append|note)\b)(?=.*\b(?:decision|risk|question|note)s?\b).*/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      type: (capture(t, /\b(decision|risk|question|note)s?\b/i) || "note").toLowerCase().replace(/s$/, ""),
      content: ctx.content || capture(t, /--content\s+(.+)$/i)
    }),
    reason: "memory append (record entry) intent",
    confidence: 0.9,
    tags: ["memory"],
    priority: 100
  },
  {
    id: "memory.append.chinese",
    capability: "memory.append",
    pattern: /记录.*(?:决策|风险|问题|笔记|备忘)/i,
    inputBuilder: (t, ctx) => {
      const zh = capture(t, /(决策|风险|问题|笔记)/);
      const type = zh === "决策" ? "decision" : zh === "风险" ? "risk" : zh === "问题" ? "question" : "note";
      return {
        feature: ctx.feature || extractFeatureName(t),
        type,
        content: ctx.content || capture(t, /--content\s+(.+)$/i)
      };
    },
    reason: "memory append intent (chinese)",
    confidence: 0.9,
    tags: ["memory", "chinese"],
    priority: 100
  },
  {
    id: "audit.query.english",
    capability: "audit.query",
    pattern: /^(?=.*\baudit\b).*/i,
    inputBuilder: (t, ctx) => ({
      since: ctx.since || capture(t, /--since[=\s]+(\S+)/i),
      until: ctx.until || capture(t, /--until[=\s]+(\S+)/i),
      capability: ctx.capability || capture(t, /--capability[=\s]+(\S+)/i),
      feature: ctx.feature || capture(t, /--feature[=\s]+(\S+)/i)
    }),
    reason: "audit query intent",
    confidence: 0.92,
    tags: ["audit"],
    priority: 100
  },
  {
    id: "audit.query.chinese",
    capability: "audit.query",
    pattern: /审计|能力执行日志/i,
    inputBuilder: (t, ctx) => ({
      since: ctx.since || capture(t, /--since[=\s]+(\S+)/i),
      until: ctx.until || capture(t, /--until[=\s]+(\S+)/i),
      capability: ctx.capability || capture(t, /--capability[=\s]+(\S+)/i),
      feature: ctx.feature || capture(t, /--feature[=\s]+(\S+)/i)
    }),
    reason: "audit query intent (chinese)",
    confidence: 0.9,
    tags: ["audit", "chinese"],
    priority: 100
  },
  {
    id: "repos.remove.english",
    capability: "repos.remove",
    pattern: /^(?=.*(?:remove|delete|drop)\b)(?=.*(?<!-)\brepos?\b).*/i,
    inputBuilder: (t, ctx) => ({
      name: ctx.name || capture(t, /(?:remove|delete|drop)\s+([a-zA-Z0-9_-]+)/i) || extractName(t),
      force: /--force/.test(t)
    }),
    reason: "repo remove intent",
    confidence: 0.93,
    tags: ["repos"],
    priority: 100
  },
  {
    id: "repos.remove.chinese",
    capability: "repos.remove",
    pattern: /(?:移除|删除|去掉).*(?:repo|仓库)|(?:repo|仓库).*(?:移除|删除|去掉)/i,
    inputBuilder: (t, ctx) => ({
      name: ctx.name || capture(t, /(?:移除|删除|去掉)\s*(?:repos?\b|仓库)?\s*([a-zA-Z0-9_-]+)/i),
      force: /--force|强制/.test(t)
    }),
    reason: "repo remove intent (chinese)",
    confidence: 0.92,
    tags: ["repos", "chinese"],
    priority: 100
  },

  // === Route authority (v3.2) — CDR v0.10 / cognitive domains ===
  //
  // Same contract as the core block above: these are the registered ids in
  // packages/cdr/src/capabilities.ts and the core cognitive domain that had
  // no route. The CDR family is bilingual (see the v0.3/v0.5/v0.8 blocks),
  // so each capability gets an English pattern plus a Chinese mirror.
  //
  // Every noun here is disjoint from the already-routed siblings:
  //   `cdr.query` needs a query verb or a `created by feature` / `emit` /
  //   `calling` discriminator, so `list behaviors for X` stays with
  //   cognitive.artifact.list and `analyze behavior for X` stays with
  //   cognitive.discover;
  //   `cdr.entries.candidate` needs `entry/entries` adjacent to
  //   `candidate(s)/file(s)`, so `discover entries for X` stays with
  //   cdr.entries.prepare.
  {
    id: "cdr.state.derive.english",
    capability: "cdr.state.derive",
    pattern: /^(?=.*\b(?:derive|draft|infer)\b)(?=.*\b(?:states?|state[\s-]?machines?)\b).*/i,
    inputBuilder: (t, ctx) => ({
      entity: ctx.entity || extractCdrEntityName(t) || "all",
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr state derive intent",
    confidence: 0.92,
    tags: ["cdr", "state"],
    priority: 100
  },
  {
    id: "cdr.state.derive.machine.english",
    capability: "cdr.state.derive",
    pattern: /^(?=.*\bstate[\s-]?machines?\b)(?=.*\b(?:derive|draft|generate|create|build)\b).*/i,
    inputBuilder: (t, ctx) => ({
      entity: ctx.entity || extractCdrEntityName(t) || "all",
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr state derive intent (state machine)",
    confidence: 0.92,
    tags: ["cdr", "state"],
    priority: 100
  },
  {
    id: "cdr.state.derive.chinese",
    capability: "cdr.state.derive",
    // `推导状态 for Order` (no 机) stays with cognitive.state.suggest;
    // only the state-machine vocabulary lands here.
    pattern: /推导.*状态机|状态机.*(?:推导|生成|构建)/i,
    inputBuilder: (t, ctx) => ({
      entity: ctx.entity || extractCdrEntityName(t) || "all",
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr state derive intent (chinese)",
    confidence: 0.92,
    tags: ["cdr", "state", "chinese"],
    priority: 100
  },
  {
    id: "cdr.behavior.upsert.english",
    capability: "cdr.behavior.upsert",
    // `cognitive` is the marker of the sibling cognitive.artifact.upsert
    // route, so it is excluded here instead of relying on confidence.
    pattern: /^(?!.*\bcognitive\b)(?=.*\bupsert\b)(?=.*\bbehaviors?\b).*/i,
    inputBuilder: (t, ctx) => ({
      id: ctx.id || capture(t, /\bupsert\s+behaviors?\s+([a-zA-Z0-9_.-]+)/i),
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr behavior upsert intent",
    confidence: 0.93,
    tags: ["cdr", "behavior"],
    priority: 100
  },
  {
    id: "cdr.behavior.upsert.write.english",
    capability: "cdr.behavior.upsert",
    pattern: /^(?!.*\bcognitive\b)(?=.*\b(?:write|insert|index)\b)(?=.*\bbehaviors?\b).*/i,
    inputBuilder: (t, ctx) => ({
      id: ctx.id || capture(t, /\b(?:write|insert|index)\s+behaviors?\s+([a-zA-Z0-9_.-]+)/i),
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr behavior upsert intent (write form)",
    confidence: 0.9,
    tags: ["cdr", "behavior"],
    priority: 100
  },
  {
    id: "cdr.behavior.upsert.chinese",
    capability: "cdr.behavior.upsert",
    pattern: /(?:写入|索引|更新)\s*行为(?:产物|链路)?|行为\s*(?:写入|索引)/i,
    inputBuilder: (t, ctx) => ({
      id: ctx.id || "",
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr behavior upsert intent (chinese)",
    confidence: 0.92,
    tags: ["cdr", "behavior", "chinese"],
    priority: 100
  },
  {
    id: "cdr.entries.candidate.english",
    capability: "cdr.entries.candidate",
    pattern: /^(?:(?=.*\b(?:entry|entries)\s+(?:candidates?|files?)\b)|(?=.*\b(?:candidates?|files?)\s+(?:for\s+)?(?:entry|entries)\b)).*/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr entries candidate intent",
    confidence: 0.92,
    tags: ["cdr", "entries"],
    priority: 100
  },
  {
    id: "cdr.entries.candidate.chinese",
    capability: "cdr.entries.candidate",
    pattern: /入口候选|候选入口|入口文件/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr entries candidate intent (chinese)",
    confidence: 0.92,
    tags: ["cdr", "entries", "chinese"],
    priority: 100
  },
  {
    id: "cdr.entries.propose.english",
    capability: "cdr.entries.propose",
    pattern: /^(?=.*\b(?:propose|submit)\b)(?=.*\bentr(?:y|ies)\b).*/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || "",
      id: ctx.id || extractCdrEntryId(t) || "",
      file: ctx.file || capture(t, /--file[=\s]+(\S+)/i) || ""
    }),
    reason: "cdr entries propose intent",
    confidence: 0.92,
    tags: ["cdr", "entries"],
    priority: 100
  },
  {
    id: "cdr.entries.propose.chinese",
    capability: "cdr.entries.propose",
    pattern: /提交.*入口|入口.*提交/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || "",
      id: ctx.id || extractCdrEntryId(t) || "",
      file: ctx.file || capture(t, /--file[=\s]+(\S+)/i) || ""
    }),
    reason: "cdr entries propose intent (chinese)",
    confidence: 0.92,
    tags: ["cdr", "entries", "chinese"],
    priority: 100
  },
  {
    id: "cdr.query.byTarget.english",
    capability: "cdr.query",
    pattern: /^(?=.*\b(?:query|search|find)\b)(?=.*\bbehaviors?\b).*/i,
    inputBuilder: (t, ctx) => ({
      target: ctx.target || "any",
      entity: ctx.entity || extractCdrEntityName(t) || "",
      id_contains: ctx.id_contains || capture(t, /\bid contains\s+([a-zA-Z0-9_.-]+)/i) || "",
      event: ctx.event || capture(t, /\bemit(?:s|ting)?\s+([a-zA-Z0-9_.-]+)/i) || "",
      calls_target: ctx.calls_target || capture(t, /\bcall(?:s|ing)?\s+([A-Za-z0-9_.-]+)/i) || "",
      created_by_feature: ctx.created_by_feature || capture(t, /\bcreated by feature\s+([a-zA-Z0-9_-]+)/i) || "",
      target_repo: ctx.target_repo || capture(t, /\bin\s+([a-z][a-zA-Z0-9_-]*)\s*$/i) || "",
      repo: ctx.repo || ""
    }),
    reason: "cdr query intent (read-only cross-repo lookup)",
    confidence: 0.93,
    tags: ["cdr", "query"],
    priority: 100
  },
  {
    id: "cdr.query.byFilter.english",
    capability: "cdr.query",
    // A filter discriminator (`created by feature`, `emit`, `calling`,
    // `writes`, ...) is what distinguishes a cross-repo query from
    // cognitive.artifact.list (`list behaviors for X`) and
    // cognitive.discover (`analyze/discover behaviors for X`).
    pattern: /^(?!.*\b(?:discover|analyze)\b)(?=.*\b(?:behaviors?|state[\s-]?machines?|domains?|business[\s-]?rules?|capability[\s-]?maps?)\b)(?=.*\b(?:created by feature|emits?|emitting|calls?|calling|writes|reads|exposes?)\b).*/i,
    inputBuilder: (t, ctx) => ({
      target: ctx.target || "any",
      entity: ctx.entity || extractCdrEntityName(t) || "",
      id_contains: ctx.id_contains || capture(t, /\bid contains\s+([a-zA-Z0-9_.-]+)/i) || "",
      event: ctx.event || capture(t, /\bemit(?:s|ting)?\s+([a-zA-Z0-9_.-]+)/i) || "",
      calls_target: ctx.calls_target || capture(t, /\bcall(?:s|ing)?\s+([A-Za-z0-9_.-]+)/i) || "",
      created_by_feature: ctx.created_by_feature || capture(t, /\bcreated by feature\s+([a-zA-Z0-9_-]+)/i) || "",
      target_repo: ctx.target_repo || capture(t, /\bin\s+([a-z][a-zA-Z0-9_-]*)\s*$/i) || "",
      repo: ctx.repo || ""
    }),
    reason: "cdr query intent (filtered lookup)",
    confidence: 0.93,
    tags: ["cdr", "query"],
    priority: 100
  },
  {
    id: "cdr.query.chinese",
    capability: "cdr.query",
    pattern: /(?:查询|查找|搜索).*(?:行为|状态机|业务规则|领域|资产)/i,
    inputBuilder: (t, ctx) => ({
      target: ctx.target || "any",
      entity: ctx.entity || "",
      target_repo: ctx.target_repo || extractCdrRepoName(t) || "",
      repo: ctx.repo || ""
    }),
    reason: "cdr query intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "query", "chinese"],
    priority: 100
  },
  {
    id: "cdr.pipeline.status.english",
    capability: "cdr.pipeline.status",
    pattern: /^(?=.*\bpipeline\b)(?=.*\b(?:status|progress|next|phase)\b).*/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr pipeline status intent",
    confidence: 0.92,
    tags: ["cdr", "pipeline"],
    priority: 100
  },
  {
    id: "cdr.pipeline.status.chinese",
    capability: "cdr.pipeline.status",
    pattern: /pipeline.*(?:状态|进度|阶段)|(?:状态|进度).*pipeline/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr pipeline status intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "pipeline", "chinese"],
    priority: 100
  },
  {
    id: "cdr.feature.link.english",
    capability: "cdr.feature.link",
    pattern: /^(?=.*\bfeature\b)(?=.*\blink\b).*/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureRef(t),
      mode: /backfill/i.test(t) ? "backfill" : "audit",
      repo: ctx.repo || ""
    }),
    reason: "cdr feature link intent",
    confidence: 0.9,
    tags: ["cdr", "feature"],
    priority: 100
  },
  {
    id: "cdr.feature.link.chinese",
    capability: "cdr.feature.link",
    pattern: /(?:关联|链接).*(?:feature|特性|资产)/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureRef(t),
      mode: /backfill|回填/i.test(t) ? "backfill" : "audit",
      repo: ctx.repo || ""
    }),
    reason: "cdr feature link intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "feature", "chinese"],
    priority: 100
  },
  {
    id: "cdr.stale.scan.english",
    capability: "cdr.stale.scan",
    pattern: /^(?=.*\bstale\b)(?=.*\b(?:scan|scanning|diff)\b).*/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || "",
      base: ctx.base || capture(t, /--base[=\s]+(\S+)/i) || "",
      head: ctx.head || capture(t, /--head[=\s]+(\S+)/i) || ""
    }),
    reason: "cdr stale scan intent",
    confidence: 0.92,
    tags: ["cdr", "stale"],
    priority: 100
  },
  {
    id: "cdr.stale.scan.chinese",
    capability: "cdr.stale.scan",
    pattern: /(?:过期|陈旧|失效).*(?:扫描|检测|diff)/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr stale scan intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "stale", "chinese"],
    priority: 100
  },
  {
    id: "cdr.asset.stalecheck.english",
    capability: "cdr.asset.stalecheck",
    pattern: /^(?=.*\bstale\b)(?=.*\b(?:check|checking|verify|clear|patch)\b).*/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || "",
      clear_stale: /--clear/.test(t)
    }),
    reason: "cdr asset stalecheck intent",
    confidence: 0.9,
    tags: ["cdr", "stale"],
    priority: 100
  },
  {
    id: "cdr.asset.stalecheck.chinese",
    capability: "cdr.asset.stalecheck",
    pattern: /(?:过期|陈旧).*(?:检查|清理|标记)/i,
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || "",
      clear_stale: /--clear|清理/.test(t)
    }),
    reason: "cdr asset stalecheck intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "stale", "chinese"],
    priority: 100
  },
  {
    id: "cdr.architecture.driftcheck.english",
    capability: "cdr.architecture.driftcheck",
    pattern: /^(?=.*\barchitecture\b)(?=.*\bdrift\b).*/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureRef(t),
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr architecture driftcheck intent",
    confidence: 0.92,
    tags: ["cdr", "architecture"],
    priority: 100
  },
  {
    id: "cdr.architecture.driftcheck.chinese",
    capability: "cdr.architecture.driftcheck",
    pattern: /架构.*(?:漂移|偏移|drift)/i,
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureRef(t),
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cdr architecture driftcheck intent (chinese)",
    confidence: 0.92,
    tags: ["cdr", "architecture", "chinese"],
    priority: 100
  },
  {
    id: "cdr.context.envelope.english",
    capability: "cdr.context.envelope",
    pattern: /^(?=.*\benvelope\b).*/i,
    inputBuilder: (t, ctx) => {
      const target = ctx.target || detectEnvelopeTarget(t);
      return {
        ...(target ? { target } : {}),
        id: ctx.id || extractCdrEntryId(t) || extractCdrRepoName(t) || ""
      };
    },
    reason: "cdr context envelope intent (single-artifact bundle)",
    confidence: 0.92,
    tags: ["cdr", "context"],
    priority: 100
  },
  {
    id: "cdr.context.envelope.chinese",
    capability: "cdr.context.envelope",
    pattern: /(?:上下文|语境).*(?:封套|信封|包|bundle)/i,
    inputBuilder: (t, ctx) => {
      const target = ctx.target || detectEnvelopeTarget(t);
      return {
        ...(target ? { target } : {}),
        id: ctx.id || extractCdrEntryId(t) || extractCdrRepoName(t) || ""
      };
    },
    reason: "cdr context envelope intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "context", "chinese"],
    priority: 100
  },
  {
    id: "cognitive.artifact.upsert.english",
    capability: "cognitive.artifact.upsert",
    pattern: /^(?=.*\bcognitive\b)(?=.*\b(?:upsert|write|index|insert)\b).*/i,
    inputBuilder: (t, ctx) => ({
      type: /状态机|state[\s-]?machine/i.test(t) ? "state-machine" : "behavior",
      content: ctx.content || "",
      file: ctx.file || capture(t, /--file[=\s]+(\S+)/i) || ""
    }),
    reason: "cognitive artifact upsert intent",
    confidence: 0.92,
    tags: ["cognitive", "artifact"],
    priority: 100
  },
  {
    id: "cognitive.artifact.upsert.chinese",
    capability: "cognitive.artifact.upsert",
    pattern: /(?:写入|索引|更新).*(?:认知|产物)/i,
    inputBuilder: (t, ctx) => ({
      type: /状态机/.test(t) ? "state-machine" : "behavior",
      content: ctx.content || "",
      file: ctx.file || ""
    }),
    reason: "cognitive artifact upsert intent (chinese)",
    confidence: 0.92,
    tags: ["cognitive", "artifact", "chinese"],
    priority: 100
  },
  {
    id: "cognitive.artifact.validate.english",
    capability: "cognitive.artifact.validate",
    pattern: /^(?=.*\bcognitive\b)(?=.*\b(?:validate|validation|check)\b).*/i,
    inputBuilder: (t, ctx) => ({
      type: /状态机|state[\s-]?machine/i.test(t) ? "state-machine" : "behavior",
      content: ctx.content || "",
      file: ctx.file || capture(t, /--file[=\s]+(\S+)/i) || ""
    }),
    reason: "cognitive artifact validate intent",
    confidence: 0.93,
    tags: ["cognitive", "artifact"],
    priority: 100
  },
  {
    id: "cognitive.artifact.validate.chinese",
    capability: "cognitive.artifact.validate",
    pattern: /(?:校验|验证).*(?:认知|产物)/i,
    inputBuilder: (t, ctx) => ({
      type: /状态机/.test(t) ? "state-machine" : "behavior",
      content: ctx.content || "",
      file: ctx.file || ""
    }),
    reason: "cognitive artifact validate intent (chinese)",
    confidence: 0.92,
    tags: ["cognitive", "artifact", "chinese"],
    priority: 100
  },
  {
    id: "cognitive.explore.english",
    capability: "cognitive.explore",
    pattern: /^(?=.*\bcognitive\b)(?=.*\bexplore\b).*/i,
    inputBuilder: (t, ctx) => ({
      intent: ctx.intent || t,
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cognitive explore intent",
    confidence: 0.92,
    tags: ["cognitive"],
    priority: 100
  },
  {
    id: "cognitive.explore.chinese",
    capability: "cognitive.explore",
    pattern: /认知.*(?:探索|调研|研究)/i,
    inputBuilder: (t, ctx) => ({
      intent: ctx.intent || t,
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "cognitive explore intent (chinese)",
    confidence: 0.9,
    tags: ["cognitive", "chinese"],
    priority: 100
  },
  {
    id: "cdr.capability.map.build.english",
    capability: "cdr.capability.map.init",
    // `build capability map for X` (no init/synth verb) has always resolved to
    // the v0.3 init route, and
    // tests/integration/cdr-v0.8-reverse-cluster.test.mjs pins that. Keeping
    // the verb-less form in its own route — instead of as a broad alternative
    // inside cdr.capability.map.init.chinese — is what keeps init and synth
    // conflict-free per introspectConflicts().
    pattern: /^(?!.*\b(?:init|initialize|synth(?:esize)?)\b)(?=.*\bcapability\b)(?=.*\bmap\b).*/i,
    inputBuilder: (t, ctx) => ({ product: ctx.product || extractCdrProductName(t) || "" }),
    reason: "cdr capability map init intent (verb-less build form)",
    confidence: 0.9,
    tags: ["cdr", "capability-map"],
    priority: 100
  },
  {
    id: "cdr.business.compose.english",
    capability: "cdr.business.compose",
    pattern: /^(?=.*\bcompose\b)(?=.*\b(?:business|rule|ruleset|invariant)\b).*/i,
    inputBuilder: (t, ctx) => ({
      id: ctx.id || capture(t, /\bcompose\s+business(?:\s+rules?)?\s+([a-zA-Z0-9_.-]+)/i),
      kind: ctx.kind || "invariant",
      description: ctx.description || extractCdrDescription(t) || ""
    }),
    reason: "cdr business compose intent",
    confidence: 0.91,
    tags: ["cdr", "business-rule"],
    priority: 100
  }
];
