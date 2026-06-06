import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { CapabilityError } from "../../types.ts";
import type { CapabilityResult, CapabilitySpec } from "../../types.ts";
import { copyIfMissing, ensureDir, isConformingWorkspace, isEffectivelyEmpty, read, runSafe, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";
import { parseReposYamlNames } from "../shared.ts";

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
      join(p.runtimeDir, "templates"), join(p.runtimeDir, "ai-rules"),
      join(p.docsDir, ".vitepress"), join(p.docsDir, ".vitepress", "theme"), join(p.docsDir, "scripts"), join(p.docsDir, "compiled")
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

    // Copy VitePress config & compilation script templates
    const sourceTemplatesDocs = join(engineHome, "runtime", "templates", "docs");
    copyIfMissing(join(sourceTemplatesDocs, ".vitepress", "config.mts"), join(p.docsDir, ".vitepress", "config.mts"));
    copyIfMissing(join(sourceTemplatesDocs, ".vitepress", "theme", "index.ts"), join(p.docsDir, ".vitepress", "theme", "index.ts"));
    copyIfMissing(join(sourceTemplatesDocs, ".vitepress", "theme", "custom.css"), join(p.docsDir, ".vitepress", "theme", "custom.css"));
    copyIfMissing(join(sourceTemplatesDocs, "scripts", "build-cognitive-pages.ts"), join(p.docsDir, "scripts", "build-cognitive-pages.ts"));
    copyIfMissing(join(sourceTemplatesDocs, "index.md"), join(p.docsDir, "index.md"));

    // Ensure placeholders for standard documentation to prevent 404s
    const placeholderFiles = [
      { path: join(p.docsDir, "architecture", "README.md"), title: "Architecture & Boundary" },
      { path: join(p.docsDir, "standards", "README.md"), title: "Standards & Rules" },
      { path: join(p.docsDir, "glossary", "README.md"), title: "Terminology Glossary" },
      { path: join(p.docsDir, "decisions", "README.md"), title: "Design Decisions (ADR)" }
    ];
    placeholderFiles.forEach(({ path: filepath, title }) => {
      if (!existsSync(filepath)) {
        write(filepath, `# ${title}\n\n*Placeholder for workspace documentation.*\n`);
      }
    });

    // Merge VitePress dev dependencies and package scripts
    const packageJsonPath = join(p.rootDir, "package.json");
    const newScripts = {
      "docs:build-assets": "node --experimental-strip-types docs/scripts/build-cognitive-pages.ts",
      "docs:dev": "npm run docs:build-assets && vitepress dev docs",
      "docs:build": "npm run docs:build-assets && vitepress build docs",
      "docs:preview": "vitepress preview docs"
    };
    const newDevDeps = {
      "vitepress": "^1.5.0",
      "vue": "^3.5.13",
      "js-yaml": "^4.2.0"
    };

    if (existsSync(packageJsonPath)) {
      try {
        const current = JSON.parse(read(packageJsonPath));
        current.scripts = { ...current.scripts, ...newScripts };
        current.devDependencies = { ...current.devDependencies, ...newDevDeps };
        write(packageJsonPath, JSON.stringify(current, null, 2) + "\n");
      } catch (e) {
        // Safe fallback
      }
    } else {
      const initPkg = {
        name: basename(p.rootDir),
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: newScripts,
        devDependencies: newDevDeps
      };
      write(packageJsonPath, JSON.stringify(initPkg, null, 2) + "\n");
    }

    if (!existsSync(join(p.docsDir, "agents.md"))) {
      write(join(p.docsDir, "agents.md"), "# Workspace Agents\n\nUse this workspace as the durable source of engineering context.\n");
    }

    return { ok: true, data: { message: `workspace initialized at ${p.rootDir}` }, sideEffects: ["filesystem"], reportFragments: ["workspace initialized"] };
  }
};

export const workspaceReport: AnyCap = {
  id: "workspace.report",
  version: "1.0.0",
  inputSchema: {},
  async execute(ctx) {
    const p = workspacePaths(ctx.rootDir);
    const registry = join(p.dapeiDir, "repos.yaml");
    const repos: Array<{ name: string; branch?: string; hash?: string; cloned: boolean }> = [];

    if (existsSync(registry)) {
      const names = parseReposYamlNames(read(registry));
      for (const name of names) {
        const repoPath = join(p.reposDir, name);
        const cloned = existsSync(join(repoPath, ".git"));
        if (cloned) {
          repos.push({
            name,
            branch: runSafe("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"], p.rootDir) || undefined,
            hash: runSafe("git", ["-C", repoPath, "rev-parse", "--short", "HEAD"], p.rootDir) || undefined,
            cloned: true
          });
        } else {
          repos.push({ name, cloned: false });
        }
      }
    }

    const features: Array<{ name: string; stage: string | null }> = [];
    if (existsSync(p.featuresDir)) {
      for (const name of readdirSync(p.featuresDir)) {
        if (!existsSync(join(p.featuresDir, name, "feature.yaml"))) continue;
        const progressFile = join(p.featuresDir, name, "reports", "feature-progress.md");
        let stage: string | null = null;
        if (existsSync(progressFile)) {
          const m = read(progressFile).match(/## Stage: (\S+)/);
          if (m) stage = m[1];
        }
        features.push({ name, stage });
      }
    }

    return { ok: true, data: { repos, features }, sideEffects: [], reportFragments: ["workspace report generated"] };
  }
};

export const workspaceValidate: AnyCap = {
  id: "workspace.validate",
  version: "1.0.0",
  inputSchema: {},
  async execute(ctx) {
    const p = workspacePaths(ctx.rootDir);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!existsSync(join(p.dapeiDir, "workspace.yaml"))) {
      errors.push(".dapei/workspace.yaml missing");
    }
    if (!existsSync(p.reposDir)) warnings.push("repos/ directory missing");
    if (!existsSync(p.featuresDir)) warnings.push("features/ directory missing");
    if (!existsSync(join(p.docsDir, "agents.md"))) warnings.push("docs/agents.md missing");

    const status = errors.length === 0 ? (warnings.length === 0 ? "valid" : "warn") : "invalid";
    return { ok: true, data: { status, errors, warnings }, sideEffects: [], reportFragments: ["workspace validated"] };
  }
};

export const workspaceStatus: AnyCap = {
  id: "workspace.status",
  version: "1.0.0",
  inputSchema: {},
  async execute(ctx) {
    const p = workspacePaths(ctx.rootDir);
    const registry = join(p.dapeiDir, "repos.yaml");
    const repoCount = existsSync(registry) ? parseReposYamlNames(read(registry)).length : 0;
    const featureCount = existsSync(p.featuresDir)
      ? readdirSync(p.featuresDir).filter((x) => existsSync(join(p.featuresDir, x, "feature.yaml"))).length
      : 0;
    const conforms = isConformingWorkspace(p.rootDir);
    return { ok: true, data: { repoCount, featureCount, conforms }, sideEffects: [], reportFragments: ["workspace status"] };
  }
};