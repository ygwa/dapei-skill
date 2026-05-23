import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { CapabilityError } from "../../types.ts";
import type { CapabilityResult, CapabilitySpec } from "../../types.ts";
import { copyIfMissing, ensureDir, isConformingWorkspace, isEffectivelyEmpty, runSafe, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";

export type AnyCap = CapabilitySpec<any, any>;

export const workspaceInit: AnyCap = {
  id: "workspace.init",
  version: "1.0.0",
  inputSchema: {},
  outputs: [".dapei/workspace.yaml"],
  async execute(ctx): Promise<CapabilityResult> {
    const p = workspacePaths(ctx.rootDir);
    ensureDir(p.rootDir);
    if (!isEffectivelyEmpty(p.rootDir) && !isConformingWorkspace(p.rootDir)) {
      throw new CapabilityError("WORKSPACE_INVALID", `current directory is not empty and does not look like a dapei workspace: ${p.rootDir}`);
    }

    if (!existsSync(join(p.rootDir, ".git"))) {
      runSafe("git", ["init", "-b", "main"], p.rootDir);
    }

    const gitignoreFile = join(p.rootDir, ".gitignore");
    if (!existsSync(gitignoreFile)) {
      write(gitignoreFile, `# dapei workspace gitignore\nnode_modules/\n.DS_Store\n.dapei/audit/\nfeatures/*/repos/\n`);
    }

    const dirs = [
      join(p.dapeiDir, "workflows"), join(p.dapeiDir, "rules"), join(p.dapeiDir, "cognitive"), join(p.dapeiDir, "schemas"),
      p.reposDir, p.featuresDir,
      join(p.docsDir, "as-is"), join(p.docsDir, "as-is", "behavior"), join(p.docsDir, "as-is", "state-machines"),
      join(p.docsDir, "as-is", "domains"), join(p.docsDir, "architecture"), join(p.docsDir, "standards"),
      join(p.docsDir, "business"), join(p.docsDir, "domain"), join(p.docsDir, "glossary"),
      join(p.docsDir, "workflows"), join(p.docsDir, "decisions"), join(p.docsDir, "feature-impact"),
      join(p.docsDir, "integrations"), join(p.docsDir, "observability"), join(p.docsDir, "playbooks"), join(p.docsDir, "specs"),
      join(p.runtimeDir, "templates"), join(p.runtimeDir, "ai-rules")
    ];
    dirs.forEach(ensureDir);

    const workspaceFile = join(p.dapeiDir, "workspace.yaml");
    if (!existsSync(workspaceFile)) {
      write(workspaceFile, `version: 0.2\nworkspace:\n  name: ${basename(p.rootDir)}\n  root: .\n  default_branch: main\n  locale: zh-CN\n  repos_file: .dapei/repos.yaml\n\nrepos:\n  root_dir: repos\n  feature_repo_mode: worktree\n  management_mode: submodule\n  managed_repos: []\n\nquality_gates:\n  guardrail_mode: report\n  required_reports:\n    - feature-progress\n    - daily-report\n    - architecture-review\n    - validation-report\n`);
    }

    const engineHome = process.env.DAPEI_ENGINE_HOME || p.rootDir;
    const sourceDapei = join(engineHome, ".dapei");
    const sourceTemplates = join(engineHome, "runtime", "templates");
    const files = ["commands.yaml", "feature.schema.yaml", "repos.schema.yaml", "workflows/feature-lifecycle.yaml", "rules/api.yaml", "rules/ddd.yaml", "rules/layering.yaml", "rules/naming.yaml"];
    files.forEach((f) => copyIfMissing(join(sourceDapei, f), join(p.dapeiDir, f)));
    const schemaFiles = ["evidence.schema.yaml", "behavior.schema.yaml", "state-machine.schema.yaml", "cognitive-index.schema.yaml"];
    schemaFiles.forEach((f) => copyIfMissing(join(sourceDapei, "schemas", f), join(p.dapeiDir, "schemas", f)));
    copyIfMissing(join(sourceDapei, "cognitive", "index.yaml"), join(p.dapeiDir, "cognitive", "index.yaml"));
    copyIfMissing(join(sourceDapei, "rules", "cognitive.yaml"), join(p.dapeiDir, "rules", "cognitive.yaml"));
    for (const name of ["01-current-state.md.template", "02-gap-analysis.md.template", "03-business-design.md.template", "04-technical-design.md.template", "05-task-breakdown.md.template", "06-acceptance.md.template"]) {
      copyIfMissing(join(sourceTemplates, name), join(p.runtimeDir, "templates", name));
    }
    copyIfMissing(join(engineHome, "runtime", "ai-rules", "README.md"), join(p.runtimeDir, "ai-rules", "README.md"));

    if (!existsSync(join(p.docsDir, "agents.md"))) {
      write(join(p.docsDir, "agents.md"), "# Workspace Agents\n\nUse this workspace as the durable source of engineering context.\n");
    }

    return { ok: true, data: { message: `workspace initialized at ${p.rootDir}` }, sideEffects: ["filesystem"], reportFragments: ["workspace initialized"] };
  }
};
