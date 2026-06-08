import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { assertValidArtifact, validateArtifact, type ArtifactType } from "../../evidence.ts";
import {
  artifactRelativePath,
  cognitivePaths,
  loadCognitiveIndex,
  saveCognitiveIndex,
  upsertIndexEntry
} from "../../cognitive-index.ts";
import { parseYamlDocument, stringifyYamlDocument, type YamlValue } from "../../yaml-doc.ts";
import { parseReposYamlNames, requireFields } from "../shared.ts";
import { ensureDir, read, runSafe, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";

export type AnyCap = CapabilitySpec<any, any>;

function resolveArtifactContent(rootDir: string, input: Record<string, unknown>): { type: ArtifactType; content: string } {
  requireFields(input as Record<string, import("../../types.ts").Json>, ["type"]);
  const type = String(input.type) as ArtifactType;
  if (type !== "behavior" && type !== "state-machine") {
    throw new CapabilityError("INVALID_INPUT", "type must be behavior or state-machine");
  }
  if (input.content) return { type, content: String(input.content) };
  if (input.file) {
    const filePath = join(rootDir, String(input.file));
    if (!existsSync(filePath)) throw new CapabilityError("FILE_MISSING", `artifact file not found: ${input.file}`);
    return { type, content: read(filePath) };
  }
  throw new CapabilityError("INVALID_INPUT", "content or file is required");
}

function parseArtifact(type: ArtifactType, content: string): Record<string, unknown> {
  const doc = parseYamlDocument(content);
  return doc as Record<string, unknown>;
}

const MANIFEST_MARKERS = [
  "package.json", "pnpm-lock.yaml", "yarn.lock",
  "pom.xml", "build.gradle", "build.gradle.kts",
  "pyproject.toml", "requirements.txt", "setup.py",
  "go.mod", "Cargo.toml", "Gemfile", "composer.json",
  "mix.exs", "pubspec.yaml", "Package.swift", "CMakeLists.txt"
];

const DISCOVER_WORKFLOW = [
  { step: 1, phase: "orient", goal: "Inspect directory tree and stack manifest files; infer language and layout" },
  { step: 2, phase: "strategy", goal: "Agent chooses how to locate behavior entry points for this stack — platform does not prescribe keywords or patterns" },
  { step: 3, phase: "candidates", goal: "Read code semantically; write candidates[] to _candidates.yaml" },
  { step: 4, phase: "deep_dive", goal: "Trace each candidate; upsert behavior artifacts with evidence via cognitive.artifact.upsert" }
];

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

export const cognitiveDiscover: AnyCap = {
  id: "cognitive.discover",
  version: "2.1.0",
  inputSchema: {
    required: ["target"],
    properties: { target: { type: "string", minLength: 1 } },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["target"]);
    const p = workspacePaths(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    ensureDir(cp.behaviorDir);
    const target = String(input.target);
    const names =
      target === "--all" && existsSync(join(p.dapeiDir, "repos.yaml"))
        ? parseReposYamlNames(read(join(p.dapeiDir, "repos.yaml")))
        : [target];

    const repos: Array<Record<string, YamlValue>> = [];
    const repoContext: Array<Record<string, YamlValue>> = [];

    for (const name of names) {
      const rp = join(p.reposDir, name);
      if (!existsSync(rp)) continue;

      const manifestFiles = repoManifestFiles(rp);
      const directoryTree = repoDirectoryTree(rp, p.rootDir);

      const repoEntry: Record<string, YamlValue> = {
        name,
        path: `repos/${name}`,
        directory_tree: directoryTree,
        manifest_files: manifestFiles
      };
      repos.push(repoEntry);
      repoContext.push(repoEntry);
    }

    const candidatesDoc: Record<string, YamlValue> = {
      generated_at: new Date().toISOString(),
      status: "awaiting_agent_analysis",
      workflow: DISCOVER_WORKFLOW as unknown as YamlValue,
      repo_context: repoContext as unknown as YamlValue,
      candidates: []
    };

    write(cp.candidatesFile, stringifyYamlDocument(candidatesDoc));

    return {
      ok: true,
      data: {
        candidatesFile: relative(p.rootDir, cp.candidatesFile),
        candidateCount: 0,
        repos,
        workflow: DISCOVER_WORKFLOW,
        nextStep: "Agent orients via directory_tree + manifest_files, chooses entry-finding strategy, then fills candidates[]"
      },
      sideEffects: ["cognitive discover workspace prepared"],
      reportFragments: [`prepared discover scaffold for ${repos.length} repo(s)`]
    };
  }
};

export const cognitiveArtifactValidate: AnyCap = {
  id: "cognitive.artifact.validate",
  version: "1.0.0",
  inputSchema: {
    required: ["type"],
    properties: {
      type: { type: "string", enum: ["behavior", "state-machine"] },
      content: { type: "string" },
      file: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const { type, content } = resolveArtifactContent(ctx.rootDir, input);
    const doc = parseArtifact(type, content);
    const errors = validateArtifact(type, doc);
    return {
      ok: errors.length === 0,
      data: { valid: errors.length === 0, errors, type, id: doc.id || doc.entity },
      sideEffects: [],
      reportFragments: errors.length ? ["validation failed"] : ["validation passed"]
    };
  }
};

export const cognitiveArtifactUpsert: AnyCap = {
  id: "cognitive.artifact.upsert",
  version: "1.0.0",
  inputSchema: {
    required: ["type"],
    properties: {
      type: { type: "string", enum: ["behavior", "state-machine"] },
      content: { type: "string" },
      file: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const { type, content } = resolveArtifactContent(ctx.rootDir, input);
    const doc = parseArtifact(type, content);
    assertValidArtifact(type, doc);

    const cp = cognitivePaths(ctx.rootDir);
    ensureDir(cp.behaviorDir);
    ensureDir(cp.stateMachineDir);
    ensureDir(cp.cognitiveDir);

    const relPath = artifactRelativePath(type, doc);
    const absPath = join(ctx.rootDir, relPath);
    write(absPath, content.endsWith("\n") ? content : `${content}\n`);

    const index = loadCognitiveIndex(ctx.rootDir);
    upsertIndexEntry(index, type, relPath, doc);
    saveCognitiveIndex(ctx.rootDir, index);

    return {
      ok: true,
      data: {
        type,
        path: relPath,
        id: doc.id || doc.entity,
        kind: (doc.confidence as any)?.kind
      },
      sideEffects: ["cognitive artifact upserted", "index updated"],
      reportFragments: [`upserted ${type} ${doc.id || doc.entity}`]
    };
  }
};

export const cognitiveArtifactList: AnyCap = {
  id: "cognitive.artifact.list",
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
    const domains = index.domains.filter((d) => {
      if (repoFilter && d.repo !== repoFilter) return false;
      return true;
    });
    const capabilityMaps = index.capability_maps;
    const unknowns = index.unknowns;

    const lines = [
      `# Cognitive Artifacts`,
      ``,
      `- Updated: ${index.updated_at}`,
      `- Behaviors: ${behaviors.length}`,
      `- State Machines: ${stateMachines.length}`,
      `- Domains: ${domains.length}`,
      `- Capability Maps: ${capabilityMaps.length}`,
      `- Unknowns: ${unknowns.length}`,
      ``,
      `## Behaviors`,
      ...(behaviors.length ? behaviors.map((b) => `- ${b.id} [${b.kind}/${b.level}] ${b.path}${b.repo ? ` (${b.repo})` : ""}`) : ["- none"]),
      ``,
      `## State Machines`,
      ...(stateMachines.length ? stateMachines.map((s) => `- ${s.entity} [${s.kind}/${s.level}] ${s.path}${s.repo ? ` (${s.repo})` : ""}`) : ["- none"]),
      ``,
      `## Domains`,
      ...(domains.length ? domains.map((d) => `- ${d.domain} ${d.path} derived_from: [${d.derived_from.join(", ")}]${d.repo ? ` (${d.repo})` : ""}`) : ["- none"]),
      ``,
      `## Capability Maps`,
      ...(capabilityMaps.length ? capabilityMaps.map((c) => `- ${c.product} ${c.path} (${c.capability_count} capabilities)`) : ["- none"]),
      ``,
      `## Unknowns`,
      ...(unknowns.length ? unknowns.map((u) => `- ${u.id}: ${u.reason}`) : ["- none"])
    ];

    return {
      ok: true,
      data: { text: lines.join("\n"), behaviors, state_machines: stateMachines, domains, capability_maps: capabilityMaps, unknowns, updated_at: index.updated_at },
      sideEffects: [],
      reportFragments: ["cognitive list"]
    };
  }
};

export const cognitiveStateSuggest: AnyCap = {
  id: "cognitive.state.suggest",
  version: "1.0.0",
  inputSchema: {
    required: ["entity"],
    properties: {
      entity: { type: "string", minLength: 1 },
      repo: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["entity"]);
    const entity = String(input.entity);
    const repoFilter = input.repo ? String(input.repo) : undefined;
    const cp = cognitivePaths(ctx.rootDir);
    ensureDir(cp.stateMachineDir);

    const index = loadCognitiveIndex(ctx.rootDir);
    const behaviorIds = index.behaviors
      .filter((b) => !repoFilter || b.repo === repoFilter)
      .map((b) => b.id);

    const states = new Set<string>();
    const transitions: Array<Record<string, string>> = [];
    const derivedFrom: string[] = [];

    for (const bid of behaviorIds) {
      // v0.4 — resolve via the index's canonical path; fall back to the
      // legacy flat path for pre-v0.4 artifacts that the index has not
      // recorded yet.
      const indexEntry = index.behaviors.find((b) => b.id === bid);
      const behaviorPath = indexEntry
        ? join(ctx.rootDir, indexEntry.path)
        : join(ctx.rootDir, "docs/as-is/behavior", `${bid}.yaml`);
      if (!existsSync(behaviorPath)) continue;
      const doc = parseYamlDocument(read(behaviorPath)) as Record<string, unknown>;
      const id = String(doc.id || "");
      if (!id.toLowerCase().includes(entity.toLowerCase()) && entity.toLowerCase() !== "all") continue;

      derivedFrom.push(id);
      const entry = doc.entry as Record<string, unknown> | undefined;
      const trigger =
        entry?.type === "api"
          ? `${entry.method || "POST"} ${entry.path || ""}`.trim()
          : entry?.type === "mq"
            ? String(entry.topic || entry.handler || "mq.event")
            : String(entry?.handler || id);

      if (Array.isArray(doc.events)) {
        for (const ev of doc.events) {
          const eventName = String(ev);
          const parts = eventName.split(".");
          const stateHint = parts[parts.length - 1]?.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
          if (stateHint) states.add(stateHint);
          transitions.push({ trigger: eventName, from: "TBD", to: stateHint || "TBD", behavior_id: id });
        }
      }

      if (Array.isArray(doc.writes)) {
        for (const w of doc.writes) {
          const wo = w as Record<string, unknown>;
          if (wo.operation === "insert") states.add("CREATED");
          if (wo.operation === "update") states.add("UPDATED");
        }
      }
    }

    if (!states.size) {
      states.add("CREATED");
      states.add("ACTIVE");
      states.add("CLOSED");
    }

    const draft: Record<string, YamlValue> = {
      entity,
      states: [...states],
      transitions: transitions as unknown as YamlValue,
      confidence: { level: "medium", kind: "inference", evidence_type: "inferred_from_behavior" },
      derived_from: derivedFrom.length ? derivedFrom : ["cognitive.state.suggest"]
    };
    if (repoFilter) draft.repo = repoFilter;
    if (!derivedFrom.length) draft.reason = "no matching behaviors found; placeholder states generated";

    const relPath = artifactRelativePath("state-machine", draft);
    const absPath = join(ctx.rootDir, relPath);
    write(absPath, stringifyYamlDocument(draft));

    return {
      ok: true,
      data: {
        draft: true,
        path: relPath,
        entity,
        states: draft.states,
        transitions: draft.transitions,
        note: "draft only — Agent must confirm before upsert with kind=fact"
      },
      sideEffects: ["state machine draft written"],
      reportFragments: [`state draft for ${entity}`]
    };
  }
};
