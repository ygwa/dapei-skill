import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { registerCapabilityProxy } from "./router.ts";

/**
 * Feature IPC handlers. M1-2 demonstrative: list (proxies through
 * feature.status then maps the text response to a structured list).
 * The mapping lives in services/feature/feature-service.ts; this
 * file is the IPC wiring.
 */
export function registerFeatureHandlers(): void {
  registerCapabilityProxy("dapei:feature:list", "feature.status");
}
