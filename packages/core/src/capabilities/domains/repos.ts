import { existsSync, readdirSync } from "node:fs";
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
  version: "1.1.0",
  inputSchema: {
    required: ["name", "url"],
    properties: {
      name: { type: "string", minLength: 1 },
      url: { type: "string", minLength: 1 },
      auto_profile: { type: "boolean" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["name", "url"]);
    const p = workspacePaths(ctx.rootDir);
    const name = String(input.name);
    const url = String(input.url);
    const target = join(p.reposDir, name);
    ensureDir(p.reposDir);
    ensureDir(p.dapeiDir);
    const autoProfile = input.auto_profile === true;

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

    const sideEffects: string[] = [managementMode === "submodule" ? "git submodule add" : "git clone", "repos registry"];
    const data: Record<string, unknown> = { name, url };
    if (autoProfile) {
      const { cdrProfile } = await import("./cdr.ts");
      const r = await cdrProfile.execute(ctx, { repo: name });
      const d = r.data as { path: string };
      data.profile_path = d.path;
      sideEffects.push(`cdr.profile: ${d.path}`);
    }
    return {
      ok: true,
      data,
      sideEffects,
      reportFragments: autoProfile
        ? ["repos add done; profile generated"]
        : ["repos add done"]
    };
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
    if (!existsSync(registry)) return { ok: true, data: { text: "No repos registered." }, sideEffects: [], reportFragments: [] };
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
  version: "2.0.0",
  inputSchema: {
    required: ["target"],
    properties: {
      target: { type: "string", minLength: 1 },
      use_cdr: { type: "boolean" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["target"]);
    const p = workspacePaths(ctx.rootDir);
    const target = String(input.target);
    // v2.0 (BREAKING): default `use_cdr` to true. To keep the legacy
    // grep-style summary + repo-inventory.md report, pass `use_cdr: false`.
    const useCdr = input.use_cdr === undefined ? true : Boolean(input.use_cdr);
    const names = target === "--all" && existsSync(join(p.dapeiDir, "repos.yaml"))
      ? parseReposYamlNames(read(join(p.dapeiDir, "repos.yaml")))
      : [target];

    // ---- CDR-backed path (default) ----
    if (useCdr) {
      const { cdrProfile } = await import("./cdr.ts");
      const profiles: Array<{
        name: string;
        profile_path: string;
        language: string | null;
        manifest_files: string[];
        test_commands: string[];
        codegraph: Record<string, unknown>;
      }> = [];
      for (const name of names) {
        const rp = join(p.reposDir, name);
        if (!existsSync(join(rp, ".git"))) continue;
        const r = await cdrProfile.execute(ctx, { repo: name });
        const d = r.data as {
          repo: string;
          path: string;
          language: string | null;
          manifest_files: string[];
          test_commands: string[];
          codegraph: Record<string, unknown>;
        };
        profiles.push({
          name: d.repo,
          profile_path: d.path,
          language: d.language,
          manifest_files: d.manifest_files,
          test_commands: d.test_commands,
          codegraph: d.codegraph
        });
      }
      return {
        ok: true,
        data: {
          target,
          use_cdr: true,
          profiles,
          next_step: profiles.length === 0
            ? "no repos found; check `repos list`"
            : "review each profile_path; next: `@dapei discover entries for <repo>`"
        },
        sideEffects: ["cdr.profile per repo"],
        reportFragments: [`repos analyzed via cdr.profile (${profiles.length})`]
      };
    }

    // ---- Legacy grep-style path (deprecated) ----
    const results: Array<{
      name: string;
      branch: string;
      hash: string;
      stack: string;
      testCommands: string[];
      structure: string[];
      apiEndpoints: string[];
      dbFiles: string[];
      mqEvidence: string[];
      todos: string[];
    }> = [];

    for (const name of names) {
      const rp = join(p.reposDir, name);
      if (!existsSync(join(rp, ".git"))) continue;

      const branch = runSafe("git", ["-C", rp, "rev-parse", "--abbrev-ref", "HEAD"], p.rootDir) || "";
      const hash = runSafe("git", ["-C", rp, "rev-parse", "--short", "HEAD"], p.rootDir) || "";
      const stack = detectRepoLanguage(rp);
      const testCommands = detectTestCommands(rp);
      const structure = (runSafe("find", [rp, "-maxdepth", "3", "-type", "d"], p.rootDir) || "").split("\n").slice(0, 60).map((x: string) => x.replace(`${rp}/`, ""));
      const apiEndpoints = (runSafe("grep", ["-rnE", "\\.(get|post|put|delete|patch)\\s*\\(|@(Get|Post|Put|Delete|Patch|Request)Mapping", rp, "--include=*.js", "--include=*.ts", "--include=*.java"], p.rootDir) || "").split("\n").filter(Boolean).slice(0, 30);
      const dbFiles = (runSafe("find", [rp, "-type", "f", "(", "-name", "*.sql", "-o", "-path", "*/migrations/*", "-o", "-path", "*/migrate/*", ")"], p.rootDir) || "").split("\n").filter(Boolean).slice(0, 20).map((f: string) => f.replace(`${rp}/`, ""));
      const mqEvidence = (runSafe("grep", ["-rliE", "kafka|rabbitmq|amqp|bull|celery|nats|SQS|SNS|EventBridge", rp], p.rootDir) || "").split("\n").filter(Boolean).slice(0, 15).map((f: string) => f.replace(`${rp}/`, ""));
      const todos = (runSafe("grep", ["-rnE", "TODO|FIXME|HACK", rp, "--include=*.js", "--include=*.ts", "--include=*.java", "--include=*.py", "--include=*.go", "--include=*.rs"], p.rootDir) || "").split("\n").filter(Boolean).slice(0, 20);

      results.push({ name, branch, hash, stack, testCommands, structure, apiEndpoints, dbFiles, mqEvidence, todos });
    }

    const report = join(p.docsDir, "as-is", "repo-inventory.md");
    const lines = [
      "# Repo Inventory",
      "",
      `- Generated At: ${new Date().toISOString()}`,
      `- Target: ${target}`,
      `- Repos: ${results.length}`,
      `- Mode: legacy (use_cdr=false; deprecated)`,
      ""
    ];
    for (const r of results) {
      lines.push(
        `## ${r.name}`,
        "",
        `- Branch: ${r.branch || "unknown"}`,
        `- Commit: ${r.hash || "unknown"}`,
        `- Stack: ${r.stack || "unknown"}`,
        `- Test Commands: ${r.testCommands.length ? r.testCommands.join(", ") : "none detected"}`,
        "",
        "### Structure",
        ...(r.structure.length ? r.structure.map((x) => `- ${x}`) : ["- none"]),
        "",
        "### API Evidence",
        ...(r.apiEndpoints.length ? r.apiEndpoints.map((x) => `- ${x}`) : ["- none"]),
        "",
        "### Database Evidence",
        ...(r.dbFiles.length ? r.dbFiles.map((x) => `- ${x}`) : ["- none"]),
        "",
        "### Messaging Evidence",
        ...(r.mqEvidence.length ? r.mqEvidence.map((x) => `- ${x}`) : ["- none"]),
        "",
        "### TODO Evidence",
        ...(r.todos.length ? r.todos.map((x) => `- ${x}`) : ["- none"]),
        ""
      );
    }
    write(report, lines.join("\n"));

    return {
      ok: true,
      data: {
        target,
        use_cdr: false,
        repos: results,
        report: relative(p.rootDir, report),
        deprecated: true
      },
      sideEffects: ["repo inventory report (legacy)"],
      reportFragments: ["repos scanned (legacy mode; pass use_cdr:true to use cdr.profile)"]
    };
  }
};

export const reposRemove: AnyCap = {
  id: "repos.remove",
  version: "1.0.0",
  inputSchema: {
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
      force: { type: "boolean" }
    },
    additionalProperties: false
  },
    async execute(ctx, input) {
    requireFields(input, ["name"]);
    const name = String(input.name);
    const p = workspacePaths(ctx.rootDir);
    const repoPath = join(p.reposDir, name);
    const registry = join(p.dapeiDir, "repos.yaml");
    if (!existsSync(join(repoPath, ".git"))) throw new CapabilityError("REPO_MISSING", `repos/${name} not found`);

    // Check if any feature worktree is using this repo
    if (existsSync(p.featuresDir)) {
      for (const f of readdirSync(p.featuresDir)) {
        const wt = join(p.featuresDir, f, "repos", name);
        if (existsSync(join(wt, ".git"))) {
          if (input.force !== true) throw new CapabilityError("REPO_IN_USE", `repos/${name} in use by feature '${f}'. use --force to override`);
        }
      }
    }

    // Remove from repos.yaml
    if (existsSync(registry)) {
      const content = read(registry);
      const lines = content.split("\n");
      const newLines: string[] = [];
      let skipMode = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Start of a repo entry
        const nameMatch = line.match(/^\s+- name:\s*"?([^"]+)"?/);
        if (nameMatch && nameMatch[1] === name) {
          skipMode = true;
          continue;
        }
        if (skipMode) {
          // Check if we've reached the next entry (a new "- name:" line)
          if (line.match(/^\s+- name:\s*/)) {
            // Exiting skip mode - this line starts a new entry, so process it normally
            skipMode = false;
            // fall through to push it below
          } else {
            // Still skipping lines belonging to removed entry
            continue;
          }
        }
        newLines.push(line);
      }
      write(registry, newLines.join("\n"));
    }

    // Remove the repo directory
    runSafe("rm", ["-rf", repoPath], p.rootDir);

    return { ok: true, data: { name }, sideEffects: ["repo removed", "registry updated"], reportFragments: [`repos ${name} removed`] };
  }
};
