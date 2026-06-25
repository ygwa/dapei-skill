# Sample Plugin — dapei-welcome

> M2-3 ships this as the L1 example for `@dapei/desktop-plugins`.

This is the smallest meaningful plugin:

- One sidebar contribution
- One route contribution (the route is not yet mounted in
  the renderer; L1 only requires the registry to track it)
- No agent backend, no feature panel, no pipeline step

## Install

```bash
# User-global install
mkdir -p ~/.dapei/plugins/dapei-welcome
cp dapei-desktop-plugin.json ~/.dapei/plugins/dapei-welcome/

# Workspace-local install
mkdir -p .dapei/plugins/dapei-welcome
cp dapei-desktop-plugin.json .dapei/plugins/dapei-welcome/
```

Then restart the desktop. The PluginHost discovers the
manifest, validates with the Zod allowlist (per ADR-0013),
and registers the sidebar item. The next M2-4 milestone
wires the renderer to display it.

## What it does NOT do

- Does not register an AgentBackend (L2 surface; reserved)
- Does not register a FeaturePanel (L1+1; reserved)
- Does not register a pipelineStep (L3 surface; rejected
  by L1 host per ADR-0013)
- Does not bypass the dimension rule (cannot, plugins have
  no engine.write access)
