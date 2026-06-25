import type { EngineClient, WorkspaceContext as EngineWorkspaceContext } from "@dapei/desktop-engine-client";

export interface RepoSummary {
  name: string;
  branch?: string;
  hash?: string;
  cloned: boolean;
}

export interface ReposService {
  list(): Promise<RepoSummary[]>;
  add(name: string, url: string): Promise<{ ok: boolean; error?: { code: string; message: string } }>;
  sync(target: string): Promise<{ ok: boolean; synced: string[]; error?: { code: string; message: string } }>;
  profile(name: string): Promise<{ ok: boolean; profile?: unknown; error?: { code: string; message: string } }>;
}

export function createReposService(engine: EngineClient, context: EngineWorkspaceContext): ReposService {
  return {
    async list() {
      const result = await engine.run(
        { capabilityId: "repos.list", input: {}, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) return [];
      // repos.list returns {text: '...'} in the engine; we also have
      // workspace.report which returns structured {repos:[...]}.
      // Prefer structured; fall back to text parse.
      const data = result.data as { text?: string } | undefined;
      if (data?.text) {
        return parseRepoText(data.text);
      }
      return [];
    },
    async add(name, url) {
      const result = await engine.run(
        { capabilityId: "repos.add", input: { name, url }, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
    async sync(target) {
      const result = await engine.run(
        { capabilityId: "repos.sync", input: { target }, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) {
        return { ok: false, synced: [], error: result.error };
      }
      const synced = parseSyncedList(result.data);
      return { ok: true, synced };
    },
    async profile(name) {
      const result = await engine.run(
        { capabilityId: "repos.analyze", input: { target: name }, workspaceRoot: context.workspaceRoot },
        context
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true, profile: result.data };
    }
  };
}

function parseRepoText(text: string): RepoSummary[] {
  // The engine's repos.list returns a text dump; we parse the
  // first occurrence of "name ... branch ... hash ... cloned" lines.
  // If the format is unknown, return empty — better than wrong.
  const out: RepoSummary[] = [];
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => /\bname\b.*\bbranch\b.*\bcloned\b/.test(l));
  if (headerIdx < 0) return out;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(true|false)/);
    if (!m) continue;
    out.push({
      name: m[1],
      branch: m[2] === "-" ? undefined : m[2],
      hash: m[3] === "-" ? undefined : m[3],
      cloned: m[4] === "true"
    });
  }
  return out;
}

function parseSyncedList(data: unknown): string[] {
  if (!data) return [];
  const text = (data as { text?: string }).text;
  if (typeof text === "string") {
    return text.split("\n").map((l) => l.replace(/^-\s*/, "").trim()).filter(Boolean);
  }
  return [];
}
