import type { CapabilityInvokeRequest, CapabilityInvokeResponse } from "./ipc/capability.ts";

export { IPC_CHANNELS } from "./ipc/channels.ts";

import type { DesktopPushEvent } from "./events/push.ts";

/** Preload 暴露给 renderer 的 API 形状 */
export interface DesktopApi {
  version: string;
  workspace: {
    listRecents: () => Promise<import("./ipc/workspace.ts").RecentWorkspace[]>;
    open: (path: string) => Promise<import("./ipc/workspace.ts").WorkspaceOpenResult>;
    pickDirectory: () => Promise<string | null>;
    init: (parentDir: string, name: string) => Promise<import("./ipc/workspace.ts").WorkspaceOpenResult>;
  };
  capability: {
    run: (request: CapabilityInvokeRequest) => Promise<CapabilityInvokeResponse>;
  };
  events: {
    /** 订阅 Main 推送（ACP 流、workspace mutated 等） */
    subscribe: (handler: (event: DesktopPushEvent) => void) => () => void;
  };
}

export * from "./ipc/index.ts";
export * from "./events/index.ts";
export * from "./plugin/index.ts";
export * from "./acp/index.ts";
