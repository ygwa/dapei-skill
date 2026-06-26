---
id: ADR-0011
title: "Agent-Share v1 uses ACP stdio JSON-RPC; PTY route is permanently deprecated"
status: proposed
date: 2026-06-26
deciders: [ygwa]
technical-story: "feature/desktop-m1-m2 (M1-6)"
---

## Problem Statement

The desktop's P5 workbench needs to talk to an AI agent (OpenCode, Claude Code, custom). Three candidate transports were considered:

- **WebSocket / HTTP / SSE**: requires the agent to expose a port; complicated firewall story; doesn't match what OpenCode / Claude Code provide out of the box.
- **PTY (pseudo-terminal)**: spawn the agent in a child pty, scrape ANSI output. Lowest common denominator; fragile (color codes, prompt detection, multi-line responses).
- **ACP (Agent Client Protocol) stdio JSON-RPC**: structured, line-delimited JSON; tools stream events (`agent/textStream`, `agent/toolCallRequest`); explicit `initialize` handshake; matches the official OpenCode/Claude Code wire protocol.

The M0 scaffold left a PTY bridge as the de facto path and an `attach()` stub that throws. M1-6 has to pick a transport and ship something that works in CI without a real OpenCode install.

## Constraints

- The desktop main process is the only process that spawns the agent. Renderer talks to it via IPC.
- The renderer must not be coupled to the agent protocol. Agent events become `AgentEvent` (a 7-type union in `packages/contracts/src/events/agent.ts`) and travel to the renderer as `dapei:agent:event` push messages.
- A real OpenCode install is optional. CI / dev-mode users do not have it. The UI must not be broken in that case.
- The agent session is per-`(workspace, feature)`. Two windows opening the same feature should share the session (Agent-Share).
- The dimension rule still applies: an agent prompt running in feature dim cannot directly invoke workspace-dim writes; the prompt goes through `engine.run` (the engine-client layer), which enforces the rule.

## Decision

M1-6 ships Agent-Share v1 on **ACP stdio JSON-RPC** with **two backends**:

1. **MockAgentBackend** — always available. Emits a scripted conversation: `session:ready`, an assistant greeting, a `tool:call` for `workspace.status`, a `tool:result`, a `capability:invoked`, and a final assistant message. Time-spaced with `setTimeout` (50ms-650ms) so the UI has time to render. CI uses this backend; local dev-mode also falls back to it when OpenCode is not installed.

2. **OpenCodeAgentBackend** — best-effort. Spawns `opencode acp` as a child process; wraps stdio in `StdioJsonRpcTransport`; sends the `initialize` request and forwards `agent/textStream` / `agent/toolCallRequest` notifications as `AgentEvent` to the dispatcher. If the binary is missing or `initialize` fails, the AgentHost falls back to MockAgentBackend transparently.

Wire protocol (anchored at `packages/contracts/src/acp/schemas.ts` and `methods.ts`):

| Method | Direction | Params |
|---|---|---|
| `initialize` | client → server | `{ clientInfo, workspaceRoot, capabilities.ui? }` |
| `agent/textStream` | server → client | `{ delta, sessionId? }` |
| `agent/toolCallRequest` | server → client | `{ capabilityId, input, sessionId? }` |
| `agent/toolCallResult` | client → server | `{ id, result }` |
| `session/prompt` | client → server | `{ text, sessionId }` |

PTY bridge (`packages/agent/src/pty/*`) is **permanently deprecated**; the package still exports it for backward compat but new code must not use it. The deprecation JSDoc in `packages/agent/src/index.ts` is the public notice.

### AgentEvent surface (the contract the renderer sees)

```ts
type AgentEvent =
  | { type: "session:ready"; sessionId: string }
  | { type: "session:closed"; sessionId: string }
  | { type: "message:user"; text: string }
  | { type: "message:assistant"; text: string; stage?: string }
  | { type: "tool:call"; name: string; input: unknown }
  | { type: "tool:result"; name: string; output: unknown; ok: boolean }
  | { type: "capability:invoked"; id: string; ok: boolean };
```

The renderer subscribes via `dapei:events.subscribe`; the main process wraps each `AgentEvent` in a `DesktopPushEvent` envelope (`{channel:"dapei:agent:event", payload}`) and broadcasts to all open windows. This is Agent-Share: one agent session, multiple UI surfaces.

