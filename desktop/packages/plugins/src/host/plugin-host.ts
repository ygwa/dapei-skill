import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import type { DesktopPluginManifest, LoadedPlugin } from "@dapei/desktop-contracts/plugin";
import type { PluginRegistry } from "../registry/plugin-registry.ts";
import { createEmptyRegistry } from "../registry/plugin-registry.ts";

/**
 * Real PluginHost. M2-3 implements:
 *   - discoverPaths() — returns the union of user-global
 *     (~/.dapei/plugins) and workspace-local
 *     (<workspace>/.dapei/plugins) plugin root paths.
 *   - loadManifest() — reads dapei-desktop-plugin.json
 *     and validates with the Zod schema (allowlist enforced).
 *   - register() — adds the manifest to the registry and
 *     contributes to the four L1 surfaces.
 *   - init() — runs discoverPaths, loads every manifest,
 *     registers. Bad manifests are logged and skipped.
 *
 * L3 pipelineSteps are rejected at L1 per ADR-0013.
 */

const userRoot = (): string => {
  const home = homedir();
  return isAbsolute(home) ? join(home, ".dapei", "plugins") : join(process.cwd(), ".dapei", "plugins");
};

const workspaceRoot = (workspacePath: string): string => join(workspacePath, ".dapei", "plugins");

function discoverPaths(workspacePath?: string): string[] {
  const out: string[] = [];
  const user = userRoot();
  if (existsSync(user)) {
    for (const d of readdirSync(user)) {
      const full = join(user, d);
      if (existsSync(join(full, "dapei-desktop-plugin.json"))) out.push(full);
    }
  }
  if (workspacePath) {
    const ws = workspaceRoot(workspacePath);
    if (existsSync(ws)) {
      for (const d of readdirSync(ws)) {
        const full = join(ws, d);
        if (existsSync(join(full, "dapei-desktop-plugin.json"))) out.push(full);
      }
    }
  }
  return out;
}

const manifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-_.]{0,62}$/),
  version: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  main: z.string().optional(),
  renderer: z.string().optional(),
  engines: z.object({ desktop: z.string().optional() }).optional(),
  contributes: z.object({
    routes: z.array(z.object({
      id: z.string(),
      path: z.string(),
      label: z.string(),
      module: z.string().optional()
    })).optional(),
    sidebar: z.array(z.object({
      id: z.string(),
      label: z.string(),
      icon: z.string().optional(),
      route: z.string()
    })).optional(),
    featurePanels: z.array(z.object({
      id: z.string(),
      label: z.string(),
      slot: z.enum(["inspector", "context"]),
      module: z.string()
    })).optional(),
    agentBackends: z.array(z.object({
      id: z.string(),
      label: z.string(),
      module: z.string()
    })).optional(),
    // pipelineSteps: L1 REJECTS this. A future L3 host will accept it.
    pipelineSteps: z.array(z.any()).optional()
  })
});

function loadManifest(pluginRoot: string): DesktopPluginManifest | null {
  const file = join(pluginRoot, "dapei-desktop-plugin.json");
  if (!existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.warn(`[plugins] ${pluginRoot}: invalid JSON in ${file}:`, (err as Error).message);
    return null;
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(`[plugins] ${pluginRoot}: manifest validation failed:`, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return null;
  }
  // L1 hard rule: pipelineSteps rejected.
  const m = parsed.data;
  if (m.contributes.pipelineSteps && m.contributes.pipelineSteps.length > 0) {
    console.warn(`[plugins] ${pluginRoot}: pipelineSteps is L3-only; rejected (${m.contributes.pipelineSteps.length} entries)`);
    m.contributes = { ...m.contributes, pipelineSteps: [] };
  }
  return m as unknown as DesktopPluginManifest;
}

function validateAgainstRegistry(m: DesktopPluginManifest, taken: Set<string>): string | null {
  if (taken.has(m.id)) return `duplicate plugin id: ${m.id}`;
  // Check all contribution ids are unique within the plugin
  // (and across the registry, which `taken` enforces).
  const contributions: Array<[string, string]> = [];
  for (const r of m.contributes.routes ?? []) contributions.push([`route:${r.id}`, `routes.${r.id}`]);
  for (const s of m.contributes.sidebar ?? []) contributions.push([`sidebar:${s.id}`, `sidebar.${s.id}`]);
  for (const f of m.contributes.featurePanels ?? []) contributions.push([`panel:${f.id}`, `featurePanels.${f.id}`]);
  for (const a of m.contributes.agentBackends ?? []) contributions.push([`backend:${a.id}`, `agentBackends.${a.id}`]);
  for (const [key, label] of contributions) {
    if (taken.has(key)) return `duplicate contribution id: ${label}`;
    taken.add(key);
  }
  taken.add(m.id);
  return null;
}

export interface PluginHost {
  init(workspacePath?: string): Promise<void>;
  registry: PluginRegistry;
  list(): LoadedPlugin[];
  enable(pluginId: string): Promise<void>;
  disable(pluginId: string): Promise<void>;
}

export function createPluginHost(): PluginHost {
  const registry = createEmptyRegistry();
  const plugins = new Map<string, LoadedPlugin>();
  const enabled = new Set<string>();
  const taken = new Set<string>();

  function addToRegistry(m: DesktopPluginManifest): void {
    if (m.contributes.routes) registry.routes.push(...m.contributes.routes);
    if (m.contributes.sidebar) registry.sidebar.push(...m.contributes.sidebar);
    if (m.contributes.featurePanels) registry.featurePanels.push(...m.contributes.featurePanels);
    if (m.contributes.agentBackends) registry.agentBackends.push(...m.contributes.agentBackends);
  }

  return {
    registry,
    async init(workspacePath?: string) {
      for (const pluginRoot of discoverPaths(workspacePath)) {
        const manifest = loadManifest(pluginRoot);
        if (!manifest) continue;
        const err = validateAgainstRegistry(manifest, taken);
        if (err) {
          console.warn(`[plugins] ${pluginRoot}: ${err}; skipped`);
          continue;
        }
        const lp: LoadedPlugin = { manifest, rootDir: resolve(pluginRoot), enabled: true };
        plugins.set(manifest.id, lp);
        enabled.add(manifest.id);
        addToRegistry(manifest);
        console.info(`[plugins] loaded ${manifest.id}@${manifest.version} from ${pluginRoot}`);
      }
    },
    list() {
      return [...plugins.values()];
    },
    async enable(pluginId) {
      const p = plugins.get(pluginId);
      if (p) {
        p.enabled = true;
        enabled.add(pluginId);
      }
    },
    async disable(pluginId) {
      const p = plugins.get(pluginId);
      if (p) {
        p.enabled = false;
        enabled.delete(pluginId);
      }
    }
  };
}
