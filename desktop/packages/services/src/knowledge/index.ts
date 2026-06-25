import type { EngineClient } from "@dapei/desktop-engine-client";
import type { WorkspaceContext } from "../workspace/index.ts";

export interface KnowledgeService {
  readonly context: WorkspaceContext;
}

export function createKnowledgeService(_engine: EngineClient, context: WorkspaceContext): KnowledgeService {
  return { context };
}
