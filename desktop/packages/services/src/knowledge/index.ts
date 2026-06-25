import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import type { AssetNode } from "@dapei/desktop-contracts";

export type { AssetNode };

export interface KnowledgeService {
  portalBuild(): Promise<{ ok: boolean; error?: { code: string; message: string } }>;
  getPortalUrl(): Promise<string>;
  assetTree(): Promise<AssetNode[]>;
  indexList(): Promise<{ ok: boolean; behaviors: Array<{ id: string; kind: string; level: string; repo?: string }>; stateMachines: Array<{ entity: string; kind: string; level: string; repo?: string }>; error?: { code: string; message: string } }>;
}

function readCognitiveIndex(workspaceRoot: string): {
  behaviors: Array<{ id: string; kind: string; level: string; repo?: string; path: string }>;
  stateMachines: Array<{ entity: string; kind: string; level: string; repo?: string; path: string }>;
} {
  const empty = { behaviors: [], stateMachines: [] };
  const indexFile = join(workspaceRoot, ".dapei", "cognitive", "index.yaml");
  if (!existsSync(indexFile)) return empty;
  try {
    const text = readFileSync(indexFile, "utf8");
    return parseIndex(text);
  } catch {
    return empty;
  }
}

function parseIndex(text: string): { behaviors: any[]; stateMachines: any[] } {
  const behaviors: any[] = [];
  const stateMachines: any[] = [];
  const lines = text.split("\n");
  let section: "behaviors" | "state_machines" | null = null;
  let current: Record<string, string> | null = null;
  for (const line of lines) {
    if (/^behaviors:/.test(line)) { section = "behaviors"; continue; }
    if (/^state_machines:/.test(line)) { section = "state_machines"; continue; }
    if (/^domain[s]?:/.test(line) || /^business_rules:/.test(line) || /^capability_map:/.test(line)) { section = null; continue; }
    if (/^\s*-\s+id:/.test(line) || /^\s*-\s+entity:/.test(line)) {
      if (current) (section === "behaviors" ? behaviors : stateMachines).push(current);
      const m = line.match(/:\s*(.+)$/);
      const key = line.includes("entity:") ? "entity" : "id";
      current = { [key]: m ? m[1].trim() : "" };
      continue;
    }
    if (current && /^\s+\w+:/.test(line)) {
      const m = line.match(/^\s+(\w+):\s*(.+?)\s*$/);
      if (m) current[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  if (current) (section === "behaviors" ? behaviors : stateMachines).push(current);
  return { behaviors, stateMachines };
}

export function createKnowledgeService(engine: EngineClient, context: WorkspaceContext): KnowledgeService {
  return {
    async portalBuild() {
      const result = await engine.run(
        { capabilityId: "cdr.doc.generate", input: {}, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
    async getPortalUrl() {
      return "";
    },
    async assetTree() {
      const root = join(context.workspaceRoot, "docs", "as-is");
      const nodes: AssetNode[] = [];
      if (!existsSync(root)) return nodes;

      const knownDirs: Array<{ dir: string; kind: AssetNode["kind"]; label: string }> = [
        { dir: "behavior", kind: "behavior", label: "Behaviors" },
        { dir: "state-machines", kind: "state-machine", label: "State Machines" },
        { dir: "domains", kind: "domain", label: "Domains" },
        { dir: "profiles", kind: "profile", label: "Profiles" },
        { dir: "entries", kind: "entry", label: "Entries" },
        { dir: "business-rules", kind: "business-rule", label: "Business Rules" },
        { dir: "capabilities", kind: "capability-map", label: "Capability Map" }
      ];

      for (const k of knownDirs) {
        const dirPath = join(root, k.dir);
        if (!existsSync(dirPath)) continue;
        const files: AssetNode[] = [];
        for (const f of readdirSync(dirPath)) {
          if (!f.endsWith(".yaml")) continue;
          const filePath = join(dirPath, f);
          try {
            const stat = statSync(filePath);
            if (!stat.isFile()) continue;
            const text = readFileSync(filePath, "utf8");
            const idMatch = text.match(/^(id|entity):\s*(\S+)/m);
            const repoMatch = text.match(/^repo:\s*(\S+)/m);
            const kindMatch = text.match(/^kind:\s*(\S+)/m);
            files.push({
              name: f,
              path: filePath,
              kind: k.kind,
              meta: {
                title: idMatch?.[2] ?? f.replace(/\.yaml$/, ""),
                repo: repoMatch?.[1],
                kind: kindMatch?.[1]
              }
            });
          } catch {
            // skip
          }
        }
        if (files.length === 0) continue;
        files.sort((a, b) => a.name.localeCompare(b.name));
        nodes.push({
          name: k.label,
          path: dirPath,
          kind: "directory",
          children: files
        });
      }

      const indexPath = join(context.workspaceRoot, ".dapei", "cognitive", "index.yaml");
      if (existsSync(indexPath)) {
        nodes.unshift({
          name: "Cognitive Index",
          path: indexPath,
          kind: "index"
        });
      }

      return nodes;
    },
    async indexList() {
      const result = await engine.run(
        { capabilityId: "cdr.index.list", input: {}, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) {
        return { ok: false, behaviors: [], stateMachines: [], error: result.error };
      }
      const data = result.data as { behaviors?: any[]; state_machines?: any[] } | undefined;
      const fsIndex = readCognitiveIndex(context.workspaceRoot);
      return {
        ok: true,
        behaviors: data?.behaviors ?? fsIndex.behaviors,
        stateMachines: data?.state_machines ?? fsIndex.stateMachines
      };
    }
  };
}
