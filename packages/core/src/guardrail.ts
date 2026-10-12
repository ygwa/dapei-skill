import { existsSync } from "node:fs";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runSafe } from "@dapei/runtime-adapters/system";
import { loadCognitiveIndex } from "./cognitive-index.ts";
import { defaultBranch, featureRepoNames } from "./capabilities/shared.ts";
import { CapabilityError } from "./types.ts";
import { load } from "js-yaml";

export type GuardrailStatus = "PASS" | "WARN" | "FAIL";

export interface GuardrailResult {
  status: GuardrailStatus;
  findings: string[];
  /** Ids of the checks that actually failed (e.g. `BASE-002`, `DDD-001`). */
  failedChecks: string[];
  mode: string;
  reportPath: string;
}

function parseSimpleYamlRules(content: string): Array<Record<string, any>> {
  try {
    const doc = load(content) as any;
    if (doc && Array.isArray(doc.rules)) {
      return doc.rules;
    }
  } catch {
    // Return empty on parsing error to preserve backward compatibility
  }
  return [];
}

function modifiedFiles(rootDir: string, opts?: { ignoreSubmodules?: boolean }): string[] {
  if (!existsSync(join(rootDir, ".git"))) return [];
  const args = ["status", "--porcelain"];
  if (opts?.ignoreSubmodules) args.push("--ignore-submodules=all");
  const output = runSafe("git", args, rootDir);
  if (!output) return [];
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/, 2)[1])
    .filter(Boolean);
}

