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

/** A single rule as declared in `.dapei/rules/*.yaml`. */
export interface GuardrailRule {
  id?: string;
  title?: string;
  severity?: string;
  message?: string;
  check?: Record<string, unknown>;
}

/**
 * Parse one rule-pack YAML file with `js-yaml` (the same dependency
 * `yaml-doc.ts` / `domains/cognitive.ts` use). Returns the `rules:` array and
 * preserves every field the engine consumes (`id`, `title`, `severity`,
 * `message`, `check`). A malformed document yields `[]` rather than throwing,
 * preserving the previous lenient behaviour for hand-edited rule packs.
 */
function parseRuleFile(content: string): GuardrailRule[] {
  try {
    const doc = load(content);
    if (doc && typeof doc === "object" && "rules" in doc && Array.isArray(doc.rules)) {
      return doc.rules as GuardrailRule[];
    }
  } catch {
    // Return empty on parsing error to preserve backward compatibility
  }
  return [];
}

/** Everything a rule check can read. Pure: evaluators never mutate state. */
export interface RuleCheckContext {
  rootDir: string;
  feature: string;
  filesChanged: string[];
}

export interface RuleCheckOutcome {
  failed: boolean;
}

export type RuleCheck = (check: Record<string, unknown>, ctx: RuleCheckContext) => RuleCheckOutcome;

/**
 * The rule-check registry: `check.type` → small pure evaluator returning
 * whether the rule failed. This is the single dispatch table; adding a check
 * type means adding one entry here, not another branch in the loop. An
 * unknown/missing `check.type` has no evaluator and is handled by the caller
 * (it fails the rule with an "unsupported check.type" finding).
 */
export const RULE_CHECKS: Record<string, RuleCheck> = {
  // Every path in `check.files` must exist (`<feature>` expands to the feature).
  "file-required": (check, ctx) => {
    const files = Array.isArray(check.files) ? check.files.map((v) => String(v)) : [];
    for (const f of files) {
      if (!existsSync(join(ctx.rootDir, f.replace("<feature>", ctx.feature)))) return { failed: true };
    }
    return { failed: false };
  },
  // `check.regex` must match the feature directory name.
  "folder-name-regex": (check, ctx) => {
    const regex = typeof check.regex === "string" ? check.regex : "";
    return { failed: Boolean(regex) && !new RegExp(regex).test(ctx.feature) };
  },
  // No changed file may match any glob in `check.patterns`.
  "path-deny": (check, ctx) => {
    const patterns = Array.isArray(check.patterns) ? check.patterns.map((v) => String(v)) : [];
    for (const p of patterns) {
      const reg = new RegExp("^" + p.replace(/\*\*\//g, ".*").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$");
      if (ctx.filesChanged.some((x) => reg.test(x))) return { failed: true };
    }
    return { failed: false };
  },
  // `check.evidence_file` must exist and contain `check.condition` (if set).
  "evidence-required": (check, ctx) => {
    const f = typeof check.evidence_file === "string" ? check.evidence_file.replace("<feature>", ctx.feature) : "";
    const full = join(ctx.rootDir, f);
    if (!existsSync(full)) return { failed: true };
    const cond = typeof check.condition === "string" ? check.condition : "";
    if (cond && !readFileSync(full, "utf8").includes(cond)) return { failed: true };
    return { failed: false };
  },
  // The cognitive index must hold at least `check.min_facts` fact behaviors.
  "cognitive-artifact-required": (check, ctx) => {
    const minFacts = Number(check.min_facts || 1);
    const indexFile = join(ctx.rootDir, ".dapei", "cognitive", "index.yaml");
    if (!existsSync(indexFile)) return { failed: true };
    try {
      const index = loadCognitiveIndex(ctx.rootDir);
      const factCount = index.behaviors.filter((b) => b.kind === "fact").length;
      return { failed: factCount < minFacts };
    } catch {
      return { failed: true };
    }
  }
};

/** Every `check.type` the registry can evaluate. */
export const SUPPORTED_RULE_CHECK_TYPES: string[] = Object.keys(RULE_CHECKS);

/**
 * `check.type` values that are intentionally recognised-but-unsupported (they
 * still fail the rule, but callers/tests know they are not a typo). Kept empty
 * because the engine implements every type the shipped rule pack uses; unknown
 * types are reported through the "unsupported check.type" finding.
 */
export const KNOWN_UNSUPPORTED_RULE_CHECK_TYPES: string[] = [];

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
    const rules = parseRuleFile(readFileSync(join(rulesDir, rf), "utf8"));
    for (const rule of rules) {
      const rid = rule.id || "UNKNOWN";
      const title = rule.title || "";
      const severity = rule.severity || "medium";
      const message = rule.message || "failed rule check";
      const check = rule.check || {};
      const type = typeof check.type === "string" ? check.type : "";
      // Non-empty when the rule declares a check.type the engine does not implement.
      let unsupported: string | null = null;

      const evaluator = RULE_CHECKS[type];
      let failed: boolean;
      if (evaluator) {
        failed = evaluator(check, { rootDir, feature, filesChanged }).failed;
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
