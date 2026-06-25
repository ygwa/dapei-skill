import type { AgentEvent } from "@dapei/desktop-contracts";

export interface AgentSpawnOptions {
  cwd: string;
  feature?: string;
  dimension: "workspace" | "feature";
}

export interface AgentSession {
  id: string;
  subscribe(handler: (event: AgentEvent) => void): () => void;
  sendUserMessage(text: string): void;
  dispose(): Promise<void>;
}

/** L2 插件可注册自定义 Agent 后端（OpenCode / Claude Code / …） */
export interface AgentBackend {
  id: string;
  label: string;
  detect(): Promise<{ installed: boolean; path?: string }>;
  spawn(opts: AgentSpawnOptions): Promise<AgentSession>;
}
