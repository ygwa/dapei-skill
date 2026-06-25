import type { BrowserWindow } from "electron";
import { createAgentHostStub } from "@dapei/desktop-agent";
import { createPluginHostStub } from "@dapei/desktop-plugins";
import { registerIpcHandlers } from "./ipc/register-handlers.ts";
import { startPluginUtilityHost } from "./plugins/utility-host.ts";
import { wireAgentPush } from "./wire-agent-push.ts";
import { createEngineClient, type SubprocessEngineClient } from "./engine/subprocess-client.ts";
import type { EngineClient } from "@dapei/desktop-engine-client";

export interface AppContext {
  agent: ReturnType<typeof createAgentHostStub>;
  plugins: ReturnType<typeof createPluginHostStub>;
  engine: EngineClient;
}

let bootstrapped = false;

export function bootstrapApp(_mainWindow: BrowserWindow): AppContext {
  if (bootstrapped) {
    throw new Error("bootstrapApp already called");
  }
  bootstrapped = true;

  const engine = createEngineClient();
  const agent = createAgentHostStub();
  const plugins = createPluginHostStub();

  registerIpcHandlers(engine);
  void plugins.init();
  startPluginUtilityHost();
  wireAgentPush({ agent, plugins, engine });

  console.info("[dapei-desktop] bootstrap complete (ACP + IPC + utility stub)");
  return { agent, plugins, engine };
}

export type { SubprocessEngineClient };
