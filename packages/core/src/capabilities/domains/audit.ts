import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { workspacePaths } from "@dapei/runtime-adapters/system";
import { requireFields } from "../shared.ts";
// Canonical audit-entry shape, owned by the core package root. Imported
// relatively (not as `@dapei/core`) because this file *is* that package: a
// self-referential `@dapei/core` specifier would trip the package-boundary
// guard, which requires every `@dapei/*` import to be a declared dependency.
import type { AuditEntry } from "../../index.ts";

export type AnyCap = CapabilitySpec<any, any>;

/**
 * Yield the lines of `filePath` newest-first, reading the file in chunks from
 * the tail. Newlines (0x0A) cannot appear inside a UTF-8 multi-byte sequence,
 * so decoding each byte-slice between newlines is always safe. Lets readers
 * stop early without loading (or parsing) the whole log.
 */
function* linesFromEnd(filePath: string): Generator<string> {
  const size = statSync(filePath).size;
  if (size === 0) return;
  const fd = openSync(filePath, "r");
  try {
    const CHUNK = 64 * 1024;
    let pos = size;
    // Bytes read so far that belong to a line whose start is in an earlier chunk.
    let pending = Buffer.alloc(0);
    while (pos > 0) {
      const start = Math.max(0, pos - CHUNK);
      const buf = Buffer.allocUnsafe(pos - start);
      const n = readSync(fd, buf, 0, buf.length, start);
      pos = start;
      const chunk = Buffer.concat([buf.subarray(0, n), pending]);
      let end = chunk.length;
      for (let i = chunk.length - 1; i >= 0; i--) {
        if (chunk[i] === 0x0a) {
          const line = chunk.subarray(i + 1, end);
          end = i;
          if (line.length > 0) yield line.toString("utf8");
        }
      }
      pending = chunk.subarray(0, end);
    }
    if (pending.length > 0) yield pending.toString("utf8");
  } finally {
    closeSync(fd);
  }
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

    // Scan the log newest-line-first and stop as soon as `limit` matching
    // entries are collected, instead of parsing the whole file. `linesFromEnd`
    // reads chunks from the tail, so the full log never has to be held in
    // memory; malformed lines are skipped as before.
    const since = input.since ? new Date(String(input.since)).getTime() : 0;
    const until = input.until ? new Date(String(input.until)).getTime() : Date.now();
    const capFilter = input.capability ? String(input.capability) : null;
    const featFilter = input.feature ? String(input.feature) : null;
    const artifactFilter = input.artifact_path ? String(input.artifact_path) : null;
    const limit = input.limit ? Number(input.limit) : 100;

    const collected: AuditEntry[] = [];
    for (const line of linesFromEnd(auditFile)) {
      if (collected.length >= limit) break;
      try {
        const entry = JSON.parse(line) as AuditEntry;
        const ts = new Date(entry.timestamp).getTime();
        if (ts < since || ts > until) continue;
        if (capFilter && entry.capability !== capFilter) continue;
        if (featFilter && entry.feature !== featFilter) continue;
        if (artifactFilter) {
          const hits = (entry.artifactPaths || []).some((p) => p === artifactFilter || p.includes(artifactFilter));
          if (!hits) continue;
        }
        collected.push(entry);
      } catch {
        // skip malformed lines
      }
    }

    // `collected` is newest-first; reverse it to the chronological order the
    // previous `filtered.slice(-limit)` produced.
    return { ok: true, data: { entries: collected.reverse() }, sideEffects: [], reportFragments: [] };
  }
};
