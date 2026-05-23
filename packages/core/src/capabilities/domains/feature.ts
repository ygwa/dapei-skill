import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { ensureDir, read, run, runSafe, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";
import { defaultBranch, featureRepoNames, requireFields } from "../shared.ts";

export type AnyCap = CapabilitySpec<any, any>;

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
      const branch = `feature/${name}`;
      runSafe("git", ["-C", repoPath, "fetch", "origin"], p.rootDir);
      const base = defaultBranch(repoPath);
      runSafe("git", ["-C", repoPath, "checkout", base], p.rootDir);
      runSafe("git", ["-C", repoPath, "pull", "--ff-only", "origin", base], p.rootDir);
      const hasBranch = runSafe("git", ["-C", repoPath, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`], p.rootDir);
      if (hasBranch === "") run("git", ["-C", repoPath, "branch", branch], p.rootDir);
      runSafe("git", ["-C", repoPath, "worktree", "add", join(featureDir, "repos", repo), branch], p.rootDir);
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
      }
    }
    write(join(featureDir, "reports", "stage-acceptance.completed"), `stage: acceptance\ncompleted-at: ${new Date().toISOString()}\nnote: archived and closed\n`);
    return { ok: true, data: { feature }, sideEffects: ["archive docs", "worktree remove"], reportFragments: ["feature closed"] };
  }
};
