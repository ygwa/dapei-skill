import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { capabilitySpecs } from "./capabilities/index.ts";
import { CapabilityRegistry } from "./capability-registry.ts";
import { validateInputSchema } from "./schema.ts";
import { CapabilityError } from "./types.ts";
import type { CapabilityContext, Json } from "./types.ts";

function ensureAuditDir(rootDir: string): string {
  const dir = join(rootDir, ".dapei", "audit");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
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

  const startedAt = new Date().toISOString();
  const result = await spec.execute(ctx, input as any);
  const endedAt = new Date().toISOString();
  const log = {
    capability: id,
    version: spec.version,
    startedAt,
    endedAt,
    input,
    outputs: spec.outputs || [],
    sideEffects: result.sideEffects,
    reportFragments: result.reportFragments
  };
  const auditFile = join(ensureAuditDir(ctx.rootDir), "capability.log");
  appendFileSync(auditFile, `${JSON.stringify(log)}\n`, "utf8");
  return { spec, result };
}
