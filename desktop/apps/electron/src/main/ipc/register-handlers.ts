import { ipcMain } from "electron";
import type { CapabilityInvokeRequest } from "@dapei/desktop-contracts";
import { IPC_CHANNELS } from "@dapei/desktop-contracts";
import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import type { DesktopServices } from "@dapei/desktop-services";
import type { AgentHost } from "@dapei/desktop-agent";
import { registerHandler, installIpcRouter, setRouterEngineAndContext } from "./router.ts";
import { registerWorkspaceHandlers } from "./workspace-handlers.ts";
import { registerReposHandlers } from "./repos-handlers.ts";
import { registerFeatureHandlers } from "./feature-handlers.ts";
import { registerKnowledgeHandlers } from "./knowledge-handlers.ts";
import { registerAgentHandlers } from "./agent-handlers.ts";
import { broadcastPush } from "../push/broadcast.ts";

export function registerIpcHandlers(
  engine: EngineClient,
  getContext: () => WorkspaceContext,
  setContext: (ctx: WorkspaceContext) => void,
  services: DesktopServices,
  agent: AgentHost
): void {
  setRouterEngineAndContext(engine, getContext, setContext);
  registerWorkspaceHandlers(setContext, getContext);
  registerReposHandlers(services);
  registerFeatureHandlers(services);
  registerKnowledgeHandlers(services, getContext);
  registerAgentHandlers(agent);

  registerHandler(IPC_CHANNELS.capability.run, async (rawInput, ctx) => {
    const input = rawInput as CapabilityInvokeRequest;
    const result = await engine.run(input, ctx);
    if (result.ok) {
      broadcastPush({
        channel: "dapei:workspace:mutated",
        payload: { scope: input.feature ? "feature" : "workspace", keys: [input.capabilityId] }
      });
    }
    return result;
  });

  installIpcRouter();

  ipcMain.handle(IPC_CHANNELS.plugin.list, async () => []);
}
