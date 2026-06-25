import type { AgentSession, AgentSpawnOptions } from "../backends/types.ts";

export interface SessionScope {
  kind: "workspace" | "feature";
  workspaceRoot: string;
  featureId?: string;
}

/** 每 workspace / feature 至多一个 Agent 会话 */
export interface SessionManager {
  getActive(scope: SessionScope): AgentSession | undefined;
  attach(scope: SessionScope, opts: AgentSpawnOptions): Promise<AgentSession>;
}
