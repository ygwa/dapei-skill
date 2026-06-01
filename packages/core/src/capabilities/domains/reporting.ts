import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { detectTestCommands, featureRepoNames, requireFields } from "../shared.ts";
import { read, run, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";
import { runGuardrail } from "../../guardrail.ts";

export type AnyCap = CapabilitySpec<any, any>;

export const featureGuardrail: AnyCap = {
  id: "feature.guardrail",
  version: "1.0.0",
  inputSchema: { required: ["feature"] },
  async execute(ctx, input) {
    requireFields(input, ["feature"]);
    const g = runGuardrail(workspacePaths(ctx.rootDir).rootDir, String(input.feature));
    return { ok: true, data: { status: g.status, mode: g.mode, report: g.reportPath }, sideEffects: ["guardrail report"], reportFragments: ["guardrail run"] };
  }
};

export const validationRun: AnyCap = {
  id: "validation.run",
  version: "1.0.0",
  inputSchema: { required: ["feature"], properties: { feature: { type: "string", minLength: 1 } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["feature"]);
    const feature = String(input.feature);
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, feature);
    const valReport = join(featureDir, "reports", "validation-report.md");
    const testReport = join(featureDir, "reports", "test-report.md");
    let status = "PASS";
    const errors: string[] = [];
    const repos = featureRepoNames(read(join(featureDir, "feature.yaml")));
    let out = `# Test Report\n\n- Feature: ${feature}\n\n`;
    for (const repo of repos) {
      const rp = join(p.reposDir, repo);
      out += `## Repo: ${repo}\n\n`;
      const cmds = detectTestCommands(rp);
      if (cmds.length === 0) {
        status = "FAIL";
        out += "- Status: SKIPPED\n- Reason: no candidate test command detected\n\n";
      }
      for (const cmd of cmds) {
        const [bin, ...args] = cmd.split(" ");
        let code = 0;
        let text = "";
        try {
          text = run(bin, args, rp);
        } catch (e: any) {
          code = e.status || 1;
          text = e.stdout?.toString?.() || e.message;
        }
        if (code !== 0) status = "FAIL";
        out += `### Command: \`${cmd}\`\n\n- Exit Code: ${code}\n\n\`\`\`text\n${text.split("\n").slice(-120).join("\n")}\n\`\`\`\n\n`;
      }
    }
    write(testReport, out);
    let guardrailStatus: string = "PASS";
    try {
      const g = runGuardrail(p.rootDir, feature);
      guardrailStatus = g.status;
      if (g.status === "FAIL") status = "FAIL";
    } catch (err: any) {
      errors.push(`guardrail error: ${err?.message || String(err)}`);
      status = "FAIL";
      guardrailStatus = "ERROR";
    }
    const guardrailReport = join(featureDir, "reports", "guardrail-report.md");
    write(valReport, `# Validation Report\n\n- Feature: ${feature}\n- Status: ${status}\n- Test Status: ${status !== "PASS" ? "FAIL" : "PASS"}\n- Guardrail Status: ${guardrailStatus}\n- Errors: ${errors.length ? errors.join("; ") : "none"}\n- Test Report: reports/test-report.md\n- Guardrail Report: reports/guardrail-report.md\n`);
    return { ok: true, data: { status, errors }, sideEffects: ["validation reports"], reportFragments: ["validation done"] };
  }
};

export const validationDetect: AnyCap = {
  id: "validation.detect",
  version: "1.0.0",
  inputSchema: { required: ["repo"], properties: { repo: { type: "string", minLength: 1 } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["repo"]);
    const repo = String(input.repo);
    const p = workspacePaths(ctx.rootDir);
    const repoPath = join(p.reposDir, repo);
    const commands = detectTestCommands(repoPath);
    return { ok: true, data: { repo, commands }, sideEffects: [], reportFragments: ["test commands detected"] };
  }
};

export const validationExecute: AnyCap = {
  id: "validation.execute",
  version: "1.0.0",
  inputSchema: { required: ["repo", "command"], properties: { repo: { type: "string", minLength: 1 }, command: { type: "string", minLength: 1 } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["repo", "command"]);
    const repo = String(input.repo);
    const command = String(input.command);
    const p = workspacePaths(ctx.rootDir);
    const repoPath = join(p.reposDir, repo);
    const [bin, ...args] = command.split(" ");
    let exitCode = 0;
    let output = "";
    try {
      output = run(bin, args, repoPath);
    } catch (e: any) {
      exitCode = e.status || 1;
      output = e.stdout?.toString?.() || e.message || String(e);
    }
    return { ok: true, data: { repo, command, exitCode, output }, sideEffects: [], reportFragments: ["validation executed"] };
  }
};

export const validationReport: AnyCap = {
  id: "validation.report",
  version: "1.0.0",
  inputSchema: { required: ["feature"], properties: { feature: { type: "string", minLength: 1 } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["feature"]);
    const feature = String(input.feature);
    const p = workspacePaths(ctx.rootDir);
    const valReport = join(p.featuresDir, feature, "reports", "validation-report.md");
    const testReport = join(p.featuresDir, feature, "reports", "test-report.md");
    const guardrailReport = join(p.featuresDir, feature, "reports", "guardrail-report.md");
    const results: Record<string, { exists: boolean; path?: string }> = {
      "validation-report.md": { exists: existsSync(valReport), path: existsSync(valReport) ? relative(p.rootDir, valReport) : undefined },
      "test-report.md": { exists: existsSync(testReport), path: existsSync(testReport) ? relative(p.rootDir, testReport) : undefined },
      "guardrail-report.md": { exists: existsSync(guardrailReport), path: existsSync(guardrailReport) ? relative(p.rootDir, guardrailReport) : undefined }
    };
    return { ok: true, data: { feature, reports: results }, sideEffects: [], reportFragments: ["validation report accessed"] };
  }
};

export const featureReport: AnyCap = {
  id: "feature.report",
  version: "1.0.0",
  inputSchema: { required: ["feature"], properties: { feature: { type: "string", minLength: 1 } }, additionalProperties: false },
  async execute(ctx, input) {
    requireFields(input, ["feature"]);
    const feature = String(input.feature);
    const p = workspacePaths(ctx.rootDir);
    runGuardrail(p.rootDir, feature);
    const daily = join(p.featuresDir, feature, "reports", "daily-report.md");
    const arch = join(p.featuresDir, feature, "reports", "architecture-review.md");
    write(daily, `# Daily Report\n\n- Feature: ${feature}\n- Generated At: ${new Date().toISOString()}\n\n## 结论\n\n- 自动报告已生成。\n`);
    write(arch, `# Architecture Review\n\n- Feature: ${feature}\n- Generated At: ${new Date().toISOString()}\n`);
    return { ok: true, data: { daily: relative(p.rootDir, daily) }, sideEffects: ["report files"], reportFragments: ["report generated"] };
  }
};
