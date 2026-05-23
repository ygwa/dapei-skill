import { CapabilityError } from "./types.ts";

export type EvidenceKind = "fact" | "inference" | "unknown";
export type ConfidenceLevel = "high" | "medium" | "low";
export type ArtifactType = "behavior" | "state-machine";

export interface SourceRef {
  file: string;
  line?: number;
  repo?: string;
}

export interface ConfidenceBlock {
  level: ConfidenceLevel;
  evidence_type?: string;
  kind: EvidenceKind;
}

export interface EvidenceFields {
  confidence: ConfidenceBlock;
  sources?: SourceRef[];
  derived_from?: string[];
  reason?: string;
  investigation_hint?: string;
}

const ID_PATTERN = /^[a-z0-9-]+$/;
const ENTRY_TYPES = new Set(["api", "mq", "cron", "rpc", "cache", "search", "other"]);
const WRITE_OPS = new Set(["insert", "update", "delete", "upsert", "read"]);
const LEVELS = new Set(["high", "medium", "low"]);
const KINDS = new Set(["fact", "inference", "unknown"]);

function asObject(v: unknown, path: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new CapabilityError("INVALID_ARTIFACT", `${path} must be an object`);
  }
  return v as Record<string, unknown>;
}

function requireString(v: unknown, path: string): string {
  if (typeof v !== "string" || !v.trim()) {
    throw new CapabilityError("INVALID_ARTIFACT", `${path} must be a non-empty string`);
  }
  return v.trim();
}

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function parseSources(raw: unknown, path: string): SourceRef[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new CapabilityError("INVALID_ARTIFACT", `${path} must be an array`);
  return raw.map((item, i) => {
    const obj = asObject(item, `${path}[${i}]`);
    const file = requireString(obj.file, `${path}[${i}].file`);
    const line = typeof obj.line === "number" ? obj.line : undefined;
    const repo = optionalString(obj.repo);
    return { file, line, repo };
  });
}

export function parseConfidence(raw: unknown, path = "confidence"): ConfidenceBlock {
  const obj = asObject(raw, path);
  const level = requireString(obj.level, `${path}.level`);
  const kind = requireString(obj.kind, `${path}.kind`);
  if (!LEVELS.has(level)) throw new CapabilityError("INVALID_ARTIFACT", `${path}.level must be high|medium|low`);
  if (!KINDS.has(kind)) throw new CapabilityError("INVALID_ARTIFACT", `${path}.kind must be fact|inference|unknown`);
  const evidence_type = optionalString(obj.evidence_type);
  return { level: level as ConfidenceLevel, kind: kind as EvidenceKind, evidence_type };
}

export function validateEvidenceFields(fields: EvidenceFields, artifactLabel: string): string[] {
  const errors: string[] = [];
  const { confidence, sources = [], derived_from = [], reason } = fields;

  if (!confidence) {
    errors.push(`${artifactLabel}: missing confidence block`);
    return errors;
  }

  if (confidence.kind === "fact") {
    if (!sources.length) errors.push(`${artifactLabel}: kind=fact requires sources[]`);
  } else if (confidence.kind === "inference") {
    if (!derived_from.length) errors.push(`${artifactLabel}: kind=inference requires derived_from[]`);
  } else if (confidence.kind === "unknown") {
    if (!reason) errors.push(`${artifactLabel}: kind=unknown requires reason`);
  }

  return errors;
}

export function validateBehaviorArtifact(doc: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const id = optionalString(doc.id);
  if (!id) errors.push("behavior: missing id");
  else if (!ID_PATTERN.test(id)) errors.push("behavior: id must match ^[a-z0-9-]+$");

  const entry = doc.entry;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    errors.push("behavior: missing entry object");
  } else {
    const entryObj = entry as Record<string, unknown>;
    const type = optionalString(entryObj.type);
    if (!type) errors.push("behavior: entry.type is required");
    else if (!ENTRY_TYPES.has(type)) errors.push(`behavior: entry.type must be one of ${[...ENTRY_TYPES].join("|")}`);
  }

  if (Array.isArray(doc.writes)) {
    for (const [i, w] of doc.writes.entries()) {
      if (!w || typeof w !== "object" || Array.isArray(w)) {
        errors.push(`behavior: writes[${i}] must be an object`);
        continue;
      }
      const wo = w as Record<string, unknown>;
      const op = optionalString(wo.operation);
      if (op && !WRITE_OPS.has(op)) errors.push(`behavior: writes[${i}].operation invalid`);
    }
  }

  if (doc.events !== undefined && !Array.isArray(doc.events)) errors.push("behavior: events must be an array");
  if (doc.calls !== undefined && !Array.isArray(doc.calls)) errors.push("behavior: calls must be an array");
  if (doc.risks !== undefined && !Array.isArray(doc.risks)) errors.push("behavior: risks must be an array");

  try {
    const confidence = parseConfidence(doc.confidence);
    const sources = parseSources(doc.sources, "sources");
    const derived_from = Array.isArray(doc.derived_from)
      ? doc.derived_from.map((x) => String(x))
      : [];
    const reason = optionalString(doc.reason);
    errors.push(
      ...validateEvidenceFields(
        { confidence, sources, derived_from, reason, investigation_hint: optionalString(doc.investigation_hint) },
        `behavior:${id || "?"}`
      )
    );
  } catch (e: any) {
    if (e instanceof CapabilityError) errors.push(e.message);
    else errors.push("behavior: invalid confidence block");
  }

  return errors;
}

export function validateStateMachineArtifact(doc: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const entity = optionalString(doc.entity);
  if (!entity) errors.push("state-machine: missing entity");

  if (!Array.isArray(doc.states) || doc.states.length === 0) {
    errors.push("state-machine: states must be a non-empty array");
  }

  if (!Array.isArray(doc.transitions)) {
    errors.push("state-machine: transitions must be an array");
  } else {
    for (const [i, t] of doc.transitions.entries()) {
      if (!t || typeof t !== "object" || Array.isArray(t)) {
        errors.push(`state-machine: transitions[${i}] must be an object`);
        continue;
      }
      const tr = t as Record<string, unknown>;
      if (!optionalString(tr.trigger) && tr.trigger !== null) errors.push(`state-machine: transitions[${i}].trigger is required`);
      if (tr.to === undefined || tr.to === "") errors.push(`state-machine: transitions[${i}].to is required`);
    }
  }

  try {
    const confidence = parseConfidence(doc.confidence);
    const sources = parseSources(doc.sources, "sources");
    const derived_from = Array.isArray(doc.derived_from)
      ? doc.derived_from.map((x) => String(x))
      : [];
    const reason = optionalString(doc.reason);
    errors.push(
      ...validateEvidenceFields(
        { confidence, sources, derived_from, reason, investigation_hint: optionalString(doc.investigation_hint) },
        `state-machine:${entity || "?"}`
      )
    );
  } catch (e: any) {
    if (e instanceof CapabilityError) errors.push(e.message);
    else errors.push("state-machine: invalid confidence block");
  }

  return errors;
}

export function validateArtifact(type: ArtifactType, doc: Record<string, unknown>): string[] {
  if (type === "behavior") return validateBehaviorArtifact(doc);
  return validateStateMachineArtifact(doc);
}

export function assertValidArtifact(type: ArtifactType, doc: Record<string, unknown>): void {
  const errors = validateArtifact(type, doc);
  if (errors.length) {
    throw new CapabilityError("INVALID_ARTIFACT", errors.join("; "));
  }
}
