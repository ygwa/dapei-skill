import { existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { assertValidArtifact, validateArtifact, parseConfidence } from "../../evidence.ts";
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
// Helpers
// ---------------------------------------------------------------------------

const MANIFEST_MARKERS = [
  "package.json", "pnpm-lock.yaml", "yarn.lock",
  "pom.xml", "build.gradle", "build.gradle.kts",
  "pyproject.toml", "requirements.txt", "setup.py",
  "go.mod", "Cargo.toml", "Gemfile", "composer.json",
  "mix.exs", "pubspec.yaml", "Package.swift", "CMakeLists.txt"
];

const FRAMEWORK_HINTS: Array<{ file: string; hint: string }> = [
  { file: "next.config.js", hint: "next.js" },
  { file: "next.config.mjs", hint: "next.js" },
  { file: "next.config.ts", hint: "next.js" },
  { file: "nuxt.config.ts", hint: "nuxt" },
  { file: "angular.json", hint: "angular" },
  { file: "vite.config.ts", hint: "vite" },
  { file: "vite.config.js", hint: "vite" },
  { file: "nest-cli.json", hint: "nestjs" },
  { file: "tsconfig.json", hint: "typescript" },
  { file: "Dockerfile", hint: "docker" },
  { file: "docker-compose.yml", hint: "docker-compose" },
  { file: "docker-compose.yaml", hint: "docker-compose" },
];

/** Entry-point heuristic patterns (case-insensitive match against filenames). */
const ENTRY_PATTERNS: Array<{ regex: RegExp; type: "api" | "mq" | "cron" | "other" }> = [
  { regex: /controller/i, type: "api" },
  { regex: /route/i, type: "api" },
  { regex: /resource/i, type: "api" },
  { regex: /handler/i, type: "other" },
  { regex: /listener/i, type: "mq" },
  { regex: /consumer/i, type: "mq" },
  { regex: /scheduler/i, type: "cron" },
  { regex: /job/i, type: "cron" },
];

const FILE_CONTENT_SCAN_BYTES = 200_000;

interface AnnotationMatch {
  framework: string;
  type: "api";
  method?: string;
  path: string;
  line: number;
}

const CLASS_LEVEL_PATTERNS: Array<{
  framework: string;
  fileExt: string[];
  regex: RegExp;
  pathGroup: number;
}> = [
  {
    framework: "spring",
    fileExt: [".java"],
    regex: /@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/g,
    pathGroup: 1
  },
  {
    framework: "nestjs",
    fileExt: [".ts", ".js"],
    regex: /@Controller\s*\(\s*["']([^"']+)["']/g,
    pathGroup: 1
  }
];

const ANNOTATION_PATTERNS: Array<{
  framework: string;
  fileExt: string[];
  matches: Array<{ regex: RegExp; method?: string; require: RegExp; pathGroup: number; methodGroup?: number }>;
}> = [
  {
    framework: "spring",
    fileExt: [".java"],
    matches: [
      {
        // Method annotation — path in parens is optional (empty/missing → use class-level).
        regex: /@(Get|Post|Put|Delete|Patch)Mapping\s*(?:\(\s*["']?([^"']*)["']?\s*\))?/g,
        methodGroup: 1,
        pathGroup: 2,
        require: /@(RestController|Controller)\b/
      },
      {
        regex: /@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/g,
        pathGroup: 1,
        require: /@(RestController|Controller)\b/
      }
    ]
  },
  {
    framework: "nestjs",
    fileExt: [".ts", ".js"],
    matches: [
      {
        // Method decorator — path in parens is optional.
        regex: /@(Get|Post|Put|Delete|Patch)\s*(?:\(\s*["']?([^"']*)["']?\s*\))?/g,
        methodGroup: 1,
        pathGroup: 2,
        require: /@Controller\b/
      },
      {
        regex: /@Controller\s*\(\s*["']([^"']+)["']/g,
        pathGroup: 1,
        require: /@Controller\s*\(/
      }
    ]
  },
  {
    framework: "fastapi",
    fileExt: [".py"],
    matches: [
      {
        regex: /@(app|router)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/g,
        methodGroup: 2,
        pathGroup: 3,
        require: /@\s*(?:FastAPI|APIRouter|router|app)/
      }
    ]
  },
  {
    framework: "express",
    fileExt: [".ts", ".js"],
    matches: [
      {
        regex: /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/g,
        methodGroup: 1,
        pathGroup: 2,
        require: /\b(?:express\s*\(\s*)?Router\s*\(\s*\)/
      }
    ]
  }
];

function safeStat(filePath: string): number | null {
  try {
    return statSync(filePath).size;
  } catch {
    return null;
  }
}

function lineOfOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

function joinUrlPath(base: string | undefined, suffix: string): string {
  if (!base) return suffix;
  if (!suffix) return base;
  const b = base.replace(/\/+$/, "");
  const s = suffix.startsWith("/") ? suffix : "/" + suffix;
  return b + s;
}

function extractClassLevelPath(filePath: string, content: string): string | undefined {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  for (const fw of CLASS_LEVEL_PATTERNS) {
    if (!fw.fileExt.includes(ext)) continue;
    fw.regex.lastIndex = 0;
    const m = fw.regex.exec(content);
    if (m) {
      const p = (m[fw.pathGroup] || "").trim();
      if (p) return p.replace(/\/+$/, "");
    }
  }
  return undefined;
}

function scanFileForAnnotations(filePath: string, content: string): AnnotationMatch[] {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  const classLevel = extractClassLevelPath(filePath, content);
  const out: AnnotationMatch[] = [];
  for (const framework of ANNOTATION_PATTERNS) {
    if (!framework.fileExt.includes(ext)) continue;
    if (!framework.matches.some((m) => m.require.test(content))) continue;
    for (const pat of framework.matches) {
      // Skip the class-level @RequestMapping / @Controller pattern here — it's
      // already consumed by extractClassLevelPath.
      if (pat.pathGroup === 1 && pat.methodGroup === undefined && pat.regex.source.includes("RequestMapping")) continue;
      if (pat.pathGroup === 1 && pat.methodGroup === undefined && pat.regex.source.includes("Controller")) continue;
      pat.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.regex.exec(content)) !== null) {
        const rawPath = (m[pat.pathGroup] || "").trim();
        const method = pat.methodGroup ? (m[pat.methodGroup] || "").toUpperCase() : undefined;
        if (!method) continue;
        const finalPath = joinUrlPath(classLevel, rawPath);
        if (!finalPath) continue;
        out.push({
          framework: framework.framework,
          type: "api",
          method,
          path: finalPath,
          line: lineOfOffset(content, m.index)
        });
        if (m.index === pat.regex.lastIndex) pat.regex.lastIndex++;
      }
    }
  }
  return out;
}

function toKebab(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")           // strip extension
    .replace(/([a-z])([A-Z])/g, "$1-$2") // camelCase → kebab
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
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

function detectFrameworkHints(repoPath: string): string[] {
  return FRAMEWORK_HINTS
    .filter((h) => existsSync(join(repoPath, h.file)))
    .map((h) => h.hint);
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

// ---------------------------------------------------------------------------
// 1. cdr.profile
// ---------------------------------------------------------------------------

export const cdrProfile: AnyCap = {
  id: "cdr.profile",
  version: "1.0.0",
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
    const frameworks = detectFrameworkHints(repoPath);
    const manifestFiles = repoManifestFiles(repoPath);
    const directoryTree = repoDirectoryTree(repoPath, p.rootDir);
    const testCommands = detectTestCommands(repoPath);

    const profileData: Record<string, YamlValue> = {
      repo,
      generated_at: ctx.now.toISOString(),
      language,
      frameworks,
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
        frameworks,
        manifest_files: manifestFiles,
        test_commands: testCommands
      },
      sideEffects: [`profile written: ${relative(p.rootDir, outFile)}`],
      reportFragments: [`generated profile for ${repo}`]
    };
  }
};

// ---------------------------------------------------------------------------
// 2. cdr.entries.prepare
// ---------------------------------------------------------------------------

export const cdrEntriesPrepare: AnyCap = {
  id: "cdr.entries.prepare",
  version: "1.0.0",
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

    // Scan for entry point candidate files
    const codeExts = [".ts", ".js", ".java", ".py", ".go", ".rs", ".kt", ".scala", ".rb", ".php"];
    const allFiles = listFilesRecursively(repoPath, codeExts, 500);

    const candidates: Array<Record<string, YamlValue>> = [];
    const seenFilenameIds = new Set<string>();
    const seenAnnotationKeys = new Set<string>();

    for (const filePath of allFiles) {
      const relFile = relative(repoPath, filePath);
      const fileName = filePath.split("/").pop() || "";

      for (const pattern of ENTRY_PATTERNS) {
        if (pattern.regex.test(fileName)) {
          const id = toKebab(fileName);
          if (seenFilenameIds.has(id)) break;
          seenFilenameIds.add(id);

          candidates.push({
            id,
            type: pattern.type,
            status: "candidate",
            anchor: relFile,
            discovered_by: "platform"
          });
          break;
        }
      }
    }

    for (const filePath of allFiles) {
      const relFile = relative(repoPath, filePath);
      const stat = safeStat(filePath);
      if (stat === null || stat > FILE_CONTENT_SCAN_BYTES) continue;

      let content: string;
      try {
        content = read(filePath);
      } catch {
        continue;
      }

      const matches = scanFileForAnnotations(filePath, content);
      if (matches.length === 0) continue;

      // Annotation results are strictly more informative than a filename hit
      // (specific method+path vs. a whole file) — drop the latter when the
      // former is present.
      const filtered = candidates.filter((c) => c.anchor !== relFile);
      candidates.length = 0;
      candidates.push(...filtered);

      const fileBase = toKebab(relFile.split("/").pop() || relFile);
      for (const m of matches) {
        const dedupKey = `${relFile}|${m.method || ""}|${m.path}`;
        if (seenAnnotationKeys.has(dedupKey)) continue;
        seenAnnotationKeys.add(dedupKey);

        const id = `${fileBase}-${(m.method || "ANY").toLowerCase()}-${toKebab(m.path)}`;
        const entry: Record<string, YamlValue> = {
          id,
          type: m.type,
          status: "candidate",
          anchor: relFile,
          line: m.line,
          path: m.path,
          framework: m.framework,
          discovered_by: "platform-annotation"
        };
        if (m.method) entry.method = m.method;
        candidates.push(entry);
      }
    }

    const entriesDoc: Record<string, YamlValue> = {
      repo,
      generated_at: ctx.now.toISOString(),
      entry_count: candidates.length,
      entries: candidates as unknown as YamlValue
    };

    const outDir = entriesDir(ctx.rootDir);
    ensureDir(outDir);
    const outFile = join(outDir, `${repo}.yaml`);
    write(outFile, stringifyYamlDocument(entriesDoc));

    return {
      ok: true,
      data: {
        repo,
        path: relative(p.rootDir, outFile),
        entry_count: candidates.length,
        entries: candidates
      },
      sideEffects: [`entries prepared: ${relative(p.rootDir, outFile)}`],
      reportFragments: [`found ${candidates.length} entry candidates in ${repo}`]
    };
  }
};

// ---------------------------------------------------------------------------
// 3. cdr.entries.confirm
// ---------------------------------------------------------------------------

export const cdrEntriesConfirm: AnyCap = {
  id: "cdr.entries.confirm",
  version: "1.0.0",
  inputSchema: {
    required: ["repo", "entry_id", "summary"],
    properties: {
      repo: { type: "string", minLength: 1 },
      entry_id: { type: "string", minLength: 1 },
      summary: { type: "string", minLength: 1 },
      priority: { type: "string" },
      framework: { type: "string" },
      method: { type: "string" },
      path: { type: "string" },
      line: { type: "number" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["repo", "entry_id", "summary"]);
    const repo = String(input.repo);
    const entryId = String(input.entry_id);
    const summary = String(input.summary);
    const framework = input.framework ? String(input.framework) : undefined;
    const method = input.method ? String(input.method) : undefined;
    const path = input.path ? String(input.path) : undefined;
    const line = typeof input.line === "number" ? input.line : undefined;
    const priority = input.priority ? String(input.priority) : undefined;

    const outDir = entriesDir(ctx.rootDir);
    const outFile = join(outDir, `${repo}.yaml`);

    if (!existsSync(outFile)) {
      throw new CapabilityError("FILE_MISSING", `entries file not found: ${relative(ctx.rootDir, outFile)}. Run cdr.entries.prepare first.`);
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
          e.status = "confirmed";
          e.summary = summary;
          if (priority) e.priority = priority;
          if (framework) e.framework = framework;
          if (method) e.method = method;
          if (path) e.path = path;
          if (line !== undefined) e.line = line;
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
        framework: framework || null,
        method: method || null,
        path: path || null,
        line: line ?? null
      },
      sideEffects: [`entry confirmed: ${entryId}`],
      reportFragments: [`confirmed entry ${entryId} in ${repo}`]
    };
  }
};

// ---------------------------------------------------------------------------
// 4. cdr.domain.compose
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
      repo: { type: "string" }
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

    // Verify referenced behaviors exist in the index
    const missingBehaviors: string[] = [];
    const matchedBehaviors: Array<Record<string, YamlValue>> = [];

    for (const bid of behaviorIds) {
      const found = index.behaviors.find((b) => b.id === bid);
      if (!found) {
        missingBehaviors.push(bid);
      } else {
        // Load the behavior artifact if it exists
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
// 4b. cdr.business.compose
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
// 5. cdr.capability.map.init
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

    // Validate before writing
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
// 6. cdr.index.list
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

    // Filter behaviors
    const behaviors = index.behaviors.filter((b) => {
      if (repoFilter && b.repo !== repoFilter) return false;
      if (kindFilter && b.kind !== kindFilter) return false;
      return true;
    });

    // Filter state machines
    const stateMachines = index.state_machines.filter((s) => {
      if (repoFilter && s.repo !== repoFilter) return false;
      if (kindFilter && s.kind !== kindFilter) return false;
      return true;
    });

    // Scan for domain artifacts
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

    // Scan for capability maps
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

    // Filter business rules (in-memory, not filesystem-scanned — index is authoritative)
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
// 7. cdr.behavior.upsert
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
// 8. cdr.state.derive
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
      repo: { type: "string" }
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
    const allStates = new Set<string>();
    const allTransitions: Array<Record<string, YamlValue>> = [];
    const derivedFrom: string[] = [];
    const missingBehaviors: string[] = [];

    for (const bid of behaviorIds) {
      const behaviorPath = join(cp.behaviorDir, `${bid}.yaml`);
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
