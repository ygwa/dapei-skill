import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * v0.7 — runtime-adapters adapter for the [lzehrung/codegraph] CLI.
 *
 * The adapter is intentionally permissive: every method that talks to the
 * CodeGraph CLI returns a `CodeGraphResult` with an `available` flag and a
 * `fallback` marker. Callers MUST check the flag and degrade gracefully
 * when `available` is false. The design principle is that the dapei
 * platform ships with a working tree-walk + manifest fallback at every
 * level; CodeGraph is an upgrade, not a dependency.
 *
 * The CLI is treated as an external black box. The expected subcommands
 * (orient, refs, impact) and their JSON output shapes follow the
 * `docs/cdr-architecture.md` §7 plan. If the installed CLI speaks a
 * different dialect, the `parseJson` helper falls back to `{}` rather
 * than throwing — the caller is then told the result is empty.
 *
 * CLI resolution: a one-shot `which codegraph` at construction time.
 * Tests can override the binary path by setting DAPEI_CODEGRAPH_BIN
 * in the environment.
 */

const CLI_BIN_ENV = "DAPEI_CODEGRAPH_BIN";

export interface CodeGraphDoctor {
  available: boolean;
  binary: string | null;
  version: string | null;
  reason: string | null;
}

export interface CodeGraphOrientFile {
  relpath: string;
  language: string;
  size_bytes: number;
  truncated: boolean;
  content: string;
  apisurface_hint?: { type: string; method?: string; path?: string; topic?: string };
}

export interface CodeGraphOrientResult {
  available: boolean;
  backend: "native" | "fallback";
  reason?: string;
  repo_path: string;
  indexed_at: string;
  files_total?: number;
  apisurface_count?: number;
  files: CodeGraphOrientFile[];
}

export interface CodeGraphRefsResult {
  available: boolean;
  reason?: string;
  from: { file: string; line?: number; symbol?: string };
  callees: Array<{ name: string; target_repo?: string; file?: string; line?: number; kind: string }>;
}

export interface CodeGraphImpactResult {
  available: boolean;
  reason?: string;
  base: string;
  head: string;
  changed_files: string[];
  // The blast-radius set: which behavior ids are affected. The CLI is
  // expected to return ids; the engine populates this by joining CLI
  // output against the cognitive index later.
  affected_behavior_ids: string[];
}

function detectCliBinary(): { available: boolean; binary: string | null; reason: string | null } {
  const override = process.env[CLI_BIN_ENV];
  if (override && existsSync(override)) {
    return { available: true, binary: override, reason: null };
  }
  // Cheap probe: do not spawn a process, just `command -v` style check.
  try {
    const found = execFileSync("which", ["codegraph"], { encoding: "utf8" }).trim();
    if (found) return { available: true, binary: found, reason: null };
  } catch {
    // fall through
  }
  return { available: false, binary: null, reason: "codegraph CLI not in PATH and DAPEI_CODEGRAPH_BIN unset" };
}

