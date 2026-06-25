import type { CapabilityInvokeRequest, CapabilityInvokeResponse } from "./ipc/capability.ts";

export { IPC_CHANNELS } from "./ipc/channels.ts";

import type { DesktopPushEvent } from "./events/push.ts";

/** Repo summary surfaced to the renderer. */
export interface RepoSummary {
  name: string;
  branch?: string;
  hash?: string;
  cloned: boolean;
}

/** Feature summary surfaced to the renderer. */
export interface FeatureSummary {
  name: string;
  stage: string | null;
  active: boolean;
  openedAt: string;
}

/** Preload 暴露给 renderer 的 API 形状 */
export interface DesktopApi {
  version: string;
  workspace: {
    listRecents: () => Promise<import("./ipc/workspace.ts").RecentWorkspace[]>;
    open: (path: string) => Promise<import("./ipc/workspace.ts").WorkspaceOpenResult>;
    pickDirectory: () => Promise<string | null>;
    init: (parentDir: string, name: string) => Promise<import("./ipc/workspace.ts").WorkspaceOpenResult>;
  };
  repos: {
    list: () => Promise<RepoSummary[]>;
    add: (name: string, url: string) => Promise<{ ok: boolean; error?: { code: string; message: string } }>;
    sync: (target: string) => Promise<{ ok: boolean; synced: string[]; error?: { code: string; message: string } }>;
    profile: (name: string) => Promise<{ ok: boolean; profile?: unknown; error?: { code: string; message: string } }>;
  };
  features: {
    list: () => Promise<FeatureSummary[]>;
    status: (name: string) => Promise<{ stage: string | null }>;
    stage: (name: string) => Promise<{ stage: string | null }>;
    runStage: (name: string, stage: string, confirmed?: boolean) => Promise<{ ok: boolean; error?: { code: string; message: string } }>;
    context: (name: string, stage: string) => Promise<{ ok: boolean; runtimeContext?: string; error?: { code: string; message: string } }>;
    tasks: (name: string) => Promise<{ ok: boolean; text?: string; error?: { code: string; message: string } }>;
    create: (input: { name: string; repos: string; objective?: string }) => Promise<{ ok: boolean; feature?: string; error?: { code: string; message: string } }>;
  };
  agent: {
    list: () => Promise<Array<{ id: string; cwd: string; feature?: string }>>;
    listBackends: () => Promise<Array<{ id: string; label: string; installed: boolean; path?: string }>>;
    attach: (input: { backendId: string; cwd: string; feature?: string }) => Promise<{ ok: boolean; sessionId?: string; backendId?: string; error?: { code: string; message: string } }>;
    detach: (sessionId: string) => Promise<{ ok: boolean; error?: { code: string; message: string } }>;
    send: (sessionId: string, text: string) => Promise<{ ok: boolean; error?: { code: string; message: string } }>;
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
