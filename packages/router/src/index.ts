export interface RouteResult {
  capability: string;
  input: Record<string, string>;
  reason: string;
  confidence: number;
}

interface Route {
  pattern: RegExp;
  capability: string;
  inputBuilder: (t: string, ctx: Record<string, string>) => Record<string, string>;
  reason: string;
  confidence: number;
}

function matchAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

function matchAll(text: string, phrases: string[]): boolean {
  return phrases.every((p) => text.includes(p));
}

const routes: Route[] = [
  {
    pattern: /^(?=.*(?:^|\s)(?:init|initialize)\b)(?=.*\bworkspace\b).*/i,
    capability: "workspace.init",
    inputBuilder: () => ({}),
    reason: "workspace init intent",
    confidence: 0.95
  },
  {
    pattern: /^(?=.*\brepos?\b)(?=.*\badd\b).*/i,
    capability: "repos.add",
    inputBuilder: (t, ctx) => ({ name: ctx.name || extractName(t), url: ctx.url || extractUrl(t) }),
    reason: "repo add intent",
    confidence: 0.9
  },
  {
    pattern: /^(?=.*\bbehaviors?\b)(?=.*\b(?:analyze|discover)\b).*/i,
    capability: "cognitive.discover",
    inputBuilder: (t, ctx) => ({ target: ctx.target || extractRepoFromBehavior(t) || "--all" }),
    reason: "cognitive behavior discover intent (Agent reads code)",
    confidence: 0.92
  },
  {
    pattern: /^(?=.*\bbehaviors?\b)(?=.*\blist\b).*/i,
    capability: "cognitive.artifact.list",
    inputBuilder: (t, ctx) => ({ repo: ctx.repo || extractRepoFromBehavior(t) }),
    reason: "cognitive artifact list intent",
    confidence: 0.9
  },
  // === CDR (Cognitive Discovery Runtime) routes ===
  // Mutual exclusion: cdr verbs are kept distinct from existing cognitive.* patterns;
  // nouns (entries/behaviors/states) are mutually exclusive within the "discover X" family.
  {
    pattern: /^(?=.*\bprofile\b).*/i,
    capability: "cdr.profile",
    inputBuilder: (t, ctx) => ({ repo: ctx.repo || extractCdrRepoName(t) || "" }),
    reason: "cdr profile repo intent",
    confidence: 0.9
  },
  {
    pattern: /^(?=.*\bdiscover\b)(?=.*\bentries?\b).*/i,
    capability: "cdr.entries.prepare",
    inputBuilder: (t, ctx) => ({ repo: ctx.repo || extractCdrRepoName(t) || "" }),
    reason: "cdr entries prepare intent",
    confidence: 0.93
  },
  {
    pattern: /^(?=.*\bconfirm\b)(?=.*\bentry\b).*/i,
    capability: "cdr.entries.confirm",
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || "",
      entry_id: ctx.entry_id || extractCdrEntryId(t) || ""
    }),
    reason: "cdr entries confirm intent",
    confidence: 0.92
  },
  {
    pattern: /^(?=.*\bdiscover\b)(?=.*\bstates?\b).*/i,
    capability: "cognitive.state.suggest",
    inputBuilder: (t, ctx) => {
      const entity = ctx.entity || extractCdrEntityName(t);
      // Entity must be extracted before repo; otherwise "for Order in mall-order"
      // would surface "Order" as the repo. Case-sensitive replace so that
      // \border\b inside "mall-order" is not also stripped by the global flag.
      const textWithoutEntity = entity ? t.replace(new RegExp(`\\b${entity}\\b`, "g"), "") : t;
      return {
        entity: entity || "all",
        repo: ctx.repo || extractCdrRepoName(textWithoutEntity) || ""
      };
    },
    reason: "cognitive state suggest intent",
    confidence: 0.93
  },
  {
    pattern: /^(?=.*\bcompose\b)(?=.*\bdomain\b).*/i,
    capability: "cdr.domain.compose",
    inputBuilder: (t, ctx) => ({
      domain: ctx.domain || extractCdrDomainName(t) || "",
      description: ctx.description || extractCdrDescription(t) || ""
    }),
    reason: "cdr domain compose intent",
    confidence: 0.92
  },
  {
    pattern: /^(?=.*\binit\b)(?=.*\bcapability\b)(?=.*\bmap\b).*/i,
    capability: "cdr.capability.map.init",
    inputBuilder: (t, ctx) => ({ product: ctx.product || extractCdrProductName(t) || "" }),
    reason: "cdr capability map init intent",
    confidence: 0.92
  },
  {
    // "documentation|docs|portal" noun (not just "build") avoids conflict with context.build
    pattern: /^(?=.*\b(?:generate|build|render)\b)(?=.*\b(?:documentation|docs|portal)\b).*/i,
    capability: "cdr.doc.generate",
    inputBuilder: (t, ctx) => ({ output_dir: ctx.output_dir || ".dapei/docs-portal" }),
    reason: "cdr doc generate intent",
    confidence: 0.92
  },
  {
    // Lower confidence: "list" alone routes to cognitive.artifact.list; cdr.index.list needs an explicit CDR noun
    pattern: /^(?=.*\b(?:list|show)\b)(?=.*\b(?:assets|cognitive|index)\b).*/i,
    capability: "cdr.index.list",
    inputBuilder: (t, ctx) => ({
      repo: ctx.repo || extractCdrRepoName(t) || "",
      kind: ctx.kind || ""
    }),
    reason: "cdr index list intent",
    confidence: 0.85
  },
  // === CDR Chinese intent patterns (中文) ===
  // Each Chinese pattern is mutual-exclusive with English ones on key verbs/nouns.
  {
    pattern: /分析.*?(?:repo|仓库|项目|repos?)?\s*([a-zA-Z0-9_-]+)/i,
    capability: "cdr.profile",
    inputBuilder: (t, ctx) => {
      const m = t.match(/分析.*?(?:repo|仓库|项目|repos?)?\s*([a-zA-Z0-9_-]+)/i);
      return { repo: ctx.repo || (m ? m[1] : "") || "" };
    },
    reason: "cdr profile repo intent (chinese)",
    confidence: 0.88
  },
  {
    pattern: /扫描.*?(?:入口|entries?)\s+(?:for\s+|in\s+)?([a-zA-Z0-9_-]+)/i,
    capability: "cdr.entries.prepare",
    inputBuilder: (t, ctx) => {
      const m = t.match(/扫描.*?(?:入口|entries?)\s+(?:for\s+|in\s+)?([a-zA-Z0-9_-]+)/i);
      return { repo: ctx.repo || (m ? m[1] : "") || "" };
    },
    reason: "cdr entries prepare intent (chinese)",
    confidence: 0.91
  },
  {
    pattern: /(?:确认|标记).*?(?:入口|entry)\s+([a-zA-Z0-9_-]+)/i,
    capability: "cdr.entries.confirm",
    inputBuilder: (t, ctx) => {
      const m = t.match(/(?:确认|标记).*?(?:入口|entry)\s+([a-zA-Z0-9_-]+)/i);
      return {
        repo: ctx.repo || extractCdrRepoName(t) || "",
        entry_id: ctx.entry_id || (m ? m[1] : "") || ""
      };
    },
    reason: "cdr entries confirm intent (chinese)",
    confidence: 0.9
  },
  {
    pattern: /推导.*(?:状态|state)\s+(?:for\s+|of\s+)?([A-Z][a-zA-Z0-9]+)?/i,
    capability: "cognitive.state.suggest",
    inputBuilder: (t, ctx) => {
      const m = t.match(/(?:状态|state)\s+(?:for\s+|of\s+)?([A-Z][a-zA-Z0-9]+)/);
      const entity = ctx.entity || (m ? m[1] : "") || "all";
      return { entity, repo: ctx.repo || extractCdrRepoName(t) || "" };
    },
    reason: "cognitive state suggest intent (chinese)",
    confidence: 0.91
  },
  {
    pattern: /(?:组合|聚类|compose).*(?:领域|domain)\s+([a-zA-Z0-9_-]+)/i,
    capability: "cdr.domain.compose",
    inputBuilder: (t, ctx) => {
      const m = t.match(/(?:组合|聚类|compose)\s*(?:领域|domain)\s+([a-zA-Z0-9_-]+)/i);
      return {
        domain: ctx.domain || (m ? m[1] : "") || "",
        description: ctx.description || ""
      };
    },
    reason: "cdr domain compose intent (chinese)",
    confidence: 0.9
  },
  {
    pattern: /(?:组合|聚类|compose).*(?:业务规则?|business[\s_-]?rule?)\s+([a-zA-Z0-9_-]+)/i,
    capability: "cdr.business.compose",
    inputBuilder: (t, ctx) => ({
      id: ctx.id || (t.match(/(?:业务规则?|business[\s_-]?rule?)\s+([a-zA-Z0-9_-]+)/i)?.[1] || ""),
      kind: ctx.kind || "invariant",
      description: ctx.description || ""
    }),
    reason: "cdr business compose intent (chinese)",
    confidence: 0.9
  },
  {
    pattern: /(?:初始化|init).*功能地图|capability.*map.*for\s+([A-Za-z][A-Za-z0-9 _-]+)/i,
    capability: "cdr.capability.map.init",
    inputBuilder: (t, ctx) => ({ product: ctx.product || extractCdrProductName(t) || "" }),
    reason: "cdr capability map init intent (chinese)",
    confidence: 0.9
  },
  {
    pattern: /(?:生成|build|render).*(?:文档|documentation|docs|门户|portal)/i,
    capability: "cdr.doc.generate",
    inputBuilder: (t, ctx) => ({ output_dir: ctx.output_dir || ".dapei/docs-portal" }),
    reason: "cdr doc generate intent (chinese)",
    confidence: 0.9
  },
  {
    pattern: /(?:列出|list)\s*(?:资产|assets|认知|cognitive|索引|index)/i,
    capability: "cdr.index.list",
    inputBuilder: (t, ctx) => ({ repo: ctx.repo || extractCdrRepoName(t) || "", kind: ctx.kind || "" }),
    reason: "cdr index list intent (chinese)",
    confidence: 0.85
  },
  {
    pattern: /^(?=.*\brepos?\b)(?=.*\banalyze\b).*/i,
    capability: "repos.analyze",
    inputBuilder: (t, ctx) => ({ target: ctx.target || extractTarget(t) || "--all" }),
    reason: "repo analyze intent",
    confidence: 0.95
  },
  {
    pattern: /^(?=.*\brepos?\b)(?=.*\bsync\b).*/i,
    capability: "repos.sync",
    inputBuilder: (t, ctx) => ({ target: ctx.target || extractTarget(t) || "--all" }),
    reason: "repo sync intent",
    confidence: 0.95
  },
  {
    pattern: /^(?=.*\brepos?\b)(?=.*\blist\b).*/i,
    capability: "repos.list",
    inputBuilder: () => ({}),
    reason: "repo list intent",
    confidence: 0.9
  },
  {
    pattern: /^(?=.*\brepos?\b)(?=.*\bcheck\b).*/i,
    capability: "repos.check",
    inputBuilder: (t, ctx) => ({ target: ctx.target || extractTarget(t) || "--all" }),
    reason: "repo check intent",
    confidence: 0.92
  },
  {
    pattern: /^(?=.*\bcreate\b)(?=.*\bfeature\b).*/i,
    capability: "feature.create",
    inputBuilder: (t, ctx) => ({ name: ctx.name || extractFeatureName(t), repos: ctx.repos || extractRepos(t), objective: ctx.objective || extractObjective(t) || "TBD" }),
    reason: "feature create intent",
    confidence: 0.95
  },
  {
    pattern: /创建.*feature|feature.*创建/i,
    capability: "feature.create",
    inputBuilder: (t, ctx) => ({ name: ctx.name || extractFeatureName(t), repos: ctx.repos || extractRepos(t), objective: ctx.objective || extractObjective(t) || "TBD" }),
    reason: "feature create intent (chinese)",
    confidence: 0.95
  },
  {
    pattern: /新开.*需求|需求.*新开/i,
    capability: "feature.create",
    inputBuilder: (t, ctx) => ({ name: ctx.name || extractFeatureName(t), repos: ctx.repos || extractRepos(t), objective: ctx.objective || extractObjective(t) || "TBD" }),
    reason: "feature create intent (chinese)",
    confidence: 0.95
  },
  {
    pattern: /^(?=.*\bcontext\b)(?=.*\bbuild\b).*/i,
    capability: "context.build",
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t), stage: ctx.stage || extractStage(t) || "general" }),
    reason: "context build intent",
    confidence: 0.95
  },
  {
    pattern: /^(?=.*\brun\b)(?=.*\bworkflow\b).*/i,
    capability: "workflow.runStage",
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t), stage: ctx.stage || extractStage(t) || "" }),
    reason: "workflow run intent",
    confidence: 0.9
  },
  {
    pattern: /^(?=.*\bvalidate\b).*/i,
    capability: "validation.run",
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t) }),
    reason: "validation intent",
    confidence: 0.85
  },
  {
    pattern: /^(?=.*\breport\b).*/i,
    capability: "feature.report",
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t) }),
    reason: "report intent",
    confidence: 0.8
  },
  {
    pattern: /^(?=.*\breview\b).*/i,
    capability: "feature.review",
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t) }),
    reason: "review intent",
    confidence: 0.8
  },
  {
    pattern: /^(?=.*\bclose\b)(?=.*\bfeature\b).*/i,
    capability: "feature.close",
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t) }),
    reason: "close feature intent",
    confidence: 0.9
  },
  {
    pattern: /^(?=.*\bfeature\b)(?=.*\bclose\b).*/i,
    capability: "feature.close",
    inputBuilder: (t, ctx) => ({ feature: ctx.feature || extractFeatureName(t) }),
    reason: "close feature intent (reversed)",
    confidence: 0.9
  },
  {
    pattern: /^(?=.*\bstatus\b).*$/i,
    capability: "feature.status",
    inputBuilder: () => ({}),
    reason: "status intent",
    confidence: 0.7
  },
  {
    pattern: /^(?=.*\b(?:stale|过时|过期|失效|文档过时|asset.*stale|stale.*check)\b).*/i,
    capability: "cdr.asset.stale-check",
    inputBuilder: (t, ctx) => ({ repo: ctx.repo || extractCdrRepoName(t) || "" }),
    reason: "stale asset check intent",
    confidence: 0.92
  },
  {
    pattern: /^(?=.*\b(?:assign|指派|分配)\b)(?=.*\bfeature\b).*/i,
    capability: "feature.assign",
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      owner: ctx.owner || extractAssignee(t) || "",
      assignees: ctx.assignees || ""
    }),
    reason: "feature assign intent",
    confidence: 0.92
  },
  {
    pattern: /^(?=.*\b(?:handoff|转交|交接)\b).*/i,
    capability: "feature.handoff",
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      to: ctx.to || extractAssignee(t) || "",
      note: ctx.note || ""
    }),
    reason: "feature handoff intent",
    confidence: 0.92
  },
  {
    pattern: /^(?=.*\b(?:team|team.*status|who.*working|团队|谁在做什么|团队状态)\b).*/i,
    capability: "feature.team-status",
    inputBuilder: () => ({}),
    reason: "team status intent",
    confidence: 0.93
  },
  {
    pattern: /^(?=.*\b(?:explore|explore.*repo|了解|看看|帮我看看|了解一下)\b).*/i,
    capability: "cognitive.explore",
    inputBuilder: (t, ctx) => ({
      intent: t,
      repo: ctx.repo || extractCdrRepoName(t) || extractRepoFromBehavior(t) || ""
    }),
    reason: "exploration mode intent",
    confidence: 0.88
  },
  {
    pattern: /^(?=.*\b(?:drift|漂移|architecture.*drift|drift.*check)\b).*/i,
    capability: "cdr.architecture-drift-check",
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      repo: ctx.repo || extractCdrRepoName(t) || ""
    }),
    reason: "architecture drift check intent",
    confidence: 0.92
  },
  {
    pattern: /(?:stale|过时|哪些.*过时|哪些.*变化)/i,
    capability: "cdr.asset.stale-check",
    inputBuilder: (t, ctx) => ({ repo: ctx.repo || extractCdrRepoName(t) || "" }),
    reason: "stale check intent (chinese)",
    confidence: 0.9
  },
  {
    pattern: /(?:指派|分配).*(?:给|to)\s+(\S+)/i,
    capability: "feature.assign",
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      owner: ctx.owner || (t.match(/(?:指派|分配).*(?:给|to)\s+(\S+)/i)?.[1] || ""),
      assignees: ctx.assignees || ""
    }),
    reason: "feature assign intent (chinese)",
    confidence: 0.9
  },
  {
    pattern: /(?:转交|交接).*(?:给|to)\s+(\S+)/i,
    capability: "feature.handoff",
    inputBuilder: (t, ctx) => ({
      feature: ctx.feature || extractFeatureName(t),
      to: ctx.to || (t.match(/(?:转交|交接).*(?:给|to)\s+(\S+)/i)?.[1] || ""),
      note: ctx.note || ""
    }),
    reason: "feature handoff intent (chinese)",
    confidence: 0.9
  }
];

