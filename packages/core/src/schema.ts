import { CapabilityError } from "./types.ts";
import type { Json } from "./types.ts";

function jsonTypeOf(v: Json): "string" | "number" | "boolean" | "object" | "array" | "null" {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v as "string" | "number" | "boolean" | "object";
}

// Documentation-only TypeScript shapes for cognitive artifacts.
// Runtime validation lives in evidence.ts (validateArtifact) against the JSON
// schemas under .dapei/schemas/*.yaml — do not bypass that with these aliases.

import type { ConfidenceBlock, SourceRef } from "./evidence.ts";

export interface BehaviorSpec {
  id: string;
  repo?: string;
  entry: { type: "api" | "mq" | "cron" | "rpc" | "cache" | "search" | "other"; method?: string; path?: string; topic?: string; schedule?: string; handler?: string };
  writes?: Array<{ table?: string; target?: string; operation?: "insert" | "update" | "delete" | "upsert" | "read"; fields?: string[] }>;
  events?: string[];
  calls?: string[];
  risks?: string[];
  confidence: ConfidenceBlock;
  sources?: SourceRef[];
  derived_from?: string[];
  reason?: string;
  investigation_hint?: string;
}

export interface DomainSpec {
  domain: string;
  name?: string;
  description?: string;
  modules?: Array<{ name: string; description?: string; responsibilities?: string[] }>;
  derived_from: string[];
  confidence: ConfidenceBlock;
  sources?: SourceRef[];
  repo?: string;
  reason?: string;
}

export interface CapabilityMapSpec {
  product: string;
  capabilities: Array<{ id: string; name: string; description?: string; domains?: string[] }>;
}

// ---------------------------------------------------------------------------
// v0.10 — extend validateInputSchema with items, nested properties, $ref.
//
// The base shape (type/enum/minLength/required/additionalProperties) is
// unchanged. New optional fields on a property def:
//
//   items?: PropertyDef
//     When type === "array", each element is validated against this
//     def. Nested arrays-of-arrays work via recursive items.
//
//   properties?: Record<string, PropertyDef>
//     When type === "object", each key is validated against the
//     nested def. additionalProperties on the nested def is
//     independent of the top-level flag.
//
//   $ref?: "SourceRef" | "ConfidenceBlock"
//     Lightweight named reference. The two registered refs match
//     the most common v0.10 shapes — capability authors don't need
//     to repeat the field list. Resolved refs behave exactly like
//     the resolved def.
//
// Error messages carry the dotted/bracketed path so callers see
// e.g. `field 'sources[0].file' must be string` rather than the
// top-level field name alone.
// ---------------------------------------------------------------------------

export interface PropertyDef {
  type?: "string" | "number" | "boolean" | "object" | "array";
  enum?: Array<string | number | boolean>;
  minLength?: number;
  items?: PropertyDef;
  properties?: Record<string, PropertyDef>;
  required?: string[];
  additionalProperties?: boolean;
  $ref?: "SourceRef" | "ConfidenceBlock";
}

export interface InputSchema {
  required?: string[];
  properties?: Record<string, PropertyDef>;
  additionalProperties?: boolean;
}

const REF_DEFS: Record<string, PropertyDef> = {
  SourceRef: {
    type: "object",
    required: ["file"],
    additionalProperties: true,
    properties: {
      file: { type: "string", minLength: 1 },
      line: { type: "number" },
      symbol_handle: { type: "string" },
      repo: { type: "string" }
    }
  },
  ConfidenceBlock: {
    type: "object",
    required: ["level", "kind"],
    additionalProperties: true,
    properties: {
      level: { type: "string", enum: ["high", "medium", "low"] },
      kind: { type: "string", enum: ["fact", "inference", "unknown"] },
      evidence_type: { type: "string" }
    }
  }
};

function resolveRef(def: PropertyDef): PropertyDef {
  if (def.$ref && REF_DEFS[def.$ref]) {
    return { ...REF_DEFS[def.$ref], ...def };
  }
  return def;
}

function validateProperty(
  value: Json,
  def: PropertyDef,
  path: string
): void {
  const effective = resolveRef(def);

  if (effective.type && jsonTypeOf(value) !== effective.type) {
    throw new CapabilityError("INVALID_INPUT", `field '${path}' must be ${effective.type}`);
  }

  if (effective.minLength !== undefined && typeof value === "string" && value.length < effective.minLength) {
    throw new CapabilityError("INVALID_INPUT", `field '${path}' must have minLength ${effective.minLength}`);
  }

  if (effective.enum && !effective.enum.includes(value as string | number | boolean)) {
    throw new CapabilityError("INVALID_INPUT", `field '${path}' must be one of: ${effective.enum.join(", ")}`);
  }

  if (effective.type === "array" && Array.isArray(value)) {
    if (effective.items) {
      for (let i = 0; i < value.length; i++) {
        validateProperty(value[i] as Json, effective.items, `${path}[${i}]`);
      }
    }
  }

  if (effective.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, Json>;
    if (effective.required) {
      for (const k of effective.required) {
        if (obj[k] === undefined || obj[k] === null || obj[k] === "") {
          throw new CapabilityError("INVALID_INPUT", `missing field: ${path}.${k}`);
        }
      }
    }
    if (effective.properties) {
      for (const [k, childDef] of Object.entries(effective.properties)) {
        if (obj[k] === undefined) continue;
        validateProperty(obj[k] as Json, childDef, `${path}.${k}`);
      }
    }
    if (effective.additionalProperties === false) {
      const allow = new Set(Object.keys(effective.properties || {}));
      if (effective.required) for (const k of effective.required) allow.add(k);
      for (const k of Object.keys(obj)) {
        if (!allow.has(k)) {
          throw new CapabilityError("INVALID_INPUT", `unexpected field: ${path}.${k}`);
        }
      }
    }
  }
}

export function validateInputSchema(input: Record<string, Json>, schema: InputSchema): void {
  if (schema.required) {
    for (const k of schema.required) {
      if (input[k] === undefined || input[k] === null || input[k] === "") {
        throw new CapabilityError("INVALID_INPUT", `missing field: ${k}`);
      }
    }
  }

  const props = schema.properties || {};
  for (const [key, def] of Object.entries(props)) {
    const value = input[key];
    if (value === undefined) continue;
    validateProperty(value, def, key);
  }

  if (schema.additionalProperties === false) {
    const allow = new Set(Object.keys(props));
    if (schema.required) for (const k of schema.required) allow.add(k);
    for (const k of Object.keys(input)) {
      if (!allow.has(k) && k !== "confirmed" && k !== "__confirmed" && k !== "force" && k !== "feature") {
        throw new CapabilityError("INVALID_INPUT", `unexpected field: ${k}`);
      }
    }
  }
}
