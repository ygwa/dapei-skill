# M2 Acceptance — 大培桌面端

> Status: **shipped in `feature/desktop-m1-m2` @ commit TBD**
> Scope: M1 (real engine integration + Agent-Share v1) + M2
> (Knowledge portal + evidence/tool cards + PluginHost L1)

Builds on [M1-acceptance.md](M1-acceptance.md). The 8 M1
steps are still required; this document adds the M2 layer.

## 0. Bootstrap (unchanged from M1)

```bash
cd desktop && pnpm install
```

Expected: lockfile is up to date; `ensure-electron` postinstall
prints OK.

## 9. P3 Knowledge — local portal

In a workspace with **no** CDR analysis yet:

1. Click **业务知识图谱** in the sidebar.
2. You should see "门户未构建. 点击右上 Generate Portal 调用
   cdr.doc.generate."
3. Click **Generate Portal**.
4. Engine subprocess spawns `cdr.doc.generate` (a workspace-dim
   write; dimension rule allows this from workspace dim).
5. The renderer picks up the URL via `dapei:knowledge:portalUrl`
   and embeds the local server in an `<iframe>`.

If your workspace has **already** run CDR analysis
(`<workspace>/.dapei/docs-portal/.vitepress/dist/` exists):

1. Click **业务知识图谱** → the iframe loads the portal at
   `http://127.0.0.1:<random-port>/`.
2. The browser bar shows the local URL.
3. **Refresh** button reloads the iframe.
4. **Generate Portal** rebuilds and re-binds the iframe.

The local server:
- binds 127.0.0.1 only (never 0.0.0.0)
- serves security headers (CSP, X-Content-Type-Options, X-Frame-Options)
- rejects path traversal (no `..` outside the portal root)
- returns 503 + friendly HTML if the portal isn't built yet

## 10. P3 Knowledge — asset tree

In the same view, click **资产浏览器**:

1. The left pane shows the structured asset tree under
   `docs/as-is/`: Behaviors, State Machines, Domains,
   Profiles, Entries, Business Rules, Capability Map, and
   Cognitive Index (if present).
2. Each entry has a file path and (when the yaml is
   readable) an `id` / `repo` / `kind` label.
3. Click an entry → the right pane shows a placeholder for
   M3 (asset detail view + cross-link to P5 Inspector).
4. If a directory is empty, it does not appear in the tree.

## 11. P5 — ToolCallCard

In a Feature workbench (P5) with an attached agent:

1. The chat panel header is green ("在线").
2. The agent runs a tool (e.g., `workspace.status`).
3. The chat panel renders a **collapsible card** with:
   - the tool name (`workspace.status`)
   - a green check (or red cross) for ok/err
   - the input JSON (collapsed by default; click to expand)
   - the output JSON (also collapsed)
4. The mock backend serializes tool calls, so you should
   see exactly one card per tool invocation.

## 12. P5 — EvidenceCard

In the same P5 workbench:

1. Scroll the right-rail Inspector down.
2. The **证据链 (EvidenceCard · M2-2)** section shows two
   sample evidence cards:
   - `order-create endpoint` (kind: fact, file + line + symbol)
   - `order-cancel derived from behavior` (kind: inference, file only)
3. Each card has a kind badge (事实 / 推断 / 未验证).

Real evidence loading (from `docs/as-is/behavior/*.yaml`) is
M3+.

## 13. PluginHost L1

The shipped sample plugin lives in
`desktop/apps/sample-plugin/`. To install it:

### User-global install

```bash
mkdir -p ~/.dapei/plugins/dapei-welcome
cp desktop/apps/sample-plugin/dapei-desktop-plugin.json \
   ~/.dapei/plugins/dapei-welcome/
```

Restart the desktop. The PluginHost discovers the manifest
at `~/.dapei/plugins/dapei-welcome/dapei-desktop-plugin.json`,
validates with the Zod allowlist, and adds the sidebar item.

### Workspace-local install

```bash
cd <your-workspace>
mkdir -p .dapei/plugins/dapei-welcome
cp <dapei-skill>/desktop/apps/sample-plugin/dapei-desktop-plugin.json \
   .dapei/plugins/dapei-welcome/
```

Restart the desktop. Workspace-local plugins take precedence
over user-global (in this M2-3 milestone both are loaded
together).

### Expected behaviour

- The plugin is logged at startup:
  `[plugins] loaded sample.dapei-welcome@0.1.0 from <path>`
- The `plugin.list` IPC channel returns the plugin metadata.
- The sample plugin's sidebar item ('Sample 插件') is in
  the registry. M2-4 does not yet mount it in the UI
  (renderer wiring is M3+); the registry entry is the
  contract for future mounting.

### Plugin rejected scenarios

| Scenario | Outcome |
|---|---|
| Manifest with bad id (whitespace, uppercase) | Skipped; warning in main process log |
| Manifest with `pipelineSteps` entries | Loaded, but `contributes.pipelineSteps` emptied (L1 allowlist) |
| Two plugins with same id | Both skipped; one wins on `id` collision; the other logged |
| Two plugins with same contribution id (e.g. `sidebar:shared`) | First loaded; second skipped with "duplicate contribution id" |
| Manifest in `~/.dapei/plugins/foo/` without `dapei-desktop-plugin.json` | Directory skipped |

## Done

If all 13 steps pass, M2 is shipped.

## What M2 does NOT do (deferred to M3+)

- Real evidence loading from `docs/as-is/behavior/*.yaml`
  (M2-2 ships a sample; M3 reads the actual files).
- Renderer mounting of plugin route contributions
  (registry is populated; route → component mapping is M3).
- BrowserView (M2-1 uses `<iframe>` for the portal; a true
  BrowserView with cross-process IPC is M3+).
- Plugin Utility Process isolation (M2-3 loads in-process).
- L2 / L3 plugin surfaces (L2 AgentBackend L1+1, L3 pipelineStep).
- npm publish (still canary; per ADR-0007).