function extractFeatureName(t: string): string {
  const patterns = [
    /feature[:\s]+([a-z0-9-]+)/i,
    /([a-z0-9-]+)[\s\n]/,
    /\/([a-z0-9-]+)$/
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1];
  }
  return "";
}

function extractName(t: string): string {
  const patterns = [
    /(?:name|repo)[:\s]+([a-zA-Z0-9_-]+)/i,
    /add\s+([a-zA-Z0-9_-]+)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1];
  }
  return "";
}

function extractUrl(t: string): string {
  const patterns = [
    /https?:\/\/[^\s]+/,
    /git@[^\s]+/
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) return m[0];
  }
  return "";
}

function extractTarget(t: string): string {
  const m = t.match(/--all|--target\s+([a-zA-Z0-9_-]+)/i);
  if (m && m[1]) return m[1];
  if (t.includes("--all")) return "--all";
  return "";
}

function extractRepos(t: string): string {
  const patterns = [
    /repos[:\s]+([a-zA-Z0-9_,-]+)/i,
    /--repos\s+([a-zA-Z0-9_,-]+)/i,
    /(?:包含|涉及)\s+([a-zA-Z0-9_,\s-]+?)(?:\s|,|$|\n)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1].trim().replace(/\s+/g, "");
  }
  return "";
}

