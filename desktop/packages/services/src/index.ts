import type { EngineClient } from "@dapei/desktop-engine-client";
import {
  createWorkspaceService,
  type WorkspaceService,
  type WorkspaceContext
} from "./workspace/index.ts";
import { createReposService, type ReposService } from "./repos/index.ts";
import { createFeatureService, type FeatureService } from "./feature/index.ts";
import { createKnowledgeService, type KnowledgeService } from "./knowledge/index.ts";
import { createPipelineService, type PipelineService } from "./pipeline/index.ts";
import { createAuditService, type AuditService } from "./audit/index.ts";

export interface DesktopServices {
  workspace: WorkspaceService;
  repos: ReposService;
  feature: FeatureService;
  knowledge: KnowledgeService;
  pipeline: PipelineService;
  audit: AuditService;
}

export function createDesktopServices(engine: EngineClient, context: WorkspaceContext): DesktopServices {
  return {
    workspace: createWorkspaceService(engine, context),
    repos: createReposService(engine, context),
    feature: createFeatureService(engine, context),
    knowledge: createKnowledgeService(engine, context),
    pipeline: createPipelineService(engine, context),
    audit: createAuditService(engine, context)
  };
}

export * from "./workspace/index.ts";
export type { WorkspaceContext } from "./workspace/index.ts";
export * from "./repos/index.ts";
export * from "./feature/index.ts";
export * from "./knowledge/index.ts";
export * from "./pipeline/index.ts";
export * from "./pipeline/task-list.ts";
export * from "./audit/index.ts";
