import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, isAbsolute } from "node:path";
import { capabilitySpecs } from "./capabilities/index.ts";
import { CapabilityRegistry } from "./capability-registry.ts";
import { validateInputSchema } from "./schema.ts";
import { CapabilityError } from "./types.ts";
import type { CapabilityContext, Json } from "./types.ts";

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
  /** Stable hash of the file contents after the capability returned. */
  afterHash?: string;
}

function ensureAuditDir(rootDir: string): string {
  const dir = join(rootDir, ".dapei", "audit");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function hashFile(absPath: string): string | undefined {
  try {
    if (!existsSync(absPath)) return undefined;
    const content = readFileSync(absPath);
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  } catch {
    return undefined;
  }
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

function workspaceRel(rootDir: string, absPath: string): string {
  if (!isAbsolute(absPath)) return absPath;
  const rel = absPath.startsWith(rootDir) ? absPath.slice(rootDir.length).replace(/^\/+/, "") : absPath;
  return rel;
}

export async function runCapability(id: string, input: Record<string, Json>, ctx: CapabilityContext) {
  const registry = new CapabilityRegistry();
  registry.registerMany(capabilitySpecs);
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
  const effectiveCtx: CapabilityContext = ctx.feature
    ? ctx
    : envelopeFeature
      ? { ...ctx, feature: envelopeFeature }
      : ctx;

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

  // after_hash — capture a stable hash of each artifact the capability
  // claims to have written. Computed from the abs path the capability
  // returned. Hashing is best-effort: a missing or unreadable file
  // leaves afterHash undefined rather than failing the call.
  if (result.artifactPaths && result.artifactPaths.length > 0) {
    const hashes: Record<string, string> = {};
    for (const rel of result.artifactPaths) {
      const abs = isAbsolute(rel) ? rel : join(effectiveCtx.rootDir, rel);
      const h = safeHash(abs);
      if (h) hashes[rel] = h;
    }
    if (Object.keys(hashes).length > 0) {
      (log as AuditEntry & { afterHashes?: Record<string, string> }).afterHashes = hashes;
    }
  }

  const auditFile = join(ensureAuditDir(effectiveCtx.rootDir), "capability.log");
  appendFileSync(auditFile, `${JSON.stringify(log)}\n`, "utf8");
  return { spec, result, ctx: effectiveCtx };
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
