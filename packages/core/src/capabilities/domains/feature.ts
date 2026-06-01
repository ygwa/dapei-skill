import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { ensureDir, read, run, runSafe, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";
import { defaultBranch, featureRepoNames, requireFields } from "../shared.ts";

export type AnyCap = CapabilitySpec<any, any>;

function isRepoDirty(repoPath: string, rootDir: string): boolean {
  return Boolean(runSafe("git", ["-C", repoPath, "status", "--porcelain"], rootDir));
}

function currentBranch(repoPath: string, rootDir: string): string {
  return runSafe("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"], rootDir) || "HEAD";
}

function worktreeBoundToBranch(repoPath: string, rootDir: string, branch: string): string | "" {
  const out = runSafe("git", ["-C", repoPath, "worktree", "list", "--porcelain"], rootDir);
  if (!out) return "";
  const lines = out.split("\n");
  let currentPath = "";
  for (const line of lines) {
    const m1 = line.match(/^worktree\s+(.+)$/);
    if (m1) {
      currentPath = m1[1];
      continue;
    }
    const m2 = line.match(/^branch\s+(.+)$/);
    if (m2 && m2[1] === `refs/heads/${branch}`) {
      return currentPath;
    }
  }
  return "";
}

export const featureCreate: AnyCap = {
  id: "feature.create",
  version: "1.0.0",
  inputSchema: { required: ["name", "repos"], properties: { name: { type: "string", minLength: 1 }, repos: { type: "string", minLength: 1 }, objective: { type: "string" } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["name", "repos"]);
    const name = String(input.name);
    const reposCsv = String(input.repos);
    const objective = String(input.objective || "TBD");
    if (!/^[a-z0-9-]+$/.test(name)) throw new CapabilityError("INVALID_FEATURE", "feature name must match ^[a-z0-9-]+$");
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, name);
    if (existsSync(featureDir)) throw new CapabilityError("FEATURE_EXISTS", `feature already exists: ${name}`);
    ensureDir(join(featureDir, "repos"));
    const repos = reposCsv.split(",").map((x) => x.trim()).filter(Boolean);

    for (const repo of repos) {
      const repoPath = join(p.reposDir, repo);
      if (!existsSync(join(repoPath, ".git"))) throw new CapabilityError("REPO_MISSING", `repo '${repo}' not found in repos. run 'dapei repos add ${repo} <url>' first`);
      const base = defaultBranch(repoPath);
      const branch = `feature/${name}`;

      // Base pool discipline: repos/<repo> must be clean and on default branch.
      if (isRepoDirty(repoPath, p.rootDir)) {
        throw new CapabilityError("REPO_DIRTY", `repos/${repo} is dirty. base repos are read-only; discard changes before creating feature worktree.`);
      }
      const cur = currentBranch(repoPath, p.rootDir);
      if (cur !== base) {
        // Detached HEAD or other branch: switch back to default branch.
        run("git", ["-C", repoPath, "checkout", base], p.rootDir);
      }

      // Ensure base is synced to latest origin/<default>.
      run("git", ["-C", repoPath, "fetch", "origin"], p.rootDir);
      run("git", ["-C", repoPath, "merge", "--ff-only", `origin/${base}`], p.rootDir);

      // Branch decision: if remote branch exists, use it as the source of truth (continue development).
      const remoteHash = runSafe("git", ["-C", repoPath, "rev-parse", "--verify", `origin/${branch}`], p.rootDir);
      const localRef = runSafe("git", ["-C", repoPath, "show-ref", `refs/heads/${branch}`], p.rootDir);
      if (!localRef) {
        if (remoteHash) run("git", ["-C", repoPath, "branch", "--track", branch, `origin/${branch}`], p.rootDir);
        else run("git", ["-C", repoPath, "branch", branch], p.rootDir);
      }

      // Prevent "one branch bound to multiple worktrees".
      const bound = worktreeBoundToBranch(repoPath, p.rootDir, branch);
      if (bound) {
        throw new CapabilityError("WORKTREE_CONFLICT", `branch '${branch}' is already checked out by worktree: ${bound}`);
      }

      const dest = join(featureDir, "repos", repo);
      if (existsSync(dest)) throw new CapabilityError("WORKTREE_EXISTS", `worktree path already exists: features/${name}/repos/${repo}`);
      run("git", ["-C", repoPath, "worktree", "add", dest, branch], p.rootDir);
    }

    ["docs", "context", "memory", "tests/regression", "reports", "tasks", "artifacts"].forEach((d) => ensureDir(join(featureDir, d)));
    write(join(featureDir, "context", "business-context.md"), "# Business Context\n");
    write(join(featureDir, "context", "architecture-context.md"), "# Architecture Context\n");
    write(join(featureDir, "context", "repo-context.md"), "# Repo Context\n");
    write(join(featureDir, "context", "feature-context.md"), `# Feature Context\n\n- Feature: ${name}\n- Objective: ${objective}\n- Repos: ${repos.join(", ")}\n`);
    write(join(featureDir, "context", "constraints.md"), "# Constraints\n\n- Keep changes scoped to this feature workspace.\n");
    write(join(featureDir, "reports", "feature-progress.md"), "# Feature Progress\n\n- Status: initialized\n");
    write(join(featureDir, "reports", "daily-report.md"), "# Daily Report\n");
    write(join(featureDir, "reports", "architecture-review.md"), "# Architecture Review\n");
    write(join(featureDir, "tests", "test-plan.md"), "# Test Plan\n");
    write(join(featureDir, "memory", "decision-log.md"), "# Decision Log\n");
    write(join(featureDir, "memory", "risk.md"), "# Risk Log\n");
    write(join(featureDir, "memory", "open-questions.md"), "# Open Questions\n");
    write(join(featureDir, "tasks", "backlog.md"), "# Backlog\n");
    write(join(featureDir, "tasks", "plan.md"), "# Plan\n\n## Current Stage\n\nTBD\n");

    const templates = join(p.runtimeDir, "templates");
    const date = new Date().toISOString().slice(0, 10);
    const reposSummary = repos.join(", ");
    for (const f of ["01-current-state", "02-gap-analysis", "03-business-design", "04-technical-design", "05-task-breakdown", "06-acceptance"]) {
      const src = join(templates, `${f}.md.template`);
      const out = join(featureDir, "docs", `${f}.md`);
      let content = existsSync(src) ? read(src) : `# ${f}\n`;
      content = content.replaceAll("{{date}}", date).replaceAll("{{objective}}", objective).replaceAll("{{repos}}", reposSummary);
      write(out, content);
    }

    const manifest = ['version: "0.2"', 'feature:', `  name: "${name}"`, `  objective: "${objective}"`, '  owner: "unassigned"', '  isolation: "worktree"', '  repos:'];
    for (const repo of repos) {
      const rp = join(p.reposDir, repo);
      manifest.push(`    - name: "${repo}"`, `      branch: "feature/${name}"`, `      base-ref: "${runSafe("git", ["-C", rp, "rev-parse", "HEAD"], p.rootDir) || "unknown"}"`, `      base-time: "${new Date().toISOString()}"`, `      path: "repos/${repo}"`);
    }
    manifest.push("  scope:", "    in: []", "    out: []", "  acceptance:", '    - "define acceptance criteria"', '  risk_level: "medium"', "  dependencies: []", "  last-review-at: null");
    write(join(featureDir, "feature.yaml"), manifest.join("\n") + "\n");

    return { ok: true, data: { feature: name }, sideEffects: ["worktree mapping", "feature files"], reportFragments: ["feature created"] };
  }
};

