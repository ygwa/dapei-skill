/**
 * M3-2 types for the Close Feature wizard.
 *
 * ClosePreflight describes what the wizard shows the user before they
 * confirm `feature.close`. PromoteArtifactsInput is what the wizard
 * sends back to `feature.close` once the user has ticked the boxes.
 * Both shapes are also exposed as Zod schemas for runtime validation
 * at the IPC boundary (renderer ↔ main) and at the service layer
 * (main ↔ engine).
 *
 * Source of truth for the actual capability contract is
 * `packages/core/src/capabilities/domains/feature.ts` (`featureClose`
 * v3.0.0 — see ADR-0017 in `.omo/plans/desktop-m3.md`). Anything that
 * diverges from that source is a bug — fix here AND there.
 */
import { z } from "zod";

/**
 * A single architecture-note candidate the user may promote from
 * `features/<f>/<source>` to `<target>`.
 */
export const ArchitectureEntrySchema = z.object({
  source_path: z.string().min(1),
  target_path: z.string().min(1)
}).strict();

export type ArchitectureEntry = z.infer<typeof ArchitectureEntrySchema>;

/**
 * A single report candidate the user may copy from
 * `features/<f>/<rel>` to `docs/feature-impact/<f>/<basename>`.
 */
export const ReportCopySchema = z.object({
  rel_path: z.string().min(1),
  title: z.string(),
  preview_excerpt: z.string().optional()
}).strict();

export type ReportCopy = z.infer<typeof ReportCopySchema>;

/**
 * A single cognitive asset the user may unlink from this feature
 * (i.e. clear `created_by_feature` on the index entry).
 */
export const CognitiveUnlinkSchema = z.object({
  kind: z.enum(["behavior", "state-machine", "domain", "business-rule", "capability-map"]),
  id: z.string().min(1),
  repo: z.string().optional()
}).strict();

export type CognitiveUnlink = z.infer<typeof CognitiveUnlinkSchema>;

/**
 * The complete payload `feature.close` accepts under `promote_artifacts`.
 * Mirrors the engine-side schema 1:1 (with `additionalProperties: false`
 * on every nested object so future engine changes are caught at the
 * IPC boundary instead of silently dropping fields).
 */
export const PromoteArtifactsInputSchema = z.object({
  decisions: z.object({
    skip: z.boolean().optional(),
    target_path: z.string().min(1).optional()
  }).strict().optional(),
  architecture: z.object({
    entries: z.array(ArchitectureEntrySchema).optional()
  }).strict().optional(),
  cognitive: z.object({
    unlink: z.array(CognitiveUnlinkSchema).optional()
  }).strict().optional(),
  reports: z.object({
    copy_paths: z.array(z.string().min(1)).optional()
  }).strict().optional()
}).strict();

export type PromoteArtifactsInput = z.infer<typeof PromoteArtifactsInputSchema>;

/**
 * M3-2 preflight shape. Each of the 4 sections is a flat object (not
 * a generic section wrapper) because there's exactly one item per
 * section — the wizard's "select" step iterates over the candidates
 * arrays directly. The `applicable` flag tells the wizard whether to
 * render the section at all (no candidates = skip).
 *
 * `default_selected` counts items the engine will pick up by default
 * (e.g. reports.default_selected == count(reports) means all are
 * pre-checked). The wizard uses it to seed its initial checkbox state.
 */
export interface ClosePreflightDecisions {
  source_present: boolean;
  default_target_path: string;
  preview: string;
}

export interface ClosePreflightArchitecture {
  candidates: ArchitectureEntry[];
}

export interface ClosePreflightReports {
  candidates: ReportCopy[];
}

export interface ClosePreflightCognitive {
  candidates: CognitiveUnlink[];
  /**
   * Total tagged count in the cognitive index (caller may want to show
   * "12 of 15 still linked" even when the wizard only lists the first
   * 20 returned by `cdr.query`'s default limit).
   */
  total_in_index: number;
}

export interface ClosePreflight {
  feature: string;
  current_stage: string | null;
  /** Mirror of `cdr.query { created_by_feature: <f> }` BEFORE close so
   * the wizard's Step 1 preview matches what `cdr.feature.link` will
   * actually do during the close. */
  cdr_assets_tagged_preview: number;
  decisions: {
    items: ClosePreflightDecisions[];
    default_selected: number;
    display_order: number;
    applicable: boolean;
    rationale: string;
  };
  architecture: {
    items: ClosePreflightArchitecture[];
    default_selected: number;
    display_order: number;
    applicable: boolean;
    rationale: string;
  };
  reports: {
    items: ClosePreflightReports[];
    default_selected: number;
    display_order: number;
    applicable: boolean;
    rationale: string;
  };
  cognitive: {
    items: ClosePreflightCognitive[];
    default_selected: number;
    display_order: number;
    applicable: boolean;
    rationale: string;
  };
}

/**
 * Schema for the IPC payload the renderer sends when invoking the close
 * handler. Mirrors what the wizard assembles from the user's selections.
 */
export const FeatureCloseWithPromoteRequestSchema = z.object({
  feature: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  confirmed: z.boolean().optional(),
  force: z.boolean().optional(),
  promote_artifacts: PromoteArtifactsInputSchema.optional()
}).strict();

export type FeatureCloseWithPromoteRequest = z.infer<typeof FeatureCloseWithPromoteRequestSchema>;

/**
 * Response shape from `feature.close`. The desktop wizard uses this to
 * render the success banner (Step 4 → "feature closed" toast) and to
 * tell P3 portal rebuild which assets to highlight (M3-3 wires the
 * `promoted_artifacts` payload into the broadcast push).
 */
export const ClosePromotedArtifactsSchema = z.object({
  decisions: z.object({
    written: z.boolean(),
    skipped: z.boolean(),
    target_path: z.string()
  }).strict(),
  architecture: z.object({
    written_count: z.number().int().nonnegative(),
    entries: z.array(z.object({
      source_path: z.string(),
      target_path: z.string(),
      written: z.boolean()
    }).strict())
  }).strict(),
  cognitive: z.object({
    unlinked_count: z.number().int().nonnegative(),
    ids: z.array(CognitiveUnlinkSchema)
  }).strict(),
  reports: z.object({
    copied_count: z.number().int().nonnegative(),
    paths: z.array(z.object({
      source: z.string(),
      target: z.string(),
      copied: z.boolean()
    }).strict())
  }).strict()
}).strict();

export const FeatureCloseResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    feature: z.string(),
    cdr_assets_tagged: z.number().int().nonnegative(),
    promoted_artifacts: ClosePromotedArtifactsSchema
  }).strict()
}).strict();

export type ClosePromotedArtifacts = z.infer<typeof ClosePromotedArtifactsSchema>;
export type FeatureCloseResponse = z.infer<typeof FeatureCloseResponseSchema>;