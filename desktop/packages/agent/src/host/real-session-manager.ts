import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { AcpClient } from "../acp/client.ts";
import { StdioJsonRpcTransport } from "../acp/stdio-transport.ts";
import type { AcpEventDispatcher } from "../acp/dispatcher.ts";
import type { AcpSessionManager } from "./acp-session-manager.ts";
import type { AgentBackend, AgentSession, AgentSpawnOptions } from "../backends/types.ts";

/**
 * Real AcpSessionManager. M1-6 implements the L1 that the M0
 * stub left as a TODO. A session is identified by id and
 * scoped to (backend, cwd, optional feature). The dispatcher
 * receives every ACP event; the renderer's useQuery subscribes
 * via dapei:agent:event push.
 */
export interface Session {
  id: string;
  client: AcpClient;
  dispose: () => Promise<void>;
}

export class RealAcpSessionManager implements AcpSessionManager {
  private readonly sessions = new Map<string, { session: Session; options: AgentSpawnOptions }>();
  private nextId = 1;

  constructor(public readonly dispatcher: AcpEventDispatcher) {}

  getClient(id: string): AcpClient | undefined {
    return this.sessions.get(id)?.session.client;
  }

  async attach(backend: AgentBackend, cwd: string, feature?: string): Promise<{ sessionId: string; client: AcpClient }> {
    const options: AgentSpawnOptions = { cwd, feature, dimension: feature ? "feature" : "workspace" };
    const session = await backend.spawn(options);
    // The AgentSession emits AgentEvent directly. Forward to dispatcher.
    const unsubscribe = session.subscribe((event) => {
      this.dispatcher.emit(event);
    });
    const id = String(this.nextId++);
    const wrapped: Session = {
      id,
      client: makeAcpClientFromSession(session),
      dispose: async () => {
        unsubscribe();
        await session.dispose();
      }
    };
    this.sessions.set(id, { session: wrapped, options });
    return { sessionId: id, client: wrapped.client };
  }

  async detach(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    await entry.session.dispose();
    this.sessions.delete(sessionId);
  }

  list(): Array<{ id: string; backendId?: string; cwd: string; feature?: string }> {
    return [...this.sessions.entries()].map(([id, { options }]) => ({
      id,
      cwd: options.cwd,
      feature: options.feature
    }));
  }
}

/**
 * Adapter: AgentSession (backend-agnostic) -> AcpClient. The
 * backends implement AgentSession; the dispatcher consumes
 * AgentEvent. The AcpClient is a thin wrapper that exposes
 * sendUserMessage (which the backend interprets as the
 * appropriate ACP session/prompt call).
 */
function makeAcpClientFromSession(session: AgentSession): AcpClient {
  // The AcpClient is a stand-in type. The session exposes only
  // what the UI needs: sendUserMessage. The implementation
  // dispatches via the AgentSession interface.
  return {
    initialize: async () => ({ protocolVersion: "0.1", agent: "desktop-bridge" }),
    respondToolCall: () => undefined,
    sendUserMessage: (text: string) => session.sendUserMessage(text),
    dispose: () => session.dispose()
  } as unknown as AcpClient;
}

/** Helper: spawn a child process with the env injected. */
export function spawnWithEnv(command: string, args: string[], options: { cwd: string; env?: Record<string, string> }): ReturnType<typeof spawn> {
  return spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ["pipe", "pipe", "pipe"]
  });
}

export function newSessionId(): string {
  return randomUUID();
}