export const featureStatus: AnyCap = {
  id: "feature.status",
  version: "1.0.0",
  inputSchema: {},
  async execute(ctx) {
    const p = workspacePaths(ctx.rootDir);
    if (!existsSync(p.featuresDir)) return { ok: true, data: { text: "No features found." }, sideEffects: [], reportFragments: [] };
    const features = readdirSync(p.featuresDir).filter((x: string) => existsSync(join(p.featuresDir, x, "feature.yaml")));
    return { ok: true, data: { text: [`Features (${features.length}):`, ...features.map((f) => `  - ${f}`)].join("\n") }, sideEffects: [], reportFragments: [] };
  }
};

export const featureStage: AnyCap = {
  id: "feature.stage",
  version: "1.0.0",
  inputSchema: {
    required: ["feature", "action"],
    properties: {
      feature: { type: "string", minLength: 1 },
      action: { type: "string", enum: ["get", "set"] },
      stage: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["feature", "action"]);
    const feature = String(input.feature);
    const action = String(input.action);
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, feature);
    const progressFile = join(featureDir, "reports", "feature-progress.md");

    if (action === "get") {
      if (!existsSync(progressFile)) return { ok: true, data: { stage: null }, sideEffects: [], reportFragments: [] };
      const content = read(progressFile);
      const m = content.match(/## Stage: (\S+)/);
      return { ok: true, data: { stage: m ? m[1] : null }, sideEffects: [], reportFragments: [] };
    }

    if (action === "set") {
      requireFields(input, ["stage"]);
      const stage = String(input.stage);
      ensureDir(join(featureDir, "reports"));
      const marker = join(featureDir, "reports", `stage-${stage}.completed`);
      write(marker, `stage: ${stage}\nset-at: ${new Date().toISOString()}\n`);
      const prev = existsSync(progressFile) ? read(progressFile) : "# Feature Progress\n";
      const hasStageLine = /## Stage: /.test(prev);
      const updated = hasStageLine
        ? prev.replace(/## Stage: .+$/m, `## Stage: ${stage}`)
        : (prev.endsWith('\n') ? prev : prev + '\n') + `## Stage: ${stage}\n`;
      write(progressFile, updated);
      return { ok: true, data: { stage }, sideEffects: ["stage marker", "progress updated"], reportFragments: [`stage set to ${stage}`] };
    }

    throw new CapabilityError("INVALID_ACTION", `unknown action: ${action}`);
  }
};

export const featureTasks: AnyCap = {
  id: "feature.tasks",
  version: "1.0.0",
  inputSchema: {
    required: ["feature", "action"],
    properties: {
      feature: { type: "string", minLength: 1 },
      action: { type: "string", enum: ["list", "append"] },
      content: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["feature", "action"]);
    const feature = String(input.feature);
    const action = String(input.action);
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, feature);
    const tasksDir = join(featureDir, "tasks");
    ensureDir(tasksDir);

    if (action === "list") {
      const backlogFile = join(tasksDir, "backlog.md");
      if (!existsSync(backlogFile)) return { ok: true, data: { text: "" }, sideEffects: [], reportFragments: [] };
      return { ok: true, data: { text: read(backlogFile) }, sideEffects: [], reportFragments: [] };
    }

    if (action === "append") {
      requireFields(input, ["content"]);
      const content = String(input.content);
      const backlogFile = join(tasksDir, "backlog.md");
      const ts = new Date().toISOString();
      const entry = content.includes("\n") ? content : `- ${content} (${ts})`;
      const toWrite = existsSync(backlogFile) ? read(backlogFile) + "\n" + entry : `# Backlog\n\n${entry}\n`;
      write(backlogFile, toWrite);
      return { ok: true, data: { appended: true }, sideEffects: ["backlog updated"], reportFragments: ["task appended"] };
    }

    throw new CapabilityError("INVALID_ACTION", `unknown action: ${action}`);
  }
};

