import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, relative } from "node:path";
import type { CapabilitySpec } from "../../core/src/types.ts";
import { CapabilityError } from "../../core/src/types.ts";
import { assertValidArtifact, validateArtifact, parseConfidence, type SourceRef } from "../../core/src/evidence.ts";
import type { ArtifactType } from "../../core/src/evidence.ts";
import {
  artifactRelativePath,
  cognitivePaths,
  loadCognitiveIndex,
  saveCognitiveIndex,
  upsertIndexEntry,
  getRepoSnapshot,
  upsertRepoSnapshot,
  markAssetStale,
  clearAssetStale,
  type RepoSnapshot,
  type StaleAsset,
  type StaleSource
} from "../../core/src/cognitive-index.ts";
import { parseYamlDocument, stringifyYamlDocument, type YamlValue } from "../../core/src/yaml-doc.ts";
import { requireFields, detectRepoLanguage, detectTestCommands, parseReposYamlNames, featureRepoNames } from "../../core/src/capabilities/shared.ts";
import { ensureDir, read, write, runSafe, workspacePaths, listFilesRecursively } from "../../runtime-adapters/src/system.ts";
import { CodeGraphAdapter } from "../../runtime-adapters/src/codegraph.ts";

export type AnyCap = CapabilitySpec<any, any>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIFEST_MARKERS = [
  "package.json", "pnpm-lock.yaml", "yarn.lock",
  "pom.xml", "build.gradle", "build.gradle.kts",
  "pyproject.toml", "requirements.txt", "setup.py",
  "go.mod", "Cargo.toml", "Gemfile", "composer.json",
  "mix.exs", "pubspec.yaml", "Package.swift", "CMakeLists.txt"
];

/** File extensions that the engine will hand back to the AI for entry discovery. */
const CODE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".java", ".kt", ".scala",
  ".py", ".rb", ".go", ".rs", ".php", ".cs", ".swift", ".m", ".mm", ".dart"];

/** Cap on a file's content slice returned by cdr.entries.candidate, in bytes. */
const MAX_FILE_BYTES = 200_000;

/** A reasonable number of files to hand back per candidate call. */
const MAX_FILES_PER_CANDIDATE = 200;

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
  ".mjs": "javascript", ".cjs": "javascript",
  ".java": "java", ".kt": "kotlin", ".scala": "scala",
  ".py": "python", ".rb": "ruby", ".go": "go", ".rs": "rust",
  ".php": "php", ".cs": "csharp", ".swift": "swift",
  ".dart": "dart", ".m": "objc", ".mm": "objcpp"
};

const ENTRY_TYPES = new Set(["api", "mq", "cron", "rpc", "cache", "search", "other"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toKebab(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function languageHintForFile(relpath: string): string {
  const idx = relpath.lastIndexOf(".");
  if (idx < 0) return "unknown";
  return EXT_TO_LANG[relpath.slice(idx).toLowerCase()] || "unknown";
}

function repoDirectoryTree(repoPath: string, rootDir: string): string {
  const tree = runSafe(
    "tree",
    ["-L", "3", "-I", "node_modules|dist|build|target|.git|vendor|__pycache__|.next", repoPath],
    rootDir
  );
  if (tree) return tree.replace(`${repoPath}`, ".").replace(`${repoPath}/`, "./");
  const findOut = runSafe("find", [repoPath, "-maxdepth", "3", "-type", "d"], rootDir);
  if (!findOut) return "(empty or inaccessible)";
  return findOut
    .split("\n")
    .filter(Boolean)
    .slice(0, 80)
    .map((line) => line.replace(`${repoPath}`, ".").replace(`${repoPath}/`, "./"))
    .join("\n");
}

function repoManifestFiles(repoPath: string): string[] {
  return MANIFEST_MARKERS.filter((name) => existsSync(join(repoPath, name)));
}

function profilesDir(rootDir: string): string {
  return join(workspacePaths(rootDir).docsDir, "as-is", "profiles");
}

function entriesDir(rootDir: string): string {
  return join(workspacePaths(rootDir).docsDir, "as-is", "entries");
}

function capabilitiesDir(rootDir: string): string {
  return join(workspacePaths(rootDir).docsDir, "as-is", "capabilities");
}

/**
 * P1 red-line: when an artifact is `kind=fact` (a direct claim about code),
 * every sources[] entry must point at a real file in a registered repo, with
 * line (when present) in range. For `kind=inference` or `kind=unknown`,
 * sources[] are optional citations, and we do NOT strictly require them to
 * have a repo (derived_from[] carries the inference chain instead).
 *
 * This helper enforces that uniformly across all artifact upsert paths so the
 * engine, not the Agent, owns the "evidence exists" check.
 *
 * Returns an array of error strings; empty array means all sources validated.
 */
function validateEvidencePoints(
  ctx: { rootDir: string },
  doc: Record<string, unknown>,
  options: { strictRepo?: boolean } = {}
): string[] {
  const errors: string[] = [];
  const sources = Array.isArray(doc.sources) ? doc.sources : [];
  if (!sources.length) return errors;

  const confidence = doc.confidence as { kind?: string } | undefined;
  const isFact = confidence?.kind === "fact";
  // For non-facts, only validate sources that have an explicit `repo` field —
  // defense against typos. Sources without repo on an inference draft are
  // treated as loose pointers and skipped.
  const sourcesWithRepo = sources.filter(
    (s) => s && typeof s === "object" && !Array.isArray(s) && typeof (s as Record<string, unknown>).repo === "string" && (s as Record<string, unknown>).repo
  );
  if (!isFact && !options.strictRepo && !sourcesWithRepo.length) return errors;

  const defaultRepo = doc.repo ? String(doc.repo) : undefined;
  const cache = new Map<string, { size: number; lineCount: number }>();

  for (const [i, src] of sources.entries()) {
    if (!src || typeof src !== "object" || Array.isArray(src)) {
      errors.push(`sources[${i}] must be an object`);
      continue;
    }
    const s = src as Record<string, unknown>;
    const hasExplicitRepo = typeof s.repo === "string" && (s.repo as string).trim();
    if (!isFact && !options.strictRepo && !hasExplicitRepo) continue;
    const file = typeof s.file === "string" && s.file.trim() ? s.file.trim() : "";
    if (!file) {
      errors.push(`sources[${i}].file is required`);
      continue;
    }
    const repoName = hasExplicitRepo ? (s.repo as string).trim() : defaultRepo;
    if (!repoName) {
      if (isFact) {
        errors.push(`sources[${i}].repo is required (no default repo on artifact)`);
      }
      continue;
    }
    const rel = join("repos", repoName, file);
    const abs = join(ctx.rootDir, rel);
    if (!existsSync(abs)) {
      errors.push(`sources[${i}].file not found in repo '${repoName}': ${file}`);
      continue;
    }
    if (typeof s.line === "number") {
      let info = cache.get(rel);
      if (!info) {
        const content = read(abs);
        info = { size: content.length, lineCount: content.split("\n").length };
        cache.set(rel, info);
      }
      if (s.line < 1 || s.line > info.lineCount) {
        errors.push(
          `sources[${i}].line ${s.line} out of range (file repos/${repoName}/${file} has ${info.lineCount} lines)`
        );
      }
    }
  }
  return errors;
}

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
    // actually inspected so downstream consumers (build-cognitive-pages.ts,
    // the agent itself) can tell whether the graph was used. When the CLI
    // is missing, the block degrades to a `reason` and the rest of the
    // profile is unaffected.
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
    const profileData: Record<string, YamlValue> = {
      repo,
      generated_at: ctx.now.toISOString(),
      language,
      manifest_files: manifestFiles,
      directory_tree: directoryTree,
      test_commands: testCommands,
      codegraph: codegraphBlock as YamlValue
    };

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
      reportFragments: [`generated profile for ${repo}`]
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

    const entryDoc: Record<string, unknown> = {
      id,
      type,
      status: "candidate",
      discovered_by: "ai",
      anchor: file,
      line,
      sources
    };
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
      reportFragments: [`AI proposed entry ${id} (${type}) at ${file}:${line}`]
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
          // Validate the new sources[] before allowing confirmation
          const updated = {
            ...(e as Record<string, unknown>),
            status: "confirmed",
            summary,
            sources
          };
          const evidenceErrors = validateEvidencePoints(ctx, updated);
          if (evidenceErrors.length) {
            throw new CapabilityError("INVALID_EVIDENCE", evidenceErrors.join("; "));
          }

          e.status = "confirmed";
          e.summary = summary;
          e.sources = sources as unknown as YamlValue;
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
      reportFragments: [`confirmed entry ${entryId} in ${repo} with ${sources.length} source(s)`]
    };
  }
};

// ---------------------------------------------------------------------------
// 6. cdr.domain.compose
// ---------------------------------------------------------------------------