function extractObjective(t: string): string {
  const patterns = [
    /(?:goal|objective|目标|目的)[:\s]+(.+?)(?:\n|$)/i,
    /(?:goal|objective|目标)[:\s]+(.+?)(?:\.|$)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

function extractStage(t: string): string {
  const stages = ["analyze-current-state", "gap-analysis", "solution-design", "task-breakdown", "implementation", "local-validation", "architecture-review", "acceptance"];
  for (const s of stages) {
    if (t.includes(s)) return s;
  }
  const stageMatch = t.match(/stage[:\s]+([a-z-]+)/i);
  if (stageMatch) return stageMatch[1];
  return "";
}

function extractRepoFromBehavior(t: string): string {
  const patterns = [
    /(?:for|repo|target)\s+([a-zA-Z0-9_-]+)/i,
    /behaviors?\s+for\s+([a-zA-Z0-9_-]+)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1] && m[1] !== "behavior" && m[1] !== "behaviors") return m[1];
  }
  return "";
}

const CDR_NOISE = new Set([
  "repo", "repos", "the", "a", "an", "this", "that", "behavior", "behaviors",
  "state", "states", "entry", "entries", "domain", "product", "map", "maps",
  "documentation", "docs", "doc", "portal", "assets", "asset", "cognitive", "index",
  "all", "with", "using", "and", "or", "from", "to"
]);

