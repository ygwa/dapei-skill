import type { EngineClient } from "@dapei/desktop-engine-client";
import type { WorkspaceContext } from "../workspace/index.ts";

export interface AuditService {
  readonly context: WorkspaceContext;
}

export function createAuditService(_engine: EngineClient, context: WorkspaceContext): AuditService {
  return { context };
}