function readWorkspaceConfig(rootDir: string): { guardrailMode: string; submodulePointerPolicy: "ignore" | "commit" } {
  const workspaceYaml = join(rootDir, ".dapei", "workspace.yaml");
  let guardrailMode = "report";
  let submodulePointerPolicy: "ignore" | "commit" = "ignore";
  if (!existsSync(workspaceYaml)) return { guardrailMode, submodulePointerPolicy };
  const content = readFileSync(workspaceYaml, "utf8");
  const m = content.match(/guardrail_mode:\s*["']?([a-z]+)["']?/);
  if (m) guardrailMode = m[1];
  const p = content.match(/submodule_pointer_policy:\s*["']?([a-z]+)["']?/);
  if (p && (p[1] === "ignore" || p[1] === "commit")) submodulePointerPolicy = p[1];
  return { guardrailMode, submodulePointerPolicy };
}

function baseRepoHealthFindings(rootDir: string, feature: string): { findings: string[]; status: GuardrailStatus; failedChecks: string[] } {
  const findings: string[] = [];
  const failedChecks: string[] = [];
  let status: GuardrailStatus = "PASS";

  const featureYamlPath = join(rootDir, "features", feature, "feature.yaml");
  if (!existsSync(featureYamlPath)) return { findings, status, failedChecks };
  const repos = featureRepoNames(readFileSync(featureYamlPath, "utf8"));

  for (const repo of repos) {
    const repoPath = join(rootDir, "repos", repo);
    if (!existsSync(join(repoPath, ".git"))) {
      findings.push(`BASE-001 base repo missing: repos/${repo} (Severity: high)`);
      failedChecks.push("BASE-001");
      status = "FAIL";
      continue;
    }

    const dirty = runSafe("git", ["-C", repoPath, "status", "--porcelain"], rootDir);
    if (dirty) {
      findings.push(`BASE-002 base repo dirty (禁止在基座仓库开发): repos/${repo} (Severity: high)`);
      failedChecks.push("BASE-002");
      status = "FAIL";
    }

    const base = defaultBranch(repoPath);
    const current = runSafe("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"], rootDir) || "HEAD";
    if (current !== base) {
      findings.push(`BASE-003 base repo not on default branch (expected '${base}', got '${current}'): repos/${repo} (Severity: high)`);
      failedChecks.push("BASE-003");
      status = "FAIL";
    }
  }

  return { findings, status, failedChecks };
}

export function runGuardrail(rootDir: string, feature: string): GuardrailResult {
  const featureDir = join(rootDir, "features", feature);
  if (!existsSync(featureDir)) {
    throw new Error(`feature not found: ${feature}`);
  }

  const { guardrailMode: mode, submodulePointerPolicy } = readWorkspaceConfig(rootDir);
  const ignoreSubmodules = submodulePointerPolicy === "ignore";

  const findings: string[] = [];
  const failedChecks: string[] = [];
  let status: GuardrailStatus = "PASS";
  const filesChanged = modifiedFiles(rootDir, { ignoreSubmodules });

  // Base repo pool must be clean & on default branch for any repo referenced by feature.yaml.
  // This enforces the "repos is read-only base pool" discipline.
  const baseHealth = baseRepoHealthFindings(rootDir, feature);
  findings.push(...baseHealth.findings);
  failedChecks.push(...baseHealth.failedChecks);
  if (baseHealth.status === "FAIL") status = "FAIL";

  if (!existsSync(join(featureDir, "feature.yaml"))) {
    findings.push("LAYER-002 missing feature.yaml (Severity: high)");
    failedChecks.push("LAYER-002");
    status = "FAIL";
  }

  const rulesDir = join(rootDir, ".dapei", "rules");
  const ruleFiles = existsSync(rulesDir) ? readdirSync(rulesDir).filter((f: string) => f.endsWith(".yaml")) : [];

  for (const rf of ruleFiles) {
    const rules = parseSimpleYamlRules(readFileSync(join(rulesDir, rf), "utf8"));
    for (const rule of rules) {
      const rid = rule.id || "UNKNOWN";
      const title = rule.title || "";
      const severity = rule.severity || "medium";
      const message = rule.message || "failed rule check";
      const check = rule.check || {};
      const type = check.type || "";
      let failed = false;
      // Non-empty when the rule declares a check.type the engine does not implement.
      let unsupported: string | null = null;

      if (type === "file-required") {
        const required = Array.isArray(check.files) ? check.files : [];
        for (const f of required) {
          const resolved = f.replace("<feature>", feature);
          if (!existsSync(join(rootDir, resolved))) {
            failed = true;
            break;
          }
        }
      } else if (type === "folder-name-regex") {
        const regex = check.regex || "";
        if (regex && !(new RegExp(regex).test(feature))) failed = true;
      } else if (type === "path-deny") {
        const patterns = Array.isArray(check.patterns) ? check.patterns : [];
        for (const p of patterns) {
          const reg = new RegExp("^" + p.replace(/\*\*\//g, ".*").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$");
          if (filesChanged.some((x) => reg.test(x))) {
            failed = true;
            break;
          }
        }
      } else if (type === "evidence-required") {
        const f = (check.evidence_file || "").replace("<feature>", feature);
        const full = join(rootDir, f);
        const cond = check.condition || "";
        if (!existsSync(full)) failed = true;
        else if (cond) {
          const c = readFileSync(full, "utf8");
          if (!c.includes(cond)) failed = true;
        }
      } else if (type === "cognitive-artifact-required") {
        const minFacts = Number(check.min_facts || 1);
        const indexFile = join(rootDir, ".dapei", "cognitive", "index.yaml");
        if (!existsSync(indexFile)) {
          failed = true;
        } else {
          try {
            const index = loadCognitiveIndex(rootDir);
            const factCount = index.behaviors.filter((b) => b.kind === "fact").length;
            if (factCount < minFacts) failed = true;
          } catch {
            failed = true;
          }
        }
      } else {
        // Unknown check.type: fail loudly instead of silently passing the rule.
        // A rule the engine cannot evaluate must never look "green".
        unsupported = type || "(missing)";
        failed = true;
      }

      if (failed) {
        findings.push(`${rid} ${title} - ${message} (Severity: ${severity})`);
        failedChecks.push(rid);
        if (unsupported !== null) {
          findings.push(`${rid}: unsupported check.type '${unsupported}' - rule treated as failing`);
        }
        // Aggregation only ever escalates: never downgrade a FAIL to WARN.
        if (["high", "blocker"].includes(severity)) status = "FAIL";
        else if (status !== "FAIL") status = "WARN";
      }
    }
  }

  const reportPath = join(featureDir, "reports", "guardrail-report.md");
  mkdirSync(join(featureDir, "reports"), { recursive: true });
  const now = new Date().toISOString();
  const body = [
    "# Guardrail Report",
    "",
    `- Feature: ${feature}`,
    `- Mode: ${mode}`,
    `- Status: ${status}`,
    `- Generated At: ${now}`,
    "",
    "## Findings",
    ...(findings.length ? findings.map((f) => `- ${f}`) : ["- none"]),
    ""
  ].join("\n");
  writeFileSync(reportPath, body, "utf8");

  return { status, findings, failedChecks, mode, reportPath };
}

/**
 * Stage-advance guardrail gate.
 *
 * Call this immediately BEFORE writing a stage completion marker. It decides
 * whether the advance may proceed based on the workspace `guardrail_mode`:
 *
 * - `report` (and any mode that is not an enforcing one): never blocks; the
 *   caller keeps advancing and appends the returned summary fragment.
 * - `enforce` (any non-`report` mode): a FAIL status throws
 *   `CapabilityError("GUARDRAIL_FAILED")` naming the failing rule ids. Because
 *   the caller calls this before the marker write, no marker is left behind.
 *
 * Returns the reportFragments the caller should surface.
 */
export function guardStageAdvance(rootDir: string, feature: string): string[] {
  // No feature workspace yet (e.g. early scaffold calls) -> nothing to guard.
  if (!existsSync(join(rootDir, "features", feature))) return [];

  const result = runGuardrail(rootDir, feature);
  const findingSummary = result.findings.length > 0 ? `${result.findings.length} finding(s)` : "no findings";
  const summary = `guardrail: ${result.status} (mode=${result.mode}, ${findingSummary})`;

  if (result.status === "FAIL" && result.mode !== "report") {
    const failing = result.failedChecks.length > 0 ? result.failedChecks.join(", ") : "(unattributed)";
    throw new CapabilityError(
      "GUARDRAIL_FAILED",
      `guardrail FAIL (guardrail_mode=${result.mode}) blocks stage advance; failing rules: ${failing}`
    );
  }

  return [summary];
}