function extractCdrRepoName(t: string): string {
  // Pattern order matters: "in X at end" must come before "for X" so that
  // "for Order in mall-order" surfaces "mall-order", not "Order".
  const patterns = [
    /\bin\s+([a-zA-Z][a-zA-Z0-9_-]+)\s*$/,
    /\brepo\s+([a-zA-Z][a-zA-Z0-9_-]*)/i,
    /\bfor\s+([a-zA-Z][a-zA-Z0-9_-]+)\b/
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1] && !CDR_NOISE.has(m[1].toLowerCase())) return m[1];
  }
  return "";
}

function extractCdrEntryId(t: string): string {
  const patterns = [
    /\bconfirm\s+entry\s+([a-zA-Z0-9_-]+)/i,
    /\bentry\s+([a-zA-Z0-9_-]+)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1] && m[1].toLowerCase() !== "in") return m[1];
  }
  return "";
}

function extractCdrEntityName(t: string): string {
  // Entity names are typically capitalized identifiers (Order, Payment, User)
  const patterns = [
    /\bentity\s+([A-Z][a-zA-Z0-9]*)/,
    /\bfor\s+([A-Z][a-zA-Z0-9]+)\b/,
    /\bof\s+([A-Z][a-zA-Z0-9]+)\b/,
    /\b([A-Z][a-zA-Z]{2,})\s+(?:state|states)\b/
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1];
  }
  return "";
}

