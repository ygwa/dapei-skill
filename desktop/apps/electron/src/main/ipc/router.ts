import { ipcMain } from "electron";
import { z } from "zod";
import { IPC_CHANNELS, REQUEST_SCHEMAS } from "@dapei/desktop-contracts";
import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { broadcastPush } from "../push/broadcast.ts";

/**
 * M1-2 IPC router. Handlers are registered per channel; the router
 * looks up the channel's Zod schema, parses the payload, and
 * invokes the handler with the validated data. Schema-mismatched
 * payloads return {ok: false, error: {code: 'INVALID_PAYLOAD'}}
 * without reaching the handler.
 *
 * Handlers receive (input, ctx, engine). They MUST NOT mutate ctx;
 * ctx is a read-only snapshot of the current WorkspaceContext.
 */
type RouterHandler = (input: unknown, ctx: WorkspaceContext, engine: EngineClient) => Promise<unknown>;

type AnyHandler = RouterHandler;

interface HandlerEntry {
  schema?: z.ZodTypeAny;
  handler: AnyHandler;
  isWrite: boolean;
}

const handlers = new Map<string, HandlerEntry>();

export function registerHandler(
  channel: string,
  handler: AnyHandler,
  opts: { schema?: z.ZodTypeAny; isWrite?: boolean } = {}
): void {
  if (handlers.has(channel)) {
    throw new Error(`IPC handler already registered for ${channel}`);
  }
  handlers.set(channel, {
    schema: opts.schema as z.ZodTypeAny | undefined,
    handler,
    isWrite: opts.isWrite ?? false
  });
}

/** Capability proxy: invokes engine.run with the channel's capabilityId. */
export function registerCapabilityProxy(
  channel: string,
  capabilityId: string,
  opts: { isWrite?: boolean } = {}
): void {
  const schema = (REQUEST_SCHEMAS as Record<string, z.ZodTypeAny | undefined>)[channel];
  registerHandler(
    channel,
    async (input, ctx, engine) => {
      return engine.run(
        { capabilityId, input: (input ?? {}) as Record<string, unknown>, workspaceRoot: ctx.workspaceRoot, feature: ctx.feature },
        ctx
      );
    },
    { schema, isWrite: opts.isWrite }
  );
}

/**
 * Wire the router to Electron's ipcMain. Every channel registered
 * via registerHandler / registerCapabilityProxy gets an ipcMain.handle.
 */
export function installIpcRouter(): void {
  for (const [channel, entry] of handlers) {
    ipcMain.handle(channel, async (_event, rawPayload: unknown) => {
      // 1. Zod-parse if a schema is registered.
      let parsed: unknown = rawPayload;
      if (entry.schema) {
        const result = entry.schema.safeParse(rawPayload);
        if (!result.success) {
          return {
            ok: false,
            error: {
              code: "INVALID_PAYLOAD",
              message: `payload failed schema for ${channel}: ${result.error.issues.map((i: z.ZodIssue) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
            }
          };
        }
        parsed = result.data;
      }
      // 2. Get the engine + context from the running app. The router
      //    needs a way to get the current context; bootstrap wires
      //    this in via setRouterEngineAndContext.
      const { engine, getContext } = routerRuntime;
      if (!engine || !getContext) {
        return {
          ok: false,
          error: { code: "ROUTER_NOT_READY", message: "IPC router is not initialised; did bootstrap run?" }
        };
      }
      const ctx = getContext();
      // 3. Invoke the handler.
      try {
        const result = await entry.handler(parsed, ctx, engine);
        // 4. If the handler returned a CapabilityInvokeResponse, use
        //    its ok/error. Otherwise, treat the result as {ok:true, data}.
        if (result && typeof result === "object" && "ok" in (result as Record<string, unknown>)) {
          if ((result as { ok: boolean }).ok && entry.isWrite) {
            broadcastPush({
              channel: "dapei:workspace:mutated",
              payload: { scope: ctx.feature ? "feature" : "workspace", keys: [channel] }
            });
          }
          return result;
        }
        return { ok: true, data: result };
      } catch (err: unknown) {
        return {
          ok: false,
          error: {
            code: "HANDLER_THREW",
            message: err instanceof Error ? err.message : String(err)
          }
        };
      }
    });
  }
}

interface RouterRuntime {
  engine: EngineClient | null;
  getContext: (() => WorkspaceContext) | null;
}

export const routerRuntime: RouterRuntime = {
  engine: null,
  getContext: null
};

export function setRouterEngineAndContext(engine: EngineClient, getContext: () => WorkspaceContext): void {
  routerRuntime.engine = engine;
  routerRuntime.getContext = getContext;
}

/** Internal: used by tests to inspect the handler table. */
export function listHandlers(): Array<{ channel: string; isWrite: boolean; hasSchema: boolean }> {
  return [...handlers.entries()].map(([channel, entry]) => ({
    channel,
    isWrite: entry.isWrite,
    hasSchema: Boolean(entry.schema)
  }));
}

/** Internal: used by tests to clear the handler table. */
export function clearHandlers(): void {
  handlers.clear();
}

/** Sanity check: all demonstrative channels have schemas (M1-2 contract). */
export function validateRouterContract(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const [channel, schema] of Object.entries(REQUEST_SCHEMAS)) {
    if (!schema) missing.push(channel);
  }
  return { ok: missing.length === 0, missing };
}

// Re-export for callers that want the channel constants.
export { IPC_CHANNELS };
