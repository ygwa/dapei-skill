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
// v0.10 — extend validateInputSchema with items and nested properties.
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
}

export interface InputSchema {
  required?: string[];
  properties?: Record<string, PropertyDef>;
  additionalProperties?: boolean;
}

function validateProperty(
  value: Json,
  def: PropertyDef,
  path: string
): void {
  if (def.type && jsonTypeOf(value) !== def.type) {
    throw new CapabilityError("INVALID_INPUT", `field '${path}' must be ${def.type}`);
  }

  if (def.minLength !== undefined && typeof value === "string" && value.length < def.minLength) {
    throw new CapabilityError("INVALID_INPUT", `field '${path}' must have minLength ${def.minLength}`);
  }

  if (def.enum && !def.enum.includes(value as string | number | boolean)) {
    throw new CapabilityError("INVALID_INPUT", `field '${path}' must be one of: ${def.enum.join(", ")}`);
  }

  if (def.type === "array" && Array.isArray(value)) {
    if (def.items) {
      for (let i = 0; i < value.length; i++) {
        validateProperty(value[i] as Json, def.items, `${path}[${i}]`);
      }
    }
  }

  if (def.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, Json>;
    if (def.required) {
      for (const k of def.required) {
        if (obj[k] === undefined || obj[k] === null || obj[k] === "") {
          throw new CapabilityError("INVALID_INPUT", `missing field: ${path}.${k}`);
        }
      }
    }
    if (def.properties) {
      for (const [k, childDef] of Object.entries(def.properties)) {
        if (obj[k] === undefined) continue;
        validateProperty(obj[k] as Json, childDef, `${path}.${k}`);
      }
    }
    if (def.additionalProperties === false) {
      const allow = new Set(Object.keys(def.properties || {}));
      if (def.required) for (const k of def.required) allow.add(k);
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
