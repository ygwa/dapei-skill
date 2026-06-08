import { existsSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { assertValidArtifact, validateArtifact, parseConfidence, type SourceRef } from "../../evidence.ts";
import type { ArtifactType } from "../../evidence.ts";
import {
  artifactRelativePath,
  cognitivePaths,
  loadCognitiveIndex,
  saveCognitiveIndex,
  upsertIndexEntry
} from "../../cognitive-index.ts";
import { parseYamlDocument, stringifyYamlDocument, type YamlValue } from "../../yaml-doc.ts";
import { requireFields, detectRepoLanguage, detectTestCommands, parseReposYamlNames } from "../shared.ts";
import { ensureDir, read, write, runSafe, workspacePaths, listFilesRecursively } from "../../../../runtime-adapters/src/system.ts";

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

    // v0.3: removed `frameworks` field. The engine no longer prescribes which
    // frameworks a repo uses — the AI reads manifest_files + directory_tree
    // and decides. See cdr-architecture.md "AI as scanner" principle.
    const profileData: Record<string, YamlValue> = {
      repo,
      generated_at: ctx.now.toISOString(),
      language,
      manifest_files: manifestFiles,
      directory_tree: directoryTree,
      test_commands: testCommands
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
        test_commands: testCommands
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

    const allFiles = listFilesRecursively(repoPath, CODE_EXTS, maxFiles);
    const fileEntries: Array<Record<string, YamlValue>> = [];
    const skipped: Array<{ relpath: string; reason: string }> = [];

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

    return {
      ok: true,
      data: {
        repo,
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
      reportFragments: [`listed ${fileEntries.length} code file(s) in ${repo} for AI triage`]
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
      sources: { type: "array" }
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

    const relPath = artifactRelativePath("domain", domainDoc as Record<string, unknown>);
    const outFile = join(ctx.rootDir, relPath);
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
  version: "1.0.0",
  inputSchema: {
    properties: {
      repo: { type: "string" },
      kind: { type: "string", enum: ["fact", "inference", "unknown"] }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const index = loadCognitiveIndex(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    const repoFilter = input.repo ? String(input.repo) : undefined;
    const kindFilter = input.kind ? String(input.kind) : undefined;

    const behaviors = index.behaviors.filter((b) => {
      if (repoFilter && b.repo !== repoFilter) return false;
      if (kindFilter && b.kind !== kindFilter) return false;
      return true;
    });

    const stateMachines = index.state_machines.filter((s) => {
      if (repoFilter && s.repo !== repoFilter) return false;
      if (kindFilter && s.kind !== kindFilter) return false;
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
    if (Array.isArray(input.calls)) doc.calls = input.calls.map((x: unknown) => String(x)) as unknown as YamlValue;
    if (Array.isArray(input.risks)) doc.risks = input.risks.map((x: unknown) => String(x)) as unknown as YamlValue;
    if (Array.isArray(input.sources)) doc.sources = input.sources as unknown as YamlValue;
    if (Array.isArray(input.derived_from)) doc.derived_from = input.derived_from.map((x: unknown) => String(x)) as unknown as YamlValue;
    if (input.reason) doc.reason = String(input.reason);
    doc.confidence = input.confidence as YamlValue;

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
    requireFields(input as Record<string, import("../../types.ts").Json>, ["entity", "behaviors"]);
    const entity = String(input.entity);
    const behaviorIds: string[] = Array.isArray(input.behaviors)
      ? input.behaviors.map((b: unknown) => String(b))
      : [];
    const repo = input.repo ? String(input.repo) : undefined;

    if (!behaviorIds.length) {
      throw new CapabilityError("INVALID_INPUT", "behaviors[] must contain at least one behavior ID");
    }

    const cp = cognitivePaths(ctx.rootDir);
    const index = loadCognitiveIndex(ctx.rootDir);
    const allStates = new Set<string>();
    const allTransitions: Array<Record<string, YamlValue>> = [];
    const derivedFrom: string[] = [];
    const missingBehaviors: string[] = [];

    for (const bid of behaviorIds) {
      // v0.4 — look up the canonical path via the cognitive index so we can
      // resolve per-repo behavior files (`docs/as-is/behavior/<repo>/<id>.yaml`)
      // without guessing. Falls back to the flat legacy path for pre-v0.4
      // artifacts only when the index does not know about the id.
      const indexEntry = index.behaviors.find((b) => b.id === bid);
      const behaviorPath = indexEntry
        ? join(ctx.rootDir, indexEntry.path)
        : join(cp.behaviorDir, `${bid}.yaml`);
      if (!existsSync(behaviorPath)) {
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
  id: "cdr.business.cross_link",
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
      throw new CapabilityError(
        "FILE_MISSING",
        `business-rules directory not found: ${relative(ctx.rootDir, cp.businessRulesDir)}`
      );
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
  id: "cdr.cross_repo.doc.generate",
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
