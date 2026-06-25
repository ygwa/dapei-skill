import { ipcMain } from "electron";
import { z } from "zod";
import { IPC_CHANNELS, REQUEST_SCHEMAS } from "@dapei/desktop-contracts";
import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { broadcastPush } from "../push/broadcast.ts";

/**
 * M1-2 IPC router. The pure handler map (registerHandler,
 * listHandlers, clearHandlers) is the only testable surface
 * here; the Electron-specific wiring (ipcMain.handle) is
 * wired in installIpcRouter which is called once at app
 * boot.
 *
 * Contract (M1-7.1 regression guard — the bug that turned
 * `picked` into `[object Object]`):
 *  - The router passes handler results through unchanged.
 *  - Handlers that can fail MUST return
 *    `{ok, data?, error?}` explicitly.
 *  - Handlers that cannot fail return bare values
 *    (e.g., pickDirectory returns `string | null`).
 *  - A bare value is **not** wrapped; the renderer sees
 *    exactly what the handler returned.
 */

type RouterHandler = (
  input: unknown,
  ctx: WorkspaceContext,
  engine: EngineClient,
  runtime: {
    getContext: () => WorkspaceContext;
    setContext: ((ctx: WorkspaceContext) => void) | null;
  }
) => Promise<unknown>;

interface HandlerEntry {
  schema?: z.ZodTypeAny;
  handler: RouterHandler;
  isWrite: boolean;
}

const handlers = new Map<string, HandlerEntry>();

export function registerHandler(
  channel: string,
  handler: RouterHandler,
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

export function listHandlers(): Array<{ channel: string; isWrite: boolean; hasSchema: boolean }> {
  return [...handlers.entries()].map(([channel, entry]) => ({
    channel,
    isWrite: entry.isWrite,
    hasSchema: Boolean(entry.schema)
  }));
}

export function clearHandlers(): void {
  handlers.clear();
}

interface RouterRuntime {
  engine: EngineClient | null;
  getContext: (() => WorkspaceContext) | null;
  setContext: ((ctx: WorkspaceContext) => void) | null;
}

export const routerRuntime: RouterRuntime = {
  engine: null,
  getContext: null,
  setContext: null
};

export function setRouterEngineAndContext(
  engine: EngineClient,
  getContext: () => WorkspaceContext,
  setContext?: (ctx: WorkspaceContext) => void
): void {
  routerRuntime.engine = engine;
  routerRuntime.getContext = getContext;
  routerRuntime.setContext = setContext ?? null;
}

/**
 * Wire the router to Electron's ipcMain. Every channel registered
 * via registerHandler / registerCapabilityProxy gets an
 * ipcMain.handle. The handler's return value is passed
 * through unchanged (no auto-wrap).
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
      // 2. Get the engine + context from the running app.
      const { engine, getContext, setContext } = routerRuntime;
      if (!engine || !getContext) {
        return {
          ok: false,
          error: { code: "ROUTER_NOT_READY", message: "IPC router is not initialised; did bootstrap run?" }
        };
      }
      const ctx = getContext();
      // 3. Invoke the handler. The runtime context is passed
      //    as the 4th arg so handlers can switch dimension /
      //    feature when a feature-scoped call comes in.
      try {
        const result = await entry.handler(parsed, ctx, engine, { getContext, setContext: setContext ?? null });
        // 4. Pass-through. The router does NOT auto-wrap.
        //    Handlers that can fail must return a
        //    `{ok, data?, error?}` shape explicitly; handlers
        //    that cannot fail return bare values. The renderer's
        //    `unwrap` helper extracts `.data` from `{ok:true}`
        //    responses and surfaces `.error` on `{ok:false}`.
        //    A bare value is passed through unchanged.
        if (result && typeof result === "object" && "ok" in (result as Record<string, unknown>)) {
          if ((result as { ok: boolean }).ok && entry.isWrite) {
            broadcastPush({
              channel: "dapei:workspace:mutated",
              payload: { scope: ctx.feature ? "feature" : "workspace", keys: [channel] }
            });
          }
        }
        return result;
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

/** Sanity check: all demonstrative channels have schemas. */
export function validateRouterContract(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const [channel, schema] of Object.entries(REQUEST_SCHEMAS)) {
    if (!schema) missing.push(channel);
  }
  return { ok: missing.length === 0, missing };
}
