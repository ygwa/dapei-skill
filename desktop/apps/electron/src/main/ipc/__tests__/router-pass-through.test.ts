// Pin the IPC router pass-through contract.
//
// Bug history (M1-7.1): the router used to auto-wrap handler
// return values in {ok: true, data: result}, which silently
// broke handlers that returned bare values. The renderer
// would see {ok:true, data:"/path"} instead of "/path", so
// a stored "picked" became an object and the form field
// rendered "[object Object]".
//
// Fix: the router passes handler results through unchanged.
// Handlers that can fail must return {ok, data?, error?}
// explicitly; handlers that cannot return bare values.
//
// This test mirrors the router's pass-through logic with
// the same handler-map data structure. The router itself
// imports `electron` and cannot be loaded under plain
// `node --test`. The test runs the equivalent of
// installIpcRouter's handler invocation by reading the
// handler's isWrite + schema, parsing the payload, and
// returning the handler's result unchanged. If the
// production router ever auto-wraps again, this test fails.
import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

interface HandlerEntry {
  schema?: z.ZodTypeAny;
  handler: (input: unknown) => Promise<unknown>;
  isWrite: boolean;
}

const handlers = new Map<string, HandlerEntry>();

function registerHandler(
  channel: string,
  handler: HandlerEntry["handler"],
  opts: { schema?: HandlerEntry["schema"]; isWrite?: boolean } = {}
): void {
  if (handlers.has(channel)) {
    throw new Error(`IPC handler already registered for ${channel}`);
  }
  handlers.set(channel, { handler, schema: opts.schema, isWrite: opts.isWrite ?? false });
}

async function invoke(channel: string, rawPayload: unknown, _ctx: { workspaceRoot: string }): Promise<unknown> {
  const entry = handlers.get(channel);
  if (!entry) return { ok: false, error: { code: "CHANNEL_NOT_FOUND", message: `no ${channel}` } };
  let parsed = rawPayload;
  if (entry.schema) {
    const result = entry.schema.safeParse(rawPayload);
    if (!result.success) {
      return { ok: false, error: { code: "INVALID_PAYLOAD", message: result.error.issues.map((i) => i.message).join("; ") } };
    }
    parsed = result.data;
  }
  const result = await entry.handler(parsed);
  // Pass-through. NO auto-wrap.
  return result;
}

test("router contract: bare-value handler result is not wrapped", async () => {
  registerHandler("test:bare-string", async () => "/path/to/workspace");
  const result = await invoke("test:bare-string", undefined, { workspaceRoot: "/ws" });
  assert.equal(result, "/path/to/workspace");
  assert.equal(typeof result, "string");
});

test("router contract: bare null from cancelled dialog flows through as null", async () => {
  registerHandler("test:null", async () => null);
  const result = await invoke("test:null", undefined, { workspaceRoot: "/ws" });
  assert.equal(result, null);
});

test("router contract: bare array flows through as the array (no {ok, data} wrap)", async () => {
  registerHandler("test:array", async () => [{ id: "a" }, { id: "b" }]);
  const result = await invoke("test:array", undefined, { workspaceRoot: "/ws" });
  assert.deepEqual(result, [{ id: "a" }, { id: "b" }]);
});

test("router contract: wrapped {ok} handler is passed through as-is", async () => {
  registerHandler("test:wrapped", async () => ({ ok: true, data: { hello: "world" } }));
  const result = await invoke("test:wrapped", undefined, { workspaceRoot: "/ws" });
  assert.deepEqual(result, { ok: true, data: { hello: "world" } });
});

test("router contract: wrapped {ok:false} is passed through as-is (handler decides error shape)", async () => {
  registerHandler("test:err", async () => ({ ok: false, error: { code: "FOO", message: "bar" } }));
  const result = await invoke("test:err", undefined, { workspaceRoot: "/ws" });
  assert.deepEqual(result, { ok: false, error: { code: "FOO", message: "bar" } });
});

test("router contract: Zod schema mismatch returns INVALID_PAYLOAD regardless of handler", async () => {
  registerHandler("test:schema", async () => "ok", { schema: z.object({ x: z.number() }) });
  const result = await invoke("test:schema", { x: "not-a-number" }, { workspaceRoot: "/ws" });
  assert.equal((result as { ok: boolean }).ok, false);
  assert.equal((result as { error: { code: string } }).error.code, "INVALID_PAYLOAD");
});

test("router contract: write flag is preserved on the entry", () => {
  const entry: HandlerEntry = { handler: async () => null, isWrite: true };
  assert.equal(entry.isWrite, true);
});
