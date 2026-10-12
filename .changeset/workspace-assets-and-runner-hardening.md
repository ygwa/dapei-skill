---
"dapei-skill": minor
---

**One home for workspace assets, one portal, and a bundle you can actually ship.**

The templates a new workspace receives moved from this repository's own
`.dapei/**` to `runtime/templates/dapei/**`, and `workspace.init` reads only
from there; this repo's `.dapei/` is now explicitly its own workspace config
(its runtime state, `.dapei/audit/` and `.dapei/cognitive/`, is no longer
versioned). The second, untested VitePress pipeline
(`runtime/templates/docs/**`) is deleted — `cdr.doc.generate` is the only
renderer — and `workspace.init` no longer injects `docs:*` scripts or
`vitepress`/`vue`/`js-yaml` devDependencies into the host `package.json`, which
was its only write outside its declared `outputs`. The five `.dapei/schemas/*`
artifact contracts (no runtime reader, one never seeded) are gone. See
ADR-0024.

`dist/dapei-engine.js` is now genuinely standalone: `npm run gen:assets` embeds
`runtime/templates/**` into the bundle, template copying prefers disk and falls
back to the embedded copy only when no engine home exists, and
`npm run smoke:bundle` copies the bundle into a directory with nothing beside it
and no `DAPEI_ENGINE_HOME` — it still initialises a complete workspace, reaches
`cdr.index.list` and routes. `npm run check:assets` keeps the embedded copy
fresh in CI. The root `SKILL.md` now documents the engine entry point
(previously the skills never said how to reach the engine), and
`scripts/validate-skills.mjs` fails if that section disappears.

The runner no longer dispatches through a module-level global:
`registerCapabilitySpecs` is gone, `runCapabilityWith` injects a `dispatch`
callback into each capability's context, and a caller that wires the runner
without the composition root gets `DISPATCH_UNAVAILABLE` naming the target
instead of a missing capability. `packages/cdr/src/capabilities.ts` (4444 lines)
was split into 12 domain modules behind the same 24-export entry. Guardrail
rules are parsed with js-yaml and dispatched through a registry. `workflow.status`
reads its stage list from the workspace workflow file instead of a hardcoded
array. `audit.query` scans backwards, the audit log rotates past 5 MB and no
longer fails a succeeded capability on write error, `AuditEntry.afterHash` was
replaced by the `afterHashes` map that is really written, and CodeGraph's
write-only "no CLI" marker is now honoured (with `fullDoctor()` probing the
workspace root rather than `<workspace>/.dapei/graph`).
