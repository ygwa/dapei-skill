import { ipcMain } from "electron";
import type { CapabilityInvokeRequest } from "@dapei/desktop-contracts";
import { IPC_CHANNELS } from "@dapei/desktop-contracts";
import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { broadcastPush } from "../push/broadcast.ts";

/**
 * IPC handler registry. M1-2 will split this into a router with
 * per-namespace modules; for M1-1 we keep the M0 shape but thread
 * the WorkspaceContext through the capability:run handler so the
 * engine-client can enforce the dimension rule.
 *
 * M0 placeholders remain for workspace.* / repos.* / feature.* /
 * plugin.* so the renderer can boot; M1-3 / M1-4 will replace
 * them with real implementations.
 */
export function registerIpcHandlers(
  engine: EngineClient,
  getContext: () => WorkspaceContext,
  _setContext: (ctx: WorkspaceContext) => void
): void {
  ipcMain.handle(IPC_CHANNELS.workspace.listRecents, async () => []);

  ipcMain.handle(IPC_CHANNELS.workspace.open, async (_e, path: string) => ({
    ok: true,
    path,
    name: path.split(/[/\\]/).pop() ?? path,
    validation: { status: "valid" as const, errors: [], warnings: [] }
  }));

  ipcMain.handle(IPC_CHANNELS.workspace.pickDirectory, async () => null);

  ipcMain.handle(IPC_CHANNELS.workspace.init, async (_e, parentDir: string, name: string) => {
    const path = `${parentDir.replace(/[/\\]$/, "")}/${name}`;
    broadcastPush({ channel: "dapei:workspace:mutated", payload: { scope: "workspace" } });
    return {
      ok: true,
      path,
      name,
      validation: { status: "valid" as const, errors: [], warnings: [] }
    };
  });

  ipcMain.handle(IPC_CHANNELS.workspace.status, async () => {
    const ctx = getContext();
    return engine.run({ capabilityId: "workspace.status", input: {}, workspaceRoot: ctx.workspaceRoot }, ctx);
  });

  ipcMain.handle(IPC_CHANNELS.capability.run, async (_e, request: CapabilityInvokeRequest) => {
    const ctx = getContext();
    const result = await engine.run(request, ctx);
    if (result.ok) {
      broadcastPush({
        channel: "dapei:workspace:mutated",
        payload: {
          scope: request.feature ? "feature" : "workspace",
          keys: [request.capabilityId]
        }
      });
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.plugin.list, async () => []);
}
