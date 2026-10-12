import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { CapabilityError } from "@dapei/core/types";
import { loadCognitiveIndex, saveCognitiveIndex, getRepoSnapshot, upsertRepoSnapshot, markAssetStale, clearAssetStale, type RepoSnapshot, type StaleAsset, type StaleSource } from "@dapei/core/cognitive-index";
import { parseYamlDocument, type YamlValue } from "@dapei/core/yaml-doc";
import { featureRepoNames } from "@dapei/core/internal/shared";
import { read, write, runSafe, workspacePaths } from "@dapei/runtime-adapters/system";
import { CodeGraphAdapter } from "@dapei/runtime-adapters/codegraph";
import type { AnyCap } from "./internal/shared.ts";

function getCurrentCommitHash(repoPath: string, rootDir: string): string {
  const hash = runSafe("git", ["-C", repoPath, "rev-parse", "HEAD"], rootDir);
  return hash || "";
}

function getRepoFilesChangedSince(repoPath: string, rootDir: string, sinceCommit: string): Set<string> {
  if (!sinceCommit) return new Set();
  const out = runSafe(
    "git",
    ["-C", repoPath, "diff", "--name-only", `${sinceCommit}..HEAD`],
    rootDir
  );
  if (!out) return new Set();
  return new Set(out.trim().split("\n").filter(Boolean));
}

