import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { ensureDir, read, workspacePaths, write } from "@dapei/runtime-adapters/system";
import { assertStageConfirmation, assertStagePrereqs, requireFields, yamlStageList, yamlStageOutputs } from "../shared.ts";
import { guardStageAdvance } from "../../guardrail.ts";
import { contextBuild } from "./context.ts";

export type AnyCap = CapabilitySpec<any, any>;

export const workflowRunStage: AnyCap = {
  id: "workflow.runStage",
  version: "1.0.0",
  inputSchema: { required: ["feature", "stage"], properties: { feature: { type: "string", minLength: 1 }, stage: { type: "string", minLength: 1 }, confirmed: { type: "boolean" } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["feature", "stage"]);
    const feature = String(input.feature);
    const stage = String(input.stage);
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, feature);
    const workflowFile = join(p.dapeiDir, "workflows", "feature-lifecycle.yaml");
    // Confirmation gate first, so a gated stage refuses even when the workspace
    // has no workflow file yet. The gate list is read from the workflow YAML.
    const declaredWorkflow = existsSync(workflowFile) ? read(workflowFile) : "";
    assertStageConfirmation(declaredWorkflow, stage, input.confirmed === true);
    await contextBuild.execute(ctx, { feature, stage });
    if (!existsSync(workflowFile)) throw new CapabilityError("WORKFLOW_MISSING", `workflow file not found: ${workflowFile}`);
    const wf = read(workflowFile);
    if (!yamlStageList(wf).includes(stage)) throw new CapabilityError("INVALID_STAGE", `stage '${stage}' not found in workflow`);
    assertStagePrereqs(wf, featureDir, stage);
    // Guardrail runs before any marker is written: in a non-report
    // guardrail_mode a FAIL aborts the advance and leaves no marker behind.
    const guardFragments = guardStageAdvance(p.rootDir, feature);
    ensureDir(join(featureDir, "reports"));
    for (const output of yamlStageOutputs(wf, stage)) {
      if (!output || ["code changes", "all reports", "layered context", "feature manifest", "repos/"].includes(output)) continue;
      const outFile = join(featureDir, output);
      if (output.startsWith("reports/") && !existsSync(outFile)) write(outFile, `# ${output.split("/").pop()?.replace(/\.md$/, "").replace(/-/g, " ") || "report"}\n\n- Stage: ${stage}\n- Status: pending content\n`);
      else if (output === "release-notes.md" && !existsSync(outFile)) write(outFile, `# Release Notes\n\n- Feature: ${feature}\n- Status: pending content\n`);
      if (!existsSync(outFile)) throw new CapabilityError("STAGE_OUTPUT_MISSING", `stage '${stage}' missing declared output: ${output}`);
    }
    const marker = join(featureDir, "reports", `stage-${stage}.completed`);
    write(marker, `stage: ${stage}\ncompleted-at: ${new Date().toISOString()}\n`);
    const progress = join(featureDir, "reports", "feature-progress.md");
    write(progress, `${existsSync(progress) ? read(progress) : "# Feature Progress\n"}\n## Stage: ${stage}\n- Status: completed\n`);
    return { ok: true, data: { stage, marker: relative(p.rootDir, marker) }, sideEffects: ["stage marker"], reportFragments: ["workflow stage completed", ...guardFragments] };
  }
};

export const workflowStatus: AnyCap = {
  id: "workflow.status",
  version: "1.0.0",
  inputSchema: { required: ["feature"], properties: { feature: { type: "string", minLength: 1 } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["feature"]);
    const feature = String(input.feature);
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, feature);
    const progressFile = join(featureDir, "reports", "feature-progress.md");

    if (!existsSync(progressFile)) {
      return { ok: true, data: { feature, stage: null, completed: [] }, sideEffects: [], reportFragments: [] };
    }

    const content = read(progressFile);
    const stageMatch = content.match(/## Stage: (\S+)/);
    const currentStage = stageMatch ? stageMatch[1] : null;
    const completed: string[] = [];
    for (const file of ["analyze-current-state", "gap-analysis", "solution-design", "task-breakdown", "implementation", "local-validation", "architecture-review", "acceptance"]) {
      if (existsSync(join(featureDir, "reports", `stage-${file}.completed`))) completed.push(file);
    }

    return { ok: true, data: { feature, currentStage, completed }, sideEffects: [], reportFragments: [] };
  }
};
