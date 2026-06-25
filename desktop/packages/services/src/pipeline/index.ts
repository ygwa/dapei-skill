import type { EngineClient } from "@dapei/desktop-engine-client";
import type { WorkspaceContext } from "../workspace/index.ts";

/** CDR 流水线 + 未来 TaskList for-each 编排（程序调度，LLM 只做单任务语义） */
export interface PipelineService {
  readonly context: WorkspaceContext;
}

export function createPipelineService(_engine: EngineClient, context: WorkspaceContext): PipelineService {
  return { context };
}
