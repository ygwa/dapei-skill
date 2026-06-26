import type { AgentBackend } from "../backends/types.ts";
import type { AcpClient } from "../acp/client.ts";
import type { AcpEventDispatcher } from "../acp/dispatcher.ts";

export interface AcpSessionManager {
  readonly dispatcher: AcpEventDispatcher;
  getClient(sessionId: string): AcpClient | undefined;
  attach(backend: AgentBackend, workspaceRoot: string): Promise<{ sessionId: string; client: AcpClient }>;
  detach(sessionId: string): Promise<void>;
}
