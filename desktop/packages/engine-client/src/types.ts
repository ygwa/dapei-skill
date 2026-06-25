import { isAbsolute } from "node:path";
import type { CapabilityInvokeRequest, CapabilityInvokeResponse } from "@dapei/desktop-contracts";

/**
 * WorkspaceContext is the desktop main process's typed handle on "which
 * workspace is open and which dimension the user is in". It is constructed
 * once at app boot (or on workspace switch) and held on AppContext; it
 * never crosses IPC. The renderer only sends a `workspaceId` / path
 * string; the main process maps that to a WorkspaceContext against its
 * registry. See ADR-0008, ADR-0009.
 */
export interface WorkspaceContext {
  /** Absolute path of the workspace root (e.g., `/Users/x/projects/mall-core`). */
  workspaceRoot: string;
  /** Optional feature name; present iff the renderer is in the Feature dimension. */
  feature?: string;
  /** Dimension the renderer is currently in. Drives ADR-0004 enforcement. */
  dimension: "workspace" | "feature";
}

const FEATURE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Validate a WorkspaceContext at construction. Throws on any of:
 *  - empty / non-absolute workspaceRoot
 *  - '..' segment in workspaceRoot (defense against symlink escape)
 *  - feature present but not kebab-case
 *  - dimension not in the allowed set
 *
 * The desktop does not call this in production hot paths; tests and dev
 * mode call it at construction. Production code can call it once at
 * AppContext.setWorkspaceContext to fail loud at the boundary.
 */
export function validateWorkspaceContext(ctx: WorkspaceContext): void {
  if (!ctx || typeof ctx !== "object") {
    throw new Error("WorkspaceContext must be an object");
  }
  if (!ctx.workspaceRoot || typeof ctx.workspaceRoot !== "string") {
    throw new Error("WorkspaceContext.workspaceRoot is required");
  }
  if (!isAbsolute(ctx.workspaceRoot)) {
    throw new Error(`WorkspaceContext.workspaceRoot must be absolute: ${ctx.workspaceRoot}`);
  }
  if (ctx.workspaceRoot.split(/[\\/]+/).includes("..")) {
    throw new Error(`WorkspaceContext.workspaceRoot must not contain '..' segment: ${ctx.workspaceRoot}`);
  }
  if (ctx.feature !== undefined) {
    if (typeof ctx.feature !== "string" || !FEATURE_NAME_RE.test(ctx.feature)) {
      throw new Error(`WorkspaceContext.feature must match ${FEATURE_NAME_RE}: ${ctx.feature}`);
    }
  }
  if (ctx.dimension !== "workspace" && ctx.dimension !== "feature") {
    throw new Error(`WorkspaceContext.dimension must be 'workspace' or 'feature': ${ctx.dimension}`);
  }
}

/**
 * The EngineClient is the desktop's stable contract for talking to the
 * dapei engine. Exactly one method: run. No streaming, no abort, no
 * subscribe — those are added as separate methods if/when needed.
 *
 * The WorkspaceContext is passed as a second argument (not threaded
 * through the request) so the dimension rule can be enforced
 * per-call without trusting renderer-supplied metadata. See ADR-0008.
 */
export interface EngineClient {
  run(request: CapabilityInvokeRequest, ctx: WorkspaceContext): Promise<CapabilityInvokeResponse>;
}

/**
 * Stable error codes for the EngineClient surface. Renderer UI can
 * branch on these. Anything not in this set is treated as a generic
 * "the engine said no" by the renderer.
 */
export type EngineErrorCode =
  | "ENGINE_EXIT"        // subprocess exited with non-zero
  | "SPAWN_FAILED"       // could not even spawn the subprocess
  | "PARSE_FAILED"       // subprocess output was neither JSON nor recognized text
  | "DIMENSION_BLOCKED"  // dimension rule refused this capability
  | "INVALID_CONTEXT"    // WorkspaceContext failed validation
  | "NOT_IMPLEMENTED";   // stub client

/**
 * Result of dimension-rule evaluation. `allow: true` means the call may
 * proceed; `allow: false` means DIMENSION_BLOCKED with the reason. The
 * engine-client uses this internally and the renderer never sees the
 * object directly.
 */
export type DimensionDecision =
  | { allow: true }
  | { allow: false; code: EngineErrorCode; message: string };

export { StubEngineClient } from "./stub-engine-client.ts";
export * from "./dimension-rules.ts";
