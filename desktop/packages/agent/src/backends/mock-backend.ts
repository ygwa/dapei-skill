import { randomUUID } from "node:crypto";
import type { AgentEvent } from "@dapei/desktop-contracts";
import type { AgentBackend, AgentSession, AgentSpawnOptions } from "./types.ts";

/**
 * MockAgentBackend — the runtime substitute for OpenCode/Claude Code
 * when no real ACP server is available. CI / smoke / dev-mode uses
 * this. The script emits a fixed conversation: the assistant greets,
 * proposes a tool call (workspace.status), reads the result, and
 * summarises. Every AgentEvent is sent with realistic timing.
 */
export class MockAgentBackend implements AgentBackend {
  readonly id = "mock";
  readonly label = "Mock Agent (CI / dev)";

  async detect(): Promise<{ installed: boolean }> {
    return { installed: true };
  }

  async spawn(options: AgentSpawnOptions): Promise<AgentSession> {
    const sessionId = randomUUID();
    const handlers = new Set<(e: AgentEvent) => void>();
    let closed = false;

    const emit = (event: AgentEvent): void => {
      if (closed) return;
      for (const h of handlers) h(event);
    };

    const featureSuffix = options.feature ? ` (feature: ${options.feature})` : "";

    // Fire a scripted conversation. setTimeout instead of setInterval
    // so the timing is deterministic for tests.
    const sequence: Array<{ delay: number; event: AgentEvent }> = [
      { delay: 50, event: { type: "session:ready", sessionId } },
      { delay: 100, event: { type: "message:assistant", text: `Mock agent ready in ${options.cwd}${featureSuffix}.` } },
      { delay: 250, event: { type: "tool:call", name: "workspace.status", input: {} } },
      { delay: 350, event: { type: "tool:result", name: "workspace.status", output: { repoCount: 0, featureCount: 0, conforms: true }, ok: true } },
      { delay: 500, event: { type: "capability:invoked", id: "workspace.status", ok: true } },
      { delay: 650, event: { type: "message:assistant", text: "Workspace is empty. Run `@dapei add <repo> <url>` to start." } }
    ];

    const timers: NodeJS.Timeout[] = [];
    for (const step of sequence) {
      const t = setTimeout(() => emit(step.event), step.delay);
      timers.push(t);
    }

    return {
      id: sessionId,
      subscribe(handler) {
        handlers.add(handler);
        return () => {
          handlers.delete(handler);
        };
      },
      sendUserMessage(text: string) {
        // Echo the user's message as a user event, then a canned
        // assistant reply.
        emit({ type: "message:user", text });
        timers.push(
          setTimeout(() => emit({ type: "message:assistant", text: `Mock agent received: "${text}". (no real agent attached)` }), 50)
        );
      },
      async dispose() {
        for (const t of timers) clearTimeout(t);
        timers.length = 0;
        emit({ type: "session:closed", sessionId });
        closed = true;
      }
    };
  }
}
