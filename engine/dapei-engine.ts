#!/usr/bin/env node
import { resolve } from "node:path";
import { runCapability } from "../packages/core/src/index.ts";
import { routeIntent } from "../packages/router/src/index.ts";
import { CapabilityError } from "../packages/core/src/types.ts";

type Cli = { cmd: "run" | "route" | "legacy"; args: string[] };

function parseArg(flag: string, args: string[]): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function parseJson(raw?: string): Record<string, any> {
  if (!raw) return {};
  return JSON.parse(raw);
}

function parseLegacy(args: string[]): { capability: string; input: Record<string, any> } {
  const [a, b, c, ...rest] = args;
  if (!a) throw new CapabilityError("INVALID_INPUT", "missing command");
  if (a === "init" && b === "workspace") return { capability: "workspace.init", input: {} };
  if (a === "repos" && b === "add") return { capability: "repos.add", input: { name: c, url: rest[0] } };
  if (a === "repos" && b === "sync") return { capability: "repos.sync", input: { target: c } };
  if (a === "repos" && b === "list") return { capability: "repos.list", input: {} };
  if (a === "repos" && b === "analyze") return { capability: "repos.analyze", input: { target: c } };
  if (a === "create" && b === "feature") {
    const repos = parseArg("--repos", rest) || "";
    const objective = parseArg("--objective", rest) || "";
    return { capability: "feature.create", input: { name: c, repos, objective } };
  }
  if (a === "context" && b === "build") return { capability: "context.build", input: { feature: c, stage: parseArg("--stage", rest) || "general" } };
  if (a === "run" && b === "workflow") return { capability: "workflow.runStage", input: { feature: c, stage: parseArg("--stage", rest) || "", confirmed: rest.includes("--yes") } };
  if (a === "validate" && b === "feature") return { capability: "validation.run", input: { feature: c } };
  if (a === "review" && b === "feature") return { capability: "feature.review", input: { feature: c } };
  if (a === "report" && b === "feature") return { capability: "feature.report", input: { feature: c } };
  if (a === "close" && b === "feature") return { capability: "feature.close", input: { feature: c, confirmed: rest.includes("--yes"), force: rest.includes("--force") } };
  if (a === "status" && b === "feature") return { capability: "feature.status", input: {} };
  throw new CapabilityError("INVALID_INPUT", "unknown legacy command");
}

function parseCli(argv: string[]): Cli {
  const [cmd, ...args] = argv;
  if (cmd === "run" && args[0] !== "workflow") return { cmd, args };
  if (cmd === "route") return { cmd, args };
  return { cmd: "legacy", args: argv };
}

async function main() {
  const rootDir = resolve(process.env.DAPEI_WORKSPACE_ROOT || process.cwd());
  const cli = parseCli(process.argv.slice(2));
  try {
    if (cli.cmd === "run") {
      const capability = parseArg("--capability", cli.args) || cli.args[0];
      const input = parseJson(parseArg("--input", cli.args));
      const { result } = await runCapability(capability, input, { rootDir, now: new Date() });
      if ((result.data as any).text) console.log((result.data as any).text);
      else console.log(JSON.stringify(result.data, null, 2));
      return;
    }

    if (cli.cmd === "route") {
      const intent = parseArg("--intent", cli.args) || "";
      const ctx = parseJson(parseArg("--context", cli.args));
      const r = routeIntent(intent, ctx);
      console.log(JSON.stringify(r, null, 2));
      return;
    }

    if (cli.args.length === 0 && cli.cmd === "legacy") {
      console.log(`Usage:\n  dapei init workspace\n  dapei repos add <name> <git-url>\n  dapei repos sync <name|--all>\n  dapei repos list\n  dapei repos analyze <name|--all>\n  dapei create feature <name> --repos repo1,repo2 [--objective \"...\"]\n  dapei context build <feature> [--stage <stage>]\n  dapei run workflow <feature> --stage <stage>\n  dapei validate feature <name>\n  dapei review feature <name>\n  dapei report feature <name>\n  dapei close feature <name>\n  dapei status feature`);
      process.exitCode = 1;
      return;
    }

    const resolved = parseLegacy(cli.args[0] === "@dapei" ? cli.args.slice(1) : cli.args);
    const { result } = await runCapability(resolved.capability, resolved.input, { rootDir, now: new Date() });
    if ((result.data as any).text) console.log((result.data as any).text);
    else if ((result.data as any).message) console.log(`[dapei] ${(result.data as any).message}`);
  } catch (err: any) {
    if (err instanceof CapabilityError) {
      console.error(`[dapei][error] ${err.message}`);
      process.exit(1);
    }
    console.error(err?.message || String(err));
    process.exit(1);
  }
}

main();
