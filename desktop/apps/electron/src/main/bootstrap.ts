import type { BrowserWindow } from "electron";
import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { createAgentHostStub } from "@dapei/desktop-agent";
import { createPluginHostStub } from "@dapei/desktop-plugins";
import { registerIpcHandlers } from "./ipc/register-handlers.ts";
import { startPluginUtilityHost } from "./plugins/utility-host.ts";
import { wireAgentPush } from "./wire-agent-push.ts";
import { createEngineClient } from "./engine/subprocess-client.ts";

export interface AppContext {
  agent: ReturnType<typeof createAgentHostStub>;
  plugins: ReturnType<typeof createPluginHostStub>;
  engine: EngineClient;
  /**
   * The current WorkspaceContext held by the main process. M1-1 wired
   * this in; handlers reach for it through `getContext()` rather than
   * reading from process.env (which would race and which is forbidden
   * by ADR-0009).
   */
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
  const agent = createAgentHostStub();
  const plugins = createPluginHostStub();

  let currentContext: WorkspaceContext = initialContext;
  const setContext = (next: WorkspaceContext): void => {
    currentContext = next;
  };

  registerIpcHandlers(engine, () => currentContext, setContext);
  void plugins.init();
  startPluginUtilityHost();
  wireAgentPush(agent);

  console.info(
    `[dapei-desktop] bootstrap complete (workspace=${currentContext.workspaceRoot}, dimension=${currentContext.dimension})`
  );
  return { agent, plugins, engine, currentContext, setContext };
}