export const cdrAssetStaleCheck: AnyCap = {
  id: "cdr.asset.stalecheck",
  version: "1.0.0",
  inputSchema: {
    properties: {
      repo: { type: "string" },
      clear_stale: { type: "boolean" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const p = workspacePaths(ctx.rootDir);
    const repoFilter = input.repo ? String(input.repo) : undefined;
    const clearStale = input.clear_stale === true;

    const index = loadCognitiveIndex(ctx.rootDir);

    const reposToCheck: string[] = [];
    if (repoFilter) {
      const repoPath = join(p.reposDir, repoFilter);
      if (!existsSync(repoPath)) {
        throw new CapabilityError("REPO_MISSING", `repos/${repoFilter} not found`);
      }
      reposToCheck.push(repoFilter);
    } else {
      for (const entry of readdirSync(p.reposDir)) {
        const repoPath = join(p.reposDir, entry);
        if (existsSync(join(repoPath, ".git"))) {
          reposToCheck.push(entry);
        }
      }
    }

    const now = ctx.now.toISOString();
    const newlyStale: StaleAsset[] = [];
    const cleared: string[] = [];

    for (const repo of reposToCheck) {
      const repoPath = join(p.reposDir, repo);
      const currentHash = getCurrentCommitHash(repoPath, p.rootDir);
      if (!currentHash) continue;

      const snapshot = getRepoSnapshot(index, repo);
      const lastHash = snapshot?.commit_hash;

      const newSnapshot: RepoSnapshot = {
        repo,
        commit_hash: currentHash,
        committed_at: runSafe("git", ["-C", repoPath, "log", "-1", "--format=%ci", "--", "HEAD"], p.rootDir) || now,
        analyzed_at: now,
        source_snapshots: snapshot?.source_snapshots || {}
      };

      if (lastHash && lastHash !== currentHash) {
        const changedFiles = getRepoFilesChangedSince(repoPath, p.rootDir, lastHash);
        if (changedFiles.size > 0) {
          newSnapshot.source_snapshots = { ...newSnapshot.source_snapshots };
          for (const file of changedFiles) {
            newSnapshot.source_snapshots[file] = currentHash;
          }
        }
      }

      upsertRepoSnapshot(index, newSnapshot);

      const allArtifacts: Array<{ id: string; path: string; repo?: string; artifact_type: "behavior" | "state-machine" | "domain" | "business-rule" | "capability-map" }> = [];

      for (const b of index.behaviors) {
        allArtifacts.push({ id: b.id, path: b.path, repo: b.repo, artifact_type: "behavior" });
      }
      for (const s of index.state_machines) {
        allArtifacts.push({ id: s.entity, path: s.path, repo: s.repo, artifact_type: "state-machine" });
      }
      for (const d of index.domains) {
        allArtifacts.push({ id: d.domain, path: d.path, repo: d.repo, artifact_type: "domain" });
      }
      for (const r of index.business_rules) {
        allArtifacts.push({ id: r.id, path: r.path, repo: r.repo, artifact_type: "business-rule" });
      }

      for (const artifact of allArtifacts) {
        if (repoFilter && artifact.repo !== repoFilter) continue;
        const absPath = join(ctx.rootDir, artifact.path);
        if (!existsSync(absPath)) continue;

        const doc = parseYamlDocument(read(absPath));
        const sources = Array.isArray(doc.sources) ? doc.sources : [];
        if (!sources.length) continue;

        const artifactRepo = artifact.repo || (doc as Record<string, unknown>).repo as string;
        if (artifactRepo !== repo) continue;

        const staleSources: StaleSource[] = [];

        for (const src of sources) {
          if (!src || typeof src !== "object" || Array.isArray(src)) continue;
          const s = src as Record<string, unknown>;
          const file = typeof s.file === "string" ? s.file.trim() : "";
          if (!file) continue;

          const lastValidCommit = snapshot?.source_snapshots[file] || lastHash || "";
          if (!lastValidCommit) continue;

          const changedFiles = lastHash ? getRepoFilesChangedSince(repoPath, p.rootDir, lastValidCommit) : new Set<string>();
          if (!changedFiles.has(file)) continue;

          staleSources.push({
            file,
            last_valid_commit: lastValidCommit,
            current_commit: currentHash,
            reason: "new_commits"
          });
        }

        if (staleSources.length > 0) {
          const staleAsset: StaleAsset = {
            id: artifact.id,
            artifact_type: artifact.artifact_type === "capability-map" ? "domain" : artifact.artifact_type,
            path: artifact.path,
            repo,
            stale_sources: staleSources,
            checked_at: now
          };
          markAssetStale(index, staleAsset);
          newlyStale.push(staleAsset);
        } else if (clearStale) {
          clearAssetStale(index, artifact.id);
          cleared.push(artifact.id);
        }
      }
    }

    saveCognitiveIndex(ctx.rootDir, index);

    const reportLines: string[] = [];
    reportLines.push(`## Stale Asset Check — ${now}`);
    reportLines.push("");
    if (newlyStale.length === 0) {
      reportLines.push("✅ No stale assets detected.");
    } else {
      reportLines.push(`⚠️  ${newlyStale.length} artifact(s) have stale sources:`);
      for (const asset of newlyStale) {
        reportLines.push(`\n### ${asset.id} [${asset.artifact_type}]`);
        for (const ss of asset.stale_sources) {
          reportLines.push(`  - ${ss.file}: changed since ${ss.last_valid_commit.slice(0, 8)}`);
        }
      }
    }
    if (cleared.length > 0) {
      reportLines.push(`\n✅ Cleared stale flag for: ${cleared.join(", ")}`);
    }

    return {
      ok: true,
      data: {
        checked_at: now,
        repos_checked: reposToCheck,
        stale_count: newlyStale.length,
        stale_assets: newlyStale as unknown as YamlValue,
        cleared_count: cleared.length,
        cleared,
        report: reportLines.join("\n")
      },
      sideEffects: newlyStale.length > 0 ? ["index updated with stale assets"] : cleared.length > 0 ? ["stale flags cleared"] : [],
      reportFragments: [
        `${newlyStale.length} stale asset(s) detected${cleared.length > 0 ? `, ${cleared.length} cleared` : ""}`
      ]
    };
  }
};

export const cdrArchitectureDriftCheck: AnyCap = {
  id: "cdr.architecture.driftcheck",
  version: "1.0.0",
  inputSchema: {
    properties: {
      feature: { type: "string" },
      repo: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const p = workspacePaths(ctx.rootDir);
    const featureFilter = input.feature ? String(input.feature) : undefined;
    const repoFilter = input.repo ? String(input.repo) : undefined;

    const index = loadCognitiveIndex(ctx.rootDir);
    const now = ctx.now.toISOString();
    const driftItems: Array<{
      id: string;
      artifact_type: string;
      repo: string;
      path: string;
      drift_type: string;
      detail: string;
    }> = [];

    const reposToCheck: string[] = [];
    if (repoFilter) {
      reposToCheck.push(repoFilter);
    } else if (featureFilter) {
      const featureDir = join(p.featuresDir, featureFilter);
      const featureYaml = join(featureDir, "feature.yaml");
      if (existsSync(featureYaml)) {
        for (const repo of featureRepoNames(read(featureYaml))) {
          reposToCheck.push(repo);
        }
      }
    } else {
      for (const entry of readdirSync(p.reposDir)) {
        const repoPath = join(p.reposDir, entry);
        if (existsSync(join(repoPath, ".git"))) {
          reposToCheck.push(entry);
        }
      }
    }

    for (const repo of reposToCheck) {
      const repoPath = join(p.reposDir, repo);
      if (!existsSync(join(repoPath, ".git"))) continue;

      const currentHash = getCurrentCommitHash(repoPath, p.rootDir);
      if (!currentHash) continue;

      const repoBehaviors = index.behaviors.filter((b) => b.repo === repo);
      const repoStateMachines = index.state_machines.filter((s) => s.repo === repo);

      for (const b of repoBehaviors) {
        const absPath = join(ctx.rootDir, b.path);
        if (!existsSync(absPath)) {
          driftItems.push({
            id: b.id,
            artifact_type: "behavior",
            repo,
            path: b.path,
            drift_type: "file_missing",
            detail: "artifact references a file that no longer exists"
          });
          continue;
        }

        const doc = parseYamlDocument(read(absPath));
        const sources = Array.isArray(doc.sources) ? doc.sources : [];
        for (const src of sources) {
          if (!src || typeof src !== "object" || Array.isArray(src)) continue;
          const s = src as Record<string, unknown>;
          const file = typeof s.file === "string" ? s.file.trim() : "";
          if (!file) continue;

          const absSrcFile = join(ctx.rootDir, "repos", repo, file);
          if (!existsSync(absSrcFile)) {
            driftItems.push({
              id: b.id,
              artifact_type: "behavior",
              repo,
              path: b.path,
              drift_type: "source_file_deleted",
              detail: `source file ${file} was deleted`
            });
          }
        }
      }

      for (const s of repoStateMachines) {
        const absPath = join(ctx.rootDir, s.path);
        if (!existsSync(absPath)) {
          driftItems.push({
            id: s.entity,
            artifact_type: "state-machine",
            repo,
            path: s.path,
            drift_type: "file_missing",
            detail: "artifact file no longer exists"
          });
        }
      }
    }

    const reportLines: string[] = [];
    reportLines.push(`## Architecture Drift Check — ${now}`);
    reportLines.push("");

    if (driftItems.length === 0) {
      reportLines.push("✅ No architecture drift detected.");
      reportLines.push("");
      reportLines.push("All behavior and state machine artifacts are consistent with current code.");
    } else {
      reportLines.push(`⚠️  ${driftItems.length} drift item(s) detected:`);
      for (const item of driftItems) {
        reportLines.push(`\n### ${item.id} [${item.artifact_type}] (${item.repo})`);
        reportLines.push(`  - **Type**: ${item.drift_type}`);
        reportLines.push(`  - **Detail**: ${item.detail}`);
        reportLines.push(`  - **Path**: ${item.path}`);
      }
      reportLines.push("");
      reportLines.push("**Recommendation**: Run `@dapei discover behaviors for <repo>` to re-analyze drifted areas.");
    }

    return {
      ok: true,
      data: {
        checked_at: now,
        repos_checked: reposToCheck,
        drift_count: driftItems.length,
        drift_items: driftItems as unknown as YamlValue,
        report: reportLines.join("\n")
      },
      sideEffects: [],
      reportFragments: [
        `${driftItems.length} drift item(s) detected across ${reposToCheck.length} repo(s)`
      ]
    };
  }
};

// ---------------------------------------------------------------------------
// 14. cdr.stale.scan — v0.7
//
// Watches the cognitive index for assets whose `sources[]` references
// have moved since they were last written. Implements the v0.4
// StaleFields reservation by populating `stale`, `stale_reason`,
// `stale_at`, and `stale_base` on the affected index entries.
//
// Backend:
//   * CodeGraph `impact` (when present) computes the transitive blast
//     radius — the change set is whatever CodeGraph says the diff
//     affects, not just the file names in `git diff --name-only`.
//   * Fallback to `git diff --name-only <base>..<HEAD> -- repos/<repo>/`
//     when CodeGraph is missing.
//
// The capability is read-modify-write: it loads the cognitive
// index, updates stale fields in place, saves, and returns a
// summary of what changed. It does NOT regenerate any artifacts.
// ---------------------------------------------------------------------------

function computeBehaviorStaleness(
  ctx: { rootDir: string },
  repo: string | undefined,
  changedFiles: Set<string>
): Array<{ id: string; entity: string; reason: string; reason_paths: string[] }> {
  const index = loadCognitiveIndex(ctx.rootDir);
  const out: Array<{ id: string; entity: string; reason: string; reason_paths: string[] }> = [];

  const considerEntry = (id: string, repoFilter: string | undefined, sources: unknown, kind: "behavior" | "state-machine" | "business-rule") => {
    if (repoFilter && repo && repoFilter !== repo) return;
    if (!Array.isArray(sources)) return;
    const pathsHit: string[] = [];
    for (const s of sources) {
      if (!s || typeof s !== "object") continue;
      const so = s as Record<string, unknown>;
      const f = typeof so.file === "string" ? so.file : "";
      if (!f) continue;
      // sources[].file is repo-relative; the diff paths are also
      // repo-relative when we ran `git diff --name-only -- repos/<repo>/`.
      if (changedFiles.has(f)) pathsHit.push(f);
    }
    if (pathsHit.length > 0) {
      out.push({
        id,
        entity: id,
        reason: `${kind} sources[] intersect with the diff`,
        reason_paths: pathsHit
      });
    }
  };

  for (const b of index.behaviors) {
    // Read the YAML off disk to inspect sources[] — the index only
    // stores the path, not the full content.
    const filePath = join(ctx.rootDir, b.path);
    if (!existsSync(filePath)) continue;
    let doc: Record<string, unknown>;
    try {
      doc = parseYamlDocument(read(filePath)) as Record<string, unknown>;
    } catch {
      continue;
    }
    considerEntry(String(doc.id || b.id), b.repo, doc.sources, "behavior");
  }

  for (const sm of index.state_machines) {
    const filePath = join(ctx.rootDir, sm.path);
    if (!existsSync(filePath)) continue;
    let doc: Record<string, unknown>;
    try {
      doc = parseYamlDocument(read(filePath)) as Record<string, unknown>;
    } catch {
      continue;
    }
    considerEntry(String(doc.entity || sm.entity), sm.repo, doc.sources, "state-machine");
  }

  for (const br of index.business_rules) {
    const filePath = join(ctx.rootDir, br.path);
    if (!existsSync(filePath)) continue;
    let doc: Record<string, unknown>;
    try {
      doc = parseYamlDocument(read(filePath)) as Record<string, unknown>;
    } catch {
      continue;
    }
    considerEntry(String(doc.id || br.id), br.repo, doc.sources, "business-rule");
  }

  return out;
}

function gitDiffFileNames(repoPath: string, base: string, head: string): string[] {
  try {
    const out = execFileSync("git", ["diff", "--name-only", `${base}..${head}`, "--"], { cwd: repoPath, encoding: "utf8" });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export const cdrStaleScan: AnyCap = {
  id: "cdr.stale.scan",
  version: "1.0.0",
  inputSchema: {
    properties: {
      repo: { type: "string" },
      base: { type: "string" },
      head: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const repo = typeof input.repo === "string" ? input.repo : undefined;
    const head = typeof input.head === "string" ? input.head : "HEAD";
    const base = typeof input.base === "string" ? input.base : "HEAD~1";

    if (!repo) {
      throw new CapabilityError("INVALID_INPUT", "cdr.stale.scan requires { repo } to scope the diff");
    }
    const p = workspacePaths(ctx.rootDir);
    const repoPath = join(p.reposDir, repo);
    if (!existsSync(repoPath)) {
      throw new CapabilityError("REPO_MISSING", `repos/${repo} not found`);
    }

    let changedFiles: string[] = [];
    // v0.9 — the change set is always computed via `git diff --name-only`.
    // The real `codegraph impact <sym> --depth N` is symbol-level
    // (what's affected if I change symbol X), not commit-level. The
    // codegraph adapter wraps git diff for its caching/marker
    // machinery, but the underlying source of truth is git, so the
    // backend label is always "git-diff" for this capability.
    // (Symbol-level blast radius is a future capability that will
    // use `codegraph_callers` on each changed symbol.)
    const backendUsed: "codegraph" | "git-diff" = "git-diff";
    try {
      const adapter = new CodeGraphAdapter(ctx.rootDir);
      if (adapter.isAvailable()) {
        const impact = adapter.impact(repoPath, base, head);
        if (impact.available) {
          changedFiles = impact.changed_files;
        } else {
          changedFiles = gitDiffFileNames(repoPath, base, head);
        }
      } else {
        changedFiles = gitDiffFileNames(repoPath, base, head);
      }
    } catch {
      changedFiles = gitDiffFileNames(repoPath, base, head);
    }

    if (changedFiles.length === 0) {
      return {
        ok: true,
        data: {
          repo,
          base,
          head,
          backend: backendUsed,
          changed_files: 0,
          marked: 0,
          stale: [] as Array<{ id: string; entity: string; reason: string; reason_paths: string[] }>
        },
        sideEffects: ["no changes detected; nothing to mark stale"],
        reportFragments: [`cdr.stale.scan: 0 changed files in ${repo} (${base}..${head})`]
      };
    }

    const changedSet = new Set(changedFiles);
    const candidates = computeBehaviorStaleness(ctx, repo, changedSet);

    // Apply: load index, mark each candidate stale, save.
    const index = loadCognitiveIndex(ctx.rootDir);
    const now = new Date().toISOString();
    let marked = 0;
    for (const c of candidates) {
      const sm = index.state_machines.find((s) => s.entity === c.id && (!repo || s.repo === repo));
      if (sm) {
        sm.stale = true;
        sm.stale_reason = c.reason;
        sm.stale_at = now;
        sm.stale_base = `${base}..${head}`;
        marked++;
        continue;
      }
      const b = index.behaviors.find((x) => x.id === c.id && (!repo || x.repo === repo));
      if (b) {
        b.stale = true;
        b.stale_reason = c.reason;
        b.stale_at = now;
        b.stale_base = `${base}..${head}`;
        marked++;
        continue;
      }
      const r = index.business_rules.find((x) => x.id === c.id && (!repo || x.repo === repo));
      if (r) {
        r.stale = true;
        r.stale_reason = c.reason;
        r.stale_at = now;
        r.stale_base = `${base}..${head}`;
        marked++;
        continue;
      }
    }
    saveCognitiveIndex(ctx.rootDir, index);

    return {
      ok: true,
      data: {
        repo,
        base,
        head,
        backend: backendUsed,
        changed_files: changedFiles.length,
        stale: candidates,
        marked
      },
      sideEffects: marked > 0 ? [`marked ${marked} cognitive asset(s) stale`] : [],
      reportFragments: [
        `cdr.stale.scan: ${changedFiles.length} changed file(s) in ${repo} (${base}..${head}) via ${backendUsed}`,
        marked > 0 ? `${marked} asset(s) marked stale` : "no assets match the change set"
      ]
    };
  }
};
