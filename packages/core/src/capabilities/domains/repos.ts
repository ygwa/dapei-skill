import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { ensureDir, read, run, runSafe, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";
import { defaultBranch, detectRepoLanguage, detectTestCommands, parseReposYamlNames, requireFields } from "../shared.ts";

export type AnyCap = CapabilitySpec<any, any>;

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
    if (existsSync(join(target, ".git"))) throw new CapabilityError("REPO_EXISTS", `repos '${name}' already exists`);
    run("git", ["clone", url, target], p.rootDir);
    const registry = join(p.dapeiDir, "repos.yaml");
    if (!existsSync(registry)) write(registry, 'version: "0.2"\nrepos:\n');
    const content = read(registry);
    if (!content.includes(`name: ${name}`) && !content.includes(`name: "${name}"`)) {
      write(registry, content + `  - name: ${name}\n    path: repos/${name}\n    url: ${url}\n    added-at: ${new Date().toISOString()}\n    default-branch: ${defaultBranch(target)}\n    test-commands: []\n`);
    }
    return { ok: true, data: { name, url }, sideEffects: ["git clone", "repos registry"], reportFragments: ["repos add done"] };
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
      // Fetch latest remote refs
      const fetchOut = runSafe("git", ["-C", repoPath, "fetch", "origin"], p.rootDir);
      if (fetchOut) results.push(`${name}: fetch done`);
      // Determine current branch and pull/merge
      const currentBranch = runSafe("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"], p.rootDir) || "HEAD";
      const base = defaultBranch(repoPath);
      if (currentBranch === base || currentBranch === "HEAD") {
        // Detached HEAD or on default branch - do a pull
        const pullErr = runSafe("git", ["-C", repoPath, "pull", "--ff-only", "origin", base], p.rootDir);
        if (!pullErr) {
          results.push(`${name}: pulled ${base} (fast-forward)`);
        } else {
          // Non-fast-forward or conflict - fetch + rebase if possible
          const rebaseErr = runSafe("git", ["-C", repoPath, "rebase", `origin/${base}`], p.rootDir);
          if (!rebaseErr) {
            results.push(`${name}: rebased onto origin/${base}`);
          } else {
            results.push(`${name}: sync conflict - run 'git status' in repos/${name}`);
          }
        }
      } else {
        // On a feature branch - just update the ref, don't merge into branch
        const fetchHead = runSafe("git", ["-C", repoPath, "rev-parse", "FETCH_HEAD"], p.rootDir);
        if (fetchHead) results.push(`${name}: branch '${currentBranch}' updated (fetch only - rebase your branch to integrate)`);
        else results.push(`${name}: no remote update available`);
      }
    }
    return { ok: true, data: { target, results }, sideEffects: ["git fetch", "git pull", "git rebase"], reportFragments: ["repos sync"] };
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
    write(report, inventory);
    write(technical, tech + "\n## Architecture Unknowns\n\n- [ ] Service-to-service communication patterns\n");
    return { ok: true, data: { report: relative(p.rootDir, report), technical: relative(p.rootDir, technical) }, sideEffects: ["docs generated"], reportFragments: ["repos analysis done"] };
  }
};