export const cdrDomainCompose: AnyCap = {
  id: "cdr.domain.compose",
  version: "1.0.0",
  inputSchema: {
    required: ["domain", "description", "behaviors"],
    properties: {
      domain: { type: "string", minLength: 1 },
      description: { type: "string", minLength: 1 },
      behaviors: { type: "array" },
      repo: { type: "string" },
      sources: { type: "array" },
      confidence: { type: "object" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["domain", "description", "behaviors"]);
    const domainName = String(input.domain);
    const description = String(input.description);
    const behaviorIds: string[] = Array.isArray(input.behaviors)
      ? input.behaviors.map((b: unknown) => String(b))
      : [];
    const repo = input.repo ? String(input.repo) : undefined;

    if (!behaviorIds.length) {
      throw new CapabilityError("INVALID_INPUT", "behaviors[] must contain at least one behavior ID (P1 rule: domain must have derived_from)");
    }

    const cp = cognitivePaths(ctx.rootDir);
    const index = loadCognitiveIndex(ctx.rootDir);

    const missingBehaviors: string[] = [];
    const matchedBehaviors: Array<Record<string, YamlValue>> = [];

    for (const bid of behaviorIds) {
      const found = index.behaviors.find((b) => b.id === bid);
      if (!found) {
        missingBehaviors.push(bid);
      } else {
        const behaviorPath = join(ctx.rootDir, found.path);
        if (existsSync(behaviorPath)) {
          const behaviorDoc = parseYamlDocument(read(behaviorPath));
          matchedBehaviors.push({
            id: String(behaviorDoc.id || bid),
            name: String(behaviorDoc.id || bid),
            summary: String(behaviorDoc.summary || behaviorDoc.description || ""),
            kind: found.kind,
            level: found.level
          });
        } else {
          matchedBehaviors.push({
            id: bid,
            name: bid,
            summary: "",
            kind: found.kind,
            level: found.level
          });
        }
      }
    }

    if (missingBehaviors.length) {
      throw new CapabilityError("NOT_FOUND", `behaviors not found in cognitive index: ${missingBehaviors.join(", ")}`);
    }

    const domainSlug = toKebab(domainName);

    const domainDoc: Record<string, YamlValue> = {
      domain: domainSlug,
      name: domainName,
      description,
      generated_at: ctx.now.toISOString(),
      modules: matchedBehaviors as unknown as YamlValue,
      derived_from: behaviorIds,
      confidence: {
        level: "medium",
        kind: "inference",
        evidence_type: "composed_from_behaviors"
      }
    };
    if (repo) domainDoc.repo = repo;
    if (Array.isArray(input.sources)) domainDoc.sources = input.sources as unknown as YamlValue;

    // P1: if sources[] provided, validate they point at real code
    const evidenceErrors = validateEvidencePoints(ctx, domainDoc as Record<string, unknown>);
    if (evidenceErrors.length) {
      throw new CapabilityError("INVALID_EVIDENCE", evidenceErrors.join("; "));
    }

    // Validate before writing (P1 rule enforcement)
    const errors = validateArtifact("domain", domainDoc as Record<string, unknown>);
    if (errors.length) {
      throw new CapabilityError("INVALID_ARTIFACT", errors.join("; "));
    }

    const outDir = cp.domainDir;
    ensureDir(outDir);
    const outFile = join(outDir, `${domainSlug}.yaml`);
    write(outFile, stringifyYamlDocument(domainDoc));

    return {
      ok: true,
      data: {
        domain: domainSlug,
        path: relative(ctx.rootDir, outFile),
        behavior_count: behaviorIds.length,
        derived_from: behaviorIds
      },
      sideEffects: [`domain composed: ${relative(ctx.rootDir, outFile)}`],
      reportFragments: [`composed domain '${domainName}' from ${behaviorIds.length} behavior(s)`]
    };
  }
};

// ---------------------------------------------------------------------------
// 7. cdr.business.compose
// ---------------------------------------------------------------------------

export const cdrBusinessCompose: AnyCap = {
  id: "cdr.business.compose",
  version: "1.0.0",
  inputSchema: {
    required: ["id", "kind", "confidence"],
    properties: {
      id: { type: "string", minLength: 1 },
      kind: { type: "string", enum: ["invariant", "constraint", "authorization", "sla", "compensation"] },
      description: { type: "string" },
      expr: { type: "string" },
      applies_to: { type: "array" },
      repo: { type: "string" },
      confidence: { type: "object" },
      sources: { type: "array" },
      derived_from: { type: "array" },
      reason: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const id = String(input.id);
    const kind = String(input.kind);
    const doc: Record<string, YamlValue> = { id, kind };
    if (input.description) doc.description = String(input.description);
    if (input.expr) doc.expr = String(input.expr);
    if (Array.isArray(input.applies_to)) doc.applies_to = input.applies_to.map((x: unknown) => String(x)) as unknown as YamlValue;
    if (input.repo) doc.repo = String(input.repo);
    if (Array.isArray(input.sources)) doc.sources = input.sources as unknown as YamlValue;
    if (Array.isArray(input.derived_from)) doc.derived_from = input.derived_from.map((x: unknown) => String(x)) as unknown as YamlValue;
    if (input.reason) doc.reason = String(input.reason);
    doc.confidence = input.confidence as YamlValue;

    // P1: validate sources[] point at real code
    const evidenceErrors = validateEvidencePoints(ctx, doc as Record<string, unknown>);
    if (evidenceErrors.length) {
      throw new CapabilityError("INVALID_EVIDENCE", evidenceErrors.join("; "));
    }

    const errors = validateArtifact("business-rule", doc as Record<string, unknown>);
    if (errors.length) {
      throw new CapabilityError("INVALID_ARTIFACT", errors.join("; "));
    }

    const cp = cognitivePaths(ctx.rootDir);
    ensureDir(cp.businessRulesDir);
    const relPath = artifactRelativePath("business-rule", doc as Record<string, unknown>);
    const absPath = join(ctx.rootDir, relPath);
    const content = stringifyYamlDocument(doc);
    write(absPath, content.endsWith("\n") ? content : `${content}\n`);

    const index = loadCognitiveIndex(ctx.rootDir);
    upsertIndexEntry(index, "business-rule", relPath, doc as Record<string, unknown>);
    saveCognitiveIndex(ctx.rootDir, index);

    return {
      ok: true,
      data: {
        id,
        kind,
        path: relPath,
        evidence_kind: (input.confidence as Record<string, unknown>).kind
      },
      sideEffects: ["business rule upserted", "index updated"],
      reportFragments: [`upserted business rule ${id} (${kind})`]
    };
  }
};

// ---------------------------------------------------------------------------
// 8. cdr.capability.map.init
// ---------------------------------------------------------------------------

export const cdrCapabilityMapInit: AnyCap = {
  id: "cdr.capability.map.init",
  version: "1.0.0",
  inputSchema: {
    required: ["product", "capabilities"],
    properties: {
      product: { type: "string", minLength: 1 },
      capabilities: { type: "array" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["product", "capabilities"]);
    const product = String(input.product);
    const capabilities: Array<Record<string, unknown>> = Array.isArray(input.capabilities)
      ? input.capabilities
      : [];

    if (!capabilities.length) {
      throw new CapabilityError("INVALID_INPUT", "capabilities[] must contain at least one capability");
    }

    const capEntries: Array<Record<string, YamlValue>> = capabilities.map((cap) => {
      const entry: Record<string, YamlValue> = {
        id: String(cap.id || ""),
        name: String(cap.name || ""),
        description: String(cap.description || "")
      };
      if (Array.isArray(cap.domains)) {
        entry.domains = cap.domains.map((d: unknown) => String(d));
      }
      return entry;
    });

    const mapDoc: Record<string, YamlValue> = {
      product,
      generated_at: ctx.now.toISOString(),
      capabilities: capEntries as unknown as YamlValue
    };

    const errors = validateArtifact("capability-map", mapDoc as Record<string, unknown>);
    if (errors.length) {
      throw new CapabilityError("INVALID_ARTIFACT", errors.join("; "));
    }

    const outDir = capabilitiesDir(ctx.rootDir);
    ensureDir(outDir);
    const outFile = join(outDir, "product-map.yaml");
    write(outFile, stringifyYamlDocument(mapDoc));

    return {
      ok: true,
      data: {
        product,
        path: relative(ctx.rootDir, outFile),
        capability_count: capEntries.length
      },
      sideEffects: [`capability map created: ${relative(ctx.rootDir, outFile)}`],
      reportFragments: [`initialized capability map for '${product}' with ${capEntries.length} capabilities`]
    };
  }
};

// ---------------------------------------------------------------------------
// 9. cdr.index.list
// ---------------------------------------------------------------------------

export const cdrIndexList: AnyCap = {
  id: "cdr.index.list",
  version: "1.1.0",
  inputSchema: {
    properties: {
      repo: { type: "string" },
      kind: { type: "string", enum: ["fact", "inference", "unknown"] },
      entity: { type: "string" },
      id_contains: { type: "string" },
      created_by_feature: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const index = loadCognitiveIndex(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    const repoFilter = input.repo ? String(input.repo) : undefined;
    const kindFilter = input.kind ? String(input.kind) : undefined;
    const entityFilter = input.entity ? String(input.entity) : undefined;
    const idContainsFilter = input.id_contains ? String(input.id_contains).toLowerCase() : undefined;
    const createdByFeatureFilter = input.created_by_feature ? String(input.created_by_feature) : undefined;

    function matchesText<T>(entry: T, getText: (e: T) => string | undefined): boolean {
      if (idContainsFilter) {
        const haystack = `${getText(entry) ?? ""}`.toLowerCase();
        if (!haystack.includes(idContainsFilter)) return false;
      }
      if (createdByFeatureFilter) {
        const origin = (entry as unknown as { created_by_feature?: string }).created_by_feature;
        if (origin !== createdByFeatureFilter) return false;
      }
      return true;
    }

    const behaviors = index.behaviors.filter((b) => {
      if (repoFilter && b.repo !== repoFilter) return false;
      if (kindFilter && b.kind !== kindFilter) return false;
      if (entityFilter && (b as unknown as { entity?: string }).entity !== entityFilter) return false;
      if (!matchesText(b, () => b.id)) return false;
      return true;
    });

    const stateMachines = index.state_machines.filter((s) => {
      if (repoFilter && s.repo !== repoFilter) return false;
      if (kindFilter && s.kind !== kindFilter) return false;
      if (entityFilter && s.entity !== entityFilter) return false;
      if (!matchesText(s, () => s.entity)) return false;
      return true;
    });

    const domains: Array<Record<string, string>> = [];
    if (existsSync(cp.domainDir)) {
      const domainFiles = listFilesRecursively(cp.domainDir, [".yaml", ".yml"], 50);
      for (const df of domainFiles) {
        try {
          const doc = parseYamlDocument(read(df));
          const domain = String(doc.domain || doc.name || "");
          if (domain) {
            domains.push({
              domain,
              path: relative(ctx.rootDir, df)
            });
          }
        } catch {
          // skip malformed files
        }
      }
    }

    const capMaps: Array<Record<string, string>> = [];
    const capDir = capabilitiesDir(ctx.rootDir);
    if (existsSync(capDir)) {
      const capFiles = listFilesRecursively(capDir, [".yaml", ".yml"], 50);
      for (const cf of capFiles) {
        try {
          const doc = parseYamlDocument(read(cf));
          const product = String(doc.product || "");
          if (product) {
            capMaps.push({
              product,
              path: relative(ctx.rootDir, cf)
            });
          }
        } catch {
          // skip malformed files
        }
      }
    }

    const businessRules = (index.business_rules || []).filter((b) => {
      if (repoFilter && b.repo !== repoFilter) return false;
      if (kindFilter && b.evidence_kind !== kindFilter) return false;
      return true;
    });

    const unknowns = index.unknowns;

    const lines = [
      `# Cognitive Assets Index`,
      ``,
      `- Updated: ${index.updated_at}`,
      `- Behaviors: ${behaviors.length}`,
      `- State Machines: ${stateMachines.length}`,
      `- Domains: ${domains.length}`,
      `- Capability Maps: ${capMaps.length}`,
      `- Business Rules: ${businessRules.length}`,
      `- Unknowns: ${unknowns.length}`,
      ``,
      `## Behaviors`,
      ...(behaviors.length
        ? behaviors.map((b) => `- ${b.id} [${b.kind}/${b.level}] ${b.path}${b.repo ? ` (${b.repo})` : ""}`)
        : ["- none"]),
      ``,
      `## State Machines`,
      ...(stateMachines.length
        ? stateMachines.map((s) => `- ${s.entity} [${s.kind}/${s.level}] ${s.path}${s.repo ? ` (${s.repo})` : ""}`)
        : ["- none"]),
      ``,
      `## Domains`,
      ...(domains.length
        ? domains.map((d) => `- ${d.domain} → ${d.path}`)
        : ["- none"]),
      ``,
      `## Capability Maps`,
      ...(capMaps.length
        ? capMaps.map((c) => `- ${c.product} → ${c.path}`)
        : ["- none"]),
      ``,
      `## Business Rules`,
      ...(businessRules.length
        ? businessRules.map((r) => `- ${r.id} [${r.kind}] [${r.evidence_kind}/${r.evidence_level}] ${r.path}${r.repo ? ` (${r.repo})` : ""}`)
        : ["- none"]),
      ``,
      `## Unknowns`,
      ...(unknowns.length
        ? unknowns.map((u) => `- ${u.id}: ${u.reason}`)
        : ["- none"])
    ];

    return {
      ok: true,
      data: {
        text: lines.join("\n"),
        behaviors,
        state_machines: stateMachines,
        domains,
        capability_maps: capMaps,
        business_rules: businessRules,
        unknowns,
        updated_at: index.updated_at
      },
      sideEffects: [],
      reportFragments: ["cognitive assets listed"]
    };
  }
};

// ---------------------------------------------------------------------------
// Capability: cdr.query (cross-cut read-only search)
//
// Semantic filters: event / writes_table / calls_target / target_repo.
// Origin filter: created_by_feature. Read-only.
// ---------------------------------------------------------------------------

export const cdrQuery: AnyCap = {
  id: "cdr.query",
  version: "1.0.0",
  inputSchema: {
    properties: {
      target: {
        type: "string",
        enum: ["any", "behavior", "state-machine", "business-rule", "domain", "capability-map"]
      },
      entity: { type: "string" },
      id_contains: { type: "string" },
      event: { type: "string" },
      writes_table: { type: "string" },
      calls_target: { type: "string" },
      target_repo: { type: "string" },
      created_by_feature: { type: "string" },
      repo: { type: "string" },
      limit: { type: "number" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const index = loadCognitiveIndex(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    const idContains = input.id_contains ? String(input.id_contains).toLowerCase() : undefined;
    const eventFilter = input.event ? String(input.event) : undefined;
    const writesTableFilter = input.writes_table ? String(input.writes_table) : undefined;
    const callsTargetFilter = input.calls_target ? String(input.calls_target) : undefined;
    const targetRepoFilter = input.target_repo ? String(input.target_repo) : undefined;
    const createdByFeatureFilter = input.created_by_feature ? String(input.created_by_feature) : undefined;
    const repoFilter = input.repo ? String(input.repo) : undefined;
    const entityFilter = input.entity ? String(input.entity) : undefined;
    const targetKind = (input.target && input.target !== "any")
      ? String(input.target)
      : undefined;
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 500);

    type Result = {
      kind: string;
      id: string;
      repo?: string;
      path: string;
      summary: string;
      sources: Array<{ file?: string; line?: number }>;
    };
    const results: Result[] = [];

    const includeBehavior = !targetKind || targetKind === "behavior";
    const includeState = !targetKind || targetKind === "state-machine";
    const includeRule = !targetKind || targetKind === "business-rule";
    const includeDomain = !targetKind || targetKind === "domain";
    const includeCapMap = !targetKind || targetKind === "capability-map";

    if (includeBehavior) {
      for (const b of index.behaviors) {
        if (repoFilter && b.repo !== repoFilter) continue;
        if (idContains && !(b.id || "").toLowerCase().includes(idContains)) continue;
        if (createdByFeatureFilter && (b as unknown as { created_by_feature?: string }).created_by_feature !== createdByFeatureFilter) continue;
        if (eventFilter || writesTableFilter || callsTargetFilter || targetRepoFilter) {
          const details = readBehaviorDetails(ctx.rootDir, b.path);
          if (eventFilter && !(details.events || []).some((e) => String(e).includes(eventFilter))) continue;
          if (writesTableFilter && !(details.writes || []).some((w) => String(w.table || "").includes(writesTableFilter))) continue;
          if (callsTargetFilter && !(details.calls || []).some((c) => {
            const t = typeof c === "string" ? c : (c as { target?: string }).target;
            return t ? String(t).includes(callsTargetFilter) : false;
          })) continue;
          if (targetRepoFilter && !(details.calls || []).some((c) => {
            if (typeof c === "string") return false;
            return ((c as { target_repo?: string }).target_repo) === targetRepoFilter;
          })) continue;
        }
        const summary = (b as unknown as { description?: string }).description
          || `Behavior ${b.id} (${b.kind})`;
        results.push({
          kind: "behavior",
          id: b.id,
          repo: b.repo,
          path: b.path,
          summary: String(summary).slice(0, 200),
          sources: []
        });
      }
    }

// behavior-shaped filters (event / writes_table / calls_target / target_repo)
// don't apply to state-machines; suppress them when any such filter is set
    const behaviorShapedFilters = !!(eventFilter || writesTableFilter || callsTargetFilter || targetRepoFilter);
    const includeStateShaped = (!targetKind || targetKind === "state-machine") && !behaviorShapedFilters;

    if (includeStateShaped) {
      for (const s of index.state_machines) {
        if (repoFilter && s.repo !== repoFilter) continue;
        if (entityFilter && s.entity !== entityFilter) continue;
        if (idContains && !(s.entity || "").toLowerCase().includes(idContains)) continue;
        if (createdByFeatureFilter && (s as unknown as { created_by_feature?: string }).created_by_feature !== createdByFeatureFilter) continue;
        results.push({
          kind: "state-machine",
          id: s.entity,
          repo: s.repo,
          path: s.path,
          summary: `State machine for ${s.entity} (${s.kind})`,
          sources: []
        });
      }
    }

    if (includeRule) {
      for (const r of index.business_rules) {
        if (repoFilter && r.repo !== repoFilter) continue;
        if (idContains && !(r.id || "").toLowerCase().includes(idContains)) continue;
        if (callsTargetFilter) {
          const apStr = JSON.stringify((r as unknown as { applies_to?: unknown[] }).applies_to || []);
          if (!apStr.includes(callsTargetFilter)) continue;
        }
        if (createdByFeatureFilter && (r as unknown as { created_by_feature?: string }).created_by_feature !== createdByFeatureFilter) continue;
        results.push({
          kind: "business-rule",
          id: r.id,
          repo: r.repo,
          path: r.path,
          summary: `Rule ${r.id} (${r.kind})`,
          sources: []
        });
      }
    }

    if (includeDomain) {
      const domainFiles = listFilesRecursively(cp.domainDir, [".yaml", ".yml"], 200);
      for (const df of domainFiles) {
        try {
          const doc = parseYamlDocument(read(df));
          const name = String(doc.domain || doc.name || "");
          if (!name) continue;
          if (idContains && !name.toLowerCase().includes(idContains)) continue;
          if (createdByFeatureFilter && (doc as { created_by_feature?: string }).created_by_feature !== createdByFeatureFilter) continue;
          results.push({
            kind: "domain",
            id: name,
            path: relative(ctx.rootDir, df),
            summary: String(doc.description || `Domain ${name}`).slice(0, 200),
            sources: []
          });
        } catch {
          // skip malformed
        }
      }
    }

    if (includeCapMap) {
      const capFiles = listFilesRecursively(cp.capabilityDir, [".yaml", ".yml"], 50);
      for (const cf of capFiles) {
        try {
          const doc = parseYamlDocument(read(cf));
          const product = String(doc.product || "");
          if (idContains && !product.toLowerCase().includes(idContains)) continue;
          results.push({
            kind: "capability-map",
            id: product || basename(cf, ".yaml"),
            path: relative(ctx.rootDir, cf),
            summary: `Capability map for ${product || basename(cf, ".yaml")}`,
            sources: []
          });
        } catch {
          // skip malformed
        }
      }
    }

    const total = results.length;
    const capped = results.slice(0, limit);
    return {
      ok: true,
      data: {
        results: capped,
        total,
        next_step: total > limit
          ? `narrow filter or increase limit; matched ${total}, returned ${limit}`
          : ""
      },
      sideEffects: [],
      reportFragments: [`cdr.query matched ${total} asset(s)`]
    };
  }
};

// ---------------------------------------------------------------------------
// Capability: cdr.pipeline.status
//
// Per-phase status (done / blocked / skipped) + artifacts_count + next_action
// with exact capability + input shape the AI should call next.
// Closes phase 2-6 orchestration: engine tells AI what to call next.
// ---------------------------------------------------------------------------

type PhaseId =
  | "profile"
  | "entries"
  | "behavior"
  | "state"
  | "domain"
  | "rule"
  | "capability-map"
  | "doc";

interface PhaseStatus {
  id: PhaseId;
  status: "done" | "blocked" | "skipped";
  artifacts_count: number;
  next_action?: {
    capability: string;
    input_template: { repo?: string; required_fields: Array<{ name: string; type: string; description: string }> };
    hint: string;
  };
}

export const cdrPipelineStatus: AnyCap = {
  id: "cdr.pipeline.status",
  version: "1.0.0",
  inputSchema: {
    required: ["repo"],
    properties: {
      repo: { type: "string", minLength: 1 },
      up_to_phase: {
        type: "string",
        enum: ["profile", "entries", "behavior", "state", "domain", "rule", "capability-map", "doc", "all"]
      }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["repo"]);
    const p = workspacePaths(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    const repo = String(input.repo);
    const repoPath = join(p.reposDir, repo);
    const upTo = String(input.up_to_phase || "all");

    if (!existsSync(repoPath)) {
      throw new CapabilityError("REPO_MISSING", `repos/${repo} not found`);
    }

    const index = loadCognitiveIndex(ctx.rootDir);
    const behaviorsForRepo = index.behaviors.filter((b) => b.repo === repo);
    const stateMachinesForRepo = index.state_machines.filter((s) => s.repo === repo);
    const businessRulesForRepo = index.business_rules.filter((r) => r.repo === repo);

    const phases: PhaseStatus[] = [];

    const profileDone = existsSync(join(cp.profilesDir, `${repo}.yaml`));
    phases.push({
      id: "profile",
      status: profileDone ? "done" : "blocked",
      artifacts_count: profileDone ? 1 : 0,
      next_action: profileDone ? undefined : {
        capability: "cdr.profile",
        input_template: { repo, required_fields: [{ name: "repo", type: "string", description: "the repo name (as registered in repos.yaml)" }] },
        hint: "start the pipeline by writing the L0 tech profile"
      }
    });

    const entriesFile = join(cp.entriesDir, `${repo}.yaml`);
    const entriesDoc = existsSync(entriesFile) ? parseYamlDocumentSafe(read(entriesFile)) : null;
    const candidateCount = entriesDoc && Array.isArray((entriesDoc as { entries?: unknown[] }).entries)
      ? (entriesDoc as { entries: unknown[] }).entries.length
      : 0;
    const confirmedCount = entriesDoc && Array.isArray((entriesDoc as { entries?: Array<{ status?: string }> }).entries)
      ? (entriesDoc as { entries: Array<{ status?: string }> }).entries.filter((e) => e.status === "confirmed").length
      : 0;
    const entriesDone = confirmedCount > 0;
    const entriesBlocked = !profileDone;
    phases.push({
      id: "entries",
      status: entriesBlocked ? "blocked" : (entriesDone ? "done" : "blocked"),
      artifacts_count: candidateCount,
      next_action: entriesBlocked ? undefined : (entriesDone ? undefined : {
        capability: "cdr.entries.candidate",
        input_template: { repo, required_fields: [{ name: "repo", type: "string", description: "the repo name" }] },
        hint: candidateCount > 0
          ? `AI: read candidate files, then cdr.entries.propose per entry with sources[]`
          : "no candidate entries yet — engine will list code files"
      })
    });

    phases.push({
      id: "behavior",
      status: entriesBlocked ? "blocked" : (behaviorsForRepo.length > 0 ? "done" : "blocked"),
      artifacts_count: behaviorsForRepo.length,
      next_action: entriesBlocked || behaviorsForRepo.length > 0 ? undefined : {
        capability: "cdr.behavior.upsert",
        input_template: {
          repo,
          required_fields: [
            { name: "id", type: "string", description: "behavior id, e.g. 'order-create'" },
            { name: "repo", type: "string", description: "the repo name" },
            { name: "entry", type: "object", description: "HTTP/method/path or similar" },
            { name: "confidence", type: "object", description: "kind=fact requires sources[]" }
          ]
        },
        hint: "trace each confirmed entry's calls/writes/events; one behavior per logical action"
      }
    });

    const stateCount = stateMachinesForRepo.length;
    phases.push({
      id: "state",
      status: behaviorsForRepo.length === 0 ? "blocked" : (stateCount > 0 ? "done" : "blocked"),
      artifacts_count: stateCount,
      next_action: behaviorsForRepo.length === 0 || stateCount > 0 ? undefined : {
        capability: "cdr.state.derive",
        input_template: {
          repo,
          required_fields: [
            { name: "entity", type: "string", description: "entity name, e.g. 'Order'" },
            { name: "behaviors", type: "array", description: "behavior ids for this entity" }
          ]
        },
        hint: "pick a central entity (Order / Payment / etc) and derive its lifecycle"
      }
    });

    const domainForRepo = existsSync(cp.domainDir)
      ? readdirSync(cp.domainDir).some((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      : false;
    phases.push({
      id: "domain",
      status: behaviorsForRepo.length === 0 ? "blocked" : (domainForRepo ? "done" : "blocked"),
      artifacts_count: domainForRepo ? 1 : 0,
      next_action: behaviorsForRepo.length === 0 || domainForRepo ? undefined : {
        capability: "cdr.domain.compose",
        input_template: {
          repo,
          required_fields: [
            { name: "domain", type: "string", description: "kebab-case name" },
            { name: "description", type: "string", description: "1-2 sentence summary" },
            { name: "derived_from", type: "array", description: "behavior ids (P1 red line)" }
          ]
        },
        hint: "cluster behaviors by entity / responsibility; derived_from required"
      }
    });

    phases.push({
      id: "rule",
      status: businessRulesForRepo.length > 0 ? "done" : "skipped",
      artifacts_count: businessRulesForRepo.length,
      next_action: businessRulesForRepo.length > 0 ? undefined : {
        capability: "cdr.business.compose",
        input_template: {
          repo,
          required_fields: [
            { name: "id", type: "string", description: "rule id, kebab-case" },
            { name: "kind", type: "string", description: "invariant / constraint / authorization / sla / compensation" },
            { name: "applies_to", type: "array", description: "behavior ids this rule constrains" }
          ]
        },
        hint: "optional but valuable when SLA / authorization / compensation patterns exist"
      }
    });

    const capMapDone = existsSync(join(cp.capabilityDir, "product-map.yaml"));
    phases.push({
      id: "capability-map",
      status: capMapDone ? "done" : "blocked",
      artifacts_count: capMapDone ? 1 : 0,
      next_action: capMapDone ? undefined : {
        capability: "cdr.capability.map.init",
        input_template: {
          required_fields: [
            { name: "product", type: "string", description: "the product this map belongs to" },
            { name: "capabilities", type: "array", description: "list of {id, name, spans_repos, ...}" }
          ]
        },
        hint: "wire domains into the L1 capability map"
      }
    });

    const docDone = existsSync(join(ctx.rootDir, ".dapei", "docs-portal", "index.md"));
    phases.push({
      id: "doc",
      status: capMapDone ? (docDone ? "done" : "blocked") : "blocked",
      artifacts_count: docDone ? 1 : 0,
      next_action: !capMapDone || docDone ? undefined : {
        capability: "cdr.doc.generate",
        input_template: { required_fields: [] },
        hint: "render the VitePress portal at .dapei/docs-portal/"
      }
    });

    const filtered = upTo === "all"
      ? phases
      : phases.filter((p) => {
          const order: PhaseId[] = ["profile", "entries", "behavior", "state", "domain", "rule", "capability-map", "doc"];
          return order.indexOf(p.id) <= order.indexOf(upTo as PhaseId);
        });

    const doneOrSkipped = filtered.filter((p) => p.status === "done" || p.status === "skipped").length;
    const doneCount = filtered.filter((p) => p.status === "done").length;
    const overall = doneOrSkipped === filtered.length
      ? "complete"
      : doneCount === 0
        ? "empty"
        : "partial";

    const nextStep = overall === "complete"
      ? "all phases done; portal generated"
      : overall === "empty"
        ? `start with ${phases[0].next_action?.capability || "cdr.profile"}`
        : (filtered.find((p) => p.status !== "done")?.next_action?.hint || "continue with the next unfinished phase");

    return {
      ok: true,
      data: {
        repo,
        phases: filtered,
        overall_status: overall,
        next_step: nextStep
      },
      sideEffects: [],
      reportFragments: [`pipeline status for ${repo}: ${overall} (${doneCount}/${filtered.length})`]
    };
  }
};

// ---------------------------------------------------------------------------
// Capability: cdr.feature.link
//
// Tag every CDR asset touched by a feature with `created_by_feature =
// <feature>` so that `cdr.query --created_by_feature <feature>` can
// surface them later, and so the closeout backfill to
// `docs/decisions/<feature>.md` can list what the feature actually
// produced. Idempotent: re-running on the same feature is a no-op
// (the field is overwritten with the same value).
//
// `feature.close` calls this on the way out. It is also callable
// from `feature.review` if a team wants to surface the link before
// the feature is closed.
// ---------------------------------------------------------------------------

export const cdrFeatureLink: AnyCap = {
  id: "cdr.feature.link",
  version: "1.0.0",
  inputSchema: {
    required: ["feature"],
    properties: {
      feature: { type: "string", minLength: 1 },
      repo: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["feature"]);
    const feature = String(input.feature);
    const repo = input.repo ? String(input.repo) : undefined;
    const now = ctx.now.toISOString();

    const index = loadCognitiveIndex(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    let tagged = 0;

    const tagInList = <T extends { created_by_feature?: string; created_at?: string; path: string; repo?: string }>(list: T[]): T[] => {
      let touched = 0;
      const out = list.map((entry) => {
        if (repo && entry.repo && entry.repo !== repo) return entry;
        if (entry.created_by_feature === feature) return entry;
        touched++;
        return { ...entry, created_by_feature: feature, created_at: now };
      });
      tagged += touched;
      return out;
    };

    index.behaviors = tagInList(index.behaviors);
    index.state_machines = tagInList(index.state_machines);
    index.business_rules = tagInList(index.business_rules);

    if (existsSync(cp.domainDir)) {
      const domainFiles = listFilesRecursively(cp.domainDir, [".yaml", ".yml"], 200);
      for (const df of domainFiles) {
        try {
          const doc = parseYamlDocument(read(df));
          if (repo) {
            const docRepo = String((doc as { repo?: string }).repo || "");
            if (docRepo && docRepo !== repo) continue;
          }
          if ((doc as { created_by_feature?: string }).created_by_feature === feature) continue;
          (doc as Record<string, unknown>).created_by_feature = feature;
          (doc as Record<string, unknown>).created_at = now;
          write(df, stringifyYamlDocument(doc));
          tagged++;
        } catch {
          // skip malformed
        }
      }
    }

    if (existsSync(cp.capabilityDir)) {
      const capFiles = listFilesRecursively(cp.capabilityDir, [".yaml", ".yml"], 50);
      for (const cf of capFiles) {
        try {
          const doc = parseYamlDocument(read(cf));
          if ((doc as { created_by_feature?: string }).created_by_feature === feature) continue;
          (doc as Record<string, unknown>).created_by_feature = feature;
          (doc as Record<string, unknown>).created_at = now;
          write(cf, stringifyYamlDocument(doc));
          tagged++;
        } catch {
          // skip malformed
        }
      }
    }

    saveCognitiveIndex(ctx.rootDir, index);

    return {
      ok: true,
      data: {
        feature,
        repo: repo || "*",
        assets_tagged: tagged
      },
      sideEffects: ["cognitive index updated", "docs/as-is tagged"],
      reportFragments: [`linked ${tagged} asset(s) to feature ${feature}`]
    };
  }
};

function parseYamlDocumentSafe(content: string): Record<string, unknown> | null {
  try {
    return parseYamlDocument(content);
  } catch {
    return null;
  }
}

interface BehaviorDetails {
  events?: string[];
  writes?: Array<{ table?: string }>;
  calls?: Array<string | { target?: string; target_repo?: string }>;
}

function readBehaviorDetails(rootDir: string, relPath: string): BehaviorDetails {
  const fullPath = join(rootDir, relPath);
  if (!existsSync(fullPath)) return {};
  try {
    const doc = parseYamlDocument(read(fullPath));
    return doc as BehaviorDetails;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// 10. cdr.behavior.upsert
// ---------------------------------------------------------------------------

export const cdrBehaviorUpsert: AnyCap = {
  id: "cdr.behavior.upsert",
  version: "1.0.0",
  inputSchema: {
    required: ["id", "entry", "confidence"],
    properties: {
      id: { type: "string", minLength: 1 },
      repo: { type: "string" },
      entry: { type: "object" },
      steps: { type: "array" },
      writes: { type: "array" },
      events: { type: "array" },
      calls: { type: "array" },
      risks: { type: "array" },
      confidence: { type: "object" },
      sources: { type: "array" },
      derived_from: { type: "array" },
      reason: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const doc: Record<string, YamlValue> = {
      id: String(input.id),
      entry: input.entry as YamlValue
    };
    if (input.repo) doc.repo = String(input.repo);
    if (Array.isArray(input.steps)) doc.steps = input.steps as unknown as YamlValue;
    if (Array.isArray(input.writes)) doc.writes = input.writes as unknown as YamlValue;
    if (Array.isArray(input.events)) doc.events = input.events.map((x: unknown) => String(x)) as unknown as YamlValue;
    // v0.6 — structured calls[]. Preserve objects (v0.5 used calls.map(String)
    // which silently turned objects into the literal "[object Object]").
    // Legacy string calls pass through unchanged; object calls with `target`
    // / `protocol` / `target_repo` / `evidence` keep their structure.
    if (Array.isArray(input.calls)) {
      doc.calls = input.calls.map((c: unknown) => {
        if (typeof c === "string") return c as unknown as YamlValue;
        if (c && typeof c === "object" && !Array.isArray(c)) {
          const co = c as Record<string, unknown>;
          // v0.6 minimal validation: structured calls must have `target`.
          // Protocol is optional but if present must be a known string.
          if (typeof co.target !== "string" || !co.target.trim()) {
            throw new CapabilityError("INVALID_INPUT", "calls[0].target is required");
          }
          if (co.protocol !== undefined && (typeof co.protocol !== "string" || !["http", "grpc", "mq", "sql", "function"].includes(co.protocol))) {
            throw new CapabilityError("INVALID_INPUT", `structured call protocol must be one of http|grpc|mq|sql|function, got: ${String(co.protocol)}`);
          }
          return co as unknown as YamlValue;
        }
        throw new CapabilityError("INVALID_INPUT", "call entries must be strings or objects");
      }) as unknown as YamlValue;
    }
    if (Array.isArray(input.risks)) doc.risks = input.risks.map((x: unknown) => String(x)) as unknown as YamlValue;
    if (Array.isArray(input.sources)) doc.sources = input.sources as unknown as YamlValue;
    if (Array.isArray(input.derived_from)) doc.derived_from = input.derived_from.map((x: unknown) => String(x)) as unknown as YamlValue;
    if (input.reason) doc.reason = String(input.reason);
    doc.confidence = input.confidence as YamlValue;

    // v0.7 — CodeGraph refs cross-check. For each structured call that
    // carries an `evidence` SourceRef, ask the adapter whether the
    // named `target` appears in the call-graph neighborhood at that
    // file:line. When the CLI is present and the target is NOT in
    // refs, the call is rejected with INVALID_EVIDENCE — the user
    // has CodeGraph and expects accuracy. When the CLI is missing,
    // the check is skipped (graceful degradation) — the user has
    // accepted the absence by not installing the CLI. The single
    // doctor probe means every calls[] entry in one upsert
    // invocation shares one CLI invocation.
    if (Array.isArray(doc.calls) && input.repo) {
      const adapter = new CodeGraphAdapter(ctx.rootDir);
      if (adapter.isAvailable()) {
        const repoPath = join(workspacePaths(ctx.rootDir).reposDir, String(input.repo));
        for (let i = 0; i < (doc.calls as unknown[]).length; i++) {
          const c = (doc.calls as unknown[])[i];
          if (!c || typeof c !== "object") continue;
          const co = c as Record<string, unknown>;
          const evidence = co.evidence as Record<string, unknown> | undefined;
          if (!evidence || typeof evidence.file !== "string") continue;
          const refsRes = adapter.refs(repoPath, {
            file: String(evidence.file),
            line: typeof evidence.line === "number" ? evidence.line : undefined
          });
          if (!refsRes.available) continue;
          const target = String(co.target);
          const matched = refsRes.callees.some((cal) => {
            if (cal.name === target) return true;
            if (cal.name.endsWith("." + target)) return true;
            return false;
          });
          if (!matched) {
            throw new CapabilityError(
              "INVALID_EVIDENCE",
              `calls[${i}].target '${target}' not found in codegraph refs at ${evidence.file}:${evidence.line || 0}`
            );
          }
        }
      }
    }

    // P1: validate sources[] point at real code (file exists, line in range)
    const evidenceErrors = validateEvidencePoints(ctx, doc as Record<string, unknown>);
    if (evidenceErrors.length) {
      throw new CapabilityError("INVALID_EVIDENCE", evidenceErrors.join("; "));
    }

    const errors = validateArtifact("behavior", doc as Record<string, unknown>);
    if (errors.length) {
      throw new CapabilityError("INVALID_ARTIFACT", errors.join("; "));
    }

    const cp = cognitivePaths(ctx.rootDir);
    ensureDir(cp.behaviorDir);
    const relPath = artifactRelativePath("behavior", doc as Record<string, unknown>);
    const absPath = join(ctx.rootDir, relPath);
    const content = stringifyYamlDocument(doc);
    write(absPath, content.endsWith("\n") ? content : `${content}\n`);

    const index = loadCognitiveIndex(ctx.rootDir);
    upsertIndexEntry(index, "behavior", relPath, doc as Record<string, unknown>);
    saveCognitiveIndex(ctx.rootDir, index);

    return {
      ok: true,
      data: {
        type: "behavior",
        path: relPath,
        id: doc.id,
        kind: (input.confidence as Record<string, unknown>).kind
      },
      sideEffects: ["behavior upserted", "index updated"],
      reportFragments: [`upserted behavior ${doc.id}`]
    };
  }
};

// ---------------------------------------------------------------------------
// 11. cdr.state.derive
// ---------------------------------------------------------------------------

function extractStatesAndTransitionsFromBehavior(
  behaviorDoc: Record<string, unknown>
): { states: Set<string>; transitions: Array<Record<string, YamlValue>> } {
  const states = new Set<string>();
  const transitions: Array<Record<string, YamlValue>> = [];
  const id = String(behaviorDoc.id || "unknown");

  if (Array.isArray(behaviorDoc.writes)) {
    for (const w of behaviorDoc.writes) {
      const wo = w as Record<string, unknown>;
      if (wo.operation === "insert") states.add("CREATED");
    }
  }

  if (Array.isArray(behaviorDoc.events)) {
    for (const ev of behaviorDoc.events) {
      const eventName = String(ev);
      const parts = eventName.split(".");
      const tail = parts[parts.length - 1] || "";
      const stateHint = tail.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      if (stateHint && stateHint !== "CREATED") states.add(stateHint);
      transitions.push({
        trigger: eventName,
        from: "[*]",
        to: stateHint || "TBD",
        behavior_id: id
      });
    }
  }

  return { states, transitions };
}

export const cdrStateDerive: AnyCap = {
  id: "cdr.state.derive",
  version: "1.0.0",
  inputSchema: {
    required: ["entity", "behaviors"],
    properties: {
      entity: { type: "string", minLength: 1 },
      behaviors: { type: "array" },
      repo: { type: "string" },
      sources: { type: "array" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input as Record<string, import("../../core/src/types.ts").Json>, ["entity", "behaviors"]);
    const entity = String(input.entity);
    const behaviorIds: string[] = Array.isArray(input.behaviors)
      ? input.behaviors.map((b: unknown) => String(b))
      : [];
    const repo = input.repo ? String(input.repo) : undefined;

    if (!behaviorIds.length) {
      throw new CapabilityError("INVALID_INPUT", "behaviors[] must contain at least one behavior ID");
    }

    const cp = cognitivePaths(ctx.rootDir);
    const allStates = new Set<string>();
    const allTransitions: Array<Record<string, YamlValue>> = [];
    const derivedFrom: string[] = [];
    const missingBehaviors: string[] = [];

    for (const bid of behaviorIds) {
      // v0.4 — per-repo layout: try the flat path first (legacy), then any
      // per-repo subdirectory. We do not know which repo the behavior
      // lives under at this point (behaviorIds is a flat list), so we
      // glob one level deep under behaviorDir.
      const flatPath = join(cp.behaviorDir, `${bid}.yaml`);
      let behaviorPath: string | null = null;
      if (existsSync(flatPath)) {
        behaviorPath = flatPath;
      } else {
        const subdirs = readdirSync(cp.behaviorDir).filter((d) => {
          try {
            return existsSync(join(cp.behaviorDir, d, `${bid}.yaml`));
          } catch {
            return false;
          }
        });
        if (subdirs.length > 0) {
          behaviorPath = join(cp.behaviorDir, subdirs[0], `${bid}.yaml`);
        }
      }
      if (!behaviorPath) {
        missingBehaviors.push(bid);
        continue;
      }
      const doc = parseYamlDocument(read(behaviorPath)) as Record<string, unknown>;
      derivedFrom.push(String(doc.id || bid));
      const { states, transitions } = extractStatesAndTransitionsFromBehavior(doc);
      states.forEach((s) => allStates.add(s));
      transitions.forEach((t) => allTransitions.push(t));
    }

    if (missingBehaviors.length) {
      throw new CapabilityError("NOT_FOUND", `behaviors not found on disk: ${missingBehaviors.join(", ")}. Run cdr.behavior.upsert first.`);
    }

    if (!allStates.size) {
      allStates.add("CREATED");
      allStates.add("ACTIVE");
      allStates.add("CLOSED");
    }

    const stateNames = [...allStates];
    const initialState = stateNames[0];

    const draft: Record<string, YamlValue> = {
      entity,
      states: stateNames,
      transitions: allTransitions as unknown as YamlValue,
      confidence: { level: "medium", kind: "inference", evidence_type: "inferred_from_behaviors" },
      derived_from: derivedFrom,
      initial_state: initialState
    };
    if (repo) draft.repo = repo;
    if (Array.isArray(input.sources)) draft.sources = input.sources as unknown as YamlValue;

    // P1: validate sources[] point at real code
    const evidenceErrors = validateEvidencePoints(ctx, draft as Record<string, unknown>);
    if (evidenceErrors.length) {
      throw new CapabilityError("INVALID_EVIDENCE", evidenceErrors.join("; "));
    }

    const errors = validateArtifact("state-machine", draft as Record<string, unknown>);
    if (errors.length) {
      throw new CapabilityError("INVALID_ARTIFACT", errors.join("; "));
    }

    const relPath = artifactRelativePath("state-machine", draft as Record<string, unknown>);
    const absPath = join(ctx.rootDir, relPath);
    write(absPath, stringifyYamlDocument(draft));

    const index = loadCognitiveIndex(ctx.rootDir);
    upsertIndexEntry(index, "state-machine", relPath, draft as Record<string, unknown>);
    saveCognitiveIndex(ctx.rootDir, index);

    return {
      ok: true,
      data: {
        type: "state-machine",
        path: relPath,
        entity,
        states: stateNames,
        transitions: allTransitions,
        derived_from: derivedFrom,
        confidence: draft.confidence,
        note: "inference-level draft — Agent must confirm before kind=fact"
      },
      sideEffects: ["state machine draft written", "index updated"],
      reportFragments: [`derived state machine for ${entity} from ${derivedFrom.length} behavior(s)`]
    };
  }
};

function getCurrentCommitHash(repoPath: string, rootDir: string): string {
  const hash = runSafe("git", ["-C", repoPath, "rev-parse", "HEAD"], rootDir);
  return hash || "";
}

function getRepoFilesChangedSince(repoPath: string, rootDir: string, sinceCommit: string): Set<string> {
  if (!sinceCommit) return new Set();
  const out = runSafe(
    "git",
    ["-C", repoPath, "diff", "--name-only", `${sinceCommit}..HEAD`],
    rootDir
  );
  if (!out) return new Set();
  return new Set(out.trim().split("\n").filter(Boolean));
}

export const cdrAssetStaleCheck: AnyCap = {
  id: "cdr.asset.stalecheck",
  version: "1.0.0",
  inputSchema: {
    properties: {
      repo: { type: "string" },
      clear_stale: { type: "boolean" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const p = workspacePaths(ctx.rootDir);
    const repoFilter = input.repo ? String(input.repo) : undefined;
    const clearStale = input.clear_stale === true;

    const index = loadCognitiveIndex(ctx.rootDir);

    const reposToCheck: string[] = [];
    if (repoFilter) {
      const repoPath = join(p.reposDir, repoFilter);
      if (!existsSync(repoPath)) {
        throw new CapabilityError("REPO_MISSING", `repos/${repoFilter} not found`);
      }
      reposToCheck.push(repoFilter);
    } else {
      for (const entry of readdirSync(p.reposDir)) {
        const repoPath = join(p.reposDir, entry);
        if (existsSync(join(repoPath, ".git"))) {
          reposToCheck.push(entry);
        }
      }
    }

    const now = ctx.now.toISOString();
    const newlyStale: StaleAsset[] = [];
    const cleared: string[] = [];

    for (const repo of reposToCheck) {
      const repoPath = join(p.reposDir, repo);
      const currentHash = getCurrentCommitHash(repoPath, p.rootDir);
      if (!currentHash) continue;

      const snapshot = getRepoSnapshot(index, repo);
      const lastHash = snapshot?.commit_hash;

      const newSnapshot: RepoSnapshot = {
        repo,
        commit_hash: currentHash,
        committed_at: runSafe("git", ["-C", repoPath, "log", "-1", "--format=%ci", "--", "HEAD"], p.rootDir) || now,
        analyzed_at: now,
        source_snapshots: snapshot?.source_snapshots || {}
      };

      if (lastHash && lastHash !== currentHash) {
        const changedFiles = getRepoFilesChangedSince(repoPath, p.rootDir, lastHash);
        if (changedFiles.size > 0) {
          newSnapshot.source_snapshots = { ...newSnapshot.source_snapshots };
          for (const file of changedFiles) {
            newSnapshot.source_snapshots[file] = currentHash;
          }
        }
      }

      upsertRepoSnapshot(index, newSnapshot);

      const allArtifacts: Array<{ id: string; path: string; repo?: string; artifact_type: "behavior" | "state-machine" | "domain" | "business-rule" | "capability-map" }> = [];

      for (const b of index.behaviors) {
        allArtifacts.push({ id: b.id, path: b.path, repo: b.repo, artifact_type: "behavior" });
      }
      for (const s of index.state_machines) {
        allArtifacts.push({ id: s.entity, path: s.path, repo: s.repo, artifact_type: "state-machine" });
      }
      for (const d of index.domains) {
        allArtifacts.push({ id: d.domain, path: d.path, repo: d.repo, artifact_type: "domain" });
      }
      for (const r of index.business_rules) {
        allArtifacts.push({ id: r.id, path: r.path, repo: r.repo, artifact_type: "business-rule" });
      }

      for (const artifact of allArtifacts) {
        if (repoFilter && artifact.repo !== repoFilter) continue;
        const absPath = join(ctx.rootDir, artifact.path);
        if (!existsSync(absPath)) continue;

        const doc = parseYamlDocument(read(absPath));
        const sources = Array.isArray(doc.sources) ? doc.sources : [];
        if (!sources.length) continue;

        const artifactRepo = artifact.repo || (doc as Record<string, unknown>).repo as string;
        if (artifactRepo !== repo) continue;

        const staleSources: StaleSource[] = [];

        for (const src of sources) {
          if (!src || typeof src !== "object" || Array.isArray(src)) continue;
          const s = src as Record<string, unknown>;
          const file = typeof s.file === "string" ? s.file.trim() : "";
          if (!file) continue;

          const lastValidCommit = snapshot?.source_snapshots[file] || lastHash || "";
          if (!lastValidCommit) continue;

          const changedFiles = lastHash ? getRepoFilesChangedSince(repoPath, p.rootDir, lastValidCommit) : new Set<string>();
          if (!changedFiles.has(file)) continue;

          staleSources.push({
            file,
            last_valid_commit: lastValidCommit,
            current_commit: currentHash,
            reason: "new_commits"
          });
        }

        if (staleSources.length > 0) {
          const staleAsset: StaleAsset = {
            id: artifact.id,
            artifact_type: artifact.artifact_type === "capability-map" ? "domain" : artifact.artifact_type,
            path: artifact.path,
            repo,
            stale_sources: staleSources,
            checked_at: now
          };
          markAssetStale(index, staleAsset);
          newlyStale.push(staleAsset);
        } else if (clearStale) {
          clearAssetStale(index, artifact.id);
          cleared.push(artifact.id);
        }
      }
    }

    saveCognitiveIndex(ctx.rootDir, index);

    const reportLines: string[] = [];
    reportLines.push(`## Stale Asset Check — ${now}`);
    reportLines.push("");
    if (newlyStale.length === 0) {
      reportLines.push("✅ No stale assets detected.");
    } else {
      reportLines.push(`⚠️  ${newlyStale.length} artifact(s) have stale sources:`);
      for (const asset of newlyStale) {
        reportLines.push(`\n### ${asset.id} [${asset.artifact_type}]`);
        for (const ss of asset.stale_sources) {
          reportLines.push(`  - ${ss.file}: changed since ${ss.last_valid_commit.slice(0, 8)}`);
        }
      }
    }
    if (cleared.length > 0) {
      reportLines.push(`\n✅ Cleared stale flag for: ${cleared.join(", ")}`);
    }

    return {
      ok: true,
      data: {
        checked_at: now,
        repos_checked: reposToCheck,
        stale_count: newlyStale.length,
        stale_assets: newlyStale as unknown as YamlValue,
        cleared_count: cleared.length,
        cleared,
        report: reportLines.join("\n")
      },
      sideEffects: newlyStale.length > 0 ? ["index updated with stale assets"] : cleared.length > 0 ? ["stale flags cleared"] : [],
      reportFragments: [
        `${newlyStale.length} stale asset(s) detected${cleared.length > 0 ? `, ${cleared.length} cleared` : ""}`
      ]
    };
  }
};

export const cdrArchitectureDriftCheck: AnyCap = {
  id: "cdr.architecture.driftcheck",
  version: "1.0.0",
  inputSchema: {
    properties: {
      feature: { type: "string" },
      repo: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const p = workspacePaths(ctx.rootDir);
    const featureFilter = input.feature ? String(input.feature) : undefined;
    const repoFilter = input.repo ? String(input.repo) : undefined;

    const index = loadCognitiveIndex(ctx.rootDir);
    const now = ctx.now.toISOString();
    const driftItems: Array<{
      id: string;
      artifact_type: string;
      repo: string;
      path: string;
      drift_type: string;
      detail: string;
    }> = [];

    const reposToCheck: string[] = [];
    if (repoFilter) {
      reposToCheck.push(repoFilter);
    } else if (featureFilter) {
      const featureDir = join(p.featuresDir, featureFilter);
      const featureYaml = join(featureDir, "feature.yaml");
      if (existsSync(featureYaml)) {
        for (const repo of featureRepoNames(read(featureYaml))) {
          reposToCheck.push(repo);
        }
      }
    } else {
      for (const entry of readdirSync(p.reposDir)) {
        const repoPath = join(p.reposDir, entry);
        if (existsSync(join(repoPath, ".git"))) {
          reposToCheck.push(entry);
        }
      }
    }

    for (const repo of reposToCheck) {
      const repoPath = join(p.reposDir, repo);
      if (!existsSync(join(repoPath, ".git"))) continue;

      const currentHash = getCurrentCommitHash(repoPath, p.rootDir);
      if (!currentHash) continue;

      const repoBehaviors = index.behaviors.filter((b) => b.repo === repo);
      const repoStateMachines = index.state_machines.filter((s) => s.repo === repo);

      for (const b of repoBehaviors) {
        const absPath = join(ctx.rootDir, b.path);
        if (!existsSync(absPath)) {
          driftItems.push({
            id: b.id,
            artifact_type: "behavior",
            repo,
            path: b.path,
            drift_type: "file_missing",
            detail: "artifact references a file that no longer exists"
          });
          continue;
        }

        const doc = parseYamlDocument(read(absPath));
        const sources = Array.isArray(doc.sources) ? doc.sources : [];
        for (const src of sources) {
          if (!src || typeof src !== "object" || Array.isArray(src)) continue;
          const s = src as Record<string, unknown>;
          const file = typeof s.file === "string" ? s.file.trim() : "";
          if (!file) continue;

          const absSrcFile = join(ctx.rootDir, "repos", repo, file);
          if (!existsSync(absSrcFile)) {
            driftItems.push({
              id: b.id,
              artifact_type: "behavior",
              repo,
              path: b.path,
              drift_type: "source_file_deleted",
              detail: `source file ${file} was deleted`
            });
          }
        }
      }

      for (const s of repoStateMachines) {
        const absPath = join(ctx.rootDir, s.path);
        if (!existsSync(absPath)) {
          driftItems.push({
            id: s.entity,
            artifact_type: "state-machine",
            repo,
            path: s.path,
            drift_type: "file_missing",
            detail: "artifact file no longer exists"
          });
        }
      }
    }

    const reportLines: string[] = [];
    reportLines.push(`## Architecture Drift Check — ${now}`);
    reportLines.push("");

    if (driftItems.length === 0) {
      reportLines.push("✅ No architecture drift detected.");
      reportLines.push("");
      reportLines.push("All behavior and state machine artifacts are consistent with current code.");
    } else {
      reportLines.push(`⚠️  ${driftItems.length} drift item(s) detected:`);
      for (const item of driftItems) {
        reportLines.push(`\n### ${item.id} [${item.artifact_type}] (${item.repo})`);
        reportLines.push(`  - **Type**: ${item.drift_type}`);
        reportLines.push(`  - **Detail**: ${item.detail}`);
        reportLines.push(`  - **Path**: ${item.path}`);
      }
      reportLines.push("");
      reportLines.push("**Recommendation**: Run `@dapei discover behaviors for <repo>` to re-analyze drifted areas.");
    }

    return {
      ok: true,
      data: {
        checked_at: now,
        repos_checked: reposToCheck,
        drift_count: driftItems.length,
        drift_items: driftItems as unknown as YamlValue,
        report: reportLines.join("\n")
      },
      sideEffects: [],
      reportFragments: [
        `${driftItems.length} drift item(s) detected across ${reposToCheck.length} repo(s)`
      ]
    };
  }
};
// ---------------------------------------------------------------------------
// 12. cdr.business.cross_link — v0.5
//
// Pure read-only computation: scan all business-rules, resolve their
// `applies_to[]` against the cognitive index, and emit a cross-repo view
// at `docs/as-is/cross-repo/cross-links.yaml`. Groups by `kind` so a
// reader can see all `compensation` rules or all `sla` rules in one place.
//
// This is the engine's answer to "what business relationships span
// multiple repos?" — answered by walking the evidence-backed rule
// artifacts the AI has already written, not by guessing from event
// names or by static call-graph analysis (which is the CodeGraph v1.0
// job, not v0.5).
//
// P1 red line: this capability only reads. It does not write behavior,
// business-rule, or index entries. It does not need evidence validation.
// ---------------------------------------------------------------------------

const CROSS_REPO_KINDS = new Set([
  "invariant",
  "constraint",
  "authorization",
  "sla",
  "compensation"
]);

interface CrossLinkRule {
  id: string;
  kind: string;
  description: string;
  applies_to: Array<{ behavior: string; repo: string | undefined }>;
  covered_repos: string[];
  evidence_kind: string;
  evidence_level: string;
}

export const cdrBusinessCrossLink: AnyCap = {
  id: "cdr.business.crosslink",
  version: "1.0.0",
  inputSchema: {
    properties: {
      min_confidence: { type: "string", enum: ["low", "medium", "high"] },
      kinds: { type: "array" },
      include_intra_repo: { type: "boolean" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const cp = cognitivePaths(ctx.rootDir);
    const index = loadCognitiveIndex(ctx.rootDir);

    const minConfidence = typeof input.min_confidence === "string"
      ? String(input.min_confidence)
      : "low";
    const confidenceRank: Record<string, number> = { low: 0, medium: 1, high: 2 };
    const minRank = confidenceRank[minConfidence] ?? 0;

    const allowedKinds = Array.isArray(input.kinds) && input.kinds.length > 0
      ? new Set((input.kinds as unknown[]).map((k) => String(k)).filter((k) => CROSS_REPO_KINDS.has(k)))
      : CROSS_REPO_KINDS;

    const includeIntraRepo = input.include_intra_repo === true;

    if (!existsSync(cp.businessRulesDir)) {
      // No business rules yet — emit an empty cross-link view so the
      // caller still has a well-formed file to render. An empty workspace
      // is a legitimate state, not an error.
      const emptyOutDir = join(cp.docsDir, "as-is", "cross-repo");
      ensureDir(emptyOutDir);
      const emptyOutFile = join(emptyOutDir, "cross-links.yaml");
      const emptyDoc: Record<string, YamlValue> = {
        generated_at: ctx.now.toISOString(),
        product: cp.workspaceName,
        total_rules: 0,
        cross_repo_rules: 0,
        intra_repo_rules: 0,
        groups: [] as unknown as YamlValue,
        filter: {
          min_confidence: minConfidence,
          kinds: [...allowedKinds],
          include_intra_repo: includeIntraRepo
        }
      };
      const emptyContent = stringifyYamlDocument(emptyDoc);
      write(emptyOutFile, emptyContent.endsWith("\n") ? emptyContent : `${emptyContent}\n`);
      return {
        ok: true,
        data: {
          path: relative(ctx.rootDir, emptyOutFile),
          total_rules: 0,
          cross_repo_rules: 0,
          intra_repo_rules: 0,
          by_kind: {},
          rules: [],
          skipped: []
        },
        sideEffects: [`cross-link view written: ${relative(ctx.rootDir, emptyOutFile)}`],
        reportFragments: ["no business rules indexed yet — emitted empty cross-link view"]
      };
    }

    const ruleFiles = listFilesRecursively(cp.businessRulesDir, [".yaml", ".yml"], 200);
    const skipped: Array<{ file: string; reason: string }> = [];
    const rules: CrossLinkRule[] = [];

    for (const rf of ruleFiles) {
      if (basename(rf).startsWith("_")) continue;
      let doc: Record<string, unknown>;
      try {
        doc = parseYamlDocument(read(rf)) as Record<string, unknown>;
      } catch (e) {
        skipped.push({ file: relative(ctx.rootDir, rf), reason: "unparseable" });
        continue;
      }

      const id = String(doc.id || basename(rf, ".yaml"));
      const kind = String(doc.kind || "unknown");
      if (!allowedKinds.has(kind)) {
        skipped.push({ file: relative(ctx.rootDir, rf), reason: `kind ${kind} not in filter` });
        continue;
      }
      const confidence = doc.confidence as { kind?: string; level?: string } | undefined;
      const evidenceKind = String(confidence?.kind || "unknown");
      const evidenceLevel = String(confidence?.level || "unknown");
      if ((confidenceRank[evidenceLevel] ?? 0) < minRank) {
        skipped.push({ file: relative(ctx.rootDir, rf), reason: `confidence ${evidenceLevel} < ${minConfidence}` });
        continue;
      }

      const rawAppliesTo = Array.isArray(doc.applies_to) ? doc.applies_to : [];
      const appliesTo: Array<{ behavior: string; repo: string | undefined }> = [];
      const coveredRepos = new Set<string>();

      for (const raw of rawAppliesTo) {
        const bid = String(raw);
        // Resolve the behavior id against the cognitive index to recover
        // the repo. If the behavior is unknown to the index (e.g., it was
        // written under a different id scheme) we still keep the link —
        // the rule's applies_to is what it is — but the repo stays
        // undefined for the unknown id and is reported in skipped.
        const matched = index.behaviors.find((b) => b.id === bid);
        if (matched) {
          appliesTo.push({ behavior: bid, repo: matched.repo });
          if (matched.repo) coveredRepos.add(matched.repo);
        } else {
          appliesTo.push({ behavior: bid, repo: undefined });
          skipped.push({ file: relative(ctx.rootDir, rf), reason: `applies_to id '${bid}' not in cognitive index` });
        }
      }

      const isCrossRepo = coveredRepos.size > 1;
      const isIntraRepo = coveredRepos.size === 1;
      if (!isCrossRepo && !isIntraRepo) continue;
      if (!includeIntraRepo && isIntraRepo) continue;

      rules.push({
        id,
        kind,
        description: String(doc.description || doc.expr || ""),
        applies_to: appliesTo,
        covered_repos: [...coveredRepos].sort(),
        evidence_kind: evidenceKind,
        evidence_level: evidenceLevel
      });
    }

    rules.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.id.localeCompare(b.id);
    });

    const crossRepoRules = rules.filter((r) => r.covered_repos.length > 1);
    const intraRepoRules = rules.filter((r) => r.covered_repos.length <= 1);

    const byKind: Record<string, number> = {};
    for (const r of rules) byKind[r.kind] = (byKind[r.kind] || 0) + 1;

    // Derive product name from workspace.yaml if present, else fall back
    // to the workspace's directory name.
    const wsFile = join(cp.dapeiDir, "workspace.yaml");
    let product = cp.workspaceName;
    if (existsSync(wsFile)) {
      try {
        const wsDoc = parseYamlDocument(read(wsFile));
        const ws = wsDoc.workspace as Record<string, unknown> | undefined;
        if (ws && typeof ws.name === "string") product = String(ws.name);
      } catch {
      }
    }

    const groups: Array<{ kind: string; rules: CrossLinkRule[] }> = [];
    for (const r of rules) {
      const g = groups.find((x) => x.kind === r.kind);
      if (g) g.rules.push(r);
      else groups.push({ kind: r.kind, rules: [r] });
    }

    const outDir = join(cp.docsDir, "as-is", "cross-repo");
    ensureDir(outDir);
    const outFile = join(outDir, "cross-links.yaml");
    const outDoc: Record<string, YamlValue> = {
      generated_at: ctx.now.toISOString(),
      product,
      total_rules: rules.length,
      cross_repo_rules: crossRepoRules.length,
      intra_repo_rules: intraRepoRules.length,
      groups: groups as unknown as YamlValue,
      filter: {
        min_confidence: minConfidence,
        kinds: [...allowedKinds],
        include_intra_repo: includeIntraRepo
      }
    };
    const content = stringifyYamlDocument(outDoc);
    write(outFile, content.endsWith("\n") ? content : `${content}\n`);

    return {
      ok: true,
      data: {
        path: relative(ctx.rootDir, outFile),
        total_rules: rules.length,
        cross_repo_rules: crossRepoRules.length,
        intra_repo_rules: intraRepoRules.length,
        by_kind: byKind,
        rules,
        skipped
      },
      sideEffects: [`cross-link view written: ${relative(ctx.rootDir, outFile)}`],
      reportFragments: [
        `cross-linked ${rules.length} rule(s) (${crossRepoRules.length} cross-repo, ${intraRepoRules.length} intra-repo)`,
        skipped.length
          ? `${skipped.length} rule(s) skipped — see report for reasons`
          : "no rules skipped"
      ]
    };
  }
};

// ---------------------------------------------------------------------------
// 13. cdr.cross_repo.doc.generate — v0.5
//
// Read the cross-link view written by cdr.business.cross_link and emit a
// VitePress section at <output>/cross-repo/. The section is a peer of
// the existing /behaviors/ /domains/ etc. sections and uses the same
// Vue 3 components already in the per-portal theme.
//
// The page set:
//   cross-repo/index.md            — overview grouped by kind
//   cross-repo/<rule-id>.md        — one page per cross-repo rule
//   cross-repo/event-graph.md      — single Mermaid diagram of all
//                                    cross-repo relationships
//
// Does not touch the doc-gen package or its existing sections. The
// caller is expected to have run cdr.business.cross_link first; if the
// cross-links.yaml file is missing, this capability fails fast with a
// clear error pointing the caller at the missing capability.
// ---------------------------------------------------------------------------

function crossLinkRuleIdSlug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function crossLinkRuleToMermaidEdge(rule: CrossLinkRule): string[] {
  const lines: string[] = [];
  for (let i = 0; i < rule.applies_to.length - 1; i++) {
    const a = rule.applies_to[i];
    const b = rule.applies_to[i + 1];
    const aId = `${a.behavior}@${a.repo || "?"}`;
    const bId = `${b.behavior}@${b.repo || "?"}`;
    const aSafe = aId.replace(/[^a-zA-Z0-9_]/g, "_");
    const bSafe = bId.replace(/[^a-zA-Z0-9_]/g, "_");
    lines.push(`  ${aSafe}["${aId}"] -- "${rule.kind}: ${rule.id}" --> ${bSafe}["${bId}"]`);
  }
  return lines;
}

function crossLinkRuleToMermaidSubgraph(rule: CrossLinkRule): string[] {
  const repoGroups = new Map<string, string[]>();
  for (const a of rule.applies_to) {
    const repo = a.repo || "unknown";
    if (!repoGroups.has(repo)) repoGroups.set(repo, []);
    repoGroups.get(repo)!.push(a.behavior);
  }
  const lines: string[] = [];
  for (const [repo, behaviors] of repoGroups.entries()) {
    lines.push(`  subgraph ${repo.replace(/[^a-zA-Z0-9_]/g, "_")}`);
    for (const b of behaviors) {
      const nodeId = `${b}@${repo}`.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`    ${nodeId}["${b}@${repo}"]`);
    }
    lines.push("  end");
  }
  lines.push(...crossLinkRuleToMermaidEdge(rule));
  return lines;
}

export const cdrCrossRepoDocGenerate: AnyCap = {
  id: "cdr.crossrepo.doc.generate",
  version: "1.0.0",
  inputSchema: {
    properties: {
      output_dir: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const p = workspacePaths(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    const outputDir = join(p.rootDir, typeof input.output_dir === "string" ? String(input.output_dir) : ".dapei/docs-portal");

    const crossLinksFile = join(cp.docsDir, "as-is", "cross-repo", "cross-links.yaml");
    if (!existsSync(crossLinksFile)) {
      throw new CapabilityError(
        "FILE_MISSING",
        `${relative(ctx.rootDir, crossLinksFile)} not found — run cdr.business.cross_link first`
      );
    }

    const crossLinksDoc = parseYamlDocument(read(crossLinksFile)) as Record<string, unknown>;
    const groups = (Array.isArray(crossLinksDoc.groups) ? crossLinksDoc.groups : []) as Array<{ kind: string; rules: CrossLinkRule[] }>;
    const product = String(crossLinksDoc.product || p.workspaceName);

    const sectionDir = join(outputDir, "cross-repo");
    ensureDir(sectionDir);

    let indexMd = `---
title: Cross-Repo Business Rules
---

# Cross-Repo Business Rules

> Auto-generated from business-rule artifacts. Each rule here was authored by the AI, validated by the engine (P1 red line: \`kind=fact\` requires \`sources[]\`), and clustered here because it spans more than one repository.

- **Product:** ${product}
- **Generated:** ${String(crossLinksDoc.generated_at || "")}
- **Total rules:** ${String(crossLinksDoc.total_rules || 0)}
- **Cross-repo:** ${String(crossLinksDoc.cross_repo_rules || 0)}
- **Intra-repo (filtered out):** ${String(crossLinksDoc.intra_repo_rules || 0)}

## Grouped by kind

`;

    for (const g of groups) {
      indexMd += `### ${g.kind} (${g.rules.length})\n\n`;
      for (const r of g.rules) {
        indexMd += `- [${r.id}](/cross-repo/${crossLinkRuleIdSlug(r.id)}) — spans ${r.covered_repos.join(", ")}\n`;
      }
      indexMd += "\n";
    }

    indexMd += `## Event Graph (cross-repo only)\n\n`;
    indexMd += "```mermaid\ngraph LR\n";
    for (const g of groups) {
      for (const r of g.rules) {
        if (r.covered_repos.length > 1) {
          indexMd += crossLinkRuleToMermaidSubgraph(r).join("\n") + "\n";
        }
      }
    }
    indexMd += "```\n";

    write(join(sectionDir, "index.md"), indexMd);

    for (const g of groups) {
      for (const r of g.rules) {
        const slug = crossLinkRuleIdSlug(r.id);
        let md = `---
title: "${r.id}"
---

# ${r.id}

- **Kind:** \`${r.kind}\`
- **Confidence:** ${r.evidence_kind} (${r.evidence_level})
- **Covered repos:** ${r.covered_repos.map((r) => `\`${r}\``).join(", ")}

${r.description}

## Applies To

| Behavior | Repo |
|----------|------|
${r.applies_to.map((a) => `| \`${a.behavior}\` | ${a.repo ? `\`${a.repo}\`` : "_(unknown — not in cognitive index)_"} |`).join("\n")}

## Mermaid

\`\`\`mermaid
graph LR
${crossLinkRuleToMermaidSubgraph(r).join("\n")}
\`\`\`
`;
        write(join(sectionDir, `${slug}.md`), md);
      }
    }

    return {
      ok: true,
      data: {
        output_dir: typeof input.output_dir === "string" ? String(input.output_dir) : ".dapei/docs-portal",
        section: "cross-repo",
        pages_generated: 1 + groups.reduce((sum, g) => sum + g.rules.length, 0),
        rules_rendered: groups.reduce((sum, g) => sum + g.rules.length, 0)
      },
      sideEffects: ["cross-repo portal section generated"],
      reportFragments: [`generated cross-repo portal section under ${relative(p.rootDir, sectionDir)}`]
    };
  }
};

// ---------------------------------------------------------------------------
// 14. cdr.stale.scan — v0.7
//
// Watches the cognitive index for assets whose `sources[]` references
// have moved since they were last written. Implements the v0.4
// StaleFields reservation by populating `stale`, `stale_reason`,
// `stale_at`, and `stale_base` on the affected index entries.
//
// Backend:
//   * CodeGraph `impact` (when present) computes the transitive blast
//     radius — the change set is whatever CodeGraph says the diff
//     affects, not just the file names in `git diff --name-only`.
//   * Fallback to `git diff --name-only <base>..<HEAD> -- repos/<repo>/`
//     when CodeGraph is missing.
//
// The capability is read-modify-write: it loads the cognitive
// index, updates stale fields in place, saves, and returns a
// summary of what changed. It does NOT regenerate any artifacts.
// ---------------------------------------------------------------------------

function computeBehaviorStaleness(
  ctx: { rootDir: string },
  repo: string | undefined,
  changedFiles: Set<string>
): Array<{ id: string; entity: string; reason: string; reason_paths: string[] }> {
  const index = loadCognitiveIndex(ctx.rootDir);
  const out: Array<{ id: string; entity: string; reason: string; reason_paths: string[] }> = [];

  const considerEntry = (id: string, repoFilter: string | undefined, sources: unknown, kind: "behavior" | "state-machine" | "business-rule") => {
    if (repoFilter && repo && repoFilter !== repo) return;
    if (!Array.isArray(sources)) return;
    const pathsHit: string[] = [];
    for (const s of sources) {
      if (!s || typeof s !== "object") continue;
      const so = s as Record<string, unknown>;
      const f = typeof so.file === "string" ? so.file : "";
      if (!f) continue;
      // sources[].file is repo-relative; the diff paths are also
      // repo-relative when we ran `git diff --name-only -- repos/<repo>/`.
      if (changedFiles.has(f)) pathsHit.push(f);
    }
    if (pathsHit.length > 0) {
      out.push({
        id,
        entity: id,
        reason: `${kind} sources[] intersect with the diff`,
        reason_paths: pathsHit
      });
    }
  };

  for (const b of index.behaviors) {
    // Read the YAML off disk to inspect sources[] — the index only
    // stores the path, not the full content.
    const filePath = join(ctx.rootDir, b.path);
    if (!existsSync(filePath)) continue;
    let doc: Record<string, unknown>;
    try {
      doc = parseYamlDocument(read(filePath)) as Record<string, unknown>;
    } catch {
      continue;
    }
    considerEntry(String(doc.id || b.id), b.repo, doc.sources, "behavior");
  }

  for (const sm of index.state_machines) {
    const filePath = join(ctx.rootDir, sm.path);
    if (!existsSync(filePath)) continue;
    let doc: Record<string, unknown>;
    try {
      doc = parseYamlDocument(read(filePath)) as Record<string, unknown>;
    } catch {
      continue;
    }
    considerEntry(String(doc.entity || sm.entity), sm.repo, doc.sources, "state-machine");
  }

  for (const br of index.business_rules) {
    const filePath = join(ctx.rootDir, br.path);
    if (!existsSync(filePath)) continue;
    let doc: Record<string, unknown>;
    try {
      doc = parseYamlDocument(read(filePath)) as Record<string, unknown>;
    } catch {
      continue;
    }
    considerEntry(String(doc.id || br.id), br.repo, doc.sources, "business-rule");
  }

  return out;
}

function gitDiffFileNames(repoPath: string, base: string, head: string): string[] {
  try {
    const out = execFileSync("git", ["diff", "--name-only", `${base}..${head}`, "--"], { cwd: repoPath, encoding: "utf8" });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export const cdrStaleScan: AnyCap = {
  id: "cdr.stale.scan",
  version: "1.0.0",
  inputSchema: {
    properties: {
      repo: { type: "string" },
      base: { type: "string" },
      head: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const repo = typeof input.repo === "string" ? input.repo : undefined;
    const head = typeof input.head === "string" ? input.head : "HEAD";
    const base = typeof input.base === "string" ? input.base : "HEAD~1";

    if (!repo) {
      throw new CapabilityError("INVALID_INPUT", "cdr.stale.scan requires { repo } to scope the diff");
    }
    const p = workspacePaths(ctx.rootDir);
    const repoPath = join(p.reposDir, repo);
    if (!existsSync(repoPath)) {
      throw new CapabilityError("REPO_MISSING", `repos/${repo} not found`);
    }

    let changedFiles: string[] = [];
    // v0.9 — the change set is always computed via `git diff --name-only`.
    // The real `codegraph impact <sym> --depth N` is symbol-level
    // (what's affected if I change symbol X), not commit-level. The
    // codegraph adapter wraps git diff for its caching/marker
    // machinery, but the underlying source of truth is git, so the
    // backend label is always "git-diff" for this capability.
    // (Symbol-level blast radius is a future capability that will
    // use `codegraph_callers` on each changed symbol.)
    const backendUsed: "codegraph" | "git-diff" = "git-diff";
    try {
      const adapter = new CodeGraphAdapter(ctx.rootDir);
      if (adapter.isAvailable()) {
        const impact = adapter.impact(repoPath, base, head);
        if (impact.available) {
          changedFiles = impact.changed_files;
        } else {
          changedFiles = gitDiffFileNames(repoPath, base, head);
        }
      } else {
        changedFiles = gitDiffFileNames(repoPath, base, head);
      }
    } catch {
      changedFiles = gitDiffFileNames(repoPath, base, head);
    }

    if (changedFiles.length === 0) {
      return {
        ok: true,
        data: {
          repo,
          base,
          head,
          backend: backendUsed,
          changed_files: 0,
          marked: 0,
          stale: [] as Array<{ id: string; entity: string; reason: string; reason_paths: string[] }>
        },
        sideEffects: ["no changes detected; nothing to mark stale"],
        reportFragments: [`cdr.stale.scan: 0 changed files in ${repo} (${base}..${head})`]
      };
    }

    const changedSet = new Set(changedFiles);
    const candidates = computeBehaviorStaleness(ctx, repo, changedSet);

    // Apply: load index, mark each candidate stale, save.
    const index = loadCognitiveIndex(ctx.rootDir);
    const now = new Date().toISOString();
    let marked = 0;
    for (const c of candidates) {
      const sm = index.state_machines.find((s) => s.entity === c.id && (!repo || s.repo === repo));
      if (sm) {
        sm.stale = true;
        sm.stale_reason = c.reason;
        sm.stale_at = now;
        sm.stale_base = `${base}..${head}`;
        marked++;
        continue;
      }
      const b = index.behaviors.find((x) => x.id === c.id && (!repo || x.repo === repo));
      if (b) {
        b.stale = true;
        b.stale_reason = c.reason;
        b.stale_at = now;
        b.stale_base = `${base}..${head}`;
        marked++;
        continue;
      }
      const r = index.business_rules.find((x) => x.id === c.id && (!repo || x.repo === repo));
      if (r) {
        r.stale = true;
        r.stale_reason = c.reason;
        r.stale_at = now;
        r.stale_base = `${base}..${head}`;
        marked++;
        continue;
      }
    }
    saveCognitiveIndex(ctx.rootDir, index);

    return {
      ok: true,
      data: {
        repo,
        base,
        head,
        backend: backendUsed,
        changed_files: changedFiles.length,
        stale: candidates,
        marked
      },
      sideEffects: marked > 0 ? [`marked ${marked} cognitive asset(s) stale`] : [],
      reportFragments: [
        `cdr.stale.scan: ${changedFiles.length} changed file(s) in ${repo} (${base}..${head}) via ${backendUsed}`,
        marked > 0 ? `${marked} asset(s) marked stale` : "no assets match the change set"
      ]
    };
  }
};

// ---------------------------------------------------------------------------
// 15. cdr.domain.suggest — v0.8
//
// Read-only reverse-clustering: cluster the cognitive index's behaviors into
// suggested domain candidates. The engine does NOT touch any domain.yaml
// artifact — that is still the AI's job via `cdr.domain.compose`. The output
// is a YAML report at `docs/as-is/cross-repo/domain-suggestions.yaml` for
// the AI to read, edit, and turn into composed domains.
//
// Edge types considered (in priority order, ties broken by weight):
//   1. shared-events    — both behaviors publish any of the same event names
//   2. shared-writes    — both behaviors write any of the same table names
//   3. cross-repo-calls — A.calls[].target_repo == B.repo (or vice versa)
//   4. business-rule    — some business_rule's applies_to contains both ids
//
// Clusters are connected components of the resulting undirected graph. A
// cluster must satisfy `min_size` and not exceed `max_size` to be reported.
// Clusters over `max_size` are split per-repo to keep them scoped.
//
// Naming heuristic:
//   take the most-frequent event-name subject across the cluster's
//   behaviors (e.g., "order.created" → "order"), prefix with "Cross-Repo:"
//   when members span more than one repo. Always emits a `_reason` line
//   so the AI can see *why* the name was chosen.
//
// Capability does NOT write to the cognitive index and does NOT call
// `cdr.domain.compose`. Pure read + one report file.
// ---------------------------------------------------------------------------

const MIN_CLUSTER_SIZE_DEFAULT = 2;
const MAX_CLUSTER_SIZE_DEFAULT = 50;
const MAX_CLUSTERS_DEFAULT = 8;

interface BehaviorNode {
  readonly key: string;
  readonly id: string;
  readonly repo: string;
  readonly events: string[];
  readonly writes: string[];
  readonly targetRepos: string[];
}

interface Edge {
  readonly a: string;
  readonly b: string;
  readonly type: "shared-events" | "shared-writes" | "cross-repo-calls" | "business-rule";
  readonly weight: number;
  readonly detail: string;
}

function behaviorNodesFromIndex(
  index: ReturnType<typeof loadCognitiveIndex>,
  repoFilter?: string[]
): BehaviorNode[] {
  const allow = repoFilter && repoFilter.length > 0 ? new Set(repoFilter) : undefined;
  const out: BehaviorNode[] = [];
  for (const b of index.behaviors) {
    if (allow && (!b.repo || !allow.has(b.repo))) continue;
    out.push({
      key: `${b.id}@${b.repo || "unknown"}`,
      id: b.id,
      repo: b.repo || "unknown",
      events: b.events || [],
      writes: b.writes || [],
      targetRepos: b.target_repos || []
    });
  }
  return out;
}

function buildBehaviorEdges(nodes: BehaviorNode[], businessRuleEdges: Map<string, string[]>): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const sharedEvents = a.events.filter((e) => b.events.includes(e));
      if (sharedEvents.length > 0) {
        edges.push({
          a: a.key,
          b: b.key,
          type: "shared-events",
          weight: 4,
          detail: `shared event(s): ${sharedEvents.join(", ")}`
        });
      }
      const sharedWrites = a.writes.filter((w) => b.writes.includes(w));
      if (sharedWrites.length > 0) {
        edges.push({
          a: a.key,
          b: b.key,
          type: "shared-writes",
          weight: 3,
          detail: `shared write target(s): ${sharedWrites.join(", ")}`
        });
      }
      const aCallsBRepo = a.targetRepos.includes(b.repo);
      const bCallsARepo = b.targetRepos.includes(a.repo);
      if (aCallsBRepo || bCallsARepo) {
        const direction = aCallsBRepo ? `${a.repo}→${b.repo}` : `${b.repo}→${a.repo}`;
        edges.push({
          a: a.key,
          b: b.key,
          type: "cross-repo-calls",
          weight: 2,
          detail: `cross-repo call: ${direction}`
        });
      }
      const coAppliedRule = businessRuleEdges.get(a.key)?.includes(b.key);
      if (coAppliedRule) {
        edges.push({
          a: a.key,
          b: b.key,
          type: "business-rule",
          weight: 1,
          detail: "co-applied by some business-rule applies_to"
        });
      }
    }
  }
  return edges;
}

function connectedComponents(nodes: BehaviorNode[], edges: Edge[]): BehaviorNode[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x);
    if (!p || p === x) {
      parent.set(x, x);
      return x;
    }
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (x: string, y: string): void => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };
  for (const n of nodes) parent.set(n.key, n.key);
  for (const e of edges) union(e.a, e.b);
  const groups = new Map<string, BehaviorNode[]>();
  for (const n of nodes) {
    const root = find(n.key);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(n);
  }
  return [...groups.values()];
}

function businessRuleCoApplyMap(
  index: ReturnType<typeof loadCognitiveIndex>,
  rootDir: string
): Map<string, string[]> {
  // For each business rule, collect (behavior_id, repo) pairs from
  // applies_to. Then expand to pairwise membership so any two behaviors
  // that appear together in any rule's applies_to are linked.
  const out = new Map<string, Set<string>>();
  const cp = cognitivePaths(rootDir);
  if (!existsSync(cp.businessRulesDir)) return new Map();
  const files = listFilesRecursively(cp.businessRulesDir, [".yaml", ".yml"], 200);
  for (const f of files) {
    if (basename(f).startsWith("_")) continue;
    let doc: Record<string, unknown>;
    try {
      doc = parseYamlDocument(read(f)) as Record<string, unknown>;
    } catch {
      continue;
    }
    const appliesTo = Array.isArray(doc.applies_to) ? doc.applies_to : [];
    const keys: string[] = [];
    for (const a of appliesTo) {
      const id = String(a);
      const matched = index.behaviors.find((b) => b.id === id);
      const key = matched ? `${matched.id}@${matched.repo || "unknown"}` : `${id}@unknown`;
      if (id) keys.push(key);
    }
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];
        if (!out.has(a)) out.set(a, new Set());
        if (!out.has(b)) out.set(b, new Set());
        out.get(a)!.add(b);
        out.get(b)!.add(a);
      }
    }
  }
  const flat = new Map<string, string[]>();
  for (const [k, v] of out.entries()) flat.set(k, [...v]);
  return flat;
}

function suggestClusterName(cluster: BehaviorNode[], edges: Edge[]): { name: string; reason: string } {
  const subjects = new Map<string, number>();
  for (const n of cluster) {
    for (const ev of n.events) {
      const subject = ev.split(/[.:]/)[0].trim();
      if (!subject) continue;
      subjects.set(subject, (subjects.get(subject) || 0) + 1);
    }
  }
  let topSubject = "";
  let topCount = 0;
  for (const [s, c] of subjects.entries()) {
    if (c > topCount || (c === topCount && s.localeCompare(topSubject) < 0)) {
      topSubject = s;
      topCount = c;
    }
  }
  const repos = new Set(cluster.map((n) => n.repo));
  const isCross = repos.size > 1;
  const edgeKinds = new Set(edges.map((e) => e.type));
  const reasons: string[] = [];
  if (topSubject) reasons.push(`most-common event subject: '${topSubject}'`);
  if (isCross) reasons.push(`spans repos: ${[...repos].sort().join(", ")}`);
  if (edgeKinds.has("shared-events")) reasons.push("behaviors share event names");
  if (edgeKinds.has("cross-repo-calls")) reasons.push("cross-repo calls");
  if (edgeKinds.has("shared-writes")) reasons.push("behaviors write the same tables");
  if (edgeKinds.has("business-rule")) reasons.push("linked by business-rule applies_to");

  const prefix = isCross ? "Cross-Repo: " : "";
  const cap = topSubject ? topSubject.charAt(0).toUpperCase() + topSubject.slice(1) : "Cluster";
  return { name: `${prefix}${cap}`, reason: reasons.join("; ") || "no edge evidence recorded" };
}

function clusterConfidence(cluster: BehaviorNode[], edges: Edge[]): "high" | "medium" | "low" {
  const repos = new Set(cluster.map((n) => n.repo));
  const isCross = repos.size > 1;
  const edgeKinds = new Set(edges.map((e) => e.type));
  if (edgeKinds.has("shared-events") && isCross) return "high";
  if (edgeKinds.has("shared-events") || edgeKinds.has("shared-writes")) return "medium";
  return "low";
}

function splitClusterByRepo(cluster: BehaviorNode[]): BehaviorNode[][] {
  const byRepo = new Map<string, BehaviorNode[]>();
  for (const n of cluster) {
    if (!byRepo.has(n.repo)) byRepo.set(n.repo, []);
    byRepo.get(n.repo)!.push(n);
  }
  return [...byRepo.values()];
}

export const cdrDomainSuggest: AnyCap = {
  id: "cdr.domain.suggest",
  version: "1.0.0",
  inputSchema: {
    properties: {
      repos: { type: "array" },
      min_size: { type: "number" },
      max_size: { type: "number" },
      max_clusters: { type: "number" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const index = loadCognitiveIndex(ctx.rootDir);
    const repoFilter = Array.isArray(input.repos) ? (input.repos as unknown[]).map((r) => String(r)) : undefined;
    const minSize = typeof input.min_size === "number" ? Number(input.min_size) : MIN_CLUSTER_SIZE_DEFAULT;
    const maxSize = typeof input.max_size === "number" ? Number(input.max_size) : MAX_CLUSTER_SIZE_DEFAULT;
    const maxClusters = typeof input.max_clusters === "number" ? Number(input.max_clusters) : MAX_CLUSTERS_DEFAULT;

    const nodes = behaviorNodesFromIndex(index, repoFilter);
    const coApply = businessRuleCoApplyMap(index, ctx.rootDir);
    const edges = buildBehaviorEdges(nodes, coApply);
    const rawClusters = connectedComponents(nodes, edges);

    const filtered: BehaviorNode[][] = [];
    const oversizedSplit: BehaviorNode[][] = [];
    for (const c of rawClusters) {
      if (c.length < minSize) continue;
      if (c.length > maxSize) {
        for (const sub of splitClusterByRepo(c)) {
          if (sub.length >= minSize) oversizedSplit.push(sub);
        }
      } else {
        filtered.push(c);
      }
    }
    filtered.sort((a, b) => b.length - a.length);
    const top = filtered.slice(0, maxClusters);

    const reportClusters = top.map((cluster) => {
      const clusterEdges = edges.filter((e) => cluster.some((n) => n.key === e.a) && cluster.some((n) => n.key === e.b));
      const evidenceTypes = new Set(clusterEdges.map((e) => e.type));
      const { name, reason } = suggestClusterName(cluster, clusterEdges);
      const confidence = clusterConfidence(cluster, clusterEdges);
      const repos = [...new Set(cluster.map((n) => n.repo))].sort();
      const behaviorKeys = cluster.map((n) => n.key).sort();
      const evidence: Array<{ type: string; detail: string; behaviors?: string[]; rules?: string[] }> = [];
      if (evidenceTypes.has("shared-events")) {
        const eventToKeys = new Map<string, string[]>();
        for (const n of cluster) {
          for (const ev of n.events) {
            if (!eventToKeys.has(ev)) eventToKeys.set(ev, []);
            eventToKeys.get(ev)!.push(n.key);
          }
        }
        for (const [ev, keys] of [...eventToKeys.entries()].sort()) {
          if (keys.length >= 2) evidence.push({ type: "shared-events", detail: ev, behaviors: keys });
        }
      }
      if (evidenceTypes.has("cross-repo-calls")) {
        for (const e of clusterEdges.filter((e) => e.type === "cross-repo-calls")) {
          evidence.push({ type: "cross-repo-calls", detail: e.detail, behaviors: [e.a, e.b] });
        }
      }
      if (evidenceTypes.has("shared-writes")) {
        const wToKeys = new Map<string, string[]>();
        for (const n of cluster) {
          for (const w of n.writes) {
            if (!wToKeys.has(w)) wToKeys.set(w, []);
            wToKeys.get(w)!.push(n.key);
          }
        }
        for (const [w, keys] of [...wToKeys.entries()].sort()) {
          if (keys.length >= 2) evidence.push({ type: "shared-writes", detail: w, behaviors: keys });
        }
      }
      if (evidenceTypes.has("business-rule")) {
        evidence.push({ type: "business-rule", detail: "co-applied by business rules" });
      }
      return {
        suggested_name: name,
        suggested_domain_slug: toKebab(name),
        naming_reason: reason,
        confidence,
        behavior_keys: behaviorKeys,
        repos,
        evidence,
        size: cluster.length
      };
    });

    const productName = readProductName(ctx.rootDir);

    const outDoc: Record<string, YamlValue> = {
      generated_at: ctx.now.toISOString(),
      product: productName,
      algorithm_version: "1.0.0",
      parameters: {
        repos: repoFilter || [],
        min_size: minSize,
        max_size: maxSize,
        max_clusters: maxClusters
      },
      behavior_count: nodes.length,
      edge_count: edges.length,
      raw_cluster_count: rawClusters.length,
      reported_cluster_count: reportClusters.length,
      clusters: reportClusters as unknown as YamlValue,
      note:
        "These are SUGGESTIONS, not committed domains. To turn a cluster into a real domain, the AI reviews it, picks a stable name, and calls `cdr.domain.compose` with the cluster's behavior keys as `behaviors[]`. The suggestion file is overwritten on each `cdr.domain.suggest` call; composed domains under `docs/as-is/domains/` are never touched."
    };

    const outDir = join(ctx.rootDir, "docs", "as-is", "cross-repo");
    ensureDir(outDir);
    const outFile = join(outDir, "domain-suggestions.yaml");
    const content = stringifyYamlDocument(outDoc);
    write(outFile, content.endsWith("\n") ? content : `${content}\n`);

    return {
      ok: true,
      data: {
        path: relative(ctx.rootDir, outFile),
        behavior_count: nodes.length,
        edge_count: edges.length,
        raw_cluster_count: rawClusters.length,
        reported_cluster_count: reportClusters.length,
        clusters: reportClusters
      },
      sideEffects: [`domain-suggestions written: ${relative(ctx.rootDir, outFile)}`],
      reportFragments: [
        `cdr.domain.suggest: ${reportClusters.length} cluster(s) reported from ${nodes.length} behavior(s) (${edges.length} edge(s))`,
        `${rawClusters.length - reportClusters.length} cluster(s) dropped (below min_size or capped)`
      ]
    };
  }
};

function readProductName(rootDir: string): string {
  const wsFile = join(rootDir, ".dapei", "workspace.yaml");
  if (existsSync(wsFile)) {
    try {
      const doc = parseYamlDocument(read(wsFile));
      const ws = doc.workspace as Record<string, unknown> | undefined;
      if (ws && typeof ws.name === "string") return String(ws.name);
    } catch {
      // ignore — fall back to directory name below
    }
  }
  return basename(rootDir);
}

// ---------------------------------------------------------------------------
// 16. cdr.capability.map.synth — v0.8
//
// Engine-driven clustering of *domains* into a capability map. Distinct
// from v0.3 `cdr.capability.map.init` (which is a thin pass-through of
// capabilities the AI hands it). The synth variant:
//
//   1. collects domains from one of three sources, in priority order:
//      a) input.manual_domains[]  (the AI pre-staged a curated list)
//      b) docs/as-is/domains/**/*.yaml (composed via cdr.domain.compose)
//      c) docs/as-is/cross-repo/domain-suggestions.yaml (from
//         cdr.domain.suggest) — only when use_suggested_domains=true
//   2. for each domain, resolves its derived_from[] behaviors back to
//      the cognitive index to compute spans_repos[], behavior_count,
//      and the fact_ratio (fraction of behaviors with kind=fact).
//   3. emits docs/as-is/capabilities/product-map.yaml — the same file
//      cdr.capability.map.init writes, but with each capability
//      carrying the engine-computed spans_repos and fact_ratio so the
//      AI has objective metrics to grade its L1 hypothesis on.
//
// If the AI passes both manual_domains[] and the workspace has composed
// domains, the manual list wins for those domain names. Conflicting
// entries on either side are kept, never silently merged.
//
// Output schema is a strict superset of the v0.3 schema. Existing
// capability-map consumers (doc-gen, cdr.doc.generate) keep working
// because the v0.3 fields are unchanged.
// ---------------------------------------------------------------------------

interface ResolvedDomain {
  readonly name: string;
  readonly description: string;
  readonly behavior_ids: string[];
  readonly repos: string[];
  readonly behavior_count: number;
  readonly fact_ratio: number;
  readonly source: "manual" | "composed" | "suggested";
}

function resolveBehaviorRepos(
  index: ReturnType<typeof loadCognitiveIndex>,
  behaviorIds: string[]
): { repos: string[]; behaviorCount: number; factRatio: number } {
  const repos = new Set<string>();
  let fact = 0;
  let total = 0;
  for (const id of behaviorIds) {
    const matched = index.behaviors.find((b) => b.id === id);
    if (!matched) continue;
    if (matched.repo) repos.add(matched.repo);
    total++;
    if (matched.kind === "fact") fact++;
  }
  const factRatio = total > 0 ? fact / total : 0;
  return { repos: [...repos].sort(), behaviorCount: total, factRatio };
}

function loadComposedDomains(
  ctxRootDir: string,
  cp: ReturnType<typeof cognitivePaths>
): ResolvedDomain[] {
  if (!existsSync(cp.domainDir)) return [];
  const out: ResolvedDomain[] = [];
  const files = listFilesRecursively(cp.domainDir, [".yaml", ".yml"], 200);
  for (const f of files) {
    if (basename(f).startsWith("_")) continue;
    let doc: Record<string, unknown>;
    try {
      doc = parseYamlDocument(read(f)) as Record<string, unknown>;
    } catch {
      continue;
    }
    // v0.8 — domain YAML carries `domain` (kebab slug, used for the
    // filesystem name) and `name` (the human label). When looking up
    // a domain from a capability's domains[] list, the AI writes the
    // human label ("Order"), not the slug. Prefer `name` so the
    // back-fill metrics step actually finds the composed domain.
    const name = String(doc.name || doc.domain || basename(f, ".yaml"));
    if (!name) continue;
    const behaviorIds = Array.isArray(doc.derived_from)
      ? (doc.derived_from as unknown[]).map((x) => String(x))
      : [];
    out.push({
      name,
      description: String(doc.description || ""),
      behavior_ids: behaviorIds,
      repos: [],
      behavior_count: behaviorIds.length,
      fact_ratio: 0,
      source: "composed"
    });
  }
  return out;
}

function loadSuggestedDomains(
  ctxRootDir: string,
  cp: ReturnType<typeof cognitivePaths>
): ResolvedDomain[] {
  const file = join(cp.docsDir, "as-is", "cross-repo", "domain-suggestions.yaml");
  if (!existsSync(file)) return [];
  let doc: Record<string, unknown>;
  try {
    doc = parseYamlDocument(read(file)) as Record<string, unknown>;
  } catch {
    return [];
  }
  const clusters = Array.isArray(doc.clusters) ? doc.clusters : [];
  const out: ResolvedDomain[] = [];
  for (const c of clusters) {
    const co = c as Record<string, unknown>;
    const keys = Array.isArray(co.behavior_keys) ? (co.behavior_keys as unknown[]).map((x) => String(x)) : [];
    out.push({
      name: String(co.suggested_name || co.suggested_domain_slug || "Cluster"),
      description: `Suggested from cluster: ${String(co.naming_reason || "(no reason recorded)")}`,
      behavior_ids: keys,
      repos: Array.isArray(co.repos) ? (co.repos as unknown[]).map((x) => String(x)) : [],
      behavior_count: keys.length,
      fact_ratio: 0,
      source: "suggested"
    });
  }
  return out;
}

function mergeDomainSources(
  manual: ResolvedDomain[],
  composed: ResolvedDomain[],
  suggested: ResolvedDomain[]
): ResolvedDomain[] {
  const byName = new Map<string, ResolvedDomain>();
  for (const d of manual) byName.set(d.name, d);
  for (const d of composed) if (!byName.has(d.name)) byName.set(d.name, d);
  for (const d of suggested) if (!byName.has(d.name)) byName.set(d.name, d);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function validateCapabilityId(id: string): { ok: boolean; error?: string } {
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i.test(id)) {
    return { ok: false, error: `capability id '${id}' must be lowercase, multi-segment (e.g., 'core.checkout'), no underscores` };
  }
  return { ok: true };
}

export const cdrCapabilityMapSynth: AnyCap = {
  id: "cdr.capability.map.synth",
  version: "1.0.0",
  inputSchema: {
    required: ["product"],
    properties: {
      product: { type: "string", minLength: 1 },
      capabilities: { type: "array" },
      manual_domains: { type: "array" },
      use_suggested_domains: { type: "boolean" },
      include_cross_repo_rules: { type: "boolean" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const product = String(input.product);
    const manualCapabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
    const manualDomains = Array.isArray(input.manual_domains) ? input.manual_domains : [];
    const useSuggested = input.use_suggested_domains === true;

    const cp = cognitivePaths(ctx.rootDir);
    const index = loadCognitiveIndex(ctx.rootDir);

    const manualDomainEntries: ResolvedDomain[] = manualDomains.map((raw: unknown) => {
      const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      return {
        name: String(m.name || m.domain || ""),
        description: String(m.description || ""),
        behavior_ids: Array.isArray(m.behavior_ids)
          ? (m.behavior_ids as unknown[]).map((x) => String(x))
          : [],
        repos: [],
        behavior_count: 0,
        fact_ratio: 0,
        source: "manual"
      };
    }).filter((d: ResolvedDomain) => d.name);

    const composed = loadComposedDomains(ctx.rootDir, cp);
    const suggested = useSuggested ? loadSuggestedDomains(ctx.rootDir, cp) : [];
    const domains = mergeDomainSources(manualDomainEntries, composed, suggested);

    const domainByName = new Map<string, ResolvedDomain>();
    for (const d of domains) {
      const stats = resolveBehaviorRepos(index, d.behavior_ids);
      domainByName.set(d.name, {
        ...d,
        repos: stats.repos,
        behavior_count: stats.behaviorCount,
        fact_ratio: stats.factRatio
      });
    }

    const capabilities: Array<Record<string, YamlValue>> = [];
    const errors: string[] = [];

    if (manualCapabilities.length === 0) {
      // Synthesize one capability per domain. The id follows the
      // `<surface>.<noun>` convention used elsewhere (matches the v0.5
      // regex: lowercase, multi-segment, no underscores).
      for (const d of domainByName.values()) {
        const id = `domain.${toKebab(d.name)}`;
        capabilities.push({
          id,
          name: d.name,
          description: d.description || `Capability synthesized from domain '${d.name}'`,
          domains: [d.name] as unknown as YamlValue,
          spans_repos: d.repos as unknown as YamlValue,
          behavior_count: d.behavior_count,
          fact_ratio: Number(d.fact_ratio.toFixed(2)),
          source: d.source
        });
      }
    } else {
      // AI handed us curated capabilities. We validate each id and
      // back-fill spans_repos / behavior_count / fact_ratio by
      // unioning the metrics across the capability's named domains.
      for (const raw of manualCapabilities) {
        const cap = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
        const id = String(cap.id || "");
        const idCheck = validateCapabilityId(id);
        if (!idCheck.ok) {
          errors.push(idCheck.error || `invalid capability id: ${id}`);
          continue;
        }
        const domainNames = Array.isArray(cap.domains)
          ? (cap.domains as unknown[]).map((x) => String(x))
          : [];
        const matchedDomains = domainNames
          .map((n) => domainByName.get(n))
          .filter((d): d is ResolvedDomain => !!d);
        const repos = new Set<string>();
        let totalBehaviors = 0;
        let factCount = 0;
        const behaviorSet = new Set<string>();
        for (const d of matchedDomains) {
          for (const r of d.repos) repos.add(r);
          for (const b of d.behavior_ids) {
            if (!behaviorSet.has(b)) {
              behaviorSet.add(b);
              const m = index.behaviors.find((bb) => bb.id === b);
              if (m) {
                totalBehaviors++;
                if (m.kind === "fact") factCount++;
              }
            }
          }
        }
        const factRatio = totalBehaviors > 0 ? factCount / totalBehaviors : 0;
        capabilities.push({
          id,
          name: String(cap.name || id),
          description: String(cap.description || ""),
          domains: domainNames as unknown as YamlValue,
          spans_repos: [...repos].sort() as unknown as YamlValue,
          behavior_count: totalBehaviors,
          fact_ratio: Number(factRatio.toFixed(2)),
          source: "manual"
        });
      }
    }

    if (errors.length > 0) {
      throw new CapabilityError("INVALID_INPUT", errors.join("; "));
    }

    const outDir = capabilitiesDir(ctx.rootDir);
    ensureDir(outDir);
    const outFile = join(outDir, "product-map.yaml");

    // v0.8 — empty workspace is a legitimate state (no domains yet, AI
    // hasn't composed anything). Write the header so the AI can see the
    // product name and "no domains yet" status, but skip the strict
    // artifact validator which requires a non-empty capabilities[]. The
    // shape on disk is a deliberate superset that the doc-gen portal
    // can render as "L1 not yet synthesized".
    if (capabilities.length === 0) {
      const emptyDoc: Record<string, YamlValue> = {
        product,
        generated_at: ctx.now.toISOString(),
        synthesized_by: "cdr.capability.map.synth@1.0.0",
        status: "empty",
        message: "no domains composed yet — run cdr.domain.compose (or cdr.domain.suggest) before cdr.capability.map.synth",
        capabilities: [] as unknown as YamlValue
      };
      write(outFile, stringifyYamlDocument(emptyDoc));
      return {
        ok: true,
        data: {
          product,
          path: relative(ctx.rootDir, outFile),
          capability_count: 0,
          domain_count: domainByName.size,
          domain_sources: {
            manual: manualDomainEntries.length,
            composed: composed.length,
            suggested: suggested.length
          },
          capabilities: []
        },
        sideEffects: [`empty capability map written: ${relative(ctx.rootDir, outFile)}`],
        reportFragments: [
          `cdr.capability.map.synth: 0 capability(s) — no domains available for '${product}'`,
          "run cdr.domain.compose or cdr.domain.suggest to seed domains first"
        ]
      };
    }

    const mapDoc: Record<string, YamlValue> = {
      product,
      generated_at: ctx.now.toISOString(),
      synthesized_by: "cdr.capability.map.synth@1.0.0",
      capabilities: capabilities as unknown as YamlValue
    };

    const validationErrors = validateArtifact("capability-map", mapDoc as Record<string, unknown>);
    if (validationErrors.length) {
      throw new CapabilityError("INVALID_ARTIFACT", validationErrors.join("; "));
    }

    write(outFile, stringifyYamlDocument(mapDoc));

    const updatedIndex = loadCognitiveIndex(ctx.rootDir);
    upsertIndexEntry(updatedIndex, "capability-map", relative(ctx.rootDir, outFile), mapDoc as Record<string, unknown>);
    saveCognitiveIndex(ctx.rootDir, index);

    return {
      ok: true,
      data: {
        product,
        path: relative(ctx.rootDir, outFile),
        capability_count: capabilities.length,
        domain_count: domainByName.size,
        domain_sources: {
          manual: manualDomainEntries.length,
          composed: composed.length,
          suggested: suggested.length
        },
        capabilities
      },
      sideEffects: [`capability map synthesized: ${relative(ctx.rootDir, outFile)}`],
      reportFragments: [
        `cdr.capability.map.synth: ${capabilities.length} capability(s) from ${domainByName.size} domain(s) for '${product}'`,
        `domain sources — manual: ${manualDomainEntries.length}, composed: ${composed.length}, suggested: ${suggested.length}`
      ]
    };
  }
};

// ---------------------------------------------------------------------------
// 17. cdr.reverse_cluster.doc.generate — v0.8
//
// Renders the L1 capability map and the cluster-suggestions report to the
// VitePress portal under <output>/l1/. Peer of v0.5's
// `cdr.crossrepo.doc.generate` (which renders cross-repo business rules
// at /cross-repo/). The two sections are siblings and use the same Vue
// 3 components already shipped in the per-portal theme.
//
// Page set:
//   l1/index.md                 — L1 overview + Mermaid total graph
//   l1/<capability-id>.md       — one page per capability
//   l1/cluster-suggestions.md   — the cdr.domain.suggest output, rendered
//                                 for the AI to consult when authoring
//                                 cdr.domain.compose calls.
//
// The capability NEVER re-runs cdr.capability.map.synth or
// cdr.domain.suggest. It only reads the artifacts those capabilities
// already wrote. If the product-map is missing, the capability fails
// fast with a clear pointer at cdr.capability.map.synth.
// ---------------------------------------------------------------------------

function l1CapabilitySlug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function l1CapabilityToMermaidSubgraph(cap: Record<string, unknown>): string[] {
  const id = String(cap.id || "");
  const name = String(cap.name || id);
  const safe = id.replace(/[^a-zA-Z0-9_]/g, "_");
  const lines: string[] = [];
  lines.push(`  subgraph ${safe}["${name}"]`);
  const repos = Array.isArray(cap.spans_repos) ? (cap.spans_repos as unknown[]).map((r) => String(r)) : [];
  if (repos.length === 0) {
    lines.push(`    ${safe}_empty["(no repos)"]`);
  } else {
    for (const repo of repos) {
      const safeRepo = repo.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`    ${safe}_${safeRepo}["${repo}"]`);
    }
  }
  lines.push("  end");
  return lines;
}

function l1CapabilitiesToMermaidTotalGraph(capabilities: Array<Record<string, unknown>>): string {
  if (capabilities.length === 0) return "graph TD\n  empty[No capabilities synthesized yet]";
  const lines: string[] = ["graph TD"];
  for (const cap of capabilities) {
    lines.push(...l1CapabilityToMermaidSubgraph(cap));
  }
  return lines.join("\n");
}

export const cdrReverseClusterDocGenerate: AnyCap = {
  id: "cdr.reversecluster.doc.generate",
  version: "1.0.0",
  inputSchema: {
    properties: {
      output_dir: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const p = workspacePaths(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    const outputDir = join(p.rootDir, typeof input.output_dir === "string" ? String(input.output_dir) : ".dapei/docs-portal");

    const productMapFile = join(cp.docsDir, "as-is", "capabilities", "product-map.yaml");
    if (!existsSync(productMapFile)) {
      throw new CapabilityError(
        "FILE_MISSING",
        `${relative(ctx.rootDir, productMapFile)} not found — run cdr.capability.map.synth first`
      );
    }

    const productMapDoc = parseYamlDocument(read(productMapFile)) as Record<string, unknown>;
    const product = String(productMapDoc.product || p.workspaceName);
    const isEmpty = String(productMapDoc.status || "") === "empty";
    const rawCaps = Array.isArray(productMapDoc.capabilities) ? productMapDoc.capabilities : [];

    const sectionDir = join(outputDir, "l1");
    ensureDir(sectionDir);

    let indexMd = `---
title: L1 Capability Map
---

# L1 Capability Map

> Auto-generated from \`docs/as-is/capabilities/product-map.yaml\` (synthesized via \`cdr.capability.map.synth\`). Each capability here was either authored by the AI (manual mode) or synthesized by the engine from composed/suggested domains, with spans_repos / behavior_count / fact_ratio back-filled from the cognitive index.

- **Product:** ${product}
- **Generated:** ${String(productMapDoc.generated_at || "")}
- **Synthesized by:** ${String(productMapDoc.synthesized_by || "—")}
- **Capability count:** ${rawCaps.length}

## Total Graph

\`\`\`mermaid
${l1CapabilitiesToMermaidTotalGraph(rawCaps as Array<Record<string, unknown>>)}
\`\`\`

## Capabilities

| ID | Spans Repos | Behavior Count | Fact Ratio | Source |
|----|-------------|----------------|------------|--------|
`;

    if (isEmpty) {
      indexMd += `| _none yet_ | — | — | — | — |\n\n`;
      indexMd += `> **Status:** empty — ${String(productMapDoc.message || "no domains composed yet")}.\n\n`;
    } else {
      for (const cap of rawCaps) {
        const id = String(cap.id || "(missing id)");
        const repos = Array.isArray(cap.spans_repos) ? (cap.spans_repos as unknown[]).map((r) => String(r)).join(", ") || "—" : "—";
        const count = cap.behavior_count !== undefined ? String(cap.behavior_count) : "—";
        const ratio = cap.fact_ratio !== undefined ? String(cap.fact_ratio) : "—";
        const source = String(cap.source || "—");
        indexMd += `| [\`${id}\`](/l1/${l1CapabilitySlug(id)}) | ${repos} | ${count} | ${ratio} | ${source} |\n`;
      }
    }

    indexMd += `\n## How this was synthesized\n\n`;
    indexMd += `- **Source:** \`${relative(ctx.rootDir, productMapFile)}\`\n`;
    indexMd += `- **Cluster suggestions:** ${existsSync(join(cp.docsDir, "as-is", "cross-repo", "domain-suggestions.yaml")) ? "[view](/l1/cluster-suggestions)" : "_no cluster suggestions run yet_"}\n`;
    indexMd += `- **Re-run:** \`runCapability('cdr.capability.map.synth', { product: '${product}' }, ctx)\`\n`;

    write(join(sectionDir, "index.md"), indexMd);

    if (!isEmpty) {
      for (const cap of rawCaps) {
        const id = String(cap.id || "");
        if (!id) continue;
        const name = String(cap.name || id);
        const description = String(cap.description || "");
        const repos = Array.isArray(cap.spans_repos) ? (cap.spans_repos as unknown[]).map((r) => String(r)) : [];
        const domains = Array.isArray(cap.domains) ? (cap.domains as unknown[]).map((d) => String(d)) : [];
        const source = String(cap.source || "—");
        const behaviorCount = cap.behavior_count !== undefined ? String(cap.behavior_count) : "—";
        const factRatio = cap.fact_ratio !== undefined ? String(cap.fact_ratio) : "—";

        let pageMd = `---
title: "${id}"
---

# Capability: ${name}

- **ID:** \`${id}\`
- **Source:** ${source}
- **Spans repos:** ${repos.length > 0 ? repos.map((r) => `\`${r}\``).join(", ") : "_(none)_"}
- **Behavior count:** ${behaviorCount}
- **Fact ratio:** ${factRatio}

${description || "_no description provided_"}

## Domains

${domains.length > 0 ? domains.map((d) => `- \`${d}\``).join("\n") : "_no domains attached_"}

## Mermaid

\`\`\`mermaid
${l1CapabilityToMermaidSubgraph(cap as Record<string, unknown>).join("\n")}
\`\`\`
`;
        write(join(sectionDir, `${l1CapabilitySlug(id)}.md`), pageMd);
      }
    }

    const suggestionsFile = join(cp.docsDir, "as-is", "cross-repo", "domain-suggestions.yaml");
    if (existsSync(suggestionsFile)) {
      const sDoc = parseYamlDocument(read(suggestionsFile)) as Record<string, unknown>;
      const sClusters = Array.isArray(sDoc.clusters) ? sDoc.clusters : [];
      let sMd = `---
title: Cluster Suggestions
---

# Cluster Suggestions (from cdr.domain.suggest)

> Read-only suggestions emitted by the engine's reverse-cluster pass. These are **not** committed domains — to turn any cluster into a real domain, the AI calls \`cdr.domain.compose\` with the cluster's behavior keys.

- **Product:** ${String(sDoc.product || product)}
- **Generated:** ${String(sDoc.generated_at || "")}
- **Algorithm version:** ${String(sDoc.algorithm_version || "—")}
- **Behavior count considered:** ${String(sDoc.behavior_count || 0)}
- **Edge count:** ${String(sDoc.edge_count || 0)}
- **Reported clusters:** ${String(sDoc.reported_cluster_count || 0)}

## Clusters

| Suggested Name | Confidence | Size | Repos | Naming Reason |
|----------------|------------|------|-------|---------------|
`;

      for (const c of sClusters) {
        const co = c as Record<string, unknown>;
        const name = String(co.suggested_name || co.suggested_domain_slug || "Cluster");
        const conf = String(co.confidence || "low");
        const size = String(co.size || (Array.isArray(co.behavior_keys) ? (co.behavior_keys as unknown[]).length : 0));
        const repos = Array.isArray(co.repos) ? (co.repos as unknown[]).map((r) => String(r)).join(", ") : "—";
        const reason = String(co.naming_reason || "—");
        sMd += `| ${name} | ${conf} | ${size} | ${repos} | ${reason} |\n`;
      }

      sMd += `\n## Note\n\n${String(sDoc.note || "")}\n`;

      write(join(sectionDir, "cluster-suggestions.md"), sMd);
    }

    return {
      ok: true,
      data: {
        output_dir: typeof input.output_dir === "string" ? String(input.output_dir) : ".dapei/docs-portal",
        section: "l1",
        pages_generated: 1 + (isEmpty ? 0 : rawCaps.length) + (existsSync(suggestionsFile) ? 1 : 0),
        capabilities_rendered: isEmpty ? 0 : rawCaps.length,
        suggestions_rendered: existsSync(suggestionsFile) ? 1 : 0
      },
      sideEffects: ["l1 portal section generated"],
      reportFragments: [
        `generated l1 portal section under ${relative(p.rootDir, sectionDir)}`,
        `${isEmpty ? 0 : rawCaps.length} capability page(s)${existsSync(suggestionsFile) ? " + cluster suggestions" : ""}`
      ]
    };
  }
};
