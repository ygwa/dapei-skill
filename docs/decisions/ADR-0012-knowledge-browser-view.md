---
id: ADR-0012
title: "P3 Knowledge uses BrowserView + local HTTP server, not file:// webview"
status: proposed
date: 2026-06-26
deciders: [ygwa]
technical-story: "feature/desktop-m1-m2 (M2-1)"
---

## Problem Statement

The P3 Knowledge view embeds the dapei CDR portal — a VitePress
build output at `<workspace>/.dapei/docs-portal/.vitepress/dist/`.
The portal is a static site (HTML + JS + CSS + assets). The
desktop must embed it inside an Electron window so users can
navigate behaviors / state machines / business rules / cross-repo
docs without leaving the desktop.

Two candidate embedding strategies:

- **`loadFile(file://...)`**: Electron's renderer loads the
  portal's `index.html` via the `file://` protocol.
- **`loadURL(http://127.0.0.1:<port>/)` + BrowserView**: Spin
  up a local HTTP server in the main process, serve the portal
  directory, and load it via a `BrowserView` attached to the
  main window.

## Constraints

- The portal is **read-only** in P3 (writes go through the
  engine via `cdr.doc.generate`).
- The portal directory may not exist yet (first-time workspace
  with no CDR analysis). The UI must show an empty state with
  a "Generate portal" action that calls `cdr.doc.generate`.
- Security: the server must bind `127.0.0.1` only (not
  `0.0.0.0`). External network access is forbidden. CSP
  headers should restrict script sources to the portal's own
  bundle, not arbitrary origins.
- The portal uses Vue 3 + VitePress + relative asset paths
  (VitePress default). The server must preserve those paths.

## Decision

P3 uses **BrowserView + a local HTTP server bound to
`127.0.0.1`**. The main process owns the server; the
BrowserView is attached to the main window and points at
`http://127.0.0.1:<random-port>/`.

### Why BrowserView (not WebContentsView in the same WebContents)

- A BrowserView is a lightweight, separate WebContents
  attached to a parent window. It can be reparented, hidden,
  or shown independently — useful for P3 / P5 transitions
  (when the user is on P5 the BrowserView can be detached).
- `loadFile(file://...)` would also work for VitePress, but
  the portal's internal relative paths and the `vscode://` /
  `https://` CodeLink resolution would all need the file://
  protocol handler. The HTTP server is simpler: every URL
  works the same way as if the user opened the portal in
  their browser.

### Why local HTTP (not a packaged VitePress run)

- VitePress has a dev server. We could run `npx vitepress dev`
  in the main process. The cost: a Vite dev server is
  slow (cold start 5-10s) and pulls the VitePress + Vue deps
  into the desktop's process tree. A static `node:http`
  server has cold start <50ms and zero deps.
- The portal is built once and re-built on demand. The
  "Generate portal" button calls `cdr.doc.generate` which
  re-runs VitePress build. We serve the build output.

### Server implementation

- Use Node's built-in `http` module (no Express; keeps the
  desktop binary lean).
- Bind to `127.0.0.1` on an OS-assigned port (`port: 0`).
- Cache the port in `~/.dapei/desktop/portal-server.json` so
  the renderer can ask "what URL is the portal at?" via IPC.
- Security headers on every response:
  - `Content-Security-Policy: default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: https:;`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN` (defense in depth; the
    BrowserView already isolates)
- Long-lived per workspace. Stop the server on `workspace.open`
  switching to a different workspace (or restart on the new
  portal path).

### What M2-1 ships

- `KnowledgeView.tsx` — replaces the P3 PlaceholderView.
  Tab A (portal) embeds BrowserView; Tab B (assets) renders
  the structured asset tree.
- `local-server.ts` — the http server.
- `knowledge-service.ts` — `indexList`, `assetTree`,
  `portalBuild`, `getUrl`.
- IPC: `dapei:knowledge:portalBuild`, `dapei:knowledge:portalUrl`,
  `dapei:knowledge:assetTree`, `dapei:knowledge:indexList`.

### What M2-1 does NOT ship

- CodeLink / vscode:// resolution (VitePress portal already
  supports it; M2-1 only embeds).
- Cross-repo business-rule pages (handled by CDR v0.5; M2-1
  reads the pre-built portal).
- Live regeneration watcher (M3+).

## Alternatives Considered

### Option A: `loadFile(file://...)` in the same WebContents
- **Pros:** No new process, no port management, no security
  headers.
- **Cons:** VitePress's relative asset paths and CodeLink
  resolution all need the `file://` protocol handler.
  CSP via `<meta>` is awkward. Cross-process IPC into the
  embedded VitePress (e.g., a "click a behavior → jump to
  P5") requires `window.postMessage` plumbing. **Rejected.**

### Option B: BrowserView + local HTTP (chosen)
- **Pros:** Standard web semantics; CSP enforced by the
  server; cross-process IPC is just `webContents.send` on
  the BrowserView.
- **Cons:** New process to manage. Port allocation, restart
  on workspace switch, server crash handling.
  **Accepted** — all costs are well-trodden Electron patterns.

### Option C: Package the VitePress dev server as a sub-process
- **Pros:** Hot reload during dev; matches what VitePress
  users expect.
- **Cons:** 5-10s cold start; pulls Vite + Vue + Markdown
  pipeline into the desktop's process tree. **Rejected.**

## Consequences

### Positive
- The portal opens in <100ms (cached at `<workspace>/.dapei/
  docs-portal/.vitepress/dist/`).
- CSP and `127.0.0.1`-only binding close the obvious
  security holes.
- Cross-process IPC for "click a behavior in the portal
  → jump to P5 Inspector" is just a `webContents.send`
  call on the BrowserView.

### Negative
- The server runs as long as the desktop is open. Memory
  usage is small (<10MB for the static-file server) but it
  is a long-lived process. The main process is
  responsible for stopping it on quit.
- Port allocation: each workspace gets its own server on a
  random port. The user sees `http://127.0.0.1:52341/`
  (for example) in the BrowserView's title. Not pretty but
  correct.
- A future cross-window view would need to share the
  BrowserView's WebContents. M3+ problem.

### Neutral
- The VitePress portal is built by the engine's
  `cdr.doc.generate` capability. The desktop does not
  bundle VitePress; it only serves pre-built output.

## References

- `desktop/packages/knowledge/src/portal/local-server.ts` (M2-1)
- `desktop/packages/services/src/knowledge/knowledge-service.ts` (M2-1)
- `desktop/apps/electron/src/renderer/src/pages/workspace/KnowledgeView.tsx` (M2-1)
- `desktop/design-desktop/architecture.md` §10.2 (decision deferred)
- `desktop/packages/cdr/.../cdr.doc.generate` — engine
  capability that produces the portal at the path
  served by the local server
- `desktop/packages/contracts/src/ipc/channels.ts` — the 4
  knowledge.* IPC channels
- `.omo/plans/desktop-m1-m2.md` §M2-1
