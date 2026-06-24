// Router entry point.

import { routes, type Route } from "./routes-table.ts";
import { pickBest, FALLBACK_ROUTE } from "./matcher.ts";
import { detectConflicts, summarizeConflict, type RouteConflict } from "./conflict.ts";

export interface RouteResult {
  capability: string;
  input: Record<string, string>;
  reason: string;
  confidence: number;
}

export function routeIntent(intent: string, context: Record<string, string> = {}): RouteResult {
  return pickBest(intent, context, routes).result;
}

export function introspectConflicts(): { conflicts: RouteConflict[]; text: string } {
  const conflicts = detectConflicts(routes);
  const text = conflicts.length === 0
    ? "no conflicts detected"
    : conflicts.map(summarizeConflict).join("\n\n");
  return { conflicts, text };
}

export { routes, type Route } from "./routes-table.ts";
export { pickBest, FALLBACK_ROUTE } from "./matcher.ts";
export { detectConflicts, summarizeConflict, type RouteConflict } from "./conflict.ts";
export { STAGES } from "./extractors.ts";
