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
  repos: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.repos.list),
    add: (name, url) => ipcRenderer.invoke(IPC_CHANNELS.repos.add, { name, url }),
    sync: (target) => ipcRenderer.invoke(IPC_CHANNELS.repos.sync, { target }),
    profile: (name) => ipcRenderer.invoke(IPC_CHANNELS.repos.profile, { name })
  },
  features: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.feature.list),
    status: (name) => ipcRenderer.invoke(IPC_CHANNELS.feature.status, { name }),
    stage: (name) => ipcRenderer.invoke(IPC_CHANNELS.feature.stage, { name }),
    runStage: (name, stage, confirmed) => ipcRenderer.invoke(IPC_CHANNELS.feature.runStage, { name, stage, confirmed }),
    context: (name, stage) => ipcRenderer.invoke(IPC_CHANNELS.feature.context, { name, stage }),
    tasks: (name) => ipcRenderer.invoke(IPC_CHANNELS.feature.tasks, { name, action: "list" }),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.feature.create, input)
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
