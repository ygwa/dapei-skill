/** AgentHost — 组合 SessionManager、BackendRegistry、PtyBridge、EventParser */

import { AgentBackendRegistry } from "../backends/registry.ts";
import { AcpEventDispatcher } from "../acp/dispatcher.ts";
import { MockAgentBackend, OpenCodeAgentBackend } from "../backends/index.ts";
import { RealAcpSessionManager, type Session } from "./real-session-manager.ts";
import type { AcpSessionManager } from "./acp-session-manager.ts";
import type { AgentBackend } from "../backends/types.ts";

export interface AgentHost extends AcpSessionManager {
  backends: AgentBackendRegistry;
  sessions: RealAcpSessionManager;
}

/**
 * Create the real AgentHost. Wires the MockAgentBackend (always
 * available) and the OpenCodeAgentBackend (best-effort; if the
 * opencode binary is not installed, detect() returns false and
 * the host falls back to mock at attach time).
 */
export function createAgentHost(): AgentHost {
  const dispatcher = new AcpEventDispatcher();
  const backends = new AgentBackendRegistry();
  const sessions = new RealAcpSessionManager(dispatcher);
  // Register built-in backends
  const mock = new MockAgentBackend();
  backends.register(mock);
  backends.register(new OpenCodeAgentBackend(dispatcher));
  // Attach shape: re-expose sessions as a SessionManager
  return Object.assign(sessions, { backends, sessions }) as unknown as AgentHost;
}

export type { Session };
