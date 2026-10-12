import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { CapabilityError } from "@dapei/core/types";
import { parseYamlDocument, stringifyYamlDocument, type YamlValue } from "@dapei/core/yaml-doc";
import { requireFields, detectRepoLanguage, detectTestCommands } from "@dapei/core/internal/shared";
import { ensureDir, read, write, workspacePaths, listFilesRecursively } from "@dapei/runtime-adapters/system";
import { CodeGraphAdapter } from "@dapei/runtime-adapters/codegraph";
import { applyProvenance, provenanceFromContext } from "@dapei/core/provenance";
import { CODE_EXTS, MAX_FILE_BYTES, MAX_FILES_PER_CANDIDATE, ENTRY_TYPES, languageHintForFile, repoDirectoryTree, repoManifestFiles, profilesDir, entriesDir, validateEvidencePoints, type AnyCap } from "./internal/shared.ts";

// ---------------------------------------------------------------------------
// 1. cdr.profile
// ---------------------------------------------------------------------------

export const cdrProfile: AnyCap = {
  id: "cdr.profile",
  version: "2.0.0",
  inputSchema: {
    required: ["repo"],
    properties: { repo: { type: "string", minLength: 1 } },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["repo"]);
    const p = workspacePaths(ctx.rootDir);
    const repo = String(input.repo);
    const repoPath = join(p.reposDir, repo);

    if (!existsSync(repoPath)) {
      throw new CapabilityError("REPO_MISSING", `repos/${repo} not found`);
    }

    const language = detectRepoLanguage(repoPath);
    const manifestFiles = repoManifestFiles(repoPath);
    const directoryTree = repoDirectoryTree(repoPath, p.rootDir);
    const testCommands = detectTestCommands(repoPath);

    // v0.7 — CodeGraph integration. The profile records what the substrate
    // actually inspected so downstream consumers (the agent, the portal) can
    // tell whether the graph was used. When the CLI is missing, the block
    // degrades to a `reason` and the rest of the profile is unaffected.
    const adapter = new CodeGraphAdapter(ctx.rootDir);
    const codegraphBlock: Record<string, YamlValue> = {
      available: adapter.isAvailable()
    };
    if (adapter.isAvailable()) {
      const orient = adapter.orient(repoPath, { maxFiles: 1, maxBytes: 0 });
      codegraphBlock.version = adapter.getDoctor().version || "";
      codegraphBlock.backend = orient.backend;
      codegraphBlock.files_total = orient.files_total || 0;
      if (orient.apisurface_count !== undefined) {
        codegraphBlock.apisurface_count = orient.apisurface_count;
      }
    } else {
      codegraphBlock.reason = adapter.getDoctor().reason || "codegraph CLI not in PATH";
    }

    // v0.3: removed `frameworks` field. The engine no longer prescribes which
    // frameworks a repo uses — the AI reads manifest_files + directory_tree
    // and decides. See cdr-architecture.md "AI as scanner" principle.
    const profileData: Record<string, YamlValue> = applyProvenance({
      repo,
      generated_at: ctx.now.toISOString(),
      language,
      manifest_files: manifestFiles,
      directory_tree: directoryTree,
      test_commands: testCommands,
      codegraph: codegraphBlock as YamlValue
    }, provenanceFromContext(ctx, "create"));

    const outDir = profilesDir(ctx.rootDir);
    ensureDir(outDir);
    const outFile = join(outDir, `${repo}.yaml`);
    write(outFile, stringifyYamlDocument(profileData));

    return {
      ok: true,
      data: {
        repo,
        path: relative(p.rootDir, outFile),
        language,
        manifest_files: manifestFiles,
        test_commands: testCommands,
        codegraph: codegraphBlock
      },
      sideEffects: [`profile written: ${relative(p.rootDir, outFile)}`],
      reportFragments: [`generated profile for ${repo}`],
      artifactPaths: [relative(p.rootDir, outFile)]
    };
  }
};

// ---------------------------------------------------------------------------
// 2. cdr.entries.candidate — cheap file listing (no pattern matching)
//
// v0.3 redesign: the engine does NOT prescribe which files are entry points.
// It returns a list of code files with content slices, and the AI decides
// which are entry points via cdr.entries.propose. This is language-agnostic
// and framework-agnostic — Quarkus / Ktor / Hapi / Actix / Axum / Django /
// Fastify / gRPC / GraphQL all work without code changes here.
// ---------------------------------------------------------------------------

