// M1-6 Agent-Share integration test. Spin up the MockAgentBackend
// and verify the event stream. We test the public AgentSession
// interface: subscribe, sendUserMessage, dispose. The renderer
// subscribes to the same dispatcher in main, so this test
// covers the Agent-Share contract end-to-end without spawning
// a real opencode process.
import test from "node:test";
import assert from "node:assert/strict";
import { MockAgentBackend } from "../../../../../../packages/agent/src/backends/mock-backend.ts";
import type { AgentEvent } from "@dapei/desktop-contracts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("MockAgentBackend.detect() always returns installed:true", async () => {
  const backend = new MockAgentBackend();
  const d = await backend.detect();
  assert.equal(d.installed, true);
});

test("MockAgentBackend.spawn() emits a session:ready event on subscribe", async () => {
  const backend = new MockAgentBackend();
  const session = await backend.spawn({ cwd: "/tmp/test", dimension: "workspace" });
  const events: AgentEvent[] = [];
  session.subscribe((e) => events.push(e));
  await sleep(100);
  const ready = events.find((e) => e.type === "session:ready");
  assert.ok(ready, `expected session:ready, got ${JSON.stringify(events)}`);
  if (ready.type === "session:ready") {
    assert.equal(typeof ready.sessionId, "string");
    assert.ok(ready.sessionId.length > 0);
  }
  await session.dispose();
});

test("MockAgentBackend.spawn() emits the scripted tool:call and tool:result", async () => {
  const backend = new MockAgentBackend();
  const session = await backend.spawn({ cwd: "/tmp/test", dimension: "workspace" });
  const events: AgentEvent[] = [];
  session.subscribe((e) => events.push(e));
  await sleep(800);
  const toolCall = events.find((e) => e.type === "tool:call");
  const toolResult = events.find((e) => e.type === "tool:result");
  assert.ok(toolCall, "expected tool:call");
  assert.ok(toolResult, "expected tool:result");
  if (toolCall.type === "tool:call") {
    assert.equal(toolCall.name, "workspace.status");
  }
  if (toolResult.type === "tool:result") {
    assert.equal(toolResult.name, "workspace.status");
    assert.equal(toolResult.ok, true);
  }
  await session.dispose();
});

test("MockAgentBackend: sendUserMessage echoes the text and replies", async () => {
  const backend = new MockAgentBackend();
  const session = await backend.spawn({ cwd: "/tmp/test", dimension: "feature", feature: "test-feat" });
  const events: AgentEvent[] = [];
  session.subscribe((e) => events.push(e));
  await sleep(800);
  const beforeSend = events.length;
  session.sendUserMessage("hello agent");
  await sleep(120);
  const userEvent = events.slice(beforeSend).find((e) => e.type === "message:user");
  const assistantEvent = events.slice(beforeSend).find((e) => e.type === "message:assistant");
  assert.ok(userEvent, "expected message:user");
  assert.ok(assistantEvent, "expected message:assistant");
  if (userEvent.type === "message:user") {
    assert.equal(userEvent.text, "hello agent");
  }
  await session.dispose();
});

test("MockAgentBackend: feature dimension is reflected in the greeting", async () => {
  const backend = new MockAgentBackend();
  const session = await backend.spawn({ cwd: "/tmp/test", dimension: "feature", feature: "payment-refactor" });
  const events: AgentEvent[] = [];
  session.subscribe((e) => events.push(e));
  await sleep(200);
  const greeting = events.find((e) => e.type === "message:assistant");
  assert.ok(greeting);
  if (greeting.type === "message:assistant") {
    assert.ok(greeting.text.includes("payment-refactor"), `greeting should include feature name: ${greeting.text}`);
  }
  await session.dispose();
});

test("MockAgentBackend: dispose() emits session:closed and stops further events", async () => {
  const backend = new MockAgentBackend();
  const session = await backend.spawn({ cwd: "/tmp/test", dimension: "workspace" });
  const events: AgentEvent[] = [];
  session.subscribe((e) => events.push(e));
  await sleep(50);
  await session.dispose();
  await sleep(200);
  const closed = events.find((e) => e.type === "session:closed");
  assert.ok(closed, `expected session:closed, got ${JSON.stringify(events)}`);
  session.sendUserMessage("after dispose");
  await sleep(50);
  const userAfterClose = events.slice(events.indexOf(closed) + 1).find((e) => e.type === "message:user");
  assert.equal(userAfterClose, undefined, "no events should fire after dispose");
});
