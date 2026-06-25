---
id: ADR-0013
title: "Plugin L1 allowlist: routes / sidebar / featurePanels / agentBackends only — no arbitrary capability registration"
status: proposed
date: 2026-06-26
deciders: [ygwa]
technical-story: "feature/desktop-m1-m2 (M2-3)"
---

## Problem Statement

The desktop's plugin system lets third parties extend the
shell. There are two candidate threat models:

- **Permissive**: a plugin can register any IPC handler, any
  capability, any file-system path. Maximum flexibility, maximum
  attack surface.
- **Locked-down**: a plugin can only contribute to a fixed
  allowlist of extension points. Lower attack surface, but
  also lower utility.

The L1 design (per the desktop tech-selection v1 PDF) picks
**locked-down**. The question is: what is in the allowlist?

## Constraints

- Plugins must not run their own Node process; they live in
  the main process (loaded by `PluginHost`) and the renderer
  (loaded by the React app).
- A plugin that wants to add a new IPC capability must not
  bypass the dimension rule or the Zod router. The cleanest
  way to enforce this is to **not** allow arbitrary capability
  registration at L1.
- A plugin must not write to `~/.dapei/desktop/recent.json`
  or other internal desktop files unless explicitly allowed.
- M2-3 ships the L1 surface; L2 (L1+1) opens AgentBackend
  registration. L3 (M3+) opens Pipeline steps. Each level
  gets its own ADR.

## Decision

L1 plugins can contribute to exactly four extension points,
all of which are **read-mostly UI surfaces**:

| Extension point | Effect |
|---|---|
| `routes` | A new route in the renderer's React Router. The plugin provides a `path` and a `module` (a function returning a React component) that the desktop mounts in the WorkspaceShell's `Routes`. |
| `sidebar` | A new item in the renderer's `GlobalSidebar` navigation. Clicking it navigates to a route the plugin registers. |
| `featurePanels` | A new panel inside a Feature's P5 workbench. Slots: `inspector` (right rail) or `context` (left rail). |
| `agentBackends` | A new `AgentBackend` registration. The plugin provides a module that exports an `AgentBackend` instance; `AgentHost.backends.register(...)` adds it. |

### Manifest

```ts
interface DesktopPluginManifest {
  id: string;                    // "acme.cursor-bridge"
  version: string;               // semver
  name?: string;
  description?: string;
  main?: string;                 // main process module path
  renderer?: string;             // renderer module path
  contributes: {
    routes?: Array<{ id; path; label; module? }>;
    sidebar?: Array<{ id; label; icon?; route }>;
    featurePanels?: Array<{ id; label; slot: "inspector" | "context"; module }>;
    agentBackends?: Array<{ id; label; module }>;
    pipelineSteps?: Array<{ id; label; phase; module }>; // L3 only
  };
}
```

The `module` field is a path relative to the plugin's
directory; `PluginHost` resolves and `import()`s it.

### Discovery

`PluginHost.discoverPaths()` returns:
- `~/.dapei/plugins/*/manifest.json` (user-global)
- `<workspace>/.dapei/plugins/*/manifest.json` (workspace-local, takes precedence)

For each path, the host reads `manifest.json`, parses with
Zod (`desktopPluginManifestSchema` in
`packages/contracts/src/plugin/manifest.ts`), and adds the
plugin to the registry. Invalid manifests are logged and
skipped; the host does **not** refuse to start the app.

### Allowlist enforcement

`PluginHost.validate(manifest)` checks:
- Every `contributes` field is in `{routes, sidebar, featurePanels, agentBackends, pipelineSteps}`.
- `pipelineSteps` is **only** allowed in L3 (M3+); the L1
  registry rejects it explicitly.
- The `id` is unique across all loaded plugins.
- `version` is a valid semver.

Any failure: skip the plugin, log the reason, continue with
the rest.

### Security

- The PluginUtilityProcess is a **separate** Node process
  forked via `utilityProcess.fork` (already in M0). It
  cannot directly call `engine.run`; only the main process
  can.
- Plugins that want to call capabilities must do so via
  `engine.run` through the IPC bridge; they cannot bypass
  the dimension rule.
- Plugins are signed by their directory trust (the
  `~/.dapei/plugins/` and `<workspace>/.dapei/plugins/`
  locations). A future ADR will cover signature verification
  (out of scope for M2-3).

## Alternatives Considered

### Option A: Permissive (any plugin can register any capability)
- **Pros:** Maximum flexibility; new agents, new pipelines,
  new IPC handlers all possible.
- **Cons:** A malicious plugin can write `~/.dapei/desktop/
  recent.json` to add a fake workspace, then the user
  opens it and the plugin reads the workspace's docs/.
  The dimension rule does not help (the fake workspace is
  workspace-dim, so any call is allowed). **Rejected.**

### Option B: Locked-down with custom capabilities via a separate `capabilities` allowlist
- **Pros:** Plugins can add new engine capabilities.
- **Cons:** Each new capability is a new attack surface; the
  desktop must audit the plugin's implementation. Adds a
  L1.5 layer. **Deferred** to a future ADR if demand
  materialises.

### Option C: Locked-down to the four extension points (chosen)
- **Pros:** Bounded attack surface. Plugins can only add UI
  surfaces; they cannot touch engine capabilities.
- **Cons:** Plugins that want to add a real capability must
  upstream the capability to `@dapei/core` first. This is
  the right model: capabilities are durable, plugins are
  presentation.

## Consequences

### Positive
- The desktop's plugin surface is well-bounded. A new
  maintainer reading this ADR knows exactly what a plugin
  can and cannot do.
- The dimension rule (ADR-0010) still applies: a plugin's
  UI surfaces that trigger `engine.run` go through the
  same Zod + dimension path. The plugin cannot bypass.
- The sample plugin (M2-3 ships one) is small (~30 lines
  of manifest + 1 React component) because the surface is
  bounded.

### Negative
- Plugins cannot add new AgentBackends that require new
  protocol implementations. They can register an
  `AgentBackend` whose module returns an instance that
  implements the existing `AgentBackend` interface. If
  the protocol needs new fields, those fields would have
  to be added to `@dapei/desktop-contracts` first.
- The M2-3 sample plugin is a `Sidebar` contribution, not
  a `routes` one. The `routes` path is exercised by tests
  but not by the shipped sample. A future PR can add a
  route-based sample.

### Neutral
- The plugin UtilityProcess (forked from main) is currently
  a no-op stub (`apps/electron/src/main/plugins/utility-host.ts`).
  The M2-3 sample plugin loads in-process (no utility
  process fork). M3+ can move plugins to the utility
  process for stronger isolation.

## References

- `desktop/packages/contracts/src/plugin/manifest.ts` —
  Zod schema for `DesktopPluginManifest`
- `desktop/packages/contracts/src/plugin/contributes.ts` —
  Per-extension-point type definitions
- `desktop/packages/plugins/src/host/plugin-host.ts` (M2-3)
- `desktop/packages/plugins/src/loader/loader.ts` (M2-3)
- `desktop/packages/plugins/src/registry/` (M2-3)
- `desktop/apps/sample-plugin/manifest.json` (M2-3)
- `desktop/design-desktop/architecture.md` §7 (Plugin system)
- `.omo/plans/desktop-m1-m2.md` §M2-3
- ADR-0003 (engine as validator — plugins can't replace the engine)
- ADR-0010 (dimension rule — plugins can't bypass)
