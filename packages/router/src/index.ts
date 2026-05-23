export interface RouteResult {
  capability: string;
  input: Record<string, string>;
  reason: string;
}

export function routeIntent(intent: string, context: Record<string, string> = {}): RouteResult {
  const t = intent.trim().toLowerCase();
  if (t.includes("init") && t.includes("workspace")) return { capability: "workspace.init", input: {}, reason: "workspace init intent" };
  if (t.includes("repos add") || t.includes("接入")) return { capability: "repos.add", input: { name: context.name || "", url: context.url || "" }, reason: "repo add intent" };
  if (t.includes("repos analyze") || t.includes("分析")) return { capability: "repos.analyze", input: { target: context.target || "--all" }, reason: "repo analyze intent" };
  if (t.includes("create feature") || t.includes("创建 feature") || t.includes("新开一个需求")) return { capability: "feature.create", input: { name: context.name || "", repos: context.repos || "", objective: context.objective || "TBD" }, reason: "feature create intent" };
  if (t.includes("context build")) return { capability: "context.build", input: { feature: context.feature || "", stage: context.stage || "general" }, reason: "context build intent" };
  if (t.includes("run workflow")) return { capability: "workflow.runStage", input: { feature: context.feature || "", stage: context.stage || "" }, reason: "workflow run intent" };
  if (t.includes("validate")) return { capability: "validation.run", input: { feature: context.feature || "" }, reason: "validation intent" };
  if (t.includes("report")) return { capability: "feature.report", input: { feature: context.feature || "" }, reason: "report intent" };
  if (t.includes("review")) return { capability: "feature.review", input: { feature: context.feature || "" }, reason: "review intent" };
  if (t.includes("close")) return { capability: "feature.close", input: { feature: context.feature || "" }, reason: "close intent" };
  if (t.includes("status")) return { capability: "feature.status", input: {}, reason: "status intent" };
  return { capability: "feature.status", input: {}, reason: "fallback" };
}
