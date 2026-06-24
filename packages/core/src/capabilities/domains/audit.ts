import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { read, workspacePaths } from "../../../../runtime-adapters/src/system.ts";
import { requireFields } from "../shared.ts";

export type AnyCap = CapabilitySpec<any, any>;

/**
 * v0.10 audit entry shape. Both the legacy hand-written fixture format
 * and the new `runCapability` output are accepted; readers branch on
 * `schema_version` when they need to distinguish. v1 entries carry
 * `timestamp`/`feature`/`ok`; v2 entries add `version`/`duration`/
 * `artifactPaths`/`afterHashes`.
 */
interface AuditEntryV1 {
  schema_version?: "2.0";
  timestamp: string;
  capability: string;
  feature?: string;
  input?: Record<string, unknown>;
  ok?: boolean;
  duration?: number;
  version?: string;
  sideEffects?: string[];
  reportFragments?: string[];
  artifactPaths?: string[];
  afterHashes?: Record<string, string>;
}

export const auditQuery: AnyCap = {
  id: "audit.query",
  version: "1.1.0",
  inputSchema: {
    properties: {
      since: { type: "string" },
      until: { type: "string" },
      capability: { type: "string" },
      feature: { type: "string" },
      artifact_path: { type: "string" },
      limit: { type: "number" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const p = workspacePaths(ctx.rootDir);
    const auditFile = join(p.dapeiDir, "audit", "capability.log");
    if (!existsSync(auditFile)) {
      return { ok: true, data: { entries: [], text: "No audit log found." }, sideEffects: [], reportFragments: [] };
    }

    const content = read(auditFile);
    const lines = content.split("\n").filter(Boolean);
    const since = input.since ? new Date(String(input.since)).getTime() : 0;
    const until = input.until ? new Date(String(input.until)).getTime() : Date.now();
    const capFilter = input.capability ? String(input.capability) : null;
    const featFilter = input.feature ? String(input.feature) : null;
    const artifactFilter = input.artifact_path ? String(input.artifact_path) : null;
    const limit = input.limit ? Number(input.limit) : 100;

    const filtered: AuditEntryV1[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as AuditEntryV1;
        const ts = new Date(entry.timestamp).getTime();
        if (ts < since || ts > until) continue;
        if (capFilter && entry.capability !== capFilter) continue;
        if (featFilter && entry.feature !== featFilter) continue;
        if (artifactFilter) {
          const hits = (entry.artifactPaths || []).some((p) => p === artifactFilter || p.includes(artifactFilter));
          if (!hits) continue;
        }
        filtered.push(entry);
      } catch {
        // skip malformed lines
      }
    }

    return { ok: true, data: { entries: filtered.slice(-limit) }, sideEffects: [], reportFragments: [] };
  }
};
