import type { BrowserWindow } from "electron";
import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { createAgentHost, type AgentHost } from "@dapei/desktop-agent";
import { createPluginHostStub } from "@dapei/desktop-plugins";
import { createDesktopServices, type DesktopServices } from "@dapei/desktop-services";
import { registerIpcHandlers } from "./ipc/register-handlers.ts";
import { startPluginUtilityHost } from "./plugins/utility-host.ts";
import { wireAgentPush } from "./wire-agent-push.ts";
import { createEngineClient } from "./engine/subprocess-client.ts";

export interface AppContext {
  agent: AgentHost;
  plugins: ReturnType<typeof createPluginHostStub>;
  engine: EngineClient;
  services: DesktopServices;
  currentContext: WorkspaceContext;
  setContext: (ctx: WorkspaceContext) => void;
}

let bootstrapped = false;

export function bootstrapApp(_mainWindow: BrowserWindow, initialContext: WorkspaceContext): AppContext {
  if (bootstrapped) {
    throw new Error("bootstrapApp already called");
  }
  bootstrapped = true;

  const engine = createEngineClient();
  const agent = createAgentHost();
  const plugins = createPluginHostStub();

  let currentContext: WorkspaceContext = initialContext;
  const setContext = (next: WorkspaceContext): void => {
    currentContext = next;
  };
  const getContext = (): WorkspaceContext => currentContext;

  const services = createDesktopServices(engine, currentContext);

  registerIpcHandlers(engine, getContext, setContext, services, agent);
  void plugins.init();
  startPluginUtilityHost();
  wireAgentPush(agent);

  console.info(
    `[dapei-desktop] bootstrap complete (workspace=${currentContext.workspaceRoot}, dimension=${currentContext.dimension})`
  );
  return { agent, plugins, engine, services, currentContext, setContext };
}
