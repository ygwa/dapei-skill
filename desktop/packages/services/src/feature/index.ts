import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { EngineClient, WorkspaceContext as EngineWorkspaceContext } from "@dapei/desktop-engine-client";
import type { ClosePreflight, FeatureCloseWithPromoteRequest, FeatureCloseResponse } from "@dapei/desktop-contracts/feature";

export interface FeatureSummary {
  name: string;
  stage: string | null;
  active: boolean;
  openedAt: string;
}

export interface FeatureService {
  list(): Promise<FeatureSummary[]>;
  getStatus(name: string): Promise<{ stage: string | null }>;
  getStage(name: string): Promise<{ stage: string | null }>;
  create(input: { name: string; repos: string; objective?: string }): Promise<{ ok: boolean; feature?: string; error?: { code: string; message: string } }>;
  runStage(name: string, stage: string, confirmed: boolean): Promise<{ ok: boolean; error?: { code: string; message: string } }>;
  /** Build runtime-context.md for a feature at a stage. M1-5 wires P5. */
  buildContext(name: string, stage: string): Promise<{ ok: boolean; runtimeContext?: string; error?: { code: string; message: string } }>;
  /** Read the feature.tasks/backlog.md content. */
  getBacklog(name: string): Promise<{ ok: boolean; text?: string; error?: { code: string; message: string } }>;
  /**
   * M3-2: read the artifacts under `features/<name>/` plus the cognitive
   * index entries tagged with `created_by_feature = <name>`, and return a
   * structured ClosePreflight the wizard renders. Pure read aggregation —
   * does NOT call `feature.close`.
   */
  prepareClose(name: string): Promise<ClosePreflight>;
  /**
   * M3-2: invoke `feature.close` with the user's wizard selections
   * (optionally carrying a `promote_artifacts` payload). Returns the
   * engine's `promoted_artifacts` for the success banner.
   */
  closeWithPromote(req: FeatureCloseWithPromoteRequest): Promise<FeatureCloseResponse | { ok: false; error: { code: string; message: string } }>;
}

