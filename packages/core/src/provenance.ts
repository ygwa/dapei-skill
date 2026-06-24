// Provenance helpers — v0.10 contract.
//
// Every cognitive artifact (behavior / state-machine / domain /
// business-rule / capability-map / profile / entry) carries a
// provenance trail: which feature produced it, when, and which feature
// last touched it. The four fields are declared in EvidenceFields:
//
//   created_by_feature, updated_by_feature, created_at, updated_at
//
// This module provides two pure helpers that every cdr.* write
// capability calls before serialising the artifact to YAML:
//
//   applyProvenance(doc, { feature, now, mode })
//     - mutates a copy of `doc` and returns it
//     - mode "create" sets all four fields to { feature, now }
//     - mode "update" refreshes updated_by_feature / updated_at only,
//       preserving created_by_feature / created_at if already set
//     - if `feature` is missing, returns doc unchanged (so calls from
//       outside any feature workflow — workspace indexing, agent
//       exploration — leave provenance unset)
//
//   provenanceFromContext(ctx, mode)
//     - convenience wrapper that reads feature from CapabilityContext
//     - returns a no-op when ctx.feature is unset
//
// The "no feature → no provenance" branch is critical: it preserves the
// ability to create artifacts during workspace-level indexing
// (cdr.profile, cdr.bootstrap, repos.analyze) without inventing a
// fake feature name. Provenance only attaches when the call runs in a
// real feature workflow.

import type { CapabilityContext } from "./types.ts";

export type ProvenanceMode = "create" | "update";

export interface ProvenanceFields {
  feature?: string;
  now: string;
  mode: ProvenanceMode;
}

const PROVENANCE_KEYS = [
  "created_by_feature",
  "updated_by_feature",
  "created_at",
  "updated_at"
];

export function applyProvenance<T extends Record<string, unknown>>(
  doc: T,
  fields: ProvenanceFields
): T {
  if (!fields.feature) return doc;
  const result = { ...doc } as Record<string, unknown>;
  const feature = fields.feature;
  const now = fields.now;
  if (fields.mode === "create") {
    result.created_by_feature = feature;
    result.updated_by_feature = feature;
    result.created_at = now;
    result.updated_at = now;
  } else {
    result.updated_by_feature = feature;
    result.updated_at = now;
    if (!result.created_by_feature) {
      result.created_by_feature = feature;
    }
    if (!result.created_at) {
      result.created_at = now;
    }
  }
  return result as T;
}

export function provenanceFromContext(
  ctx: Pick<CapabilityContext, "feature" | "now">,
  mode: ProvenanceMode
): ProvenanceFields {
  return {
    feature: ctx.feature,
    now: ctx.now.toISOString(),
    mode
  };
}

export function hasProvenance(doc: Record<string, unknown>): boolean {
  return PROVENANCE_KEYS.some((k) => doc[k] !== undefined && doc[k] !== null && doc[k] !== "");
}
