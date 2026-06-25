# M1 Acceptance — 大培桌面端

> Status: **shipped in `feature/desktop-m1-m2` @ commit TBD**
> Scope: M0 scaffold + M1 (real engine integration + Agent-Share v1)

This document is the contract for what M1 ships. Each step is
an executable action; the 8 steps together form the M1
happy path. CI does not run an Electron e2e (the macOS runner
is slow and the Electron framework is hard to test in
xvfb). CI runs `pnpm -r typecheck` + `pnpm test` (48
node:test cases + dimension-rules self-check) + `pnpm
build`. The 8 steps below are run manually on a macOS
machine before tagging the M1 release.

## 0. Bootstrap

```bash
cd desktop && pnpm install
```

Expected: `postinstall` runs `scripts/ensure-electron.mjs` and
prints `[ensure-electron] Electron binary OK`. Lockfile is
up to date; no `pnpm install` diffs.

## 1. Open the launcher

```bash
cd desktop && pnpm dev
```

Expected:
- Electron window opens at 1100x720
- Top-left shows the 大培 logo and name
- Body: "选择工作空间" + "暂无最近记录" (first run)
- "打开已有目录…" and "新建工作空间" buttons at the bottom

## 2. Create a new workspace

Click **新建工作空间**. Native directory picker opens. Pick
any empty directory (e.g., `~/projects/dapei-smoke`).
A modal appears asking for the workspace name; enter
`dapei-smoke` (kebab-case). Click **创建**.

Expected:
- Engine subprocess spawns `workspace.init` against the
  chosen directory.
- `~/.dapei/desktop/recent.json` now has one entry pointing
  at the new workspace.
- The AppContext switches: `workspaceRoot=~/projects/dapei-smoke`,
  `dimension=workspace`.
- Window navigates to `/w/<encoded-path>` and shows the
  P1 Dashboard.

## 3. Dashboard reads from engine

The P1 Dashboard should show:
- 标题: `dapei-smoke 概览`
- A status line: `结构合规: ✓ · 0 repos · 0 features`
- "暂无 feature — 点击右上角创建" in the features list

If the line shows `✗` or the wrong counts, `workspace.status`
returned an unexpected shape. Check the main process log
(`[dapei-desktop] bootstrap complete` should mention
`dimension=workspace`).

## 4. Add a repo

Click **代码库基座** in the sidebar. Click **添加代码库**.
Enter name `mall-payment` and a Git URL
(https://github.com/some/repo). Click **添加**.

Expected:
- The engine spawns `repos.add` with `{name, url}`.
- The repo card appears with status `未 clone` (the engine
  would clone it; for a public repo this succeeds, for a
  private one it returns ok:false).
- `dapei:workspace:mutated` push fires; the list refreshes.

## 5. Create a feature

Click **Features 执行区** in the sidebar. Click **创建 Feature**.
Enter name `payment-refactor`, repos `mall-payment`,
objective "refactor payment callback for idempotency". Click
**创建**.

Expected:
- Engine spawns `feature.create` with the inputs.
- If `mall-payment` is a real Git repo, worktree is created
  at `features/payment-refactor/repos/mall-payment`. The
  feature's `feature.yaml` is written; `docs/01..06` are
  seeded from templates; `context/runtime-context.md` is
  reserved (not built yet).
- The new feature appears in the list with stage `未开始`.

## 6. Open the P5 workbench

Click the feature row. The P5 workbench opens.

Expected:
- Header: `payment-refactor` + StageStepper (all stages
  greyed out) + orange "Feature 维度 · 隔离中" badge.
- Left rail: 6 deliverable doc buttons + Backlog (empty).
- Center: MarkdownViewer showing `01-current-state.md`
  (template content).
- Right rail (Inspector): "当前阶段 (未开始)" + "推进阶段"
  grid (only "现状分析" enabled, the rest disabled).
- Bottom chat panel: "Attach Agent" button.

## 7. Attach the mock agent

Click **Attach Agent**.

Expected:
- Engine / mock backend spawns.
- `session:ready` event fires through the dispatcher.
- Chat panel header turns green: "Mock Agent (CI / dev) · 在线".
- A scripted conversation starts:
  - "Agent session ready (8a3f4c2d…)"
  - "Mock agent ready in ~/projects/dapei-smoke."
  - "→ workspace.status"
  - "→ workspace.status ✓"
  - "capability: workspace.status ✓"
  - "Workspace is empty. Run `@dapei add <repo> <url>` to start."
- Wait time: ~700ms total.

Type "hi" into the chat input and press Enter.

Expected:
- "hi" appears as a user bubble (indigo, right-aligned).
- 50ms later, "Mock agent received: \"hi\". (no real agent
  attached)" appears as an assistant bubble (grey, left).

## 8. Advance the stage

Click **方案设计** in the Inspector's stage grid (the next
stage after 现状分析; the first stage is enabled because
the current is "未开始" — but advancement from "未开始" to
"方案设计" requires the engine to permit it).

If the engine accepts, a confirmation modal appears. Click
**确认推进**.

Expected:
- `workflow.runStage` is called with `{feature: payment-refactor,
  stage: '方案设计', confirmed: true}`.
- StageStepper advances: 方案设计 is now indigo (current).
- The badge in the chat panel header still shows
  "在线".
- The "推进阶段" grid now enables 任务分解.

If at any step the UI shows a red error banner, capture the
main-process log and check:
- `[dapei-desktop] bootstrap complete (workspace=..., dimension=...)`
- `[acp stderr]` lines (if any) — these are opencode warnings
- `[acp] non-json line ignored` lines — these are opencode
  protocol drift; check ADR-0011

## Done

If all 8 steps pass, M1 is shipped.

## What M1 does NOT do (deferred to M2+)

- P3 Knowledge (CDR portal embedding) — M2-1
- EvidenceCard / ToolCallCard — M2-2
- PluginHost L1 + sample plugin — M2-3
- Real-OpenCode end-to-end (CI only verifies the protocol
  shape via the mock backend; the user must have
  `opencode` installed to see the real backend in
  `agent.listBackends`)
- npm publish (per ADR-0007 the desktop is in canary mode
  for the M1 series; no external release yet)
