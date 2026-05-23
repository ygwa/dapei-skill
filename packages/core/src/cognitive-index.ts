import { existsSync } from "node:fs";
import { join } from "node:path";
import { read, write, workspacePaths } from "../../runtime-adapters/src/system.ts";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml-doc.ts";
import type { ArtifactType } from "./evidence.ts";
import { parseConfidence } from "./evidence.ts";

export interface IndexBehaviorEntry {
  id: string;
  path: string;
  repo?: string;
  kind: string;
  level: string;
}

export interface IndexStateMachineEntry {
  entity: string;
  path: string;
  repo?: string;
  kind: string;
  level: string;
}

export interface CognitiveIndex {
  version: string;
  updated_at: string;
  behaviors: IndexBehaviorEntry[];
  state_machines: IndexStateMachineEntry[];
  unknowns: Array<{ id: string; artifact_type?: string; reason: string; investigation_hint?: string }>;
}

export function cognitivePaths(rootDir: string) {
  const p = workspacePaths(rootDir);
  return {
    ...p,
    behaviorDir: join(p.docsDir, "as-is", "behavior"),
    stateMachineDir: join(p.docsDir, "as-is", "state-machines"),
    domainDir: join(p.docsDir, "as-is", "domains"),
    cognitiveDir: join(p.dapeiDir, "cognitive"),
    indexFile: join(p.dapeiDir, "cognitive", "index.yaml"),
    candidatesFile: join(p.docsDir, "as-is", "behavior", "_candidates.yaml")
  };
}

export function loadCognitiveIndex(rootDir: string): CognitiveIndex {
  const { indexFile } = cognitivePaths(rootDir);
  if (!existsSync(indexFile)) {
    return { version: "1.0", updated_at: new Date(0).toISOString(), behaviors: [], state_machines: [], unknowns: [] };
  }
  const doc = parseYamlDocument(read(indexFile));
  return {
    version: String(doc.version || "1.0"),
    updated_at: String(doc.updated_at || new Date(0).toISOString()),
    behaviors: Array.isArray(doc.behaviors) ? (doc.behaviors as unknown as IndexBehaviorEntry[]) : [],
    state_machines: Array.isArray(doc.state_machines) ? (doc.state_machines as unknown as IndexStateMachineEntry[]) : [],
    unknowns: Array.isArray(doc.unknowns) ? (doc.unknowns as unknown as CognitiveIndex["unknowns"]) : []
  };
}

export function saveCognitiveIndex(rootDir: string, index: CognitiveIndex): void {
  const { indexFile } = cognitivePaths(rootDir);
  index.updated_at = new Date().toISOString();
  write(indexFile, stringifyYamlDocument(index as unknown as Record<string, import("./yaml-doc.ts").YamlValue>));
}

export function artifactRelativePath(type: ArtifactType, doc: Record<string, unknown>): string {
  if (type === "behavior") {
    const id = String(doc.id || "unknown");
    return `docs/as-is/behavior/${id}.yaml`;
  }
  const entity = String(doc.entity || "unknown").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return `docs/as-is/state-machines/${entity}.yaml`;
}

export function upsertIndexEntry(
  index: CognitiveIndex,
  type: ArtifactType,
  relPath: string,
  doc: Record<string, unknown>
): CognitiveIndex {
  const confidence = parseConfidence(doc.confidence);
  const repo = doc.repo ? String(doc.repo) : undefined;

  if (type === "behavior") {
    const id = String(doc.id);
    index.behaviors = index.behaviors.filter((b) => b.id !== id);
    index.behaviors.push({ id, path: relPath, repo, kind: confidence.kind, level: confidence.level });
    if (confidence.kind === "unknown" && doc.reason) {
      index.unknowns = index.unknowns.filter((u) => u.id !== id);
      index.unknowns.push({
        id,
        artifact_type: "behavior",
        reason: String(doc.reason),
        investigation_hint: doc.investigation_hint ? String(doc.investigation_hint) : undefined
      });
    }
  } else {
    const entity = String(doc.entity);
    index.state_machines = index.state_machines.filter((s) => s.entity !== entity);
    index.state_machines.push({ entity, path: relPath, repo, kind: confidence.kind, level: confidence.level });
    if (confidence.kind === "unknown" && doc.reason) {
      index.unknowns = index.unknowns.filter((u) => u.id !== entity);
      index.unknowns.push({
        id: entity,
        artifact_type: "state-machine",
        reason: String(doc.reason),
        investigation_hint: doc.investigation_hint ? String(doc.investigation_hint) : undefined
      });
    }
  }

  return index;
}
