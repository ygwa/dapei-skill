/** AgentHost — 组合 SessionManager、BackendRegistry、PtyBridge、EventParser */

import { AgentBackendRegistry } from "../backends/registry.ts";
import { AcpEventDispatcher } from "../acp/dispatcher.ts";
import type { SessionManager } from "./session-manager.ts";
import type { AcpSessionManager } from "./acp-session-manager.ts";

export interface AgentHost extends AcpSessionManager {
  backends: AgentBackendRegistry;
  sessions: SessionManager;
}

export function createAgentHostStub(): AgentHost {
  const dispatcher = new AcpEventDispatcher();
  const backends = new AgentBackendRegistry();
  const clients = new Map<string, never>();

  return {
    backends,
    sessions: {} as SessionManager,
    dispatcher,
    getClient: (id) => clients.get(id) as undefined,
    attach: async () => {
      throw new Error("AcpSessionManager.attach not implemented — wire OpenCode ACP server in M1");
    },
    detach: async () => {}
  };
}
