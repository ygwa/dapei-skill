import { existsSync, readdirSync, copyFileSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { atomicWrite, ensureDir, read, run, runSafe, safeJoinWithin, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";
import { defaultBranch, featureRepoNames, requireFields } from "../shared.ts";
import { loadCognitiveIndex } from "../../cognitive-index.ts";

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
    write(join(featureDir, "context", "repo-context.md"), "# Repo Context\n\nSee also: [related-cognitive-context.md](related-cognitive-context.md) for matching behavior models.\n");
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

    // Search and Inject Related Cognitive Context from Global Index
    let relatedBehaviorsText = "# Related Cognitive Context\n\n";
    try {
      const index = loadCognitiveIndex(ctx.rootDir);
      const matchedBehaviors: Array<{ id: string; path: string; repo?: string; kind: string; level: string }> = [];
      const matchedStateMachines: Array<{ entity: string; path: string; repo?: string; kind: string; level: string }> = [];

      const objectiveKeywords = objective
        .toLowerCase()
        .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
        .filter(k => k.length > 2 || (k.length > 0 && /[\u4e00-\u9fa5]/.test(k)));

      for (const b of index.behaviors) {
        const repoMatches = b.repo && repos.includes(b.repo);
        const keywordMatches = objectiveKeywords.some(keyword => b.id.toLowerCase().includes(keyword));
        if (repoMatches || keywordMatches) {
          matchedBehaviors.push(b);
        }
      }

      for (const s of index.state_machines) {
        const repoMatches = s.repo && repos.includes(s.repo);
        const keywordMatches = objectiveKeywords.some(keyword => s.entity.toLowerCase().includes(keyword));
        if (repoMatches || keywordMatches) {
          matchedStateMachines.push(s);
        }
      }

      if (matchedBehaviors.length > 0 || matchedStateMachines.length > 0) {
        relatedBehaviorsText += `Detected the following related cognitive artifacts from the global workspace based on repos [${repos.join(", ")}] and objective keywords:\n\n`;

        if (matchedBehaviors.length > 0) {
          relatedBehaviorsText += `### Related Behaviors\n\n`;
          for (const b of matchedBehaviors) {
            relatedBehaviorsText += `- **[${b.id}](file:///${join(p.rootDir, b.path)})** (Confidence: ${b.kind}, Level: ${b.level})\n`;
          }
          relatedBehaviorsText += `\n`;
        }

        if (matchedStateMachines.length > 0) {
          relatedBehaviorsText += `### Related State Machines\n\n`;
          for (const s of matchedStateMachines) {
            relatedBehaviorsText += `- **[${s.entity}](file:///${join(p.rootDir, s.path)})** (Confidence: ${s.kind}, Level: ${s.level})\n`;
          }
          relatedBehaviorsText += `\n`;
        }
      } else {
        relatedBehaviorsText += "No matching behaviors or state machines found in the global index.\n";
      }
    } catch {
      relatedBehaviorsText += "Failed to load global cognitive index.\n";
    }
    write(join(featureDir, "context", "related-cognitive-context.md"), relatedBehaviorsText);

    const templates = join(p.runtimeDir, "templates");
    const date = new Date().toISOString().slice(0, 10);
    const reposSummary = repos.join(", ");
    for (const f of ["01-current-state", "02-gap-analysis", "03-business-design", "04-technical-design", "05-task-breakdown", "06-acceptance"]) {
      const src = join(templates, `${f}.md.template`);
      const out = join(featureDir, "docs", `${f}.md`);
      let content = existsSync(src) ? read(src) : `# ${f}\n`;
      content = content.replaceAll("{{date}}", date).replaceAll("{{objective}}", objective).replaceAll("{{repos}}", reposSummary);
      if (f === "01-current-state") {
        const replacement = "## Related Global Cognitive Context\n\nSee [related-cognitive-context.md](../context/related-cognitive-context.md) for matching behaviors and state machines loaded from the workspace.\n";
        if (content.includes("## Current Module Structure")) {
          content = content.replace("## Current Module Structure", `${replacement}\n## Current Module Structure`);
        } else {
          content += `\n${replacement}`;
        }
      }
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

// ---------- M3 (ADR-0017) promote_artifacts helpers ----------

/**
 * M3 (ADR-0017): the shape of `feature.close`'s optional `promote_artifacts`
 * block. All four sub-blocks are independent and individually optional.
 *
 * M3 note (replaces v0.1 plan): `cognitive.entries.action: 'link'` was
 * removed because v2.0.0 of `feature.close` already invokes `cdr.feature.link`
 * unconditionally (see execute body). The "unlink" sub-action is the only
 * cognitive-related affordance M3-1 adds.
 */
const promoteArtifactsSchemaShape = {
  type: "object",
  properties: {
    decisions: {
      type: "object",
      properties: {
        skip: { type: "boolean" },
        target_path: { type: "string" }
      },
      additionalProperties: false
    },
    architecture: {
      type: "object",
      properties: {
        entries: {
          type: "array",
          items: {
            type: "object",
            required: ["source_path", "target_path"],
            properties: {
              source_path: { type: "string" },
              target_path: { type: "string" }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    },
    cognitive: {
      type: "object",
      properties: {
        unlink: {
          type: "array",
          items: {
            type: "object",
            required: ["kind", "id"],
            properties: {
              kind: { enum: ["behavior", "state-machine", "domain", "business-rule", "capability-map"] },
              id: { type: "string", minLength: 1 },
              repo: { type: "string" }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    },
    reports: {
      type: "object",
      properties: {
        copy_paths: {
          type: "array",
          items: { type: "string", minLength: 1 }
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
} as const;

/**
 * Idempotency check via content hash. Writes only if either:
 *   (a) the file does not exist, or
 *   (b) the file's existing content hash differs from the new content's hash.
 * Returns `true` if the write actually happened, `false` if skipped as no-op.
 */
function writeIfContentChanged(absPath: string, content: string): boolean {
  if (existsSync(absPath)) {
    const existing = read(absPath);
    const existingHash = createHash("sha256").update(existing).digest("hex");
    const newHash = createHash("sha256").update(content).digest("hex");
    if (existingHash === newHash) return false;
  }
  atomicWrite(absPath, content);
  return true;
}

/**
 * M3-1: roll back any files written by `featureClose` so far.
 * `created` is the list of (path, existedBefore) tuples the executor
 * pushes as it writes — rollback only removes files that did NOT exist
 * before this call started, preserving any pre-existing content.
 */
function rollbackWrites(created: Array<{ path: string; existedBefore: boolean }>): void {
  for (const { path, existedBefore } of created) {
    if (existedBefore) continue;
    if (existsSync(path)) {
      try { unlinkSync(path); } catch { /* best-effort */ }
    }
  }
}

export const featureClose: AnyCap = {
  id: "feature.close",
  version: "3.0.0",
  inputSchema: {
    required: ["feature"],
    properties: {
      feature: { type: "string", minLength: 1 },
      confirmed: { type: "boolean" },
      force: { type: "boolean" },
      promote_artifacts: promoteArtifactsSchemaShape
    },
    additionalProperties: false
  },
  confirmGate: "acceptance",
  async execute(ctx, input) {
    requireFields(input, ["feature"]);
    const feature = String(input.feature);
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, feature);
    const featureYaml = join(featureDir, "feature.yaml");
    if (!existsSync(featureYaml)) throw new CapabilityError("FEATURE_MISSING", `feature.yaml not found for ${feature}`);

    const promote = (input.promote_artifacts ?? {}) as {
      decisions?: { skip?: boolean; target_path?: string };
      architecture?: { entries?: Array<{ source_path: string; target_path: string }> };
      cognitive?: { unlink?: Array<{ kind: string; id: string; repo?: string }> };
      reports?: { copy_paths?: string[] };
    };

    // Track every file this capability creates, for rollback on failure.
    // We never delete files that pre-existed this call — only files we
    // wrote ourselves get cleaned up if a later step throws.
    const created: Array<{ path: string; existedBefore: boolean }> = [];
    const track = (absPath: string): void => {
      created.push({ path: absPath, existedBefore: existsSync(absPath) });
    };

    const promotedArtifacts: {
      decisions: { written: boolean; skipped: boolean; target_path: string };
      architecture: { written_count: number; entries: Array<{ source_path: string; target_path: string; written: boolean }> };
      cognitive: { unlinked_count: number; ids: Array<{ kind: string; id: string; repo?: string }> };
      reports: { copied_count: number; paths: Array<{ source: string; target: string; copied: boolean }> };
    } = {
      decisions: { written: false, skipped: false, target_path: "" },
      architecture: { written_count: 0, entries: [] },
      cognitive: { unlinked_count: 0, ids: [] },
      reports: { copied_count: 0, paths: [] }
    };

    try {
      ensureDir(join(p.docsDir, "decisions"));
      ensureDir(join(p.docsDir, "feature-impact"));

      // --- decisions section ---
      // v2.0.0 always copied memory/decision-log.md → docs/decisions/<f>-decisions.md.
      // M3 (ADR-0017): honor promote.decisions.skip = true to suppress this
      // default, or promote.decisions.target_path to redirect the destination.
      // Either way, the write is content-hash idempotent.
      const decisionSrc = join(featureDir, "memory", "decision-log.md");
      const defaultDecisionTarget = join(p.docsDir, "decisions", `${feature}-decisions.md`);
      const decisionTarget = (promote.decisions?.target_path && promote.decisions.target_path.length > 0)
        ? safeJoinWithin(p.rootDir, promote.decisions.target_path)
        : defaultDecisionTarget;
      promotedArtifacts.decisions.target_path = relative(p.rootDir, decisionTarget);

      if (promote.decisions?.skip === true) {
        promotedArtifacts.decisions.skipped = true;
      } else if (existsSync(decisionSrc)) {
        const body = read(decisionSrc);
        const content = `# Decisions for Feature: ${feature}\n\n${body}`;
        track(decisionTarget);
        const written = writeIfContentChanged(decisionTarget, content);
        promotedArtifacts.decisions.written = written;
      }

      write(join(p.docsDir, "feature-impact", `${feature}.md`), `# Feature Impact: ${feature}\n\n- Archive Date: ${new Date().toISOString().slice(0, 10)}\n`);

      // --- architecture section (new in M3-1) ---
      // Copy each (source_path, target_path) entry from
      // features/<f>/<source> → <target>, both relative to workspace root.
      // Path-traversal protected via safeJoinWithin. Idempotent.
      if (promote.architecture?.entries) {
        for (const e of promote.architecture.entries) {
          const src = safeJoinWithin(featureDir, e.source_path);
          const dst = safeJoinWithin(p.rootDir, e.target_path);
          if (!existsSync(src)) {
            throw new CapabilityError(
              "PROMOTE_SOURCE_MISSING",
              `promote_artifacts.architecture: source_path not found: ${e.source_path}`
            );
          }
          const body = read(src);
          track(dst);
          const written = writeIfContentChanged(dst, body);
          if (written) promotedArtifacts.architecture.written_count++;
          promotedArtifacts.architecture.entries.push({
            source_path: e.source_path,
            target_path: e.target_path,
            written
          });
        }
      }

      // --- reports section (new in M3-1) ---
      // Copy selected reports from features/<f>/reports/<rel> →
      // docs/feature-impact/<f>/<basename>. Use fs.copyFileSync so binary
      // attachments (if any in the future) survive; today all reports
      // are markdown but the contract stays format-agnostic.
      if (promote.reports?.copy_paths) {
        const reportTargetDir = join(p.docsDir, "feature-impact", feature);
        ensureDir(reportTargetDir);
        for (const rel of promote.reports.copy_paths) {
          const src = safeJoinWithin(featureDir, rel);
          if (!existsSync(src)) {
            throw new CapabilityError(
              "PROMOTE_SOURCE_MISSING",
              `promote_artifacts.reports: copy_path not found: ${rel}`
            );
          }
          const basename = src.split("/").pop() ?? rel;
          const dst = join(reportTargetDir, basename);
          const entry = { source: rel, target: relative(p.rootDir, dst), copied: false };
          if (!existsSync(dst)) {
            track(dst);
            copyFileSync(src, dst);
            entry.copied = true;
            promotedArtifacts.reports.copied_count++;
          }
          promotedArtifacts.reports.paths.push(entry);
        }
      }

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

      // v2.0 — link every CDR asset touched during this feature's
      // lifetime to the feature name. Idempotent: re-running
      // cdr.feature.link on the same feature is a no-op.
      const { runCapability } = await import("../../index.ts");
      const linkResult = await runCapability("cdr.feature.link", { feature }, ctx);
      const linkData = linkResult.result.data as { assets_tagged: number };

      // --- cognitive.unlink section (new in M3-1) ---
      // Inverse of the auto-link: explicitly clear `created_by_feature` for
      // any asset the user wants to disown (e.g. an asset that was tagged
      // by a previous close but actually predates this feature).
      // We delegate to `cdr.feature.link` (not yet a `cdr.feature.unlink`)
      // because the cognitive index's created_by_feature field is a plain
      // string we can simply clear via the index API.
      if (promote.cognitive?.unlink) {
        for (const u of promote.cognitive.unlink) {
          // best-effort: not a hard error if the asset isn't currently
          // tagged with this feature; we count it as unlinked only if the
          // index loader exposes a clear-tag entry point.
          const cleared = clearCreatedByFeature(ctx, u.kind, u.id, u.repo, feature);
          if (cleared) {
            promotedArtifacts.cognitive.unlinked_count++;
            promotedArtifacts.cognitive.ids.push(u);
          } else {
            promotedArtifacts.cognitive.ids.push(u);
          }
        }
      }

      write(join(featureDir, "reports", "stage-acceptance.completed"), `stage: acceptance\ncompleted-at: ${new Date().toISOString()}\nnote: archived and closed\n`);
      return {
        ok: true,
        data: {
          feature,
          cdr_assets_tagged: linkData.assets_tagged,
          promoted_artifacts: promotedArtifacts
        },
        sideEffects: ["archive docs", "worktree remove", "cdr.feature.link", "promote_artifacts"],
        reportFragments: [
          "feature closed",
          `linked ${linkData.assets_tagged} CDR asset(s) to feature ${feature}`,
          `promoted: ${promotedArtifacts.architecture.written_count} architecture + ${promotedArtifacts.reports.copied_count} reports + ${promotedArtifacts.cognitive.unlinked_count} cognitive unlink(s); decisions ${promotedArtifacts.decisions.skipped ? "skipped" : promotedArtifacts.decisions.written ? "written" : "unchanged"}`
        ]
      };
    } catch (err) {
      // Roll back only the files we created in this call. Files that
      // pre-existed are left untouched.
      rollbackWrites(created);
      throw err;
    }
  }
};

/**
 * M3-1 cognitive.unlink helper. Clears `created_by_feature` and
 * `created_at` on a single cognitive index entry. Returns true if a
 * field was actually cleared, false if no change was needed (entry not
 * found, or already not tagged with this feature).
 *
 * Hard contract: this only edits the cognitive index in-memory and on
 * disk; it does NOT touch `docs/as-is/<kind>/*.yaml` files (the index
 * is the single source of truth for created_by_feature; the on-disk
 * yaml may carry a backfilled `created_by_feature` from a previous run
 * which is informational only — see ADR-0017 / CDR v0.10).
 */
function clearCreatedByFeature(
  ctx: { rootDir: string },
  kind: string,
  id: string,
  repo: string | undefined,
  feature: string
): boolean {
  try {
    const index = loadCognitiveIndex(ctx.rootDir);
    const buckets: Record<string, Array<{ id: string; repo?: string; created_by_feature?: string; [k: string]: unknown }>> = {
      behavior: index.behaviors as unknown as Array<{ id: string; repo?: string; created_by_feature?: string }>,
      "state-machine": index.state_machines as unknown as Array<{ id: string; repo?: string; created_by_feature?: string }>,
      domain: index.domains as unknown as Array<{ id: string; repo?: string; created_by_feature?: string }>,
      "business-rule": index.business_rules as unknown as Array<{ id: string; repo?: string; created_by_feature?: string }>,
      "capability-map": index.capability_maps as unknown as Array<{ id: string; repo?: string; created_by_feature?: string }>
    };
    const bucket = buckets[kind];
    if (!bucket) return false;
    let changed = false;
    for (const e of bucket) {
      if (e.id !== id) continue;
      if (repo !== undefined && e.repo !== repo) continue;
      if (e.created_by_feature === feature) {
        delete e.created_by_feature;
        changed = true;
      }
    }
    if (!changed) return false;
    const indexPath = join(workspacePaths(ctx.rootDir).dapeiDir, "cognitive", "index.yaml");
    atomicWrite(indexPath, JSON.stringify(index, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

function parseFeatureYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of content.split("\n")) {
    const m = line.match(/^(\s*)([a-z_]+):\s*(.*)$/);
    if (m) {
      const key = m[2].trim();
      const val = m[3].trim().replace(/^["']|["']$/g, "");
      result[key] = val;
    }
  }
  return result;
}

function updateFeatureYamlField(yamlContent: string, field: string, value: string): string {
  const lines = yamlContent.split("\n");
  let found = false;
  const updated = lines.map((line) => {
    const m = line.match(/^(\s*)(owner|assignees|last-review-at):\s*(.*)$/);
    if (m && m[2] === field) {
      found = true;
      return line.replace(/^(\s*)owner:\s*.*$/m, `$1owner: "${value}"`);
    }
    return line;
  });
  if (!found) {
    const insertLine = `  owner: "${value}"`;
    const idx = updated.findIndex((l) => l.includes("repos:"));
    if (idx >= 0) {
      updated.splice(idx, 0, insertLine);
    }
  }
  return updated.join("\n");
}

export const featureAssign: AnyCap = {
  id: "feature.assign",
  version: "1.0.0",
  inputSchema: {
    required: ["feature", "owner"],
    properties: {
      feature: { type: "string", minLength: 1 },
      owner: { type: "string", minLength: 1 },
      assignees: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["feature", "owner"]);
    const feature = String(input.feature);
    const owner = String(input.owner);
    const assigneesCsv = input.assignees ? String(input.assignees) : "";
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, feature);
    const featureYaml = join(featureDir, "feature.yaml");
    if (!existsSync(featureYaml)) throw new CapabilityError("FEATURE_MISSING", `feature.yaml not found for ${feature}`);

    let yamlContent = read(featureYaml);
    yamlContent = updateFeatureYamlField(yamlContent, "owner", owner);

    if (assigneesCsv) {
      const assignees = assigneesCsv.split(",").map((x) => x.trim()).filter(Boolean);
      if (yamlContent.includes("assignees:")) {
        yamlContent = yamlContent.replace(/assignees:\s*\n/, `assignees: [${assignees.join(", ")}]\n`);
      } else {
        const idx = yamlContent.split("\n").findIndex((l) => l.includes("owner:"));
        if (idx >= 0) {
          yamlContent = yamlContent.split("\n").splice(idx + 1, 0, `  assignees: [${assignees.join(", ")}]`).join("\n");
        }
      }
    }

    write(featureYaml, yamlContent);
    return {
      ok: true,
      data: { feature, owner, assignees: assigneesCsv || "" },
      sideEffects: ["feature.yaml updated"],
      reportFragments: [`${feature} assigned to ${owner}`]
    };
  }
};

export const featureHandoff: AnyCap = {
  id: "feature.handoff",
  version: "1.0.0",
  inputSchema: {
    required: ["feature", "to"],
    properties: {
      feature: { type: "string", minLength: 1 },
      to: { type: "string", minLength: 1 },
      note: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["feature", "to"]);
    const feature = String(input.feature);
    const to = String(input.to);
    const note = input.note ? String(input.note) : "";
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, feature);
    const featureYaml = join(featureDir, "feature.yaml");
    if (!existsSync(featureYaml)) throw new CapabilityError("FEATURE_MISSING", `feature.yaml not found for ${feature}`);

    const yamlContent = read(featureYaml);
    const parsed = parseFeatureYaml(yamlContent);
    const from = String(parsed.owner || "unknown");
    const progressFile = join(featureDir, "reports", "feature-progress.md");
    const stage = existsSync(progressFile) ? (read(progressFile).match(/## Stage: (\S+)/)?.[1] || "unknown") : "unknown";

    const handoffNote = [
      `# Handoff: ${feature}`,
      `**From**: ${from}`,
      `**To**: ${to}`,
      `**Date**: ${ctx.now.toISOString()}`,
      `**Current Stage**: ${stage}`,
      ``,
      `## Context Summary`,
      note || "(no context note provided — AI should generate from feature docs)",
      ``,
      `## Open Items`,
      `- Memory: see memory/decision-log.md and memory/risk.md`,
      `- Current State: see docs/01-current-state.md`,
      `- Latest Progress: see reports/daily-report.md`
    ].join("\n");

    write(join(featureDir, "context", "handoff.md"), handoffNote);

    let updatedYaml = updateFeatureYamlField(yamlContent, "owner", to);
    write(featureYaml, updatedYaml);

    return {
      ok: true,
      data: { feature, from, to, handoff_note: "context/handoff.md" },
      sideEffects: ["handoff note created", "owner updated"],
      reportFragments: [`${feature} handed off from ${from} to ${to}`]
    };
  }
};

export const featureTeamStatus: AnyCap = {
  id: "feature.teamstatus",
  version: "1.0.0",
  inputSchema: {},
  async execute(ctx) {
    const p = workspacePaths(ctx.rootDir);
    if (!existsSync(p.featuresDir)) return { ok: true, data: { text: "No features found." }, sideEffects: [], reportFragments: [] };

    const features = readdirSync(p.featuresDir).filter((x: string) => existsSync(join(p.featuresDir, x, "feature.yaml")));
    const rows: Array<{ name: string; owner: string; stage: string; status: string }> = [];

    for (const f of features) {
      const yamlPath = join(p.featuresDir, f, "feature.yaml");
      const yamlContent = read(yamlPath);
      const parsed = parseFeatureYaml(yamlContent);
      const progressPath = join(p.featuresDir, f, "reports", "feature-progress.md");
      const stage = existsSync(progressPath) ? (read(progressPath).match(/## Stage: (\S+)/)?.[1] || "unknown") : "unknown";
      rows.push({
        name: f,
        owner: String(parsed.owner || "unassigned"),
        stage,
        status: String(parsed.status || "active")
      });
    }

    const byOwner: Record<string, typeof rows> = {};
    for (const row of rows) {
      if (!byOwner[row.owner]) byOwner[row.owner] = [];
      byOwner[row.owner].push(row);
    }

    const lines: string[] = ["# Team Status"];
    for (const [owner, feats] of Object.entries(byOwner)) {
      lines.push(`\n## ${owner} (${feats.length})`);
      for (const feat of feats) {
        lines.push(`- **${feat.name}** [${feat.stage}] ${feat.status !== "active" ? `(${feat.status})` : ""}`);
      }
    }

    return {
      ok: true,
      data: { text: lines.join("\n"), features: rows },
      sideEffects: [],
      reportFragments: [`team status: ${rows.length} features across ${Object.keys(byOwner).length} owners`]
    };
  }
};
