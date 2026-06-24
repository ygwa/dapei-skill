// Pure matcher logic shared by routeIntent (index.ts) and the static
// conflict detector (conflict.ts). Extracted into its own module so
// neither depends on the other.

import type { Route } from "./routes-table.ts";

export interface MatchResult {
  route: Route;
  result: {
    capability: string;
    input: Record<string, string>;
    reason: string;
    confidence: number;
  };
}

export const FALLBACK_ROUTE: Route = {
  id: "fallback",
  capability: "feature.status",
  pattern: /.*/,
  inputBuilder: () => ({}),
  reason: "fallback (no match)",
  confidence: 0.1,
  tags: ["fallback"],
  priority: 1000
};

export function pickBest(
  intent: string,
  ctx: Record<string, string>,
  table: Route[]
): MatchResult {
  let best: MatchResult | undefined;
  for (const route of table) {
    if (!route.pattern.test(intent)) continue;
    if (best && route.confidence < best.route.confidence) continue;
    if (
      best &&
      route.confidence === best.route.confidence &&
      (route.priority ?? 100) > (best.route.priority ?? 100)
    ) {
      continue;
    }
    best = {
      route,
      result: {
        capability: route.capability,
        input: route.inputBuilder(intent, ctx),
        reason: route.reason,
        confidence: route.confidence
      }
    };
  }
  if (best) return best;
  return {
    route: FALLBACK_ROUTE,
    result: {
      capability: FALLBACK_ROUTE.capability,
      input: {},
      reason: FALLBACK_ROUTE.reason,
      confidence: FALLBACK_ROUTE.confidence
    }
  };
}
