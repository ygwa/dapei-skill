import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import type { AgentHost } from "@dapei/desktop-agent";
import { registerHandler } from "./router.ts";

/**
 * Agent IPC handlers. M1-6 wires the Agent-Share v1 surface:
 *   list: list active sessions
 *   attach: spawn a backend (mock or opencode) and create a session
 *   detach: dispose a session
 *   send: forward user text into the session (echoed as message:user)
 *   listBackends: which backends are available + their detect() status
 *
 * Every session's events flow through the AgentHost's dispatcher
 * which the renderer subscribes to via dapei:agent:event push
 * (wired in wire-agent-push.ts).
 */
export function registerAgentHandlers(agent: AgentHost): void {
  registerHandler("dapei:agent:list", async () => {
    return agent.sessions.list();
  });

  registerHandler("dapei:agent:listBackends", async () => {
    const out: Array<{ id: string; label: string; installed: boolean; path?: string }> = [];
    for (const b of agent.backends.list()) {
      const detected = await b.detect();
      out.push({ id: b.id, label: b.label, installed: detected.installed, path: detected.path });
    }
    return out;
  });

  registerHandler("dapei:agent:attach", async (rawInput) => {
    const { backendId, cwd, feature } = rawInput as { backendId: string; cwd: string; feature?: string };
    let backend = agent.backends.get(backendId);
    if (!backend) {
      // Unknown backend: fall back to mock so the UI never breaks.
      backend = agent.backends.get("mock");
    }
    if (!backend) {
      return { ok: false, error: { code: "NO_BACKEND", message: "no agent backend available" } };
    }
    const detected = await backend.detect();
    if (!detected.installed) {
      // Fall back to mock if requested backend isn't installed.
      const mock = agent.backends.get("mock");
      if (mock) backend = mock;
    }
    const result = await agent.sessions.attach(backend, cwd, feature);
    return { ok: true, sessionId: result.sessionId, backendId: backend.id };
  });

  registerHandler("dapei:agent:detach", async (rawInput) => {
    const { sessionId } = rawInput as { sessionId: string };
    await agent.sessions.detach(sessionId);
    return { ok: true };
  });

  registerHandler("dapei:agent:send", async (rawInput) => {
    const { sessionId, text } = rawInput as { sessionId: string; text: string };
    const session = agent.sessions.list().find((s) => s.id === sessionId);
    if (!session) {
      return { ok: false, error: { code: "SESSION_NOT_FOUND", message: `session ${sessionId} not found` } };
    }
    const acp = agent.sessions.getClient(sessionId);
    if (!acp) {
      return { ok: false, error: { code: "ACP_NOT_READY", message: "ACP client not attached" } };
    }
    // AcpClient has sendUserMessage via the adapter.
    (acp as unknown as { sendUserMessage: (text: string) => void }).sendUserMessage(text);
    return { ok: true };
  });

  registerHandler("dapei:agent:injectContext", async (rawInput) => {
    // M1-6: no-op for now. M2 may push structured context
    // (feature.yaml, runtime-context.md) into the ACP session.
    return { ok: true };
  });
}
