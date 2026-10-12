import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CapabilityError } from "../../types.ts";
import type { CapabilityResult, CapabilitySpec } from "../../types.ts";
import { copyIfMissing, ensureDir, isConformingWorkspace, isEffectivelyEmpty, read, runSafe, workspacePaths, write } from "@dapei/runtime-adapters/system";
import { parseReposYamlNames } from "../shared.ts";
import { EMBEDDED_TEMPLATE_ASSETS } from "../../generated/embedded-assets.ts";

export type AnyCap = CapabilitySpec<any, any>;

/**
 * Locate the engine home: the directory that ships the workspace scaffolds
 * (`runtime/templates/**`).
 *
 * `DAPEI_ENGINE_HOME` is an explicit override (set by the `scripts/dapei`
 * shell wrapper). When it is unset we derive the location from this module's
 * own path by walking up the directory tree. Returns `null` when the engine is
 * running from a shipped bundle with no source tree next to it — in that case
 * the templates come from `generated/embedded-assets.ts` instead (see
 * `copyTemplateAsset` and ADR-0024).
 */
function resolveEngineHome(): string | null {
  const candidates: string[] = [];
  const override = process.env.DAPEI_ENGINE_HOME;
  if (override) candidates.push(override);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    candidates.push(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "runtime", "templates", "dapei", "commands.yaml"))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Copy one template asset into the workspace being initialised.
 *
 * Disk first (a source checkout must always use what you can edit), embedded
 * second (a shipped bundle has no source tree). In disk mode a missing asset is
 * an error — silently initialising a workspace without `commands.yaml` or the
 * workflow definition is exactly the failure mode this capability used to have.
 */
function copyTemplateAsset(engineHome: string | null, relPath: string, target: string): void {
  if (existsSync(target)) return;
  if (engineHome) {
    const src = join(engineHome, "runtime", "templates", relPath);
    if (existsSync(src)) {
      copyIfMissing(src, target);
      return;
    }
    throw new CapabilityError(
      "TEMPLATE_MISSING",
      `engine home ${engineHome} has no runtime/templates/${relPath}`
    );
  }
  const embedded = EMBEDDED_TEMPLATE_ASSETS[relPath];
  if (embedded === undefined) {
    throw new CapabilityError(
      "TEMPLATE_MISSING",
      `template ${relPath} is neither on disk (no engine home found) nor embedded in this build; run \`npm run gen:assets\``
    );
  }
  ensureDir(dirname(target));
  write(target, embedded);
}


export const workspaceInit: AnyCap = {
  id: "workspace.init",
  version: "1.0.0",
  inputSchema: {},
  outputs: [
    ".dapei/workspace.yaml",
    ".dapei/commands.yaml",
    ".dapei/feature.schema.yaml",
    ".dapei/repos.schema.yaml",
    ".dapei/workflows/",
    ".dapei/rules/",
    ".dapei/cognitive/index.yaml",
    "runtime/templates/",
    "runtime/ai-rules/",
    "docs/"
  ],
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
      join(p.dapeiDir, "workflows"), join(p.dapeiDir, "rules"), join(p.dapeiDir, "cognitive"),
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

    const engineHome = resolveEngineHome();
    const templateFiles: Array<[string, string]> = [
      ["dapei/commands.yaml", join(p.dapeiDir, "commands.yaml")],
      ["dapei/feature.schema.yaml", join(p.dapeiDir, "feature.schema.yaml")],
      ["dapei/repos.schema.yaml", join(p.dapeiDir, "repos.schema.yaml")],
      ["dapei/workflows/feature-lifecycle.yaml", join(p.dapeiDir, "workflows", "feature-lifecycle.yaml")],
      ["dapei/rules/api.yaml", join(p.dapeiDir, "rules", "api.yaml")],
      ["dapei/rules/cognitive.yaml", join(p.dapeiDir, "rules", "cognitive.yaml")],
      ["dapei/rules/ddd.yaml", join(p.dapeiDir, "rules", "ddd.yaml")],
      ["dapei/rules/layering.yaml", join(p.dapeiDir, "rules", "layering.yaml")],
      ["dapei/rules/naming.yaml", join(p.dapeiDir, "rules", "naming.yaml")],
      ["dapei/cognitive/index.yaml", join(p.dapeiDir, "cognitive", "index.yaml")],
      ["01-current-state.md.template", join(p.runtimeDir, "templates", "01-current-state.md.template")],
      ["02-gap-analysis.md.template", join(p.runtimeDir, "templates", "02-gap-analysis.md.template")],
      ["03-business-design.md.template", join(p.runtimeDir, "templates", "03-business-design.md.template")],
      ["04-technical-design.md.template", join(p.runtimeDir, "templates", "04-technical-design.md.template")],
      ["05-task-breakdown.md.template", join(p.runtimeDir, "templates", "05-task-breakdown.md.template")],
      ["06-acceptance.md.template", join(p.runtimeDir, "templates", "06-acceptance.md.template")]
    ];
    for (const [rel, target] of templateFiles) {
      copyTemplateAsset(engineHome, rel, target);
    }

    // Scaffolding for the standard documentation areas, so the tree a user
    // sees matches the layout the skills describe. These are plain markdown
    // placeholders — the workspace has no site builder of its own; the portal
    // is produced by `cdr.doc.generate` (see ADR-0024).
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

    if (!existsSync(join(p.docsDir, "agents.md"))) {
      write(join(p.docsDir, "agents.md"), "# Workspace Agents\n\nUse this workspace as the durable source of engineering context.\n");
    }

    return {
      ok: true,
      data: { message: `workspace initialized at ${p.rootDir}` },
      sideEffects: ["filesystem"],
      reportFragments: ["workspace initialized"],
      artifactPaths: [".dapei/workspace.yaml", ".dapei/commands.yaml"]
    };
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