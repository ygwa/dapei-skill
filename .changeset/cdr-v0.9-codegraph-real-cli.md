---
"dapei-skill": minor
---

CDR v0.9 — CodeGraph real-CLI rewrite. The v0.7 / v0.8 branch's `runtime-adapters/src/codegraph.ts` adapter called a fictional subcommand set (`orient`, `refs`, `impact`, `doctor`) that the actual [colbymchenry/codegraph] CLI never shipped — those calls would have silently no-oped against the real binary. v0.9 rewrites the adapter against the real CLI surface (`files --format=json`, `query --kind=function`, `node`, `callers`, `callees`, `status`) and updates the fake test fixture to match. The CDR-facing public API (`orient`, `refs`, `impact`, `fullDoctor`) is preserved so callers in `packages/cdr/src/capabilities.ts` don't need to change. Also updates `docs/cdr-architecture.md` §7 with the real subcommand mapping, three integration modes (CLI subprocess / MCP server / Node library), zero-config documentation, and the full degradation matrix.
