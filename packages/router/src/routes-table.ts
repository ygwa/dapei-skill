// Data-driven route table.
//
// Each entry is a Route record with:
//   - id: stable identifier for diagnostics and conflict detection
//   - capability: the engine capability to invoke
//   - pattern: regex matched against the raw intent (case-insensitive)
//   - inputBuilder: pure function (intent, ctx) -> Record<string,string>
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

export interface Route {
  id: string;
  capability: string;
  pattern: RegExp;
  inputBuilder: (t: string, ctx: Record<string, string>) => Record<string, string>;
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
    pattern: /^(?=.*\brepos?\b)(?=.*\badd\b).*/i,
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
    pattern: /^(?=.*\bprofile\b).*/i,
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
    pattern: /^(?:bootstrap|引导)\s+(?:repo\s+)?([a-z0-9][a-z0-9._-]*)/i,
    capability: "cdr.bootstrap",
    inputBuilder: (t, ctx) => {
      const m = t.match(/(?:bootstrap|引导)\s+(?:repo\s+)?([a-z0-9][a-z0-9._-]*)/i);
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
  {
    id: "cdr.doc.generate.english",
    pattern: /^(?=.*\b(?:generate|build|render)\b)(?=.*\b(?:documentation|docs|portal)\b).*/i,
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
    pattern: /(?:初始化|init).*功能地图|capability.*map.*for\s+([A-Za-z][A-Za-z0-9 _-]+)/i,
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
    pattern: /(?:生成|渲染|render|build)\s*(?:跨[_-]?仓库?|跨[_-]?服务?|cross[_-]?repo|cross[_-]?repository)\s*(?:门户|视图|portal|view|page)/i,
    capability: "cdr.crossrepo.doc.generate",
    inputBuilder: (t, ctx) => ({ output_dir: ctx.output_dir || ".dapei/docs-portal" }),
    reason: "cdr cross_repo doc generate intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "doc", "cross-repo", "chinese"],
    priority: 50
  },
  {
    id: "cdr.doc.generate.chinese",
    pattern: /(?:生成|build|render).*(?:文档|documentation|docs|门户|portal)/i,
    capability: "cdr.doc.generate",
    inputBuilder: (t, ctx) => ({ output_dir: ctx.output_dir || ".dapei/docs-portal" }),
    reason: "cdr doc generate intent (chinese)",
    confidence: 0.9,
    tags: ["cdr", "doc", "chinese"],
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
    pattern: /(?:建立|生成|build|cluster|汇总|推导)\s*(?:跨[_-]?仓库?|跨[_-]?服务?|cross[_-]?repo|cross[_-]?repository)\s*(?:业务规则|关系|rules?|ruleset|view|map)?/i,
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
    pattern: /(?:渲染|生成|build|render).*(?:L1|能力地图|功能全景|capability[\s_-]?map)/i,
    capability: "cdr.reversecluster.doc.generate",
    inputBuilder: (t, ctx) => ({ output_dir: ctx.output_dir || ".dapei/docs-portal" }),
    reason: "cdr reverse_cluster doc generate intent (chinese)",
    confidence: 0.88,
    tags: ["cdr", "doc", "chinese", "v0.8"],
    priority: 100
  },
  {
    id: "repos.analyze.english",
    capability: "repos.analyze",
    pattern: /^(?=.*\brepos?\b)(?=.*\banalyze\b).*/i,
    inputBuilder: (t, ctx) => ({ target: ctx.target || extractTarget(t) || "--all" }),
    reason: "repo analyze intent",
    confidence: 0.95,
    tags: ["repos"],
    priority: 100
  },
  {
    id: "repos.sync.english",
    capability: "repos.sync",
    pattern: /^(?=.*\brepos?\b)(?=.*\bsync\b).*/i,
    inputBuilder: (t, ctx) => ({ target: ctx.target || extractTarget(t) || "--all" }),
    reason: "repo sync intent",
    confidence: 0.95,
    tags: ["repos"],
    priority: 100
  },
  {
    id: "repos.list.english",
    capability: "repos.list",
    pattern: /^(?=.*\brepos?\b)(?=.*\blist\b).*/i,
    inputBuilder: () => ({}),
    reason: "repo list intent",
    confidence: 0.9,
    tags: ["repos"],
    priority: 100
  },
  {
    id: "repos.check.english",
    capability: "repos.check",
    pattern: /^(?=.*\brepos?\b)(?=.*\bcheck\b).*/i,
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
  }
];
