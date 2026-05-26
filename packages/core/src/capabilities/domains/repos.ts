import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { ensureDir, read, run, runSafe, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";
import { defaultBranch, detectRepoLanguage, detectTestCommands, parseReposYamlNames, requireFields } from "../shared.ts";

export type AnyCap = CapabilitySpec<any, any>;

type RepoCheckStatus = "PASS" | "WARN" | "FAIL";

function runOk(cmd: string, args: string[], cwd: string): { ok: boolean; out: string; err?: string } {
  try {
    return { ok: true, out: run(cmd, args, cwd) };
  } catch (e: any) {
    return { ok: false, out: e?.stdout?.toString?.() || "", err: e?.stderr?.toString?.() || e?.message || String(e) };
  }
}

function repoDirty(repoPath: string, rootDir: string): boolean {
  return Boolean(runSafe("git", ["-C", repoPath, "status", "--porcelain"], rootDir));
}

function currentBranch(repoPath: string, rootDir: string): string {
  return runSafe("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"], rootDir) || "HEAD";
}

function ensureOnDefaultBranch(repoPath: string, rootDir: string): { ok: boolean; message?: string } {
  const base = defaultBranch(repoPath);
  const cur = currentBranch(repoPath, rootDir);
  if (cur === base) return { ok: true };
  if (repoDirty(repoPath, rootDir)) return { ok: false, message: `repo is dirty; cannot checkout default branch '${base}'` };
  // Detached HEAD or other branch: try to checkout the default branch.
  const r = runOk("git", ["-C", repoPath, "checkout", base], rootDir);
  if (!r.ok) return { ok: false, message: `failed to checkout default branch '${base}': ${r.err || "unknown error"}` };
  return { ok: true };
}

function fastForwardDefaultBranch(repoPath: string, rootDir: string): { ok: boolean; before?: string; after?: string; message?: string } {
  const base = defaultBranch(repoPath);
  const before = runSafe("git", ["-C", repoPath, "rev-parse", "--short", "HEAD"], rootDir) || "";
  const fetchR = runOk("git", ["-C", repoPath, "fetch", "origin"], rootDir);
  if (!fetchR.ok) return { ok: false, message: `fetch failed: ${fetchR.err || "unknown error"}` };
  // Make the local default branch exactly catch up to origin/<base> without merge commits.
  const mergeR = runOk("git", ["-C", repoPath, "merge", "--ff-only", `origin/${base}`], rootDir);
  if (!mergeR.ok) return { ok: false, message: `fast-forward failed: ${mergeR.err || "unknown error"}` };
  const after = runSafe("git", ["-C", repoPath, "rev-parse", "--short", "HEAD"], rootDir) || "";
  return { ok: true, before, after };
}

