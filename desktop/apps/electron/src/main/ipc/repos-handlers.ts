import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { registerCapabilityProxy } from "./router.ts";

/**
 * Repos IPC handlers. M1-2 demonstrative: list (read).
 * M1-4 adds add/sync/profile.
 */
export function registerReposHandlers(): void {
  registerCapabilityProxy("dapei:repos:list", "repos.list");
}