function readCliVersion(binary: string): string | null {
  try {
    const out = execFileSync(binary, ["--version"], { encoding: "utf8" }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function runCliJson(binary: string, args: string[], cwd: string): unknown | null {
  try {
    const out = execFileSync(binary, args, { cwd, encoding: "utf8" });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

export class CodeGraphAdapter {
  private readonly doctor: CodeGraphDoctor;
  private readonly noCliMarkerPath: string;

  constructor(workspaceRoot: string) {
    const probe = detectCliBinary();
    this.doctor = {
      available: probe.available,
      binary: probe.binary,
      version: probe.available && probe.binary ? readCliVersion(probe.binary) : null,
      reason: probe.reason
    };
    // Persistent "no codegraph here" marker at <workspace>/.dapei/graph/.no-codegraph
    // so we do not pay the probe cost on every capability call.
    this.noCliMarkerPath = join(workspaceRoot, ".dapei", "graph", ".no-codegraph");
  }

  isAvailable(): boolean {
    return this.doctor.available;
  }

  getDoctor(): CodeGraphDoctor {
    return this.doctor;
  }

  /**
   * The CLI is not available: stamp a marker file so subsequent capability
   * calls can short-circuit. The marker is a one-line text file; its
   * existence means "skip probe, take fallback".
   */
  markUnavailable(): void {
    if (existsSync(this.noCliMarkerPath)) return;
    try {
      mkdirSync(dirname(this.noCliMarkerPath), { recursive: true });
      writeFileSync(
        this.noCliMarkerPath,
        `codegraph CLI not in PATH. Capabilities in this workspace take the fallback path.\nprobed_at: ${new Date().toISOString()}\n`,
        "utf8"
      );
    } catch {
      // best-effort marker; failing to write it just means we probe again next time
    }
  }

  isMarkedUnavailable(): boolean {
    return existsSync(this.noCliMarkerPath);
  }

  /**
   * Call `codegraph orient --budget small --json <repo>` and parse the
   * result. Returns a CodeGraphOrientResult with `available: false` and a
   * fallback reason when the CLI is missing or fails. Callers are
   * expected to fall back to `listFilesRecursively` (the v0.3-0.6
   * strategy) when `available` is false.
   */
  orient(repoPath: string, opts: { maxFiles?: number; maxBytes?: number } = {}): CodeGraphOrientResult {
    if (!this.doctor.available || !this.doctor.binary) {
      this.markUnavailable();
      return {
        available: false,
        backend: "fallback",
        reason: this.doctor.reason || "codegraph CLI not available",
        repo_path: repoPath,
        indexed_at: new Date().toISOString(),
        files: []
      };
    }
    const args = [
      "orient",
      "--budget",
      "small",
      "--json"
    ];
    if (typeof opts.maxFiles === "number") args.push("--max-files", String(opts.maxFiles));
    if (typeof opts.maxBytes === "number") args.push("--max-bytes", String(opts.maxBytes));
    args.push(repoPath);

    const raw = runCliJson(this.doctor.binary, args, repoPath);
    if (!raw || typeof raw !== "object") {
      return {
        available: false,
        backend: "fallback",
        reason: "codegraph orient returned non-JSON or empty output",
        repo_path: repoPath,
        indexed_at: new Date().toISOString(),
        files: []
      };
    }
    const obj = raw as Record<string, unknown>;
    const files = Array.isArray(obj.files) ? obj.files as CodeGraphOrientFile[] : [];
    return {
      available: true,
      backend: "native",
      repo_path: repoPath,
      indexed_at: new Date().toISOString(),
      files_total: typeof obj.files_total === "number" ? obj.files_total : files.length,
      apisurface_count: typeof obj.apisurface_count === "number" ? obj.apisurface_count : undefined,
      files
    };
  }

  /**
   * Call `codegraph refs --json <repo> <file:line[:symbol]>`. Returns the
   * list of callees (functions, methods, MQ topics) reachable from a
   * call site. The engine uses this to verify that a behavior's
   * `calls[].target` actually exists at the call site.
   */
  refs(repoPath: string, anchor: { file: string; line?: number; symbol?: string }): CodeGraphRefsResult {
    if (!this.doctor.available || !this.doctor.binary) {
      return {
        available: false,
        reason: this.doctor.reason || "codegraph CLI not available",
        from: anchor,
        callees: []
      };
    }
    const anchorStr = anchor.symbol
      ? `${anchor.file}:${anchor.line || 0}#${anchor.symbol}`
      : `${anchor.file}:${anchor.line || 0}`;
    const raw = runCliJson(this.doctor.binary, ["refs", "--json", anchorStr], repoPath);
    if (!raw || typeof raw !== "object") {
      return {
        available: false,
        reason: "codegraph refs returned non-JSON or empty output",
        from: anchor,
        callees: []
      };
    }
    const obj = raw as Record<string, unknown>;
    const callees = Array.isArray(obj.callees) ? obj.callees as CodeGraphRefsResult["callees"] : [];
    return { available: true, from: anchor, callees };
  }

  /**
   * Call `codegraph impact --json <repo> <base> <head>` to compute the
   * blast radius of a set of changes. The engine joins the returned
   * `changed_files` against the cognitive index's behavior entries to
   * mark stale=true on anything whose `sources[].file` intersects.
   */
  impact(repoPath: string, base: string, head: string): CodeGraphImpactResult {
    if (!this.doctor.available || !this.doctor.binary) {
      return {
        available: false,
        reason: this.doctor.reason || "codegraph CLI not available",
        base,
        head,
        changed_files: [],
        affected_behavior_ids: []
      };
    }
    const raw = runCliJson(this.doctor.binary, ["impact", "--json", base, head], repoPath);
    if (!raw || typeof raw !== "object") {
      return {
        available: false,
        reason: "codegraph impact returned non-JSON or empty output",
        base,
        head,
        changed_files: [],
        affected_behavior_ids: []
      };
    }
    const obj = raw as Record<string, unknown>;
    return {
      available: true,
      base,
      head,
      changed_files: Array.isArray(obj.changed_files) ? obj.changed_files as string[] : [],
      affected_behavior_ids: Array.isArray(obj.affected_behavior_ids) ? obj.affected_behavior_ids as string[] : []
    };
  }

  /**
   * `codegraph doctor --json` — surface the full doctor report so the
   * capability layer can write `codegraph: { available, version, ... }`
   * into the profile YAML.
   */
  fullDoctor(): CodeGraphDoctor {
    return this.doctor;
  }
}

export function loadCodeGraphMarker(workspaceRoot: string): string | null {
  const p = join(workspaceRoot, ".dapei", "graph", ".no-codegraph");
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}
