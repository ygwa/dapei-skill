import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CapabilitySpec } from "@dapei/core/types";
import { parseYamlDocument } from "@dapei/core/yaml-doc";
import { read, runSafe, workspacePaths, safeJoinWithin } from "@dapei/runtime-adapters/system";

export type AnyCap = CapabilitySpec<any, any>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MANIFEST_MARKERS = [
  "package.json", "pnpm-lock.yaml", "yarn.lock",
  "pom.xml", "build.gradle", "build.gradle.kts",
  "pyproject.toml", "requirements.txt", "setup.py",
  "go.mod", "Cargo.toml", "Gemfile", "composer.json",
  "mix.exs", "pubspec.yaml", "Package.swift", "CMakeLists.txt"
];

/** File extensions that the engine will hand back to the AI for entry discovery. */
export const CODE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".java", ".kt", ".scala",
  ".py", ".rb", ".go", ".rs", ".php", ".cs", ".swift", ".m", ".mm", ".dart"];

/** Cap on a file's content slice returned by cdr.entries.candidate, in bytes. */
export const MAX_FILE_BYTES = 200_000;

/** A reasonable number of files to hand back per candidate call. */
export const MAX_FILES_PER_CANDIDATE = 200;

export const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
  ".mjs": "javascript", ".cjs": "javascript",
  ".java": "java", ".kt": "kotlin", ".scala": "scala",
  ".py": "python", ".rb": "ruby", ".go": "go", ".rs": "rust",
  ".php": "php", ".cs": "csharp", ".swift": "swift",
  ".dart": "dart", ".m": "objc", ".mm": "objcpp"
};

export const ENTRY_TYPES = new Set(["api", "mq", "cron", "rpc", "cache", "search", "other"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toKebab(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function languageHintForFile(relpath: string): string {
  const idx = relpath.lastIndexOf(".");
  if (idx < 0) return "unknown";
  return EXT_TO_LANG[relpath.slice(idx).toLowerCase()] || "unknown";
}

export function repoDirectoryTree(repoPath: string, rootDir: string): string {
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

export function repoManifestFiles(repoPath: string): string[] {
  return MANIFEST_MARKERS.filter((name) => existsSync(join(repoPath, name)));
}

export function profilesDir(rootDir: string): string {
  return join(workspacePaths(rootDir).docsDir, "as-is", "profiles");
}

export function entriesDir(rootDir: string): string {
  return join(workspacePaths(rootDir).docsDir, "as-is", "entries");
}

export function capabilitiesDir(rootDir: string): string {
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
export function validateEvidencePoints(
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
    // M7 — path-traversal guard. The old `join("repos", repoName, file)`
    // accepted `../../etc/passwd` and resolved outside the repo
    // directory. safeJoinWithin enforces that the resolved path is
    // still inside ctx.rootDir before we touch the filesystem.
    const rel = `repos/${repoName}/${file}`;
    let abs: string;
    try {
      abs = safeJoinWithin(ctx.rootDir, rel);
    } catch (err) {
      errors.push(`sources[${i}].file escapes workspace: ${file} (${(err as Error).message})`);
      continue;
    }
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

export function parseYamlDocumentSafe(content: string): Record<string, unknown> | null {
  try {
    return parseYamlDocument(content);
  } catch {
    return null;
  }
}

export interface BehaviorDetails {
  events?: string[];
  writes?: Array<{ table?: string }>;
  calls?: Array<string | { target?: string; target_repo?: string }>;
}

export function readBehaviorDetails(rootDir: string, relPath: string): BehaviorDetails {
  const fullPath = join(rootDir, relPath);
  if (!existsSync(fullPath)) return {};
  try {
    const doc = parseYamlDocument(read(fullPath));
    return doc as BehaviorDetails;
  } catch {
    return {};
  }
}
