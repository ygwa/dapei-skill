import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { registerHandler } from "./router.ts";
import type { FeatureService } from "@dapei/desktop-services";

/**
 * Feature IPC handlers. M1-4 wires: list, status, stage,
 * runStage, create. The FeatureService does the engine
 * round-trip; the router does Zod validation + dimension rule.
 */
export function registerFeatureHandlers(services: { feature: FeatureService }): void {
  registerHandler("dapei:feature:list", async () => {
    return services.feature.list();
  });

  registerHandler("dapei:feature:status", async (rawInput) => {
    const { name } = rawInput as { name: string };
    return services.feature.getStatus(name);
  });

  registerHandler("dapei:feature:stage", async (rawInput) => {
    const { name } = rawInput as { name: string };
    return services.feature.getStage(name);
  });

  registerHandler("dapei:feature:runStage", async (rawInput) => {
    const { name, stage, confirmed } = rawInput as { name: string; stage: string; confirmed?: boolean };
    return services.feature.runStage(name, stage, Boolean(confirmed));
  }, { isWrite: true });

  registerHandler("dapei:feature:create", async (rawInput) => {
    const { name, repos, objective } = rawInput as { name: string; repos: string; objective?: string };
    return services.feature.create({ name, repos, objective });
  }, { isWrite: true });
}