export function createFeatureService(engine: EngineClient, context: EngineWorkspaceContext): FeatureService {
  return {
    async list() {
      const result = await engine.run(
        { capabilityId: "feature.status", input: {}, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) return [];
      const data = result.data as { text?: string } | undefined;
      if (!data?.text) return [];
      return parseFeatureText(data.text, context.workspaceRoot);
    },
    async getStatus(name) {
      const result = await engine.run(
        { capabilityId: "feature.stage", input: { feature: name, action: "get" }, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) return { stage: null };
      const data = result.data as { stage?: string | null } | undefined;
      return { stage: data?.stage ?? null };
    },
    async getStage(name) {
      return this.getStatus(name);
    },
    async create(input) {
      const result = await engine.run(
        { capabilityId: "feature.create", input: { name: input.name, repos: input.repos, objective: input.objective ?? "" }, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      const data = result.data as { feature?: string } | undefined;
      return { ok: true, feature: data?.feature ?? input.name };
    },
    async runStage(name, stage, confirmed) {
      const result = await engine.run(
        { capabilityId: "workflow.runStage", input: { feature: name, stage, confirmed }, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
    async buildContext(name, stage) {
      const result = await engine.run(
        { capabilityId: "context.build", input: { feature: name, stage }, workspaceRoot: context.workspaceRoot, feature: name },
        { workspaceRoot: context.workspaceRoot, dimension: "feature", feature: name }
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      const data = result.data as { runtimeContext?: string } | undefined;
      return { ok: true, runtimeContext: data?.runtimeContext };
    },
    async getBacklog(name) {
      const result = await engine.run(
        { capabilityId: "feature.tasks", input: { feature: name, action: "list" }, workspaceRoot: context.workspaceRoot, feature: name },
        { workspaceRoot: context.workspaceRoot, dimension: "feature", feature: name }
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      const data = result.data as { text?: string } | undefined;
      return { ok: true, text: data?.text ?? "" };
    },
    async prepareClose(name) {
      return buildClosePreflight(name, context.workspaceRoot, engine);
    },
    async closeWithPromote(req) {
      // Close is workspace-dim — feature.close (v3.0.0) writes to
      // docs/decisions/, docs/feature-impact/, docs/architecture/, etc.
      // The dimension rule in engine-client MUST be set to "workspace" here,
      // not "feature", otherwise the rule fires (workspace-dim write is
      // blocked from feature dim). Caller (IPC handler) is responsible for
      // passing the workspace-dim context — the service does not switch
      // dimensions implicitly.
      const result = await engine.run(
        {
          capabilityId: "feature.close",
          input: {
            feature: req.feature,
            ...(req.confirmed !== undefined ? { confirmed: req.confirmed } : {}),
            ...(req.force !== undefined ? { force: req.force } : {}),
            ...(req.promote_artifacts !== undefined ? { promote_artifacts: req.promote_artifacts } : {})
          },
          workspaceRoot: context.workspaceRoot
        },
        context
      );
      if (!result.ok) {
        return { ok: false as const, error: result.error ?? { code: "UNKNOWN", message: "feature.close returned no error detail" } };
      }
      // Engine wraps return as `{ ok: true, data, sideEffects, reportFragments }`.
      // FeatureCloseResponseSchema expects `{ ok: true, data: { feature, cdr_assets_tagged, promoted_artifacts } }`.
      return result.data as FeatureCloseResponse["data"] extends infer D ? { ok: true; data: D } : never;
    }
  };
}

/**
 * Internal helper: build the ClosePreflight by reading files + the
 * cognitive index. Pure read aggregation — does not call feature.close.
 *
 * Decisions section: read features/<f>/memory/decision-log.md.
 * Architecture section: scan features/<f>/ for files matching the design
 *   doc templates (0[3-6]-*.md) or filenames containing "arch".
 * Reports section: list all *.md under features/<f>/reports/.
 * Cognitive section: query cdr.index.list (via cdr.query) for entries
 *   tagged with created_by_feature = <f>; only the first 20 surfaced
 *   in the wizard (the rest still counted in `total_in_index`).
 */
async function buildClosePreflight(
  feature: string,
  workspaceRoot: string,
  engine: EngineClient
): Promise<ClosePreflight> {
  const featureDir = join(workspaceRoot, "features", feature);
  const memoryDir = join(featureDir, "memory");
  const reportsDir = join(featureDir, "reports");
  const docsDir = join(featureDir, "docs");

  // ---- decisions ----
  const decisionLogPath = join(memoryDir, "decision-log.md");
  const decisionPresent = existsSync(decisionLogPath);
  const decisionPreview = decisionPresent
    ? readFileSync(decisionLogPath, "utf8").slice(0, 200)
    : "";
  const decisions = {
    items: decisionPresent
      ? [{
          source_present: true,
          default_target_path: `docs/decisions/${feature}-decisions.md`,
          preview: decisionPreview
        }]
      : [],
    default_selected: decisionPresent ? 1 : 0,
    display_order: 1,
    applicable: decisionPresent,
    rationale: decisionPresent
      ? `Copy features/${feature}/memory/decision-log.md → docs/decisions/${feature}-decisions.md. Default behavior in v2.0.0+; you can opt out by setting decisions.skip = true.`
      : "No decision-log.md found under features/<f>/memory/ — nothing to promote."
  };

  // ---- architecture ----
  const archCandidates = scanArchitectureCandidates(docsDir, featureDir);
  const architecture = {
    items: archCandidates.length > 0
      ? [{ candidates: archCandidates }]
      : [],
    default_selected: 0,
    display_order: 2,
    applicable: archCandidates.length > 0,
    rationale: archCandidates.length > 0
      ? `Found ${archCandidates.length} candidate file(s) that look like architecture notes (design-stage templates or filenames containing "arch"). Each row can be promoted individually to docs/architecture/.`
      : "No architecture-note candidates found. Write 03/04/05/06-*.md under features/<f>/docs/ during the feature to surface candidates."
  };

  // ---- reports ----
  const reportCandidates = scanReportCandidates(reportsDir);
  const reports = {
    items: reportCandidates.length > 0 ? [{ candidates: reportCandidates }] : [],
    default_selected: reportCandidates.length,
    display_order: 3,
    applicable: reportCandidates.length > 0,
    rationale: reportCandidates.length > 0
      ? `Found ${reportCandidates.length} report(s) under features/${feature}/reports/. Copying them to docs/feature-impact/${feature}/ makes them visible from the workspace dimension.`
      : "No reports under features/<f>/reports/. The default feature-impact/<f>.md summary will still be written."
  };

  // ---- cognitive ----
  const cognitivePreview = await queryCognitiveForFeature(engine, feature, workspaceRoot);
  const cognitive = {
    items: cognitivePreview.assets.length > 0 || cognitivePreview.total_in_index > 0
      ? [{
          candidates: cognitivePreview.assets,
          total_in_index: cognitivePreview.total_in_index
        }]
      : [],
    default_selected: 0,
    display_order: 4,
    applicable: cognitivePreview.total_in_index > 0,
    rationale: cognitivePreview.total_in_index > 0
      ? `${cognitivePreview.total_in_index} cognitive asset(s) are tagged with created_by_feature=${feature}. The wizard lets you unlink any that should NOT be attributed to this feature. The auto-link is always run by feature.close regardless.`
      : "No cognitive assets tagged with this feature. Nothing to unlink."
  };

  // ---- current stage (for Step 1 summary) ----
  let current_stage: string | null = null;
  try {
    const statusResult = await engine.run(
      { capabilityId: "feature.stage", input: { feature, action: "get" }, workspaceRoot },
      { workspaceRoot, dimension: "feature", feature }
    );
    if (statusResult.ok) {
      const data = statusResult.data as { stage?: string | null } | undefined;
      current_stage = data?.stage ?? null;
    }
  } catch {
    /* stage lookup is best-effort */
  }

  return {
    feature,
    current_stage,
    cdr_assets_tagged_preview: cognitivePreview.total_in_index,
    decisions,
    architecture,
    reports,
    cognitive
  };
}

function scanArchitectureCandidates(docsDir: string, featureDir: string): Array<{ source_path: string; target_path: string }> {
  if (!existsSync(docsDir)) return [];
  const out: Array<{ source_path: string; target_path: string }> = [];
  let files: string[] = [];
  try {
    files = readdirSync(docsDir);
  } catch {
    return [];
  }
  // Heuristic: the 6 design-stage doc templates (01..06) and any file
  // whose name contains "arch". We exclude 01-current-state and
  // 06-acceptance because those are workspace-dimension concerns, not
  // architecture notes per se.
  for (const f of files) {
    const lower = f.toLowerCase();
    const matchesTemplate = /^0[3-5]-.*\.md$/.test(f);
    const matchesName = lower.includes("arch");
    if (!matchesTemplate && !matchesName) continue;
    if (lower.includes("acceptance")) continue;
    out.push({
      source_path: `docs/${f}`,
      target_path: `docs/architecture/${f.replace(/\.md$/, "")}.md`
    });
  }
  return out;
}

function scanReportCandidates(reportsDir: string): Array<{ rel_path: string; title: string; preview_excerpt?: string }> {
  if (!existsSync(reportsDir)) return [];
  let files: string[] = [];
  try {
    files = readdirSync(reportsDir);
  } catch {
    return [];
  }
  const out: Array<{ rel_path: string; title: string; preview_excerpt?: string }> = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const fullPath = join(reportsDir, f);
    let preview: string | undefined;
    try {
      const content = readFileSync(fullPath, "utf8");
      // First non-empty line after any H1 heading → title
      const lines = content.split("\n");
      const titleLine = lines.find((l) => l.startsWith("# ")) ?? lines[0] ?? f;
      const title = titleLine.replace(/^#\s*/, "").trim() || f;
      // First ~120 chars as preview
      preview = content.replace(/^#.*\n/, "").trim().slice(0, 120);
    } catch {
      // best-effort
    }
    out.push({
      rel_path: `reports/${f}`,
      title: f,
      ...(preview !== undefined ? { preview_excerpt: preview } : {})
    });
    if (out.length > 0) {
      const last = out[out.length - 1];
      try {
        const content = readFileSync(fullPath, "utf8");
        const lines = content.split("\n");
        const titleLine = lines.find((l) => l.startsWith("# "));
        if (titleLine) last.title = titleLine.replace(/^#\s*/, "").trim() || f;
      } catch { /* ignore */ }
    }
  }
  return out;
}

async function queryCognitiveForFeature(
  engine: EngineClient,
  feature: string,
  workspaceRoot: string
): Promise<{ assets: Array<{ kind: "behavior" | "state-machine" | "domain" | "business-rule" | "capability-map"; id: string; repo?: string }>; total_in_index: number }> {
  try {
    const result = await engine.run(
      { capabilityId: "cdr.query", input: { created_by_feature: feature, limit: 20 }, workspaceRoot },
      { workspaceRoot, dimension: "workspace" }
    );
    if (!result.ok) return { assets: [], total_in_index: 0 };
    const data = result.data as { results?: Array<{ kind: string; id: string; repo?: string }>; total?: number } | undefined;
    const results = data?.results ?? [];
    const total = data?.total ?? results.length;
    const assets = results
      .filter((r) => ["behavior", "state-machine", "domain", "business-rule", "capability-map"].includes(r.kind))
      .map((r) => ({
        kind: r.kind as "behavior" | "state-machine" | "domain" | "business-rule" | "capability-map",
        id: r.id,
        ...(r.repo ? { repo: r.repo } : {})
      }));
    return { assets, total_in_index: total };
  } catch {
    return { assets: [], total_in_index: 0 };
  }
}

function parseFeatureText(text: string, workspaceRoot: string): FeatureSummary[] {
  // The engine's feature.status returns text like:
  //   Features (2):
  //     - payment-refactor
  //     - auth-overhaul
  // We read each feature's reports/feature-progress.md for the stage.
  const out: FeatureSummary[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*-\s+(\S+)\s*$/);
    if (m) {
      const name = m[1];
      out.push({
        name,
        stage: null,
        active: true,
        openedAt: new Date(0).toISOString()
      });
    }
  }
  // Best-effort: read progress for the first few features
  for (const f of out) {
    try {
      const progressPath = `${workspaceRoot}/features/${f.name}/reports/feature-progress.md`;
      if (existsSync(progressPath)) {
        const content = readFileSync(progressPath, "utf8");
        const m = content.match(/## Stage: (\S+)/);
        if (m) f.stage = m[1];
      }
    } catch {
      // ignore — service stays best-effort
    }
  }
  return out;
}
