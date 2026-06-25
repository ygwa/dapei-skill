import { ipcMain } from "electron";
import type { CapabilityInvokeRequest } from "@dapei/desktop-contracts";
import { IPC_CHANNELS } from "@dapei/desktop-contracts";
import type { EngineClient } from "@dapei/desktop-engine-client";
import { broadcastPush } from "../push/broadcast.ts";

export function registerIpcHandlers(engine: EngineClient): void {
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
    return { ok: true, path, name, validation: { status: "valid" as const, errors: [], warnings: [] } };
  });

  ipcMain.handle(IPC_CHANNELS.capability.run, async (_e, request: CapabilityInvokeRequest) => {
    const result = await engine.run(request);
    if (result.ok) {
      broadcastPush({
        channel: "dapei:workspace:mutated",
        payload: { scope: request.feature ? "feature" : "workspace", keys: [request.capabilityId] }
      });
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.plugin.list, async () => []);
}
