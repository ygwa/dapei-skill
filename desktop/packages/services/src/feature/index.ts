import { existsSync, readFileSync } from "node:fs";
import type { EngineClient, WorkspaceContext as EngineWorkspaceContext } from "@dapei/desktop-engine-client";

export interface FeatureSummary {
  name: string;
  stage: string | null;
  active: boolean;
  openedAt: string;
}

export interface FeatureService {
  list(): Promise<FeatureSummary[]>;
  getStatus(name: string): Promise<{ stage: string | null }>;
  getStage(name: string): Promise<{ stage: string | null }>;
  create(input: { name: string; repos: string; objective?: string }): Promise<{ ok: boolean; feature?: string; error?: { code: string; message: string } }>;
  runStage(name: string, stage: string, confirmed: boolean): Promise<{ ok: boolean; error?: { code: string; message: string } }>;
  /** Build runtime-context.md for a feature at a stage. M1-5 wires P5. */
  buildContext(name: string, stage: string): Promise<{ ok: boolean; runtimeContext?: string; error?: { code: string; message: string } }>;
  /** Read the feature.tasks/backlog.md content. */
  getBacklog(name: string): Promise<{ ok: boolean; text?: string; error?: { code: string; message: string } }>;
}

export function createFeatureService(engine: EngineClient, context: EngineWorkspaceContext): FeatureService {
  return {
    async list() {
      const result = await engine.run(
        { capabilityId: "feature.status", input: {}, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) return [];
      const data = result.data as { text?: string } | undefined;
      if (!data?.text) return [];
      return parseFeatureText(data.text, context.workspaceRoot);
    },
    async getStatus(name) {
      const result = await engine.run(
        { capabilityId: "feature.stage", input: { feature: name, action: "get" }, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) return { stage: null };
      const data = result.data as { stage?: string | null } | undefined;
      return { stage: data?.stage ?? null };
    },
    async getStage(name) {
      return this.getStatus(name);
    },
    async create(input) {
      const result = await engine.run(
        { capabilityId: "feature.create", input: { name: input.name, repos: input.repos, objective: input.objective ?? "" }, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      const data = result.data as { feature?: string } | undefined;
      return { ok: true, feature: data?.feature ?? input.name };
    },
    async runStage(name, stage, confirmed) {
      const result = await engine.run(
        { capabilityId: "workflow.runStage", input: { feature: name, stage, confirmed }, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
    async buildContext(name, stage) {
      const result = await engine.run(
        { capabilityId: "context.build", input: { feature: name, stage }, workspaceRoot: context.workspaceRoot, feature: name },
        { workspaceRoot: context.workspaceRoot, dimension: "feature", feature: name }
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      const data = result.data as { runtimeContext?: string } | undefined;
      return { ok: true, runtimeContext: data?.runtimeContext };
    },
    async getBacklog(name) {
      const result = await engine.run(
        { capabilityId: "feature.tasks", input: { feature: name, action: "list" }, workspaceRoot: context.workspaceRoot, feature: name },
        { workspaceRoot: context.workspaceRoot, dimension: "feature", feature: name }
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      const data = result.data as { text?: string } | undefined;
      return { ok: true, text: data?.text ?? "" };
    }
  };
}

function parseFeatureText(text: string, workspaceRoot: string): FeatureSummary[] {
  // The engine's feature.status returns text like:
  //   Features (2):
  //     - payment-refactor
  //     - auth-overhaul
  // We read each feature's reports/feature-progress.md for the stage.
  const out: FeatureSummary[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*-\s+(\S+)\s*$/);
    if (m) {
      const name = m[1];
      out.push({
        name,
        stage: null,
        active: true,
        openedAt: new Date(0).toISOString()
      });
    }
  }
  // Best-effort: read progress for the first few features
  for (const f of out) {
    try {
      const progressPath = `${workspaceRoot}/features/${f.name}/reports/feature-progress.md`;
      if (existsSync(progressPath)) {
        const content = readFileSync(progressPath, "utf8");
        const m = content.match(/## Stage: (\S+)/);
        if (m) f.stage = m[1];
      }
    } catch {
      // ignore — service stays best-effort
    }
  }
  return out;
}
