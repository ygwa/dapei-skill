import type { EngineClient } from "@dapei/desktop-engine-client";

export interface WorkspaceContext {
  rootDir: string;
}

/** workspace.init / validate / status / report */
export interface WorkspaceService {
  readonly context: WorkspaceContext;
}

export function createWorkspaceService(_engine: EngineClient, context: WorkspaceContext): WorkspaceService {
  return { context };
}
