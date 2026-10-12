import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, isAbsolute } from "node:path";
import { coreCapabilitySpecs, type AnyCap } from "./capabilities/index.ts";
import { CapabilityRegistry } from "./capability-registry.ts";
import { validateInputSchema } from "./schema.ts";
import { CapabilityError } from "./types.ts";
import type { CapabilityContext, Json } from "./types.ts";

export { coreCapabilitySpecs };
export type { AnyCap };

/**
 * v0.10 audit log entry schema. The `schema_version` field lets readers
 * branch on shape; future migrations (v2.1, v3.0) introduce additive
 * fields without breaking existing `audit.query` consumers.
 */
export interface AuditEntry {
  schema_version: "2.0";
  timestamp: string;
  capability: string;
  version: string;
  ok: boolean;
  duration: number;
  input: Record<string, Json>;
  feature?: string;
  sideEffects: string[];
  reportFragments: string[];
  /** Workspace-relative paths the capability wrote or modified. */
  artifactPaths?: string[];
  /**
   * Stable content hashes of the artifacts the capability wrote,
   * keyed by workspace-relative path. Best-effort: missing or
   * unreadable files are omitted rather than failing the call.
   */
  afterHashes?: Record<string, string>;
}

function ensureAuditDir(rootDir: string): string {
  const dir = join(rootDir, ".dapei", "audit");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function safeHash(absPath: string): string | undefined {
  try {
    if (!existsSync(absPath)) return undefined;
    const content = readFileSync(absPath);
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  } catch {
    return undefined;
  }
}

/**
 * Rotation threshold for the workspace audit log. When `capability.log`
 * grows past this size the runner rotates it to `capability.log.1`
 * (replacing any existing `.1`) before appending the new entry, so the
 * audit directory can't grow without bound.
 */
const AUDIT_LOG_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Generic capability runner. Validates the input against the spec's
 * schema, enforces the confirm gate, auto-populates `ctx.feature` from
 * the input envelope, injects the cross-capability dispatcher
 * (`ctx.dispatch`), appends the audit-log entry, and returns
 * `{ spec, result, ctx }`.
 *
 * The spec set is passed in explicitly: core no longer holds a
 * module-level registry, so composition roots (e.g.
 * `packages/catalog`) bind the full spec list with a thin wrapper and
 * callers cannot be affected by import order.
 */
export async function runCapabilityWith(
  specs: AnyCap[],
  id: string,
  input: Record<string, Json>,
  ctx: CapabilityContext
) {
  const registry = new CapabilityRegistry();
  registry.registerMany(specs);
  const spec = registry.get(id);
  if (!spec) throw new CapabilityError("CAPABILITY_NOT_FOUND", `unknown capability: ${id}`);
  validateInputSchema(input, spec.inputSchema);
  if (spec.confirmGate) {
    const confirmed = input.confirmed === true || input.__confirmed === true;
    if (!confirmed) {
      throw new CapabilityError(
        "CONFIRMATION_REQUIRED",
        `stage confirmation required before '${spec.confirmGate}'. Re-run with input.confirmed=true`
      );
    }
  }

  // v0.10 — auto-populate ctx.feature from the input envelope. Callers
  // that drive a feature workflow (worktree runtime, agent runtime)
  // stamp `feature` on every call. Capabilities without an explicit
  // ctx.feature still work as before (workspace-scope mode).
  const envelopeFeature = typeof input.feature === "string" && (input.feature as string).trim()
    ? (input.feature as string).trim()
    : undefined;
  const baseCtx: CapabilityContext = ctx.feature
    ? ctx
    : envelopeFeature
      ? { ...ctx, feature: envelopeFeature }
      : ctx;

  // v2.0 — inject the cross-capability dispatcher. Capabilities call
  // sibling capabilities through `ctx.dispatch` instead of importing
  // them, so core stays free of a module-level spec registry. The
  // dispatcher resolves against the same spec set this call was
  // resolved from and hands the child the caller's original context
  // (without the dispatcher itself, and without this call's
  // feature stamping leaking into the child).
  const effectiveCtx: CapabilityContext = {
    ...baseCtx,
    dispatch: (childId, childInput) => runCapabilityWith(specs, childId, childInput, ctx)
  };

  const startedAt = Date.now();
  const result = await spec.execute(effectiveCtx, input as any);
  const duration = Date.now() - startedAt;

  const log: AuditEntry = {
    schema_version: "2.0",
    timestamp: new Date().toISOString(),
    capability: id,
    version: spec.version,
    ok: result.ok,
    duration,
    input: stripEnvelope(input),
    ...(effectiveCtx.feature ? { feature: effectiveCtx.feature } : {}),
    sideEffects: result.sideEffects,
    reportFragments: result.reportFragments,
    ...(result.artifactPaths && result.artifactPaths.length > 0
      ? { artifactPaths: result.artifactPaths }
      : {})
  };

  // after_hashes — capture a stable hash of each artifact the capability
  // claims to have written. Computed from the abs path the capability
  // returned. Hashing is best-effort: a missing or unreadable file is
  // omitted rather than failing the call.
  if (result.artifactPaths && result.artifactPaths.length > 0) {
    const hashes: Record<string, string> = {};
    for (const rel of result.artifactPaths) {
      const abs = isAbsolute(rel) ? rel : join(effectiveCtx.rootDir, rel);
      const h = safeHash(abs);
      if (h) hashes[rel] = h;
    }
    if (Object.keys(hashes).length > 0) log.afterHashes = hashes;
  }

  // Audit append is best-effort: a capability that already succeeded (and
  // may already have mutated the workspace) must not be reported as a
  // failure because the audit directory is unwritable. On failure we
  // surface a warning instead.
  try {
    const auditFile = join(ensureAuditDir(effectiveCtx.rootDir), "capability.log");
    rotateAuditLog(auditFile);
    appendFileSync(auditFile, `${JSON.stringify(log)}\n`, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.reportFragments.push(`audit log write failed: ${message}`);
    console.error(`[dapei] audit log write failed: ${message}`);
  }
  return { spec, result, ctx: effectiveCtx };
}

/**
 * Rotate the audit log when it exceeds `AUDIT_LOG_MAX_BYTES`, renaming
 * it to `<file>.1` (replacing any existing `.1`). Best-effort: rotation
 * failures are swallowed so the caller's append attempt is unaffected.
 */
function rotateAuditLog(auditFile: string): void {
  try {
    if (!existsSync(auditFile)) return;
    if (statSync(auditFile).size <= AUDIT_LOG_MAX_BYTES) return;
    renameSync(auditFile, `${auditFile}.1`);
  } catch {
    /* rotation is best-effort; never block the append */
  }
}

/**
 * Strip envelope-only fields from input before persisting to the audit
 * log. The audit log captures the semantic input the capability saw,
 * not the routing envelope. Today the only envelope-only field is
 * `feature` (auto-populated to ctx); future envelope additions go
 * here too.
 */
function stripEnvelope(input: Record<string, Json>): Record<string, Json> {
  if (!("feature" in input)) return input;
  const { feature: _omitted, ...rest } = input as Record<string, Json> & { feature?: Json };
  return rest;
}
