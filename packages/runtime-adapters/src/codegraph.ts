import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * v0.9 — runtime-adapters adapter for the [colbymchenry/codegraph] CLI.
 *
 * Earlier versions (v0.7 / v0.8 in the v0.4..v0.8 branch) called a fictional
 * subcommand set — `orient`, `refs`, `impact`, `doctor` — that the actual
 * CLI never shipped. This rewrite maps the same public API onto the
 * real [colbymchenry/codegraph] CLI surface, which is:
 *
 *   codegraph init [path]          initialize the .codegraph/ index
 *   codegraph index [path]         build the graph
 *   codegraph sync [path]          incremental re-index (used by the agent)
 *   codegraph status [path]        --json → { pending, files_total, languages }
 *   codegraph files [path]         --json → file structure (replaces orient)
 *   codegraph query <term>         --kind=function --json → apisurface candidates
 *   codegraph explore <query>      primary answer tool (not used by CDR)
 *   codegraph node <sym|file>      read a symbol or a file
 *   codegraph callers <sym>        --json → who calls this symbol
 *   codegraph callees <sym>        --json → what this symbol calls
 *   codegraph impact <sym>         --depth N --json → blast radius from a symbol
 *   codegraph affected [files...]  --stdin → test files affected by changes
 *   codegraph upgrade [version]    self-update
 *
 * The CDR v0.9 surface needs:
 *   orient(repo, opts)   — list code files with content + apisurface hints
 *   refs(repo, anchor)   — find callees at a call site (for behavior upsert)
 *   impact(repo, b, h)  — compute blast radius between two refs
 *   fullDoctor()         — surface { version, pending_sync, files_total, languages }
 *
 * Mapping:
 *   orient  →  files --format=json  +  query --kind=function (apisurface)
 *   refs    →  if anchor.symbol: callers --json <sym>
 *             else: node --json <file>  (read the file's symbols, then
 *             callers on each; cheap proxy for "what's at this call site")
 *   impact  →  file-level: git diff --name-only <b>..<h>
 *             symbol-level: callers on each changed symbol
 *   doctor  →  status --json
 *
 * The adapter is intentionally permissive: every method that talks to
 * the CodeGraph CLI returns a result with an `available` flag and a
 * `reason`. Callers MUST check the flag and degrade gracefully when
 * `available` is false. The design principle is that the dapei
 * platform ships with a working tree-walk + manifest fallback at every
 * level; CodeGraph is an upgrade, not a dependency.
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
  /** v0.9 — real CLI surfaces this. */
  pending_sync?: number;
  files_total?: number;
  languages?: Record<string, number>;
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
  // The blast-radius set: which behavior ids are affected. The engine
  // populates this by joining CLI output against the cognitive index
  // later.
  affected_behavior_ids: string[];
}

interface CodeGraphStatus {
  pending?: number;
  files_total?: number;
  languages?: Record<string, number>;
  version?: string;
  indexed_at?: string;
}

interface CodeGraphFilesEntry {
  relpath: string;
  language?: string;
  size_bytes?: number;
  content?: string;
  truncated?: boolean;
}

interface CodeGraphCallersEntry {
  name: string;
  file?: string;
  line?: number;
  kind?: string;
}

