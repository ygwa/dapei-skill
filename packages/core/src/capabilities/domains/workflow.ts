import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { ensureDir, read, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";
import { requireFields, yamlStageList, yamlStageOutputs, yamlStageRequires } from "../shared.ts";
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
    if (new Set(["solution-design", "implementation", "acceptance"]).has(stage) && input.confirmed !== true && input.__confirmed !== true) {
      throw new CapabilityError("CONFIRMATION_REQUIRED", `stage '${stage}' requires confirmation. re-run with --yes`);
    }
    await contextBuild.execute(ctx, { feature, stage });
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, feature);
    const workflowFile = join(p.dapeiDir, "workflows", "feature-lifecycle.yaml");
    if (!existsSync(workflowFile)) throw new CapabilityError("WORKFLOW_MISSING", `workflow file not found: ${workflowFile}`);
    const wf = read(workflowFile);
    if (!yamlStageList(wf).includes(stage)) throw new CapabilityError("INVALID_STAGE", `stage '${stage}' not found in workflow`);
    for (const req of yamlStageRequires(wf, stage)) {
      if (!existsSync(join(featureDir, "reports", `stage-${req}.completed`))) throw new CapabilityError("STAGE_PREREQ_MISSING", `required stage '${req}' not completed before '${stage}'`);
    }
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
    return { ok: true, data: { stage, marker: relative(p.rootDir, marker) }, sideEffects: ["stage marker"], reportFragments: ["workflow stage completed"] };
  }
};
