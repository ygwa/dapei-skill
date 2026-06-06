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

export function validateInputSchema(input: Record<string, Json>, schema: {
  required?: string[];
  properties?: Record<string, { type?: "string" | "number" | "boolean" | "object" | "array"; enum?: Array<string | number | boolean>; minLength?: number }>;
  additionalProperties?: boolean;
}): void {
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
    if (def.type && jsonTypeOf(value) !== def.type) {
      throw new CapabilityError("INVALID_INPUT", `field '${key}' must be ${def.type}`);
    }
    if (def.minLength !== undefined && typeof value === "string" && value.length < def.minLength) {
      throw new CapabilityError("INVALID_INPUT", `field '${key}' must have minLength ${def.minLength}`);
    }
    if (def.enum && !def.enum.includes(value as any)) {
      throw new CapabilityError("INVALID_INPUT", `field '${key}' must be one of: ${def.enum.join(", ")}`);
    }
  }

  if (schema.additionalProperties === false) {
    const allow = new Set(Object.keys(props));
    if (schema.required) for (const k of schema.required) allow.add(k);
    for (const k of Object.keys(input)) {
      if (!allow.has(k) && k !== "confirmed" && k !== "__confirmed" && k !== "force") {
        throw new CapabilityError("INVALID_INPUT", `unexpected field: ${k}`);
      }
    }
  }
}
