import type { EngineClient } from "@dapei/desktop-engine-client";
import type { WorkspaceContext } from "../workspace/index.ts";

export interface FeatureService {
  readonly context: WorkspaceContext;
}

export function createFeatureService(_engine: EngineClient, context: WorkspaceContext): FeatureService {
  return { context };
}
