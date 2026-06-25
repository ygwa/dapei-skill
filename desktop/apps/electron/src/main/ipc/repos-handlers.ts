import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { registerHandler } from "./router.ts";
import type { ReposService } from "@dapei/desktop-services";

/**
 * Repos IPC handlers. M1-4 wires the four reads: list / add /
 * sync / profile. Each handler goes through ReposService which
 * itself calls engine.run. The router still does Zod validation
 * and the dimension rule.
 */
export function registerReposHandlers(services: { repos: ReposService }): void {
  registerHandler("dapei:repos:list", async (_input, _ctx, _engine) => {
    return services.repos.list();
  });

  registerHandler("dapei:repos:add", async (rawInput) => {
    const { name, url } = rawInput as { name: string; url: string };
    return services.repos.add(name, url);
  }, { isWrite: true });

  registerHandler("dapei:repos:sync", async (rawInput) => {
    const { target } = rawInput as { target: string };
    return services.repos.sync(target);
  }, { isWrite: true });

  registerHandler("dapei:repos:profile", async (rawInput) => {
    const { name } = rawInput as { name: string };
    return services.repos.profile(name);
  });
}