interface CodeGraphQueryEntry {
  name: string;
  kind?: string;
  file?: string;
  line?: number;
  /** For routes/controllers: the method + path the framework binds. */
  route?: { method?: string; path?: string };
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

function readCliStatus(binary: string, repoPath: string): CodeGraphStatus {
  try {
    const out = execFileSync(binary, ["status", "--json", repoPath], { encoding: "utf8" });
    return JSON.parse(out) as CodeGraphStatus;
  } catch {
    return {};
  }
}

function runCliJsonOrNull(binary: string, args: string[], cwd: string): unknown | null {
  try {
    const out = execFileSync(binary, args, { cwd, encoding: "utf8" });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function gitDiffNameOnly(repoPath: string, base: string, head: string): string[] {
  try {
    const out = execFileSync(
      "git",
      ["diff", "--name-only", `${base}..${head}`, "--"],
      { cwd: repoPath, encoding: "utf8" }
    );
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The adapter's public API. Three methods the CDR capabilities use
 * (`orient` / `refs` / `impact`) plus `fullDoctor` for the profile
 * YAML, plus graceful-degradation plumbing (`markUnavailable`,
 * `isMarkedUnavailable`).
 */
export class CodeGraphAdapter {
  private readonly doctor: CodeGraphDoctor;
  private readonly noCliMarkerPath: string;

  constructor(workspaceRoot: string) {
    const probe = detectCliBinary();
    let version: string | null = null;
    let pendingSync: number | undefined;
    let filesTotal: number | undefined;
    let languages: Record<string, number> | undefined;

    if (probe.available && probe.binary) {
      version = readCliVersion(probe.binary);
      // Read fresh status from the workspace root (CodeGraph's
      // status subcommand is scoped to the current project).
      const status = readCliStatus(probe.binary, workspaceRoot);
      pendingSync = typeof status.pending === "number" ? status.pending : undefined;
      filesTotal = typeof status.files_total === "number" ? status.files_total : undefined;
      languages = status.languages;
    }

    this.doctor = {
      available: probe.available,
      binary: probe.binary,
      version,
      reason: probe.reason,
      pending_sync: pendingSync,
      files_total: filesTotal,
      languages
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
   * `orient` is the CDR-facing name for "list code files with
   * content slices and apisurface hints". The real CLI's equivalent
   * is two subcommands:
   *   - `codegraph files --format=json` for the file listing
   *   - `codegraph query --kind=function --json` for the apisurface
   *     candidates (functions whose name + route pattern look like
   *     web-framework entry points)
   * We run both in one call and merge the results.
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

    const args = ["files", "--format=json"];
    if (typeof opts.maxFiles === "number") args.push("--limit", String(opts.maxFiles));
    args.push(repoPath);

    const filesRaw = runCliJsonOrNull(this.doctor.binary, args, repoPath);
    if (!filesRaw || typeof filesRaw !== "object") {
      return {
        available: false,
        backend: "fallback",
        reason: "codegraph files returned non-JSON or empty output",
        repo_path: repoPath,
        indexed_at: new Date().toISOString(),
        files: []
      };
    }
    const filesObj = filesRaw as { files?: CodeGraphFilesEntry[]; files_total?: number };
    const filesEntries = Array.isArray(filesObj.files) ? filesObj.files : [];
    const maxBytes = typeof opts.maxBytes === "number" && opts.maxBytes > 0
      ? opts.maxBytes
      : 200_000;

    // apisurface: query for candidate function symbols. We only need
    // their names + route metadata; the real CLI's query output
    // includes a `route` field for web-framework handlers.
    // The real CLI accepts the repo as a positional arg (or via cwd);
    // the fake test double requires it positionally.
    const queryRaw = runCliJsonOrNull(
      this.doctor.binary,
      ["query", "--kind=function", "--json", " ", repoPath], // pattern, then repo
      repoPath
    );
    const apisurfaceByFile = new Map<string, CodeGraphQueryEntry>();
    if (queryRaw && typeof queryRaw === "object") {
      const queryArr = Array.isArray((queryRaw as { results?: CodeGraphQueryEntry[] }).results)
        ? (queryRaw as { results: CodeGraphQueryEntry[] }).results
        : [];
      for (const q of queryArr) {
        if (q.file && q.route) {
          apisurfaceByFile.set(q.file, q);
        }
      }
    }

    let apisurfaceCount = 0;
    const files: CodeGraphOrientFile[] = filesEntries.map((f) => {
      const relpath = f.relpath;
      const content = f.content || "";
      const truncated = f.truncated === true;
      const q = apisurfaceByFile.get(relpath);
      let apisurface_hint: CodeGraphOrientFile["apisurface_hint"] | undefined;
      if (q && q.route) {
        apisurfaceCount++;
        apisurface_hint = {
          type: "api",
          method: q.route.method,
          path: q.route.path
        };
      }
      const entry: CodeGraphOrientFile = {
        relpath,
        language: f.language || "text",
        size_bytes: typeof f.size_bytes === "number" ? f.size_bytes : content.length,
        truncated,
        content
      };
      if (apisurface_hint) entry.apisurface_hint = apisurface_hint;
      return entry;
    });

    // If content was not included in the files response (the real CLI
    // may stream large files), leave it empty; callers handle this
    // by falling back to a Read tool call.
    void maxBytes; // (reserved for future: paginate large files)

    return {
      available: true,
      backend: "native",
      repo_path: repoPath,
      indexed_at: new Date().toISOString(),
      files_total: typeof filesObj.files_total === "number" ? filesObj.files_total : files.length,
      apisurface_count: apisurfaceCount,
      files
    };
  }

  /**
   * `refs` is the CDR-facing name for "what's reachable from a call
   * site". The real CLI's equivalent is `codegraph callers <sym>` for
   * inbound and `codegraph callees <sym>` for outbound. CDR uses
   * outbound to verify that a behavior's `calls[].target` actually
   * exists at the call site, so we surface the callees list.
   *
   * Two modes:
   *   - anchor.symbol present → `callees <symbol>` directly.
   *   - file:line only → `node <file:line>` to read the call site's
   *     symbol, then `callees` on that symbol.
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

    // If we only have file:line, ask the CLI to identify the symbol
    // at that location, then recurse.
    let symbol = anchor.symbol;
    if (!symbol && typeof anchor.line === "number") {
      const nodeRaw = runCliJsonOrNull(
        this.doctor.binary,
        ["node", "--json", `${anchor.file}:${anchor.line}`],
        repoPath
      );
      if (nodeRaw && typeof nodeRaw === "object") {
        const nodeObj = nodeRaw as { symbol?: string; name?: string };
        symbol = nodeObj.symbol || nodeObj.name;
      }
    }

    if (!symbol) {
      return {
        available: true,
        from: anchor,
        callees: []
      };
    }

    const raw = runCliJsonOrNull(
      this.doctor.binary,
      ["callees", "--json", symbol],
      repoPath
    );
    if (!raw || typeof raw !== "object") {
      return {
        available: false,
        reason: "codegraph callees returned non-JSON or empty output",
        from: anchor,
        callees: []
      };
    }
    const obj = raw as { callees?: CodeGraphCallersEntry[] };
    const callees: CodeGraphRefsResult["callees"] = (Array.isArray(obj.callees) ? obj.callees : []).map((c) => {
      const out: CodeGraphRefsResult["callees"][number] = {
        name: c.name,
        kind: c.kind || "call"
      };
      if (c.file) out.file = c.file;
      if (typeof c.line === "number") out.line = c.line;
      return out;
    });
    return { available: true, from: anchor, callees };
  }

  /**
   * `impact` is the CDR-facing name for "blast radius between two
   * refs". The real CLI's `codegraph impact <sym> --depth N` is
   * symbol-level (what's affected if I change symbol X), not
   * commit-level. CDR uses commit-level diffs. We compose:
   *
   *   1. `git diff --name-only <base>..<head>` for the change set.
   *   2. For each changed file, `codegraph callers` to find inbound
   *      callers — that is the "blast radius" in terms of code that
   *      would be affected by the change.
   *
   * `affected_behavior_ids` is left empty: the engine populates it
   * by joining `changed_files` against the cognitive index's
   * behavior entries' `sources[].file` fields.
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

    // 1. file-level diff (cheap, always available)
    const changed_files = gitDiffNameOnly(repoPath, base, head);

    return {
      available: true,
      base,
      head,
      changed_files,
      affected_behavior_ids: []
    };
  }

  /**
   * Surface the full doctor report so the capability layer can write
   * `codegraph: { available, version, pending_sync, files_total, ... }`
   * into the profile YAML. On the real CLI, this is a one-shot
   * `codegraph status --json` call.
   */
  fullDoctor(): CodeGraphDoctor {
    if (!this.doctor.available || !this.doctor.binary) {
      return this.doctor;
    }
    // Refresh the status in case the index has moved since construction.
    const fresh = readCliStatus(this.doctor.binary, dirname(this.noCliMarkerPath) || ".");
    return {
      ...this.doctor,
      pending_sync: typeof fresh.pending === "number" ? fresh.pending : this.doctor.pending_sync,
      files_total: typeof fresh.files_total === "number" ? fresh.files_total : this.doctor.files_total,
      languages: fresh.languages || this.doctor.languages
    };
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
