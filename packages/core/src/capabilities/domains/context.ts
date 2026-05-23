import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { loadCognitiveIndex } from "../../cognitive-index.ts";
import { listFilesRecursively, read, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";
import { detectRepoLanguage, featureRepoNames, requireFields } from "../shared.ts";

export type AnyCap = CapabilitySpec<any, any>;

function summarizeYamlFile(path: string, maxLines = 40): string {
  const content = read(path);
  return content.split("\n").slice(0, maxLines).join("\n");
}

function buildBehaviorSummary(rootDir: string, repos: string[]): string {
  const behaviorDir = join(rootDir, "docs", "as-is", "behavior");
  if (!existsSync(behaviorDir)) return "- No behavior artifacts yet.\n";

  const index = loadCognitiveIndex(rootDir);
  const lines: string[] = ["| ID | Kind | Level | Repo | Entry |", "|---|---|---|---|---|"];
  let count = 0;

  for (const b of index.behaviors) {
    if (repos.length && b.repo && !repos.includes(b.repo)) continue;
    const artifactPath = join(rootDir, b.path);
    let entry = "TBD";
    if (existsSync(artifactPath)) {
      const content = read(artifactPath);
      const method = content.match(/method:\s*(\S+)/)?.[1];
      const path = content.match(/path:\s*(\S+)/)?.[1];
      if (method || path) entry = `${method || ""} ${path || ""}`.trim();
    }
    lines.push(`| ${b.id} | ${b.kind} | ${b.level} | ${b.repo || "-"} | ${entry} |`);
    count++;
    if (count >= 30) break;
  }

  if (count === 0) return "- No behavior artifacts for mapped repos.\n";
  return lines.join("\n") + "\n";
}

function buildStateMachineSummary(rootDir: string, repos: string[]): string {
  const index = loadCognitiveIndex(rootDir);
  const lines: string[] = ["| Entity | Kind | Level | States |", "|---|---|---|---|"];
  let count = 0;

  for (const s of index.state_machines) {
    if (repos.length && s.repo && !repos.includes(s.repo)) continue;
    const artifactPath = join(rootDir, s.path);
    let stateCount = "?";
    if (existsSync(artifactPath)) {
      const states = read(artifactPath).match(/^\s*-\s+(\S+)/gm);
      stateCount = states ? String(states.length) : "?";
    }
    lines.push(`| ${s.entity} | ${s.kind} | ${s.level} | ${stateCount} |`);
    count++;
    if (count >= 20) break;
  }

  if (count === 0) return "- No state machine artifacts for mapped repos.\n";
  return lines.join("\n") + "\n";
}

export const contextBuild: AnyCap = {
  id: "context.build",
  version: "2.0.0",
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
    const featureYaml = read(join(featureDir, "feature.yaml"));
    const repos = featureRepoNames(featureYaml);

    let content = `# Runtime Context\n\n- Feature: ${feature}\n- Stage: ${stage}\n- Generated At: ${new Date().toISOString()}\n\n`;

    // L0/L1 workspace standards
    const sources = [join(p.docsDir, "standards"), join(p.runtimeDir, "ai-rules"), join(featureDir, "context"), join(featureDir, "docs"), join(featureDir, "tasks")];
    for (const s of sources) {
      if (!existsSync(s)) continue;
      for (const f of listFilesRecursively(s, [".md", ".yaml", ".yml"], 30)) {
        if (f.endsWith("runtime-context.md") || f.endsWith("context-index.yaml")) continue;
        content += `## Source: ${relative(p.rootDir, f)}\n\n\`\`\`md\n${read(f)}\n\`\`\`\n\n`;
      }
    }

    // L2 cognitive behavior summary (compressed)
    content += `# Cognitive Behavior Summary\n\n`;
    content += buildBehaviorSummary(p.rootDir, repos);

    // L3 state machine summary
    content += `\n# State Machine Summary\n\n`;
    content += buildStateMachineSummary(p.rootDir, repos);

    // L4 repo evidence
    content += `\n# Repo Runtime Evidence\n\n`;
    for (const repo of repos) {
      content += `## Repo: ${repo}\n\n- Path: repos/${repo}\n- Stack: ${detectRepoLanguage(join(p.reposDir, repo))}\n\n`;
      const behaviorDir = join(p.docsDir, "as-is", "behavior");
      if (existsSync(behaviorDir)) {
        for (const f of listFilesRecursively(behaviorDir, [".yaml"], 5)) {
          if (f.endsWith("_candidates.yaml")) continue;
          const body = read(f);
          if (repos.length && body.includes(`repo: ${repo}`)) {
            content += `### Behavior: ${relative(p.rootDir, f)}\n\n\`\`\`yaml\n${summarizeYamlFile(f)}\n\`\`\`\n\n`;
          }
        }
      }
    }

    write(output, content);
    write(index, `feature: ${feature}\nstage: ${stage}\ngenerated_at: "${new Date().toISOString()}"\ntotal_sources: ${sources.length}\ncognitive_layer: true\n`);
    return { ok: true, data: { runtimeContext: relative(p.rootDir, output) }, sideEffects: ["context rebuilt"], reportFragments: ["context build done"] };
  }
};
