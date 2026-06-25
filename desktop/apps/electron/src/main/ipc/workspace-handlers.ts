import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { registerCapabilityProxy } from "./router.ts";

/**
 * Workspace IPC handlers. M1-2 demonstrative: status. M1-3 fills
 * in the rest. Each handler is either a thin capability proxy
 * (calls engine.run) or a pure main-process action (init/open
 * which need fs / dialog access).
 */
export function registerWorkspaceHandlers(): void {
  registerCapabilityProxy("dapei:workspace:status", "workspace.status");
  registerCapabilityProxy("dapei:workspace:validate", "workspace.validate");
  registerCapabilityProxy("dapei:workspace:report", "workspace.report");
}
