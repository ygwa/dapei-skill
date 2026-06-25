# 01. Current State

Date: 2026-06-25

## Touched Repositories

| Repo | Path in worktree | Branch | Status |
|---|---|---|---|
| dapei-skill | `repos/dapei-skill` (symlink of `../dapei-skill-treesitter-finding-layer`) | `feature/cdr-treesitter-finding-layer` (to be created from `main` @ current HEAD) | local-only; not yet pushed to origin |

## Current Module Structure (verified)

What's on disk right now in this worktree, verified via `ls` and `read`:

```
packages/runtime-adapters/src/
├── codegraph.ts                     (512 lines — CodeGraph adapter v0.9, kept as-is)
└── system.ts                        (filesystem helpers, kept as-is)

packages/core/src/capabilities/domains/
└── cdr.ts                           (≈ 1370 lines — all CDR capabilities, including cdr.entries.candidate)

packages/runtime-adapters/package.json
└── (no tree-sitter deps currently)

docs/decisions/
├── ADR-0001-modular-monorepo.md      accepted
├── ADR-0002-evidence-first-artifacts.md accepted
├── ADR-0003-ai-as-scanner-engine-as-validator.md accepted   (PRESERVED — not amended)
├── ADR-0004-two-dimension-boundary.md accepted
└── ADR-0005-deterministic-engine-no-llm.md accepted         (PRESERVED — not amended)

docs/features/
├── cdr-runtime.md
├── cdr-mining.md
├── cdr-v0.3-ai-as-scanner.md
├── cdr-v0.4-multi-repo-merge.md
├── cdr-v0.5-cross-repo-rules.md
├── cdr-v0.6-structured-calls.md
├── cdr-v0.7-codegraph.md
└── cdr-v0.8-reverse-cluster.md
(NO cdr-treesitter-*.md yet)

docs/cdr-architecture.md             (520 lines — §2.1 Three roles, §7.4 Degradation, §13 Summary)

skills/cdr/SKILL.md                  (490 lines — Phase 1 Entry Discovery at lines 128-152)

.github/workflows/ci.yml              (196 lines — all jobs on ubuntu-latest, Node 22)

.changeset/
└── cdr-v0.7-codegraph.md            (template for new changeset)
```

## Current `cdr.entries.candidate` Behavior (v0.7)

Verified via `read packages/core/src/capabilities/domains/cdr.ts:299-416`:

**Input**:
```ts
{ repo: string, max_files?: number, max_bytes?: number }
```

**Output**:
```ts
{
  repo, file_count,
  files: [{
    relpath, language, size_bytes, truncated,
    content: string,                    // ≤ 200_000 bytes per file
    apisurface_hint?: { type, method?, path?, topic? }   // from CodeGraph only
  }],
  skipped: [{ relpath, reason }],
  max_bytes: number,                     // echoed
  backend: 'native' | 'fallback',
  backend_reason?: string,
  workflow: { step, phase, goal, next }
}
```

**Code path** (`cdr.ts:331-378`):
1. Try `CodeGraphAdapter.orient(repoPath)` first.
2. If CodeGraph returned files → `backend: 'native'`, use CodeGraph's content.
3. If CodeGraph absent → `backend: 'fallback'`, walk `repos/<repo>/` recursively with `listFilesRecursively`, read each file, cap at 200 KB per file, 200 files max = **40 MB worst case per call**.

## Current `cdr.profile` Output Shape (v0.7)

Verified via `cdr.ts:216-285`:

```yaml
repo: mall-order
generated_at: 2026-...
language: java
manifest_files: [pom.xml, ...]
directory_tree: ...
test_commands: [mvn test]
codegraph:
  available: true|false
  version: ... | null
  backend: "native" | "fallback"
  files_total: 842
  apisurface_count: 12
  reason: ...
```

**No `tree_sitter` block exists yet.** This is what Phase 2 of this PR adds.

## Current Skill Workflow (verified)

`skills/cdr/SKILL.md:128-152` (Phase 1 — Entry Discovery):

```
1. Engine: runCapability('cdr.entries.candidate', {repo})
   - Returns files[] with content (inlined)
   - No framework field, no pattern matching
2. AI: Reads content inline, identifies entry points
3. AI: runCapability('cdr.entries.propose', {repo, id, type, file, line, method, path, sources})
   - Engine validates sources[].file exists + line in range
4. AI / Human: runCapability('cdr.entries.confirm', {repo, entry_id, summary, priority, sources})
   - sources[] is REQUIRED (P1 red line)
```

**The "AI reads content inline" step is the negative consequence ADR-0003 acknowledged.** This PR is the fix.

## Why this PR exists (the verifiable problem)

Per `ADR-0003` (lines 41-43, verbatim):

> ## Negative
> - Higher token usage per propose call (AI reads more content)
> - Slightly slower for very large repos

Per `cdr.ts:38-42`:
```ts
const MAX_FILE_BYTES = 200_000;
const MAX_FILES_PER_CANDIDATE = 200;
```
= **40 MB worst case per `cdr.entries.candidate` call.**

Per `SKILL.md:48-63` (Tool Delegation Protocol):

> 凡满足"读量大、决策少"的动作，应当用 AI 客户端的 sub-agent 跑在独立 context 里，主 agent 只收结构化摘要

The current v0.7 candidate response violates the 1 KB sub-agent ceiling for repos with > 5 medium-sized files. This is the bug.

## Reference docs (workspace-dimension, durable)

- `docs/decisions/ADR-0003-ai-as-scanner-engine-as-validator.md` — the principle this PR preserves
- `docs/decisions/ADR-0005-deterministic-engine-no-llm.md` — the principle tree-sitter (being deterministic) satisfies
- `docs/cdr-architecture.md` §2.1, §7.4, §13 — the "Finding / Agent / Platform" split this PR instantiates
- `docs/features/cdr-v0.7-codegraph.md` — the precedent for this PR (CodeGraph as optional upgrade; not a dependency)
- `docs/features/cdr-v0.3-ai-as-scanner.md` — the v0.3 contract this PR amends
- `packages/runtime-adapters/src/codegraph.ts` — the CodeGraph adapter that coexists with the new tree-sitter adapter