function extractCdrDomainName(t: string): string {
  const patterns = [
    /\bcompose\s+domain\s+([a-zA-Z][a-zA-Z0-9_-]+)/i,
    /\bdomain\s+([a-zA-Z][a-zA-Z0-9_-]+)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1] && m[1].toLowerCase() !== "from") return m[1];
  }
  return "";
}

function extractCdrProductName(t: string): string {
  const patterns = [
    /\bcapability\s+map\s+for\s+(.+?)(?:\s+--|\n|$)/i,
    /\bfor\s+([A-Za-z][A-Za-z0-9 _-]+?)(?:\s+--|\n|$)/
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

function extractCdrDescription(t: string): string {
  const patterns = [
    /(?:description|desc|描述)[:\s]+(.+?)(?:\n|$)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

function extractAssignee(t: string): string {
  const patterns = [
    /(?:assign|指派|分配|handoff|转交|交接)\s+(?:feature\s+)?(?:to\s+|给\s+)?(\S+)/i,
    /(?:to\s+|给\s+)([a-zA-Z0-9_-]+)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1] && m[1].toLowerCase() !== "feature") return m[1];
  }
  return "";
}

export function routeIntent(intent: string, context: Record<string, string> = {}): RouteResult {
  const t = intent.trim().toLowerCase();

  let bestMatch: RouteResult = {
    capability: "feature.status",
    input: {},
    reason: "fallback (no match)",
    confidence: 0.1
  };

  for (const route of routes) {
    if (route.pattern.test(intent)) {
      if (route.confidence > bestMatch.confidence) {
        bestMatch = {
          capability: route.capability,
          input: route.inputBuilder(intent, context),
          reason: route.reason,
          confidence: route.confidence
        };
      }
    }
  }

  return bestMatch;
}
