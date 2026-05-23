import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { listFilesRecursively, read, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";
import { detectRepoLanguage, featureRepoNames, requireFields } from "../shared.ts";

export type AnyCap = CapabilitySpec<any, any>;

export const contextBuild: AnyCap = {
  id: "context.build",
  version: "1.0.0",
  inputSchema: { required: ["feature", "stage"], properties: { feature: { type: "string", minLength: 1 }, stage: { type: "string", minLength: 1 } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["feature", "stage"]);
    const feature = String(input.feature);
    const stage = String(input.stage || "general");
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, feature);
    if (!existsSync(featureDir)) throw new CapabilityError("FEATURE_MISSING", `feature not found: ${feature}`);
    const output = join(featureDir, "context", "runtime-context.md");
    const index = join(featureDir, "context", "context-index.yaml");
    let content = `# Runtime Context\n\n- Feature: ${feature}\n- Stage: ${stage}\n- Generated At: ${new Date().toISOString()}\n\n`;
    const sources = [join(p.docsDir, "standards"), join(p.runtimeDir, "ai-rules"), join(featureDir, "context"), join(featureDir, "docs"), join(featureDir, "tasks")];
    for (const s of sources) {
      if (!existsSync(s)) continue;
      for (const f of listFilesRecursively(s, [".md", ".yaml", ".yml"], 30)) {
        if (f.endsWith("runtime-context.md") || f.endsWith("context-index.yaml")) continue;
        content += `## Source: ${relative(p.rootDir, f)}\n\n\`\`\`md\n${read(f).split("\n").slice(0, 200).join("\n")}\n\`\`\`\n\n`;
      }
    }
    content += "# Repo Runtime Evidence\n\n";
    for (const repo of featureRepoNames(read(join(featureDir, "feature.yaml")))) {
      content += `## Repo: ${repo}\n\n- Path: repos/${repo}\n- Stack: ${detectRepoLanguage(join(p.reposDir, repo))}\n\n`;
    }
    write(output, content);
    write(index, `feature: ${feature}\nstage: ${stage}\ngenerated_at: "${new Date().toISOString()}"\ntotal_sources: ${sources.length}\n`);
    return { ok: true, data: { runtimeContext: relative(p.rootDir, output) }, sideEffects: ["context rebuilt"], reportFragments: ["context build done"] };
  }
};