### IPC channels (renderer ↔ main)

| Channel | Direction | Request schema | Purpose |
|---|---|---|---|
| `dapei:agent:listBackends` | invoke | `{}` | which backends are available + detect() status |
| `dapei:agent:list` | invoke | `{}` | active sessions (id, cwd, feature) |
| `dapei:agent:attach` | invoke | `{backendId, cwd, feature?}` | spawn backend, create session |
| `dapei:agent:detach` | invoke | `{sessionId}` | dispose session |
| `dapei:agent:send` | invoke | `{sessionId, text}` | forward user prompt |
| `dapei:agent:injectContext` | invoke | `{sessionId, context}` | M2: push structured context (no-op in M1-6) |

All 6 channels have Zod request schemas in `packages/contracts/src/ipc/router.ts`.

### Backwards-compatible fallback rules

- `dapei:agent:attach` with an unknown `backendId` falls back to the first installed backend, then to mock.
- `backend.detect()` returning `installed:false` triggers the same fallback chain.
- The `MockAgentBackend` is always registered; the AgentHost guarantees at least one backend is always attachable.

## Alternatives Considered

### Option A: WebSocket / SSE
- **Pros:** Easy to debug with browser devtools; no stdio parsing.
- **Cons:** Requires the agent to expose a port; firewall pain; not what OpenCode/Claude Code ship by default. **Rejected.**

### Option B: PTY (scrape ANSI)
- **Pros:** Works with anything that has a CLI.
- **Cons:** Fragile (color codes, prompt detection, multi-line responses); no structured events; can't differentiate user / agent / tool messages. **Rejected.**

### Option C: ACP stdio JSON-RPC (chosen)
- **Pros:** Structured; explicit initialize handshake; line-delimited JSON is trivial to parse; matches the official OpenCode/Claude Code wire protocol.
- **Cons:** Requires the agent to be ACP-capable. The mock backend exists for the not-yet case. If OpenCode/Claude Code change their protocol, we update `acp/schemas.ts` and the corresponding test fixtures.

## Consequences

### Positive
- The UI is fully wired against `AgentEvent` (a stable 7-type union). When M2 adds EvidenceCard / ToolCallCard they consume the same event stream.
- CI runs against the mock backend; no real OpenCode install needed.
- Per-`(workspace, feature)` session scoping makes Agent-Share natural: two windows opening the same feature share the same session.

### Negative
- Real-OpenCode paths are NOT exercised by the CI suite. CI verifies the *protocol shape* via the mock; the *binary* is verified manually by the user. A maintainer who breaks ACP method names only finds out by trying it.
- The PTY bridge is still in the package (for backward compat); future maintainers might be tempted to use it. The deprecation JSDoc is the only guard.
- `injectContext` is a no-op in M1-6. The feature work (push feature.yaml + runtime-context.md into the agent prompt) is M2.

### Neutral
- The `AcpClient` interface is partial: it exposes `initialize`, `respondToolCall`, and (via the adapter in `real-session-manager.ts`) `sendUserMessage`. The full ACP surface (cancellation, sessions listing, etc.) is M2+.

## References

- `desktop/packages/agent/src/acp/{stdio-transport,client,dispatcher}.ts`
- `desktop/packages/agent/src/host/{real-session-manager,index}.ts`
- `desktop/packages/agent/src/backends/{mock-backend,opencode-backend,registry,types}.ts`
- `desktop/packages/contracts/src/acp/{methods,schemas,json-rpc}.ts`
- `desktop/packages/contracts/src/events/{agent,push}.ts`
- `desktop/apps/electron/src/main/ipc/agent-handlers.ts`
- `desktop/apps/electron/src/renderer/src/pages/workspace/FeatureWorkbenchView.tsx`
- `desktop/design-desktop/architecture.md` §5.4 (Agent-Share package)
- `desktop/design-desktop/ui-design.md` §9 (P5 design)
- `.omo/plans/desktop-m1-m2.md` §M1-6
- ADR-0003 (engine as validator — agent goes through engine, so the dimension rule still applies)
- ADR-0008 (EngineClient contract — agent.prompt eventually becomes a `runCapability` call)
