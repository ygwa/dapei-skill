import type { DimensionDecision, EngineErrorCode } from "./types.ts";

/**
 * Dimension rule blocklist (ADR-0010). The blocklist enumerates
 * capabilities that mutate the workspace dimension (docs/, .dapei/,
 * repos/ root, or anything that affects the durable knowledge base
 * shared across features). Feature-scoped writes (writing under
 * features/<f>/, writing repos/<r>/.git worktrees) are NOT in the
 * blocklist — they are the whole point of the feature dimension.
 *
 * Decision rule (the source of truth for the desktop):
 *  1. If capabilityId starts with a FEATURE_SCOPED_PREFIX, allow.
 *  2. Else, if any blocklist regex matches, refuse with
 *     DIMENSION_BLOCKED.
 *  3. Else, allow.
 *
 * The blocklist is checked second because a future feature-scoped
 * capability may also touch the workspace dimension (rare but
 * possible); the maintainer adds an explicit block then.
 *
 * Audit rule: every workspace-dimension write capability MUST
 * appear here. The check-dimension-rules.ts script asserts the
 * invariant by scanning packages/core/src/capabilities/ and
 * asking: "for every write capability outside FEATURE_SCOPED,
 * is it in the blocklist?"
 */
const FEATURE_SCOPED_PREFIXES: ReadonlyArray<string> = [
  "feature.",
  "validation.",
  "workflow.",
  "memory.",
  "audit.",
  // context.build writes features/<f>/context/runtime-context.md
  "context."
];

const WORKSPACE_DIMENSION_BLOCKLIST: ReadonlyArray<RegExp> = [
  // docs.* writes — durable knowledge in docs/
  /^docs\.write$/,
  /^docs\.create$/,
  /^docs\.delete$/,
  /^docs\.update$/,
  // cognitive.* writes — durable artifacts in docs/as-is/
  /^cognitive\.artifact\.upsert$/,
  /^cognitive\.index\.rebuild$/,
  // cdr.* writes — durable artifacts in docs/as-is/ and the
  // cognitive index in .dapei/cognitive/. All cdr.* are workspace
  // dimension; the desktop's P3 portal reads them.
  /^cdr\.profile$/,
  /^cdr\.entries\.propose$/,
  /^cdr\.entries\.confirm$/,
  /^cdr\.entries\.prepare$/,
  /^cdr\.entries\.candidate$/,
  /^cdr\.behavior\.upsert$/,
  /^cdr\.state\.derive$/,
  /^cdr\.state\.validate$/,
  /^cdr\.domain\.compose$/,
  /^cdr\.domain\.suggest$/,
  /^cdr\.business\.compose$/,
  /^cdr\.business\.crosslink$/,
  /^cdr\.capability\.map\.init$/,
  /^cdr\.capability\.map\.synth$/,
  /^cdr\.index\.list$/,
  /^cdr\.index\.write$/,
  /^cdr\.feature\.link$/,
  /^cdr\.doc\.generate$/,
  /^cdr\.crossrepo\.doc\.generate$/,
  /^cdr\.reversecluster\.doc\.generate$/,
  // repos.* root writes (add/remove/sync affect the base pool)
  /^repos\.add$/,
  /^repos\.remove$/,
  /^repos\.sync$/,
  // workspace init creates the dimension itself
  /^workspace\.init$/,
  // M3-1 (ADR-0017): feature.close writes docs/decisions/<f>-decisions.md,
  // docs/feature-impact/<f>.md, docs/architecture/*, etc. — all workspace-dim
  // paths. The desktop Close wizard's handlers/feature-handlers.ts
  // temporarily switches context to "workspace" before invoking, so this
  // block is the canonical gate: feature-dim code paths cannot close a
  // feature, period. (v2.0.0 auto-link via cdr.feature.link is fine
  // because that capability is itself in the blocklist above.)
  /^feature\.close$/,
  // reports (architectural reviews, daily reports) write to global docs/decisions/
  /^reporting\.architecturereview$/,
  /^reporting\.dailyreport$/
];

/**
 * Capabilities that are inherently feature-scoped and therefore always
 * allowed from feature dimension. `feature.close` is intentionally
 * EXCLUDED even though it shares the "feature." prefix — it writes
 * docs/decisions/, docs/architecture/, docs/feature-impact/ which are
 * workspace-dimension paths (ADR-0017). The blocklist regex check
 * below is the canonical gate for it.
 */
function isFeatureScoped(capabilityId: string): boolean {
  if (capabilityId === "feature.close") return false;
  return FEATURE_SCOPED_PREFIXES.some((p) => capabilityId.startsWith(p));
}

/**
 * Evaluate whether a capability call is allowed in the given dimension.
 * Returns the decision and a stable error code on refusal.
 */
export function evaluateDimension(
  capabilityId: string,
  dimension: "workspace" | "feature"
): DimensionDecision {
  if (dimension !== "feature") {
    return { allow: true };
  }
  // Feature-scoped capabilities are always allowed in feature dim.
  if (isFeatureScoped(capabilityId)) {
    return { allow: true };
  }
  for (const re of WORKSPACE_DIMENSION_BLOCKLIST) {
    if (re.test(capabilityId)) {
      return {
        allow: false,
        code: "DIMENSION_BLOCKED" satisfies EngineErrorCode,
        message:
          `capability '${capabilityId}' is a workspace-dimension write and cannot be called from the Feature dimension. ` +
          `Run it from the workspace launcher or use the corresponding read capability (e.g. workspace.status, feature.status).`
      };
    }
  }
  // Outside blocklist and not feature-scoped: allow (likely a read).
  return { allow: true };
}

/**
 * Returns the blocklist as a plain array of source-regex strings. Used
 * by the dimension-rules self-check script to print the current set.
 */
export function blocklistAsStrings(): string[] {
  return WORKSPACE_DIMENSION_BLOCKLIST.map((re) => re.source);
}

export function featureScopedPrefixes(): string[] {
  return [...FEATURE_SCOPED_PREFIXES];
}
