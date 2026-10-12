import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CapabilityError } from "@dapei/core/types";
import { validateArtifact, type SourceRef } from "@dapei/core/evidence";
import { artifactRelativePath, cognitivePaths, loadCognitiveIndex, saveCognitiveIndex, upsertIndexEntry } from "@dapei/core/cognitive-index";
import { parseYamlDocument, stringifyYamlDocument, type YamlValue } from "@dapei/core/yaml-doc";
import { requireFields } from "@dapei/core/internal/shared";
import { ensureDir, read, write, workspacePaths } from "@dapei/runtime-adapters/system";
import { CodeGraphAdapter } from "@dapei/runtime-adapters/codegraph";
import { applyProvenance, provenanceFromContext } from "@dapei/core/provenance";
import { validateEvidencePoints, type AnyCap } from "./internal/shared.ts";

// ---------------------------------------------------------------------------
// 10. cdr.behavior.upsert
// ---------------------------------------------------------------------------

export const cdrBehaviorUpsert: AnyCap = {
  id: "cdr.behavior.upsert",
  version: "1.0.0",
  inputSchema: {
    required: ["id", "entry", "confidence"],
    properties: {
      id: { type: "string", minLength: 1 },
      repo: { type: "string" },
      entry: { type: "object" },
      steps: { type: "array" },
      writes: { type: "array" },
      events: { type: "array" },
      calls: { type: "array" },
      risks: { type: "array" },
      confidence: { type: "object" },
      sources: { type: "array" },
      derived_from: { type: "array" },
      reason: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const doc: Record<string, YamlValue> = {
      id: String(input.id),
      entry: input.entry as YamlValue
    };
    if (input.repo) doc.repo = String(input.repo);
    if (Array.isArray(input.steps)) doc.steps = input.steps as unknown as YamlValue;
    if (Array.isArray(input.writes)) doc.writes = input.writes as unknown as YamlValue;
    if (Array.isArray(input.events)) doc.events = input.events.map((x: unknown) => String(x)) as unknown as YamlValue;
    // v0.6 — structured calls[]. Preserve objects (v0.5 used calls.map(String)
    // which silently turned objects into the literal "[object Object]").
    // Legacy string calls pass through unchanged; object calls with `target`
    // / `protocol` / `target_repo` / `evidence` keep their structure.
    if (Array.isArray(input.calls)) {
      doc.calls = input.calls.map((c: unknown) => {
        if (typeof c === "string") return c as unknown as YamlValue;
        if (c && typeof c === "object" && !Array.isArray(c)) {
          const co = c as Record<string, unknown>;
          // v0.6 minimal validation: structured calls must have `target`.
          // Protocol is optional but if present must be a known string.
          if (typeof co.target !== "string" || !co.target.trim()) {
            throw new CapabilityError("INVALID_INPUT", "calls[0].target is required");
          }
          if (co.protocol !== undefined && (typeof co.protocol !== "string" || !["http", "grpc", "mq", "sql", "function"].includes(co.protocol))) {
            throw new CapabilityError("INVALID_INPUT", `structured call protocol must be one of http|grpc|mq|sql|function, got: ${String(co.protocol)}`);
          }
          return co as unknown as YamlValue;
        }
        throw new CapabilityError("INVALID_INPUT", "call entries must be strings or objects");
      }) as unknown as YamlValue;
    }
    if (Array.isArray(input.risks)) doc.risks = input.risks.map((x: unknown) => String(x)) as unknown as YamlValue;
    if (Array.isArray(input.sources)) doc.sources = input.sources as unknown as YamlValue;
    if (Array.isArray(input.derived_from)) doc.derived_from = input.derived_from.map((x: unknown) => String(x)) as unknown as YamlValue;
    if (input.reason) doc.reason = String(input.reason);
    doc.confidence = input.confidence as YamlValue;

    // v0.7 — CodeGraph refs cross-check. For each structured call that
    // carries an `evidence` SourceRef, ask the adapter whether the
    // named `target` appears in the call-graph neighborhood at that
    // file:line. When the CLI is present and the target is NOT in
    // refs, the call is rejected with INVALID_EVIDENCE — the user
    // has CodeGraph and expects accuracy. When the CLI is missing,
    // the check is skipped (graceful degradation) — the user has
    // accepted the absence by not installing the CLI. The single
    // doctor probe means every calls[] entry in one upsert
    // invocation shares one CLI invocation.
    if (Array.isArray(doc.calls) && input.repo) {
      const adapter = new CodeGraphAdapter(ctx.rootDir);
      if (adapter.isAvailable()) {
        const repoPath = join(workspacePaths(ctx.rootDir).reposDir, String(input.repo));
        for (let i = 0; i < (doc.calls as unknown[]).length; i++) {
          const c = (doc.calls as unknown[])[i];
          if (!c || typeof c !== "object") continue;
          const co = c as Record<string, unknown>;
          const evidence = co.evidence as Record<string, unknown> | undefined;
          if (!evidence || typeof evidence.file !== "string") continue;
          const refsRes = adapter.refs(repoPath, {
            file: String(evidence.file),
            line: typeof evidence.line === "number" ? evidence.line : undefined
          });
          if (!refsRes.available) continue;
          const target = String(co.target);
          const matched = refsRes.callees.some((cal) => {
            if (cal.name === target) return true;
            if (cal.name.endsWith("." + target)) return true;
            return false;
          });
          if (!matched) {
            throw new CapabilityError(
              "INVALID_EVIDENCE",
              `calls[${i}].target '${target}' not found in codegraph refs at ${evidence.file}:${evidence.line || 0}`
            );
          }
        }
      }
    }

    // P1: validate sources[] point at real code (file exists, line in range)
    const evidenceErrors = validateEvidencePoints(ctx, doc as Record<string, unknown>);
    if (evidenceErrors.length) {
      throw new CapabilityError("INVALID_EVIDENCE", evidenceErrors.join("; "));
    }

    const errors = validateArtifact("behavior", doc as Record<string, unknown>);
    if (errors.length) {
      throw new CapabilityError("INVALID_ARTIFACT", errors.join("; "));
    }

    const cp = cognitivePaths(ctx.rootDir);
    ensureDir(cp.behaviorDir);
    const relPath = artifactRelativePath("behavior", doc as Record<string, unknown>);
    const absPath = join(ctx.rootDir, relPath);
    const finalDoc = applyProvenance(doc as Record<string, unknown>, provenanceFromContext(ctx, "create"));
    const content = stringifyYamlDocument(finalDoc as unknown as Record<string, YamlValue>);
    write(absPath, content.endsWith("\n") ? content : `${content}\n`);

    const index = loadCognitiveIndex(ctx.rootDir);
    upsertIndexEntry(index, "behavior", relPath, finalDoc as unknown as Record<string, YamlValue>);
    saveCognitiveIndex(ctx.rootDir, index);

    return {
      ok: true,
      data: {
        type: "behavior",
        path: relPath,
        id: doc.id,
        kind: (input.confidence as Record<string, unknown>).kind
      },
      sideEffects: ["behavior upserted", "index updated"],
      reportFragments: [`upserted behavior ${doc.id}`],
      artifactPaths: [relPath]
    };
  }
};

// ---------------------------------------------------------------------------
// 11. cdr.state.derive
// ---------------------------------------------------------------------------

function extractStatesAndTransitionsFromBehavior(
  behaviorDoc: Record<string, unknown>
): { states: Set<string>; transitions: Array<Record<string, YamlValue>> } {
  const states = new Set<string>();
  const transitions: Array<Record<string, YamlValue>> = [];
  const id = String(behaviorDoc.id || "unknown");

  if (Array.isArray(behaviorDoc.writes)) {
    for (const w of behaviorDoc.writes) {
      const wo = w as Record<string, unknown>;
      if (wo.operation === "insert") states.add("CREATED");
    }
  }

  if (Array.isArray(behaviorDoc.events)) {
    for (const ev of behaviorDoc.events) {
      const eventName = String(ev);
      const parts = eventName.split(".");
      const tail = parts[parts.length - 1] || "";
      const stateHint = tail.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      if (stateHint && stateHint !== "CREATED") states.add(stateHint);
      transitions.push({
        trigger: eventName,
        from: "[*]",
        to: stateHint || "TBD",
        behavior_id: id
      });
    }
  }

  return { states, transitions };
}

export const cdrStateDerive: AnyCap = {
  id: "cdr.state.derive",
  version: "1.0.0",
  inputSchema: {
    required: ["entity", "behaviors"],
    properties: {
      entity: { type: "string", minLength: 1 },
      behaviors: { type: "array" },
      repo: { type: "string" },
      sources: { type: "array" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input as Record<string, import("@dapei/core/types").Json>, ["entity", "behaviors"]);
    const entity = String(input.entity);
    const behaviorIds: string[] = Array.isArray(input.behaviors)
      ? input.behaviors.map((b: unknown) => String(b))
      : [];
    const repo = input.repo ? String(input.repo) : undefined;

    if (!behaviorIds.length) {
      throw new CapabilityError("INVALID_INPUT", "behaviors[] must contain at least one behavior ID");
    }

    const cp = cognitivePaths(ctx.rootDir);
    const allStates = new Set<string>();
    const allTransitions: Array<Record<string, YamlValue>> = [];
    const derivedFrom: string[] = [];
    const missingBehaviors: string[] = [];

    for (const bid of behaviorIds) {
      // v0.4 — per-repo layout: try the flat path first (legacy), then any
      // per-repo subdirectory. We do not know which repo the behavior
      // lives under at this point (behaviorIds is a flat list), so we
      // glob one level deep under behaviorDir.
      const flatPath = join(cp.behaviorDir, `${bid}.yaml`);
      let behaviorPath: string | null = null;
      if (existsSync(flatPath)) {
        behaviorPath = flatPath;
      } else {
        const subdirs = readdirSync(cp.behaviorDir).filter((d) => {
          try {
            return existsSync(join(cp.behaviorDir, d, `${bid}.yaml`));
          } catch {
            return false;
          }
        });
        if (subdirs.length > 0) {
          behaviorPath = join(cp.behaviorDir, subdirs[0], `${bid}.yaml`);
        }
      }
      if (!behaviorPath) {
        missingBehaviors.push(bid);
        continue;
      }
      const doc = parseYamlDocument(read(behaviorPath)) as Record<string, unknown>;
      derivedFrom.push(String(doc.id || bid));
      const { states, transitions } = extractStatesAndTransitionsFromBehavior(doc);
      states.forEach((s) => allStates.add(s));
      transitions.forEach((t) => allTransitions.push(t));
    }

    if (missingBehaviors.length) {
      throw new CapabilityError("NOT_FOUND", `behaviors not found on disk: ${missingBehaviors.join(", ")}. Run cdr.behavior.upsert first.`);
    }

    if (!allStates.size) {
      allStates.add("CREATED");
      allStates.add("ACTIVE");
      allStates.add("CLOSED");
    }

    const stateNames = [...allStates];
    const initialState = stateNames[0];

    const draft: Record<string, YamlValue> = {
      entity,
      states: stateNames,
      transitions: allTransitions as unknown as YamlValue,
      confidence: { level: "medium", kind: "inference", evidence_type: "inferred_from_behaviors" },
      derived_from: derivedFrom,
      initial_state: initialState
    };
    if (repo) draft.repo = repo;
    if (Array.isArray(input.sources)) draft.sources = input.sources as unknown as YamlValue;

    // P1: validate sources[] point at real code
    const evidenceErrors = validateEvidencePoints(ctx, draft as Record<string, unknown>);
    if (evidenceErrors.length) {
      throw new CapabilityError("INVALID_EVIDENCE", evidenceErrors.join("; "));
    }

    const errors = validateArtifact("state-machine", draft as Record<string, unknown>);
    if (errors.length) {
      throw new CapabilityError("INVALID_ARTIFACT", errors.join("; "));
    }

    const relPath = artifactRelativePath("state-machine", draft as Record<string, unknown>);
    const absPath = join(ctx.rootDir, relPath);
    const finalDraft = applyProvenance(draft as Record<string, unknown>, provenanceFromContext(ctx, "create"));
    write(absPath, stringifyYamlDocument(finalDraft as unknown as Record<string, YamlValue>));

    const index = loadCognitiveIndex(ctx.rootDir);
    upsertIndexEntry(index, "state-machine", relPath, finalDraft as unknown as Record<string, YamlValue>);
    saveCognitiveIndex(ctx.rootDir, index);

    return {
      ok: true,
      data: {
        type: "state-machine",
        path: relPath,
        entity,
        states: stateNames,
        transitions: allTransitions,
        derived_from: derivedFrom,
        confidence: draft.confidence,
        note: "inference-level draft — Agent must confirm before kind=fact"
      },
      sideEffects: ["state machine draft written", "index updated"],
      reportFragments: [`derived state machine for ${entity} from ${derivedFrom.length} behavior(s)`],
      artifactPaths: [relPath]
    };
  }
};
