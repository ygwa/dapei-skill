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
    pattern: /^(?=.*\bbehavior\b)(?=.*\b(?:analyze|discover|list)\b).*/i,
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
  const stages = ["analyze-current-state", "gap-analysis", "solution-design", "task-breakdown", "implementation", "validation", "acceptance"];
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