export const cdrEntriesCandidate: AnyCap = {
  id: "cdr.entries.candidate",
  version: "1.0.0",
  inputSchema: {
    required: ["repo"],
    properties: {
      repo: { type: "string", minLength: 1 },
      max_files: { type: "number" },
      max_bytes: { type: "number" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["repo"]);
    const p = workspacePaths(ctx.rootDir);
    const repo = String(input.repo);
    const repoPath = join(p.reposDir, repo);

    if (!existsSync(repoPath)) {
      throw new CapabilityError("REPO_MISSING", `repos/${repo} not found`);
    }

    const maxFiles = typeof input.max_files === "number" && input.max_files > 0
      ? Math.min(input.max_files, 1000)
      : MAX_FILES_PER_CANDIDATE;
    const maxBytes = typeof input.max_bytes === "number" && input.max_bytes > 0
      ? Math.min(input.max_bytes, 2_000_000)
      : MAX_FILE_BYTES;

    // v0.7 — prefer CodeGraph when present. The adapter returns a richer
    // structure (each file carries `apisurface_hint` when the CLI tagged it)
    // and reports `backend: 'native'`. When the CLI is missing the adapter
    // returns `available: false` and we fall back to the v0.3 tree walk
    // with `backend: 'fallback'`. Existing callers see the same `files[]`
    // shape; new callers branch on `data.backend` to use richer output.
    const adapter = new CodeGraphAdapter(ctx.rootDir);
    const orient = adapter.orient(repoPath, { maxFiles, maxBytes });
    let backend: "native" | "fallback" = "fallback";
    let backendReason: string | undefined;
    if (!orient.available) {
      backendReason = orient.reason || adapter.getDoctor().reason || "codegraph CLI not available";
    }
    let fileEntries: Array<Record<string, YamlValue>>;
    const skipped: Array<{ relpath: string; reason: string }> = [];

    if (orient.available && orient.files.length > 0) {
      backend = "native";
      fileEntries = orient.files.map((f) => {
        const entry: Record<string, YamlValue> = {
          relpath: f.relpath,
          language: f.language,
          size_bytes: f.size_bytes,
          truncated: f.truncated,
          content: f.content
        };
        if (f.apisurface_hint) entry.apisurface_hint = f.apisurface_hint as unknown as YamlValue;
        return entry;
      });
    } else {
      const allFiles = listFilesRecursively(repoPath, CODE_EXTS, maxFiles);
      fileEntries = [];
      for (const filePath of allFiles) {
        const relFile = relative(repoPath, filePath);
        let content = "";
        let truncated = false;
        try {
          const raw = read(filePath);
          if (raw.length > maxBytes) {
            content = raw.slice(0, maxBytes);
            truncated = true;
            skipped.push({ relpath: relFile, reason: `exceeds ${maxBytes} bytes` });
          } else {
            content = raw;
          }
        } catch {
          skipped.push({ relpath: relFile, reason: "unreadable" });
          continue;
        }
        fileEntries.push({
          relpath: relFile,
          language: languageHintForFile(relFile),
          size_bytes: content.length,
          truncated,
          content
        });
      }
    }

    return {
      ok: true,
      data: {
        repo,
        backend,
        ...(backendReason ? { backend_reason: backendReason } : {}),
        file_count: fileEntries.length,
        files: fileEntries as unknown as YamlValue,
        skipped: skipped as unknown as YamlValue,
        max_bytes: maxBytes,
        workflow: {
          step: 1,
          phase: "candidate",
          goal: "AI reads file content and decides which files are entry points",
          next: "For each entry point: runCapability('cdr.entries.propose', {id, file, line, type, sources: [...]})"
        }
      },
      sideEffects: [],
      reportFragments: [`listed ${fileEntries.length} code file(s) in ${repo} for AI triage (backend=${backend})`]
    };
  }
};

// ---------------------------------------------------------------------------
// 3. cdr.entries.propose — AI submits one entry, engine validates evidence
// ---------------------------------------------------------------------------

export const cdrEntriesPropose: AnyCap = {
  id: "cdr.entries.propose",
  version: "1.0.0",
  inputSchema: {
    required: ["repo", "id", "file", "line", "type"],
    properties: {
      repo: { type: "string", minLength: 1 },
      id: { type: "string", minLength: 1 },
      type: { type: "string", enum: [...ENTRY_TYPES] },
      file: { type: "string", minLength: 1 },
      line: { type: "number" },
      method: { type: "string" },
      path: { type: "string" },
      summary: { type: "string" },
      sources: { type: "array" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["repo", "id", "file", "line", "type"]);
    const repo = String(input.repo);
    const id = String(input.id);
    const type = String(input.type);
    const file = String(input.file);
    const line = typeof input.line === "number" ? input.line : undefined;
    const method = input.method ? String(input.method) : undefined;
    const path = input.path ? String(input.path) : undefined;
    const summary = input.summary ? String(input.summary) : undefined;
    const sources = Array.isArray(input.sources) ? input.sources : [];

    if (!/^[a-z0-9-]+$/.test(id)) {
      throw new CapabilityError("INVALID_INPUT", "id must match ^[a-z0-9-]+$");
    }
    if (!sources.length) {
      throw new CapabilityError(
        "INVALID_INPUT",
        "sources[] is required — every entry proposal must cite at least one source location"
      );
    }

    const p = workspacePaths(ctx.rootDir);
    const repoPath = join(p.reposDir, repo);
    if (!existsSync(repoPath)) {
      throw new CapabilityError("REPO_MISSING", `repos/${repo} not found`);
    }

    const entryDoc: Record<string, unknown> = applyProvenance({
      id,
      type,
      status: "candidate",
      discovered_by: "ai",
      anchor: file,
      line,
      sources
    }, provenanceFromContext(ctx, "create"));
    if (method) entryDoc.method = method;
    if (path) entryDoc.path = path;
    if (summary) entryDoc.summary = summary;

    // P1 red line: validate every sources[].file/line points at real code
    const evidenceErrors = validateEvidencePoints(ctx, entryDoc);
    if (evidenceErrors.length) {
      throw new CapabilityError("INVALID_EVIDENCE", evidenceErrors.join("; "));
    }

    // Idempotent append: read existing entries, drop any with same id, push new
    const outDir = entriesDir(ctx.rootDir);
    ensureDir(outDir);
    const outFile = join(outDir, `${repo}.yaml`);

    let doc: Record<string, YamlValue>;
    if (existsSync(outFile)) {
      doc = parseYamlDocument(read(outFile));
    } else {
      doc = {
        repo,
        generated_at: ctx.now.toISOString(),
        entry_count: 0,
        entries: []
      };
    }

    const entries = Array.isArray(doc.entries) ? (doc.entries as Array<Record<string, YamlValue>>) : [];
    const filtered = entries.filter((e) => e && e.id !== id);
    filtered.push(entryDoc as unknown as Record<string, YamlValue>);
    doc.entries = filtered as unknown as YamlValue;
    doc.entry_count = filtered.length;
    doc.generated_at = ctx.now.toISOString();

    write(outFile, stringifyYamlDocument(doc));

    return {
      ok: true,
      data: {
        repo,
        path: relative(p.rootDir, outFile),
        id,
        type,
        status: "candidate",
        file,
        line: line ?? null,
        method: method || null,
        entry_path: path || null
      },
      sideEffects: [`entry proposed: ${id} in ${repo}`],
      reportFragments: [`AI proposed entry ${id} (${type}) at ${file}:${line}`],
      artifactPaths: [relative(p.rootDir, outFile)]
    };
  }
};

// ---------------------------------------------------------------------------
// 4. cdr.entries.prepare — thin orchestrator (v0.3: delegates to .candidate)
//
// Kept for backward compatibility with router patterns like
// "discover entries for X" / "扫描入口 for X". The actual work is done by
// cdr.entries.candidate (returns file list) and cdr.entries.propose
// (records one entry). This capability just returns a workflow description
// so the Agent knows the next step.
// ---------------------------------------------------------------------------

export const cdrEntriesPrepare: AnyCap = {
  id: "cdr.entries.prepare",
  version: "2.0.0",
  inputSchema: {
    required: ["repo"],
    properties: { repo: { type: "string", minLength: 1 } },
    additionalProperties: false
  },
  async execute(ctx, input) {
    // Delegate to cdr.entries.candidate to do the actual file listing, then
    // wrap its result with a workflow description so the Agent knows what
    // to do next.
    const candResult = await cdrEntriesCandidate.execute(ctx, input);
    if (!candResult.ok) return candResult;

    const candidate = candResult.data as {
      repo: string;
      file_count: number;
      files: Array<Record<string, YamlValue>>;
      skipped: Array<{ relpath: string; reason: string }>;
    };

    return {
      ok: true,
      data: {
        ...candidate,
        workflow: {
          step: 1,
          phase: "orient",
          goal: "AI reads code files and identifies entry points (HTTP routes, MQ consumers, cron jobs, RPC handlers, etc.)",
          next: "For each entry point: runCapability('cdr.entries.propose', {repo, id, type, file, line, sources:[{file, line, repo}]})",
          deprecated: true,
          prefer: "cdr.entries.candidate"
        }
      },
      sideEffects: candResult.sideEffects,
      reportFragments: candResult.reportFragments
    };
  }
};

// ---------------------------------------------------------------------------
// 5. cdr.entries.confirm — mark a candidate entry as confirmed
//
// v0.3: requires sources[] pointing at real code. This is the engine's
// guard against AI "fast-confirming" entries without pointing at evidence.
// ---------------------------------------------------------------------------

export const cdrEntriesConfirm: AnyCap = {
  id: "cdr.entries.confirm",
  version: "2.0.0",
  inputSchema: {
    required: ["repo", "entry_id", "summary"],
    properties: {
      repo: { type: "string", minLength: 1 },
      entry_id: { type: "string", minLength: 1 },
      summary: { type: "string", minLength: 1 },
      priority: { type: "string" },
      sources: { type: "array" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["repo", "entry_id", "summary"]);
    const repo = String(input.repo);
    const entryId = String(input.entry_id);
    const summary = String(input.summary);
    const priority = input.priority ? String(input.priority) : undefined;
    const sources = Array.isArray(input.sources) ? input.sources : [];

    if (!sources.length) {
      throw new CapabilityError(
        "INVALID_INPUT",
        "sources[] is required — confirming an entry without evidence is a P1 violation"
      );
    }

    const outDir = entriesDir(ctx.rootDir);
    const outFile = join(outDir, `${repo}.yaml`);

    if (!existsSync(outFile)) {
      throw new CapabilityError(
        "FILE_MISSING",
        `entries file not found: ${relative(ctx.rootDir, outFile)}. Run cdr.entries.candidate + cdr.entries.propose first.`
      );
    }

    const doc = parseYamlDocument(read(outFile));
    const entries = doc.entries;
    if (!Array.isArray(entries)) {
      throw new CapabilityError("INVALID_ARTIFACT", "entries file has no entries array");
    }

    let found = false;
    for (const entry of entries) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const e = entry as Record<string, YamlValue>;
        if (String(e.id) === entryId) {
          // Build the post-update shape (with provenance) once and reuse
          // it for both validation and persistence. Mutating `e`
          // directly after validating a copy would silently drop the
          // provenance fields from the written YAML.
          const updated = applyProvenance({
            ...(e as Record<string, unknown>),
            status: "confirmed",
            summary,
            sources
          }, provenanceFromContext(ctx, "update"));
          const evidenceErrors = validateEvidencePoints(ctx, updated);
          if (evidenceErrors.length) {
            throw new CapabilityError("INVALID_EVIDENCE", evidenceErrors.join("; "));
          }

          const updatedFields = updated as unknown as Record<string, unknown>;
          e.status = updated.status as unknown as YamlValue;
          e.summary = updated.summary as unknown as YamlValue;
          e.sources = updated.sources as unknown as YamlValue;
          if (updatedFields.created_by_feature) e.created_by_feature = updatedFields.created_by_feature as unknown as YamlValue;
          if (updatedFields.updated_by_feature) e.updated_by_feature = updatedFields.updated_by_feature as unknown as YamlValue;
          if (updatedFields.created_at) e.created_at = updatedFields.created_at as unknown as YamlValue;
          if (updatedFields.updated_at) e.updated_at = updatedFields.updated_at as unknown as YamlValue;
          if (priority) e.priority = priority;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      throw new CapabilityError("NOT_FOUND", `entry '${entryId}' not found in ${repo} entries`);
    }

    write(outFile, stringifyYamlDocument(doc));

    return {
      ok: true,
      data: {
        repo,
        entry_id: entryId,
        status: "confirmed",
        summary,
        priority: priority || null,
        sources: sources as unknown as YamlValue
      },
      sideEffects: [`entry confirmed: ${entryId}`],
      reportFragments: [`confirmed entry ${entryId} in ${repo} with ${sources.length} source(s)`],
      artifactPaths: [relative(ctx.rootDir, outFile)]
    };
  }
};
