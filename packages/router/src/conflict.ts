// Static route-conflict detector.

import { routes, type Route } from "./routes-table.ts";
import { pickBest } from "./matcher.ts";

export interface RouteConflict {
  routeA: Route;
  routeB: Route;
  sampleIntents: string[];
  winner: "A" | "B" | "tie";
}

const CONFLICT_PROBES: string[] = [
  "synth capability map for E-Commerce Mall",
  "init capability map for E-Commerce Mall",
  "render cross-repo portal",
  "render documentation portal",
  "render L1 portal",
  "bootstrap sample-app",
  "profile repo sample-app",
  "生成跨仓库门户",
  "生成文档门户",
  "引导 sample-app",
  "分析 repo sample-app",
  "确认入口 order-create",
  "推导状态 for Order"
];

export function detectConflicts(table: Route[] = routes): RouteConflict[] {
  const out: RouteConflict[] = [];
  for (let i = 0; i < table.length; i++) {
    for (let j = i + 1; j < table.length; j++) {
      const a = table[i];
      const b = table[j];
      const both: string[] = [];
      for (const probe of CONFLICT_PROBES) {
        if (a.pattern.test(probe) && b.pattern.test(probe)) both.push(probe);
      }
      if (both.length === 0) continue;

      const winnerRouteIds = new Set<string>();
      let thirdPartyWins = false;
      for (const intent of both) {
        const w = pickBest(intent, {}, table).route;
        if (w.id !== a.id && w.id !== b.id) {
          thirdPartyWins = true;
          break;
        }
        winnerRouteIds.add(w.id);
      }
      if (thirdPartyWins) continue;

      let winner: "A" | "B" | "tie";
      if (winnerRouteIds.size === 1) {
        winner = winnerRouteIds.has(a.id) ? "A" : "B";
      } else {
        winner = "tie";
      }
      out.push({ routeA: a, routeB: b, sampleIntents: both, winner });
    }
  }
  return out;
}

export function summarizeConflict(c: RouteConflict): string {
  const winnerName = c.winner === "A"
    ? c.routeA.id
    : c.winner === "B"
      ? c.routeB.id
      : "tie / per-intent";
  return [
    `[${c.routeA.id}] vs [${c.routeB.id}]`,
    `  winner: ${winnerName}`,
    `  shared intents: ${c.sampleIntents.join(", ")}`
  ].join("\n");
}
