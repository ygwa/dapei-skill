import type { EngineClient } from "@dapei/desktop-engine-client";
import type { WorkspaceContext } from "../workspace/index.ts";

export interface ReposService {
  readonly context: WorkspaceContext;
}

export function createReposService(_engine: EngineClient, context: WorkspaceContext): ReposService {
  return { context };
}