export const featureReview: AnyCap = {
  id: "feature.review",
  version: "1.0.0",
  inputSchema: { required: ["feature"], properties: { feature: { type: "string", minLength: 1 } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["feature"]);
    const feature = String(input.feature);
    const p = workspacePaths(ctx.rootDir);
    const report = join(p.featuresDir, feature, "reports", "daily-report.md");
    write(report, `# Daily Review: ${feature}\n\n- Date: ${new Date().toISOString()}\n`);
    return { ok: true, data: { report: relative(p.rootDir, report) }, sideEffects: ["review report"], reportFragments: ["review generated"] };
  }
};

export const featureClose: AnyCap = {
  id: "feature.close",
  version: "1.0.0",
  inputSchema: { required: ["feature"], properties: { feature: { type: "string", minLength: 1 }, confirmed: { type: "boolean" }, force: { type: "boolean" } }, additionalProperties: false },
  confirmGate: "acceptance",
  async execute(ctx, input) {
    requireFields(input, ["feature"]);
    const feature = String(input.feature);
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, feature);
    const featureYaml = join(featureDir, "feature.yaml");
    if (!existsSync(featureYaml)) throw new CapabilityError("FEATURE_MISSING", `feature.yaml not found for ${feature}`);
    ensureDir(join(p.docsDir, "decisions"));
    ensureDir(join(p.docsDir, "feature-impact"));
    const decision = join(featureDir, "memory", "decision-log.md");
    if (existsSync(decision)) write(join(p.docsDir, "decisions", `${feature}-decisions.md`), `# Decisions for Feature: ${feature}\n\n${read(decision)}`);
    write(join(p.docsDir, "feature-impact", `${feature}.md`), `# Feature Impact: ${feature}\n\n- Archive Date: ${new Date().toISOString().slice(0, 10)}\n`);
    for (const repo of featureRepoNames(read(featureYaml))) {
      const repoPath = join(p.reposDir, repo);
      const wt = join(featureDir, "repos", repo);
      if (existsSync(join(wt, ".git"))) {
        const dirty = runSafe("git", ["-C", wt, "status", "--porcelain"], p.rootDir);
        if (dirty && input.force !== true) throw new CapabilityError("WORKTREE_DIRTY", `worktree for '${repo}' has unmerged changes. re-run with --force if you confirmed removal`);
        const args = ["-C", repoPath, "worktree", "remove", wt];
        if (input.force === true) args.push("--force");
        runSafe("git", args, p.rootDir);
        runSafe("git", ["-C", repoPath, "worktree", "prune"], p.rootDir);
      }
    }
    write(join(featureDir, "reports", "stage-acceptance.completed"), `stage: acceptance\ncompleted-at: ${new Date().toISOString()}\nnote: archived and closed\n`);
    return { ok: true, data: { feature }, sideEffects: ["archive docs", "worktree remove"], reportFragments: ["feature closed"] };
  }
};
