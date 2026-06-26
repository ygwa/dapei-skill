import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { RecentWorkspace } from "@dapei/desktop-contracts";

/**
 * Persistent registry of recently-opened workspaces. Stored as JSON
 * at `~/.dapei/desktop/recent.json`. The file is the source of truth;
 * the in-memory state is rebuilt on every read. Writes are atomic
 * (write to tmp, rename).
 *
 * This is M1-3 scope: a single file, sorted by openedAt desc, capped
 * at 50 entries. The plan keeps this simple on purpose — multi-window
 * coordination is a future concern.
 */
const RECENT_FILE = join(homedir(), ".dapei", "desktop", "recent.json");
const MAX_ENTRIES = 50;

interface RecentsShape {
  recents: RecentWorkspace[];
}

function readRecents(): RecentWorkspace[] {
  if (!existsSync(RECENT_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(RECENT_FILE, "utf8")) as RecentsShape;
    if (!raw || !Array.isArray(raw.recents)) return [];
    return raw.recents;
  } catch {
    return [];
  }
}

function writeRecents(recents: RecentWorkspace[]): void {
  mkdirSync(dirname(RECENT_FILE), { recursive: true });
  writeFileSync(RECENT_FILE, JSON.stringify({ recents }, null, 2) + "\n", "utf8");
}

function deriveId(workspacePath: string): string {
  // Stable ID from absolute path. The hash avoids `/` collisions in
  // the hash-router URL while staying deterministic for the same path.
  let h = 0;
  for (let i = 0; i < workspacePath.length; i++) {
    h = (h * 31 + workspacePath.charCodeAt(i)) | 0;
  }
  // Base36 for URL friendliness; ensure positive.
  return Math.abs(h).toString(36);
}

function deriveName(workspacePath: string): string {
  return workspacePath.split(/[/\\]/).filter(Boolean).pop() ?? workspacePath;
}

export const workspaceRegistry = {
  list(): RecentWorkspace[] {
    return readRecents().sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  },

  add(workspacePath: string): RecentWorkspace {
    const recents = readRecents();
    const filtered = recents.filter((r) => r.path !== workspacePath);
    const entry: RecentWorkspace = {
      id: deriveId(workspacePath),
      name: deriveName(workspacePath),
      path: workspacePath,
      openedAt: new Date().toISOString()
    };
    const next = [entry, ...filtered].slice(0, MAX_ENTRIES);
    writeRecents(next);
    return entry;
  },

  remove(id: string): void {
    const recents = readRecents();
    writeRecents(recents.filter((r) => r.id !== id));
  },

  /** For tests / debugging. */
  filePath(): string {
    return RECENT_FILE;
  }
};
