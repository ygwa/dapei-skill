import { existsSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { CapabilityError } from "@dapei/core/types";
import { cognitivePaths, loadCognitiveIndex } from "@dapei/core/cognitive-index";
import { parseYamlDocument } from "@dapei/core/yaml-doc";
import { requireFields } from "@dapei/core/internal/shared";
import { read, workspacePaths, listFilesRecursively } from "@dapei/runtime-adapters/system";
import { parseYamlDocumentSafe, readBehaviorDetails, type AnyCap } from "./internal/shared.ts";

// ---------------------------------------------------------------------------
// Capability: cdr.query (cross-cut read-only search)
//
// Semantic filters: event / writes_table / calls_target / target_repo.
// Origin filter: created_by_feature. Read-only.
// ---------------------------------------------------------------------------

export const cdrQuery: AnyCap = {
  id: "cdr.query",
  version: "1.0.0",
  inputSchema: {
    properties: {
      target: {
        type: "string",
        enum: ["any", "behavior", "state-machine", "business-rule", "domain", "capability-map"]
      },
      entity: { type: "string" },
      id_contains: { type: "string" },
      event: { type: "string" },
      writes_table: { type: "string" },
      calls_target: { type: "string" },
      target_repo: { type: "string" },
      created_by_feature: { type: "string" },
      repo: { type: "string" },
      limit: { type: "number" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const index = loadCognitiveIndex(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    const idContains = input.id_contains ? String(input.id_contains).toLowerCase() : undefined;
    const eventFilter = input.event ? String(input.event) : undefined;
    const writesTableFilter = input.writes_table ? String(input.writes_table) : undefined;
    const callsTargetFilter = input.calls_target ? String(input.calls_target) : undefined;
    const targetRepoFilter = input.target_repo ? String(input.target_repo) : undefined;
    const createdByFeatureFilter = input.created_by_feature ? String(input.created_by_feature) : undefined;
    const repoFilter = input.repo ? String(input.repo) : undefined;
    const entityFilter = input.entity ? String(input.entity) : undefined;
    const targetKind = (input.target && input.target !== "any")
      ? String(input.target)
      : undefined;
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 500);

    type Result = {
      kind: string;
      id: string;
      repo?: string;
      path: string;
      summary: string;
      sources: Array<{ file?: string; line?: number }>;
    };
    const results: Result[] = [];

    const includeBehavior = !targetKind || targetKind === "behavior";
    const includeState = !targetKind || targetKind === "state-machine";
    const includeRule = !targetKind || targetKind === "business-rule";
    const includeDomain = !targetKind || targetKind === "domain";
    const includeCapMap = !targetKind || targetKind === "capability-map";

    if (includeBehavior) {
      for (const b of index.behaviors) {
        if (repoFilter && b.repo !== repoFilter) continue;
        if (idContains && !(b.id || "").toLowerCase().includes(idContains)) continue;
        if (createdByFeatureFilter && (b as unknown as { created_by_feature?: string }).created_by_feature !== createdByFeatureFilter) continue;
        if (eventFilter || writesTableFilter || callsTargetFilter || targetRepoFilter) {
          const details = readBehaviorDetails(ctx.rootDir, b.path);
          if (eventFilter && !(details.events || []).some((e) => String(e).includes(eventFilter))) continue;
          if (writesTableFilter && !(details.writes || []).some((w) => String(w.table || "").includes(writesTableFilter))) continue;
          if (callsTargetFilter && !(details.calls || []).some((c) => {
            const t = typeof c === "string" ? c : (c as { target?: string }).target;
            return t ? String(t).includes(callsTargetFilter) : false;
          })) continue;
          if (targetRepoFilter && !(details.calls || []).some((c) => {
            if (typeof c === "string") return false;
            return ((c as { target_repo?: string }).target_repo) === targetRepoFilter;
          })) continue;
        }
        const summary = (b as unknown as { description?: string }).description
          || `Behavior ${b.id} (${b.kind})`;
        results.push({
          kind: "behavior",
          id: b.id,
          repo: b.repo,
          path: b.path,
          summary: String(summary).slice(0, 200),
          sources: []
        });
      }
    }

// behavior-shaped filters (event / writes_table / calls_target / target_repo)
// don't apply to state-machines; suppress them when any such filter is set
    const behaviorShapedFilters = !!(eventFilter || writesTableFilter || callsTargetFilter || targetRepoFilter);
    const includeStateShaped = (!targetKind || targetKind === "state-machine") && !behaviorShapedFilters;

    if (includeStateShaped) {
      for (const s of index.state_machines) {
        if (repoFilter && s.repo !== repoFilter) continue;
        if (entityFilter && s.entity !== entityFilter) continue;
        if (idContains && !(s.entity || "").toLowerCase().includes(idContains)) continue;
        if (createdByFeatureFilter && (s as unknown as { created_by_feature?: string }).created_by_feature !== createdByFeatureFilter) continue;
        results.push({
          kind: "state-machine",
          id: s.entity,
          repo: s.repo,
          path: s.path,
          summary: `State machine for ${s.entity} (${s.kind})`,
          sources: []
        });
      }
    }

    if (includeRule) {
      for (const r of index.business_rules) {
        if (repoFilter && r.repo !== repoFilter) continue;
        if (idContains && !(r.id || "").toLowerCase().includes(idContains)) continue;
        if (callsTargetFilter) {
          const apStr = JSON.stringify((r as unknown as { applies_to?: unknown[] }).applies_to || []);
          if (!apStr.includes(callsTargetFilter)) continue;
        }
        if (createdByFeatureFilter && (r as unknown as { created_by_feature?: string }).created_by_feature !== createdByFeatureFilter) continue;
        results.push({
          kind: "business-rule",
          id: r.id,
          repo: r.repo,
          path: r.path,
          summary: `Rule ${r.id} (${r.kind})`,
          sources: []
        });
      }
    }

    if (includeDomain) {
      const domainFiles = listFilesRecursively(cp.domainDir, [".yaml", ".yml"], 200);
      for (const df of domainFiles) {
        try {
          const doc = parseYamlDocument(read(df));
          const name = String(doc.domain || doc.name || "");
          if (!name) continue;
          if (idContains && !name.toLowerCase().includes(idContains)) continue;
          if (createdByFeatureFilter && (doc as { created_by_feature?: string }).created_by_feature !== createdByFeatureFilter) continue;
          results.push({
            kind: "domain",
            id: name,
            path: relative(ctx.rootDir, df),
            summary: String(doc.description || `Domain ${name}`).slice(0, 200),
            sources: []
          });
        } catch {
          // skip malformed
        }
      }
    }

    if (includeCapMap) {
      const capFiles = listFilesRecursively(cp.capabilityDir, [".yaml", ".yml"], 50);
      for (const cf of capFiles) {
        try {
          const doc = parseYamlDocument(read(cf));
          const product = String(doc.product || "");
          if (idContains && !product.toLowerCase().includes(idContains)) continue;
          results.push({
            kind: "capability-map",
            id: product || basename(cf, ".yaml"),
            path: relative(ctx.rootDir, cf),
            summary: `Capability map for ${product || basename(cf, ".yaml")}`,
            sources: []
          });
        } catch {
          // skip malformed
        }
      }
    }

    const total = results.length;
    const capped = results.slice(0, limit);
    return {
      ok: true,
      data: {
        results: capped,
        total,
        next_step: total > limit
          ? `narrow filter or increase limit; matched ${total}, returned ${limit}`
          : ""
      },
      sideEffects: [],
      reportFragments: [`cdr.query matched ${total} asset(s)`]
    };
  }
};

// ---------------------------------------------------------------------------
// Capability: cdr.pipeline.status
//
// Per-phase status (done / blocked / skipped) + artifacts_count + next_action
// with exact capability + input shape the AI should call next.
// Closes phase 2-6 orchestration: engine tells AI what to call next.
// ---------------------------------------------------------------------------

type PhaseId =
  | "profile"
  | "entries"
  | "behavior"
  | "state"
  | "domain"
  | "rule"
  | "capability-map"
  | "doc";

interface PhaseStatus {
  id: PhaseId;
  status: "done" | "blocked" | "skipped";
  artifacts_count: number;
  next_action?: {
    capability: string;
    input_template: { repo?: string; required_fields: Array<{ name: string; type: string; description: string }> };
    hint: string;
  };
}

export const cdrPipelineStatus: AnyCap = {
  id: "cdr.pipeline.status",
  version: "1.0.0",
  inputSchema: {
    required: ["repo"],
    properties: {
      repo: { type: "string", minLength: 1 },
      up_to_phase: {
        type: "string",
        enum: ["profile", "entries", "behavior", "state", "domain", "rule", "capability-map", "doc", "all"]
      }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["repo"]);
    const p = workspacePaths(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    const repo = String(input.repo);
    const repoPath = join(p.reposDir, repo);
    const upTo = String(input.up_to_phase || "all");

    if (!existsSync(repoPath)) {
      throw new CapabilityError("REPO_MISSING", `repos/${repo} not found`);
    }

    const index = loadCognitiveIndex(ctx.rootDir);
    const behaviorsForRepo = index.behaviors.filter((b) => b.repo === repo);
    const stateMachinesForRepo = index.state_machines.filter((s) => s.repo === repo);
    const businessRulesForRepo = index.business_rules.filter((r) => r.repo === repo);

    const phases: PhaseStatus[] = [];

    const profileDone = existsSync(join(cp.profilesDir, `${repo}.yaml`));
    phases.push({
      id: "profile",
      status: profileDone ? "done" : "blocked",
      artifacts_count: profileDone ? 1 : 0,
      next_action: profileDone ? undefined : {
        capability: "cdr.profile",
        input_template: { repo, required_fields: [{ name: "repo", type: "string", description: "the repo name (as registered in repos.yaml)" }] },
        hint: "start the pipeline by writing the L0 tech profile"
      }
    });

    const entriesFile = join(cp.entriesDir, `${repo}.yaml`);
    const entriesDoc = existsSync(entriesFile) ? parseYamlDocumentSafe(read(entriesFile)) : null;
    const candidateCount = entriesDoc && Array.isArray((entriesDoc as { entries?: unknown[] }).entries)
      ? (entriesDoc as { entries: unknown[] }).entries.length
      : 0;
    const confirmedCount = entriesDoc && Array.isArray((entriesDoc as { entries?: Array<{ status?: string }> }).entries)
      ? (entriesDoc as { entries: Array<{ status?: string }> }).entries.filter((e) => e.status === "confirmed").length
      : 0;
    const entriesDone = confirmedCount > 0;
    const entriesBlocked = !profileDone;
    phases.push({
      id: "entries",
      status: entriesBlocked ? "blocked" : (entriesDone ? "done" : "blocked"),
      artifacts_count: candidateCount,
      next_action: entriesBlocked ? undefined : (entriesDone ? undefined : {
        capability: "cdr.entries.candidate",
        input_template: { repo, required_fields: [{ name: "repo", type: "string", description: "the repo name" }] },
        hint: candidateCount > 0
          ? `AI: read candidate files, then cdr.entries.propose per entry with sources[]`
          : "no candidate entries yet — engine will list code files"
      })
    });

    phases.push({
      id: "behavior",
      status: entriesBlocked ? "blocked" : (behaviorsForRepo.length > 0 ? "done" : "blocked"),
      artifacts_count: behaviorsForRepo.length,
      next_action: entriesBlocked || behaviorsForRepo.length > 0 ? undefined : {
        capability: "cdr.behavior.upsert",
        input_template: {
          repo,
          required_fields: [
            { name: "id", type: "string", description: "behavior id, e.g. 'order-create'" },
            { name: "repo", type: "string", description: "the repo name" },
            { name: "entry", type: "object", description: "HTTP/method/path or similar" },
            { name: "confidence", type: "object", description: "kind=fact requires sources[]" }
          ]
        },
        hint: "trace each confirmed entry's calls/writes/events; one behavior per logical action"
      }
    });

    const stateCount = stateMachinesForRepo.length;
    phases.push({
      id: "state",
      status: behaviorsForRepo.length === 0 ? "blocked" : (stateCount > 0 ? "done" : "blocked"),
      artifacts_count: stateCount,
      next_action: behaviorsForRepo.length === 0 || stateCount > 0 ? undefined : {
        capability: "cdr.state.derive",
        input_template: {
          repo,
          required_fields: [
            { name: "entity", type: "string", description: "entity name, e.g. 'Order'" },
            { name: "behaviors", type: "array", description: "behavior ids for this entity" }
          ]
        },
        hint: "pick a central entity (Order / Payment / etc) and derive its lifecycle"
      }
    });

    const domainForRepo = existsSync(cp.domainDir)
      ? readdirSync(cp.domainDir).some((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      : false;
    phases.push({
      id: "domain",
      status: behaviorsForRepo.length === 0 ? "blocked" : (domainForRepo ? "done" : "blocked"),
      artifacts_count: domainForRepo ? 1 : 0,
      next_action: behaviorsForRepo.length === 0 || domainForRepo ? undefined : {
        capability: "cdr.domain.compose",
        input_template: {
          repo,
          required_fields: [
            { name: "domain", type: "string", description: "kebab-case name" },
            { name: "description", type: "string", description: "1-2 sentence summary" },
            { name: "derived_from", type: "array", description: "behavior ids (P1 red line)" }
          ]
        },
        hint: "cluster behaviors by entity / responsibility; derived_from required"
      }
    });

    phases.push({
      id: "rule",
      status: businessRulesForRepo.length > 0 ? "done" : "skipped",
      artifacts_count: businessRulesForRepo.length,
      next_action: businessRulesForRepo.length > 0 ? undefined : {
        capability: "cdr.business.compose",
        input_template: {
          repo,
          required_fields: [
            { name: "id", type: "string", description: "rule id, kebab-case" },
            { name: "kind", type: "string", description: "invariant / constraint / authorization / sla / compensation" },
            { name: "applies_to", type: "array", description: "behavior ids this rule constrains" }
          ]
        },
        hint: "optional but valuable when SLA / authorization / compensation patterns exist"
      }
    });

    const capMapDone = existsSync(join(cp.capabilityDir, "product-map.yaml"));
    phases.push({
      id: "capability-map",
      status: capMapDone ? "done" : "blocked",
      artifacts_count: capMapDone ? 1 : 0,
      next_action: capMapDone ? undefined : {
        capability: "cdr.capability.map.init",
        input_template: {
          required_fields: [
            { name: "product", type: "string", description: "the product this map belongs to" },
            { name: "capabilities", type: "array", description: "list of {id, name, spans_repos, ...}" }
          ]
        },
        hint: "wire domains into the L1 capability map"
      }
    });

    const docDone = existsSync(join(ctx.rootDir, ".dapei", "docs-portal", "index.md"));
    phases.push({
      id: "doc",
      status: capMapDone ? (docDone ? "done" : "blocked") : "blocked",
      artifacts_count: docDone ? 1 : 0,
      next_action: !capMapDone || docDone ? undefined : {
        capability: "cdr.doc.generate",
        input_template: { required_fields: [] },
        hint: "render the VitePress portal at .dapei/docs-portal/"
      }
    });

    const filtered = upTo === "all"
      ? phases
      : phases.filter((p) => {
          const order: PhaseId[] = ["profile", "entries", "behavior", "state", "domain", "rule", "capability-map", "doc"];
          return order.indexOf(p.id) <= order.indexOf(upTo as PhaseId);
        });

    const doneOrSkipped = filtered.filter((p) => p.status === "done" || p.status === "skipped").length;
    const doneCount = filtered.filter((p) => p.status === "done").length;
    const overall = doneOrSkipped === filtered.length
      ? "complete"
      : doneCount === 0
        ? "empty"
        : "partial";

    const nextStep = overall === "complete"
      ? "all phases done; portal generated"
      : overall === "empty"
        ? `start with ${phases[0].next_action?.capability || "cdr.profile"}`
        : (filtered.find((p) => p.status !== "done" && p.status !== "skipped")?.next_action?.hint
            || "continue with the next unfinished phase");

    return {
      ok: true,
      data: {
        repo,
        phases: filtered,
        overall_status: overall,
        next_step: nextStep
      },
      sideEffects: [],
      reportFragments: [`pipeline status for ${repo}: ${overall} (${doneCount}/${filtered.length})`]
    };
  }
};
