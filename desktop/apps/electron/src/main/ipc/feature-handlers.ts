import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { registerHandler } from "./router.ts";
import type { FeatureService } from "@dapei/desktop-services";

/**
 * Feature IPC handlers. M1-5 adds: context (build), tasks (list).
 * M1-4 already had list / status / stage / runStage / create.
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

  registerHandler("dapei:feature:context", async (rawInput, _ctx, _engine, runtimeCtx) => {
    const { name, stage } = rawInput as { name: string; stage: string };
    if (runtimeCtx?.setContext) {
      const current = runtimeCtx.getContext();
      runtimeCtx.setContext({ workspaceRoot: current.workspaceRoot, dimension: "feature", feature: name });
    }
    return services.feature.buildContext(name, stage);
  }, { isWrite: true });

  registerHandler("dapei:feature:tasks", async (rawInput) => {
    const { name, action = "list" } = rawInput as { name: string; action?: "list" | "append" };
    if (action === "list") {
      return services.feature.getBacklog(name);
    }
    return { ok: false, error: { code: "NOT_IMPLEMENTED", message: "append not implemented in M1-5" } };
  });

  registerHandler("dapei:feature:create", async (rawInput) => {
    const { name, repos, objective } = rawInput as { name: string; repos: string; objective?: string };
    return services.feature.create({ name, repos, objective });
  }, { isWrite: true });
}
