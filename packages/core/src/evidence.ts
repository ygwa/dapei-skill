import { CapabilityError } from "./types.ts";

export type EvidenceKind = "fact" | "inference" | "unknown";
export type ConfidenceLevel = "high" | "medium" | "low";
export type ArtifactType = "behavior" | "state-machine" | "domain" | "capability-map" | "business-rule";
export type BusinessRuleKind = "invariant" | "constraint" | "authorization" | "sla" | "compensation";

export interface SourceRef {
  file: string;
  line?: number;
  symbol_handle?: string;
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
const BUSINESS_RULE_KINDS = new Set(["invariant", "constraint", "authorization", "sla", "compensation"]);

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
    const symbol_handle = optionalString(obj.symbol_handle);
    const repo = optionalString(obj.repo);
    return { file, line, symbol_handle, repo };
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
  if (doc.calls !== undefined && !Array.isArray(doc.calls)) {
    errors.push("behavior: calls must be an array");
  } else if (Array.isArray(doc.calls)) {
    // v0.6 — calls[] accepts a mix of legacy strings and structured objects.
    // Structured objects must carry `target` (the callee name) and may carry
    // `protocol` (call transport), `evidence` (a single SourceRef pointing
    // at the call site in code), and `target_repo` (the repo that owns the
    // callee, when the AI can name it). Strings are accepted verbatim so
    // pre-v0.6 fixtures keep working.
    const CALL_PROTOCOLS = new Set(["http", "grpc", "mq", "event", "rpc", "other"]);
    for (const [i, raw] of (doc.calls as unknown[]).entries()) {
      if (typeof raw === "string") continue;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push(`behavior: calls[${i}] must be a string or an object`);
        continue;
      }
      const co = raw as Record<string, unknown>;
      if (!optionalString(co.target)) {
        errors.push(`behavior: calls[${i}].target is required for structured calls`);
      }
      const proto = optionalString(co.protocol);
      if (proto && !CALL_PROTOCOLS.has(proto)) {
        errors.push(`behavior: calls[${i}].protocol must be one of ${[...CALL_PROTOCOLS].join("|")}`);
      }
      // evidence is optional in v0.6 (the AI may not have located the
      // call site yet) but when present it must be a single SourceRef
      // object — not an array, since one call has one call site.
      if (co.evidence !== undefined) {
        if (!co.evidence || typeof co.evidence !== "object" || Array.isArray(co.evidence)) {
          errors.push(`behavior: calls[${i}].evidence must be a single SourceRef object`);
        } else {
          const ev = co.evidence as Record<string, unknown>;
          if (!optionalString(ev.file)) {
            errors.push(`behavior: calls[${i}].evidence.file is required`);
          }
        }
      }
    }
  }
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

export function validateDomainArtifact(doc: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const domain = optionalString(doc.domain);
  if (!domain) errors.push("domain: missing domain name");
  else if (!ID_PATTERN.test(domain.toLowerCase().replace(/[^a-z0-9-]/g, "-"))) errors.push("domain: name must match ID pattern");

  if (doc.description !== undefined && typeof doc.description !== "string") {
    errors.push("domain: description must be a string");
  }

  if (Array.isArray(doc.modules)) {
    for (const [i, m] of doc.modules.entries()) {
      if (!m || typeof m !== "object" || Array.isArray(m)) {
        errors.push(`domain: modules[${i}] must be an object`);
        continue;
      }
      const mo = m as Record<string, unknown>;
      if (!optionalString(mo.name)) errors.push(`domain: modules[${i}].name is required`);
    }
  }

  try {
    const confidence = parseConfidence(doc.confidence || { level: "medium", kind: "inference" });
    const sources = parseSources(doc.sources, "sources");
    const derived_from = Array.isArray(doc.derived_from)
      ? doc.derived_from.map((x) => String(x))
      : [];
    const reason = optionalString(doc.reason);

    // P1 Rule: domain artifacts require derived_from
    if (!derived_from.length) {
      errors.push(`domain:${domain || "?"}: domain artifacts must specify derived_from referring to behavior IDs`);
    }

    errors.push(
      ...validateEvidenceFields(
        { confidence, sources, derived_from, reason, investigation_hint: optionalString(doc.investigation_hint) },
        `domain:${domain || "?"}`
      )
    );
  } catch (e: any) {
    if (e instanceof CapabilityError) errors.push(e.message);
    else errors.push("domain: invalid confidence block");
  }

  return errors;
}

export function validateCapabilityMapArtifact(doc: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const product = optionalString(doc.product);
  if (!product) errors.push("capability-map: missing product name");

  if (!Array.isArray(doc.capabilities) || doc.capabilities.length === 0) {
    errors.push("capability-map: capabilities must be a non-empty array");
  } else {
    for (const [i, cap] of doc.capabilities.entries()) {
      if (!cap || typeof cap !== "object" || Array.isArray(cap)) {
        errors.push(`capability-map: capabilities[${i}] must be an object`);
        continue;
      }
      const c = cap as Record<string, unknown>;
      if (!optionalString(c.id)) errors.push(`capability-map: capabilities[${i}].id is required`);
      if (!optionalString(c.name)) errors.push(`capability-map: capabilities[${i}].name is required`);
      if (c.domains !== undefined && !Array.isArray(c.domains)) {
        errors.push(`capability-map: capabilities[${i}].domains must be an array`);
      }
    }
  }

  return errors;
}

export function validateBusinessRuleArtifact(doc: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const id = optionalString(doc.id);
  if (!id) errors.push("business-rule: missing id");
  else if (!ID_PATTERN.test(id)) errors.push("business-rule: id must match ^[a-z0-9-]+$");

  const kind = optionalString(doc.kind);
  if (!kind) {
    errors.push("business-rule: missing kind");
  } else if (!BUSINESS_RULE_KINDS.has(kind)) {
    errors.push(`business-rule: kind must be one of ${[...BUSINESS_RULE_KINDS].join("|")}`);
  }

  if (doc.applies_to !== undefined && !Array.isArray(doc.applies_to)) {
    errors.push("business-rule: applies_to must be an array");
  }

  if (doc.expr !== undefined && typeof doc.expr !== "string") {
    errors.push("business-rule: expr must be a string");
  }

  if (doc.description !== undefined && typeof doc.description !== "string") {
    errors.push("business-rule: description must be a string");
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
        `business-rule:${id || "?"}`
      )
    );
  } catch (e: any) {
    if (e instanceof CapabilityError) errors.push(e.message);
    else errors.push("business-rule: invalid confidence block");
  }

  return errors;
}

export function validateArtifact(type: ArtifactType, doc: Record<string, unknown>): string[] {
  if (type === "behavior") return validateBehaviorArtifact(doc);
  if (type === "state-machine") return validateStateMachineArtifact(doc);
  if (type === "domain") return validateDomainArtifact(doc);
  if (type === "capability-map") return validateCapabilityMapArtifact(doc);
  if (type === "business-rule") return validateBusinessRuleArtifact(doc);
  return [`unknown artifact type: ${type}`];
}

export function assertValidArtifact(type: ArtifactType, doc: Record<string, unknown>): void {
  const errors = validateArtifact(type, doc);
  if (errors.length) {
    throw new CapabilityError("INVALID_ARTIFACT", errors.join("; "));
  }
}
