import type { EngineClient, WorkspaceContext as EngineWorkspaceContext } from "@dapei/desktop-engine-client";

/** Re-export for downstream service consumers (audit, knowledge, etc.) */
export type WorkspaceContext = EngineWorkspaceContext;

/**
 * workspace.* operations. M1-4 wires the dashboard reads:
 * getStatus, getReport. The handlers in apps/electron's ipc layer
 * call these and surface the results to the renderer.
 */
export interface WorkspaceService {
  getStatus(): Promise<{ repoCount: number; featureCount: number; conforms: boolean }>;
  getReport(): Promise<{ repos: Array<{ name: string; branch?: string; hash?: string; cloned: boolean }>; features: Array<{ name: string; stage: string | null }> }>;
}

export function createWorkspaceService(engine: EngineClient, context: EngineWorkspaceContext): WorkspaceService {
  return {
    async getStatus() {
      const result = await engine.run(
        { capabilityId: "workspace.status", input: {}, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) {
        return { repoCount: 0, featureCount: 0, conforms: false };
      }
      const data = result.data as { repoCount?: number; featureCount?: number; conforms?: boolean } | undefined;
      return {
        repoCount: data?.repoCount ?? 0,
        featureCount: data?.featureCount ?? 0,
        conforms: data?.conforms ?? false
      };
    },
    async getReport() {
      const result = await engine.run(
        { capabilityId: "workspace.report", input: {}, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) {
        return { repos: [], features: [] };
      }
      const data = result.data as { repos?: Array<{ name: string; branch?: string; hash?: string; cloned: boolean }>; features?: Array<{ name: string; stage: string | null }> } | undefined;
      return {
        repos: data?.repos ?? [],
        features: data?.features ?? []
      };
    }
  };
}