export const reposAdd: AnyCap = {
  id: "repos.add",
  version: "1.0.0",
  inputSchema: { required: ["name", "url"], properties: { name: { type: "string", minLength: 1 }, url: { type: "string", minLength: 1 } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["name", "url"]);
    const p = workspacePaths(ctx.rootDir);
    const name = String(input.name);
    const url = String(input.url);
    const target = join(p.reposDir, name);
    ensureDir(p.reposDir);
    ensureDir(p.dapeiDir);

    let managementMode: "submodule" | "clone" = "clone";
    const workspaceYaml = join(p.dapeiDir, "workspace.yaml");
    if (existsSync(workspaceYaml)) {
      const content = read(workspaceYaml);
      const m = content.match(/management_mode:\s*["']?([a-z]+)["']?/);
      if (m && (m[1] === "submodule" || m[1] === "clone")) {
        managementMode = m[1] as "submodule" | "clone";
      }
    }

    if (existsSync(join(target, ".git"))) throw new CapabilityError("REPO_EXISTS", `repos '${name}' already exists`);

    if (managementMode === "submodule") {
      if (!existsSync(join(p.rootDir, ".git"))) {
        runSafe("git", ["init", "-b", "main"], p.rootDir);
      }
      try {
        run("git", ["-c", "protocol.file.allow=always", "submodule", "add", url, `repos/${name}`], p.rootDir);
        run("git", ["-c", "protocol.file.allow=always", "submodule", "update", "--init", "--recursive", `repos/${name}`], p.rootDir);
      } catch (e: any) {
        run("git", ["clone", url, target], p.rootDir);
      }
    } else {
      run("git", ["clone", url, target], p.rootDir);
    }

    // Align base repo to its default branch and fast-forward to origin/<default>.
    // This is critical for the "repos is read-only base pool for feature worktrees" model.
    const checkout = ensureOnDefaultBranch(target, p.rootDir);
    if (!checkout.ok) {
      throw new CapabilityError("REPO_INVALID_BASE", `repos/${name} not on default branch: ${checkout.message || "unknown error"}`);
    }
    const ff = fastForwardDefaultBranch(target, p.rootDir);
    if (!ff.ok) {
      throw new CapabilityError("REPO_SYNC_FAILED", `repos/${name} failed to sync default branch: ${ff.message || "unknown error"}`);
    }

    const registry = join(p.dapeiDir, "repos.yaml");
    if (!existsSync(registry)) write(registry, 'version: "0.2"\nrepos:\n');
    const content = read(registry);
    if (!content.includes(`name: ${name}`) && !content.includes(`name: "${name}"`)) {
      write(registry, content + `  - name: ${name}\n    path: repos/${name}\n    url: ${url}\n    added-at: ${new Date().toISOString()}\n    default-branch: ${defaultBranch(target)}\n    test-commands: []\n`);
    }
    return { ok: true, data: { name, url }, sideEffects: [managementMode === "submodule" ? "git submodule add" : "git clone", "repos registry"], reportFragments: ["repos add done"] };
  }
};

export const reposSync: AnyCap = {
  id: "repos.sync",
  version: "1.0.0",
  inputSchema: { required: ["target"], properties: { target: { type: "string", minLength: 1 } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["target"]);
    const target = String(input.target);
    const p = workspacePaths(ctx.rootDir);
    const registry = join(p.dapeiDir, "repos.yaml");
    const names = target === "--all" && existsSync(registry) ? parseReposYamlNames(read(registry)) : [target];
    const results: string[] = [];
    for (const name of names) {
      const repoPath = join(p.reposDir, name);
      if (!existsSync(join(repoPath, ".git"))) continue;
      if (repoDirty(repoPath, p.rootDir)) {
        throw new CapabilityError("REPO_DIRTY", `repos/${name} is dirty; base repos must be read-only. Please discard changes: (cd repos/${name} && git status)`);
      }
      const checkout = ensureOnDefaultBranch(repoPath, p.rootDir);
      if (!checkout.ok) {
        throw new CapabilityError("REPO_INVALID_BASE", `repos/${name} not on default branch: ${checkout.message || "unknown error"}`);
      }
      const base = defaultBranch(repoPath);
      const ff = fastForwardDefaultBranch(repoPath, p.rootDir);
      if (!ff.ok) {
        throw new CapabilityError("REPO_SYNC_FAILED", `repos/${name} failed to fast-forward '${base}': ${ff.message || "unknown error"}`);
      }
      results.push(`${name}: ${base} ${ff.before || "???"} -> ${ff.after || "???"}`);
    }
    return { ok: true, data: { target, results }, sideEffects: ["git fetch", "git merge --ff-only"], reportFragments: ["repos sync"] };
  }
};

export const reposCheck: AnyCap = {
  id: "repos.check",
  version: "1.0.0",
  inputSchema: { required: ["target"], properties: { target: { type: "string", minLength: 1 } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["target"]);
    const target = String(input.target);
    const p = workspacePaths(ctx.rootDir);
    const registry = join(p.dapeiDir, "repos.yaml");
    const names = target === "--all" && existsSync(registry) ? parseReposYamlNames(read(registry)) : [target];
    if (names.length === 0) {
      return { ok: true, data: { status: "WARN", text: "No repos registered." }, sideEffects: [], reportFragments: [] };
    }

    let overall: RepoCheckStatus = "PASS";
    const lines: string[] = [`Repo Check (${names.length})`];
    const results: Array<{ repo: string; status: RepoCheckStatus; detail: string }> = [];

    for (const name of names) {
      const repoPath = join(p.reposDir, name);
      if (!existsSync(join(repoPath, ".git"))) {
        overall = "FAIL";
        results.push({ repo: name, status: "FAIL", detail: "missing .git (not cloned/submodule not initialized)" });
        continue;
      }

      // remote reachability (non-blocking warning)
      const fetchR = runOk("git", ["-C", repoPath, "fetch", "--dry-run", "origin"], p.rootDir);
      let status: RepoCheckStatus = "PASS";
      const issues: string[] = [];
      if (!fetchR.ok) {
        status = "WARN";
        issues.push(`remote fetch dry-run failed`);
      }

      const base = defaultBranch(repoPath);
      const cur = currentBranch(repoPath, p.rootDir);
      if (repoDirty(repoPath, p.rootDir)) {
        status = "FAIL";
        issues.push("dirty (禁止在基座仓库开发)");
      }
      if (cur !== base) {
        status = "FAIL";
        issues.push(`not on default branch (expected '${base}', got '${cur}')`);
      }

      if (status === "FAIL") overall = "FAIL";
      else if (status === "WARN" && overall !== "FAIL") overall = "WARN";

      results.push({ repo: name, status, detail: issues.length ? issues.join("; ") : "ok" });
    }

    lines.push(`Overall: ${overall}`);
    for (const r of results) lines.push(`- ${r.repo}: ${r.status} - ${r.detail}`);
    return { ok: true, data: { status: overall, results, text: lines.join("\n") }, sideEffects: [], reportFragments: ["repos check"] };
  }
};

export const reposList: AnyCap = {
  id: "repos.list",
  version: "1.0.0",
  inputSchema: {},
  async execute(ctx) {
    const p = workspacePaths(ctx.rootDir);
    const registry = join(p.dapeiDir, "repos.yaml");
    if (!existsSync(registry)) return { ok: true, data: { text: "No reposs registered." }, sideEffects: [], reportFragments: [] };
    const names = parseReposYamlNames(read(registry));
    const lines = [`Codebases (${names.length}):`];
    for (const name of names) {
      const repoPath = join(p.reposDir, name);
      if (existsSync(join(repoPath, ".git"))) lines.push(`  - ${name}: ${runSafe("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"], p.rootDir) || "???"} (${runSafe("git", ["-C", repoPath, "rev-parse", "--short", "HEAD"], p.rootDir) || "???"})`);
      else lines.push(`  - ${name}: not cloned`);
    }
    return { ok: true, data: { text: lines.join("\n") }, sideEffects: [], reportFragments: [] };
  }
};

export const reposAnalyze: AnyCap = {
  id: "repos.analyze",
  version: "1.0.0",
  inputSchema: { required: ["target"], properties: { target: { type: "string", minLength: 1 } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["target"]);
    const p = workspacePaths(ctx.rootDir);
    ensureDir(join(p.docsDir, "as-is"));
    ensureDir(join(p.docsDir, "architecture"));
    const target = String(input.target);
    const report = join(p.docsDir, "as-is", "repo-inventory.md");
    const technical = join(p.docsDir, "architecture", "technical-current-state.md");
    const names = target === "--all" ? (existsSync(join(p.dapeiDir, "repos.yaml")) ? parseReposYamlNames(read(join(p.dapeiDir, "repos.yaml"))) : []) : [target];
    let inventory = `# Repository Inventory\n\n- Generated At: ${new Date().toISOString()}\n\n`;
    let tech = `# Technical Current State\n\n- Generated At: ${new Date().toISOString()}\n\n| Repo | Stack |\n|---|---|\n`;
    for (const name of names) {
      const rp = join(p.reposDir, name);
      if (!existsSync(join(rp, ".git"))) continue;
      const tests = detectTestCommands(rp).join(", ") || "TBD";
      inventory += `## ${name}\n\n| Property | Value |\n|---|---|\n| Branch | ${runSafe("git", ["-C", rp, "rev-parse", "--abbrev-ref", "HEAD"], p.rootDir)} |\n| Revision | ${runSafe("git", ["-C", rp, "rev-parse", "--short", "HEAD"], p.rootDir)} |\n| Stack | ${detectRepoLanguage(rp)} |\n| Test Commands | ${tests} |\n\n`;
      inventory += "### Module Structure (top 3 levels)\n\n```\n";
      inventory += runSafe("find", [rp, "-maxdepth", "3", "-type", "d"], p.rootDir).split("\n").slice(0, 60).map((x: string) => x.replace(`${rp}/`, "")).join("\n") + "\n```\n\n";
      const apiHits = runSafe("sh", ["-lc", `grep -rnE '\\.(get|post|put|delete|patch)\\s*\\(|@(Get|Post|Put|Delete|Patch|Request)Mapping' "${rp}" --include='*.js' --include='*.ts' --include='*.java' | head -30`], p.rootDir);
      inventory += "### API Routes / Endpoints\n\n" + (apiHits ? `\
\`\`\`\n${apiHits}\n\`\`\`\n\n` : "- No API routes detected by static scan.\n\n");
      const dbHits = runSafe("sh", ["-lc", `find "${rp}" -type f \\( -name '*.sql' -o -path '*/migrations/*' -o -path '*/migrate/*' \\) | head -20`], p.rootDir);
      inventory += "### Database / Data Layer Evidence\n\n" + (dbHits ? dbHits.split("\n").filter(Boolean).map((f: string) => `- ${f.replace(`${rp}/`, "")}`).join("\n") + "\n\n" : "- No database evidence detected.\n\n");
      const mqHits = runSafe("sh", ["-lc", `grep -rliE '(kafka|rabbitmq|amqp|bull|celery|nats|SQS|SNS|EventBridge)' "${rp}" | head -15`], p.rootDir);
      inventory += "### Message Queue / Event Evidence\n\n" + (mqHits ? mqHits.split("\n").filter(Boolean).map((f: string) => `- ${f.replace(`${rp}/`, "")}`).join("\n") + "\n\n" : "- No MQ/event evidence detected.\n\n");
      const todoHits = runSafe("sh", ["-lc", `grep -rnE 'TODO|FIXME|HACK' "${rp}" --include='*.js' --include='*.ts' --include='*.java' --include='*.py' --include='*.go' --include='*.rs' | head -20`], p.rootDir);
      inventory += "### Technical Debt Indicators\n\n" + (todoHits ? `\
\`\`\`\n${todoHits}\n\`\`\`\n\n` : "- No TODO/FIXME/HACK indicators detected.\n\n");
      tech += `| ${name} | ${detectRepoLanguage(rp)} |\n`;
    }
    inventory += `\n## Cognitive Next Steps\n\n`;
    inventory += `- Run \`@dapei analyze behavior for <repo>\` — Agent orients repo (tree + manifests), reads code, builds candidates\n`;
    inventory += `- Agent writes candidate list to \`docs/as-is/behavior/_candidates.yaml\`\n`;
    inventory += `- Deep-dive each candidate into \`docs/as-is/behavior/<id>.yaml\`\n`;
    inventory += `- Validate with \`cognitive.artifact.upsert\` (requires evidence for kind=fact)\n`;
    inventory += `- See \`skills/cognitive/SKILL.md\` for the discover → deep-dive protocol\n`;
    write(report, inventory);
    write(technical, tech + "\n## Architecture Unknowns\n\n- [ ] Service-to-service communication patterns\n");
    return { ok: true, data: { report: relative(p.rootDir, report), technical: relative(p.rootDir, technical) }, sideEffects: ["docs generated"], reportFragments: ["repos analysis done"] };
  }
};
