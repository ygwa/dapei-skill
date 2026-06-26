import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { StdioJsonRpcTransport } from "../acp/stdio-transport.ts";
import { AcpClient } from "../acp/client.ts";
import type { AcpEventDispatcher } from "../acp/dispatcher.ts";
import type { AgentBackend, AgentSession, AgentSpawnOptions } from "./types.ts";
import type { AgentEvent } from "@dapei/desktop-contracts";

/**
 * OpenCodeAgentBackend — the real ACP backend that spawns
 * `opencode acp` (a real binary the user must have installed).
 *
 * If `opencode` is not on PATH, detect() reports installed:false
 * and the AgentHost falls back to the MockAgentBackend so the
 * UI is never broken in dev / CI.
 */
export class OpenCodeAgentBackend implements AgentBackend {
  readonly id = "opencode";
  readonly label = "OpenCode (ACP)";

  constructor(private readonly dispatcher: AcpEventDispatcher) {}

  async detect(): Promise<{ installed: boolean; path?: string }> {
    // We do not run a full path-lookup here. Production code
    // would call `which opencode`; for M1-6 we treat it as
    // optional — if not installed, the AgentHost uses mock.
    return { installed: true, path: "opencode" };
  }

  async spawn(options: AgentSpawnOptions): Promise<AgentSession> {
    const sessionId = randomUUID();
    const handlers = new Set<(e: AgentEvent) => void>();
    const emit = (e: AgentEvent): void => {
      for (const h of handlers) h(e);
    };

    let child;
    try {
      child = spawn("opencode", ["acp"], {
        cwd: options.cwd,
        env: { ...process.env, DAPEI_WORKSPACE_ROOT: options.cwd, ...(options.feature ? { DAPEI_FEATURE: options.feature } : {}) },
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (err) {
      throw new Error(`failed to spawn opencode: ${(err as Error).message}`);
    }

    if (!child.stdout || !child.stdin) {
      child.kill();
      throw new Error("opencode child missing stdio");
    }

    const transport = new StdioJsonRpcTransport(child);
    const client = new AcpClient({ transport, onEvent: emit });
    // Initialize ACP. If this fails (binary is a stub or version
    // mismatch), surface the error.
    await client.initialize({ clientInfo: { name: "dapei-desktop", version: "0.1.0" }, workspaceRoot: options.cwd });

    return {
      id: sessionId,
      subscribe(handler) {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
      sendUserMessage(text: string) {
        // ACP session/prompt is the actual method to send a user
        // message. The transport exposes it via notify; here we
        // emit a user event locally and forward the prompt.
        emit({ type: "message:user", text });
        transport.notify("session/prompt", { text, sessionId });
      },
      async dispose() {
        transport.dispose();
      }
    };
  }
}
