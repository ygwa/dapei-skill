import { contextBridge, ipcRenderer } from "electron";
import type { CapabilityInvokeRequest, DesktopApi, DesktopPushEvent } from "@dapei/desktop-contracts";
import { DESKTOP_PUSH_CHANNEL, IPC_CHANNELS } from "@dapei/desktop-contracts";

const api: DesktopApi = {
  version: "0.1.0",
  workspace: {
    listRecents: () => ipcRenderer.invoke(IPC_CHANNELS.workspace.listRecents),
    open: (path) => ipcRenderer.invoke(IPC_CHANNELS.workspace.open, path),
    pickDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.workspace.pickDirectory),
    init: (parentDir, name) => ipcRenderer.invoke(IPC_CHANNELS.workspace.init, parentDir, name)
  },
  capability: {
    run: (request: CapabilityInvokeRequest) => ipcRenderer.invoke(IPC_CHANNELS.capability.run, request)
  },
  events: {
    subscribe: (handler: (event: DesktopPushEvent) => void) => {
      const listener = (_: unknown, payload: DesktopPushEvent) => handler(payload);
      ipcRenderer.on(DESKTOP_PUSH_CHANNEL, listener);
      return () => ipcRenderer.removeListener(DESKTOP_PUSH_CHANNEL, listener);
    }
  }
};

contextBridge.exposeInMainWorld("dapei", api);
