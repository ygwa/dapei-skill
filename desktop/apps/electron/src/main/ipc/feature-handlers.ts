import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { registerHandler } from "./router.ts";
import type { FeatureService } from "@dapei/desktop-services";
import type { FeatureCloseWithPromoteRequest } from "@dapei/desktop-contracts/feature";
import { broadcastPush } from "../push/broadcast.ts";

/**
 * Feature IPC handlers. M3-2 adds prepareClose + closeWithPromote for
 * the Close Feature wizard. See ADR-0017 for the engine-side contract
 * and `feature.close` v3.0.0 in `packages/core/src/capabilities/domains/feature.ts`.
 */
export function registerFeatureHandlers(services: { feature: FeatureService }, _engine: EngineClient, getContext: () => WorkspaceContext, setContext: (ctx: WorkspaceContext) => void): void {
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

  registerHandler("dapei:feature:prepareClose", async (rawInput) => {
    const { feature } = rawInput as { feature: string };
    return services.feature.prepareClose(feature);
  });

  registerHandler("dapei:feature:closeWithPromote", async (rawInput, _ctx, _engine, runtimeCtx) => {
    const req = rawInput as FeatureCloseWithPromoteRequest;
    // feature.close writes to workspace-dim paths (docs/decisions/,
    // docs/architecture/, docs/feature-impact/). The dimension rule
    // blocks workspace-dim writes from feature-dim context. We must
    // temporarily switch to workspace-dim for the close, then restore.
    // Saving and restoring also preserves the user's "I'm in feature X"
    // state across the modal close action.
    const before = getContext();
    const restore = (): void => {
      setContext(before);
    };
    let success = false;
    try {
      setContext({ workspaceRoot: before.workspaceRoot, dimension: "workspace" });
      broadcastPush({
        channel: "dapei:dimension:lock",
        payload: { scope: "feature", feature: req.feature, reason: "close-wizard" }
      });
      const result = await services.feature.closeWithPromote(req);
      success = result.ok === true;
      if (success) {
        // Broadcast: feature closed (renderer uses this for the success banner).
        broadcastPush({
          channel: "dapei:feature:closed",
          payload: { feature: req.feature, promoted: "ok" }
        });
        // Also broadcast workspace mutation so P3 portal rebuilds.
        broadcastPush({
          channel: "dapei:workspace:mutated",
          payload: { scope: "workspace", keys: ["feature.close"] }
        });
      }
      return result;
    } finally {
      if (success && runtimeCtx?.getContext) {
        const now = runtimeCtx.getContext();
        if (now.dimension === "workspace") restore();
      } else {
        restore();
      }
      broadcastPush({
        channel: "dapei:dimension:unlock",
        payload: { scope: "feature", feature: req.feature }
      });
    }
  }, { isWrite: true });
}
