---
"dapei-skill": minor
---

**Repository hardening pass: the desktop subtree left, the capability graph is
acyclic, the gates actually gate, and routing has one authority.**

Repo layout: `desktop/`, `design-desktop/`, the two `features/desktop-*`
workspaces, the desktop-specific ADRs (0007–0014, 0016, 0017, 0019 ×2, 0020)
and the three `desktop:*` npm scripts moved to the sibling `desktop-app/`
directory, with a provenance note recording where the files came from. ADRs
that document engine behaviour the desktop consumed stay here (ADR-0004,
ADR-0018). See ADR-0021.

Package graph: `packages/core` no longer imports `packages/cdr` or
`packages/doc-gen`. A new `packages/catalog` is the composition root that
assembles core + cdr + doc-gen and binds `runCapability`; consumers (`engine/`,
64 test files, `scripts/validate-skills.mjs`) import it. `packages/core` keeps
the kernel and the generic runner. Package dependency direction is documented in
each `packages/*/package.json`. See ADR-0021.

Gates: a guardrail that fails now blocks a stage advance
(`GUARDRAIL_FAILED`, no completion marker written) when `guardrail_mode` is
anything but `report`, instead of being advisory-only forever; unknown guardrail
`check.type` values are reported instead of silently passing; and
`feature.stage action=set` goes through the same stage-list / prerequisite /
confirmation-gate path as the transition action, so `stage-*.completed` markers
can no longer be forged with any string. The gate stage list is single-sourced
from `.dapei/workflows/feature-lifecycle.yaml`. See ADR-0022 for the
`feature.close` closeout contract.

Routing: `packages/router` now routes all 64 registered capabilities (was 34 of
64; 122 routes, was 53), `.dapei/commands.yaml` declares a `capability:` per
entry and all 30 entries route correctly (was 14/30 misrouting), `tests/router/**`
runs in CI via the new `test:router` script, and a new
`tests/unit/route-authority.test.mjs` asserts registry coverage, `commands.yaml`
agreement, absence of unknown ids, that no `@dapei` example lands on the fallback
route, and the conflict allowlist.

Fixes: `workspace.init` no longer silently produces a workspace with no
`commands.yaml`, no rules, no schemas and no templates when invoked without
`DAPEI_ENGINE_HOME` (it derives its template root from the module location and
throws `ENGINE_HOME_NOT_FOUND` when it cannot find one); `scripts/first-run.mjs`'s
two dead engine paths (`packages/core/dist/index.js`,
`scripts/cdr-doc-generate.mjs`) are replaced by real
`dapei-engine run --capability …` calls that fail loudly, and it only seeds
sample CDR artifacts on `--with-samples`; `scripts/dapei-guardrail` calls
`feature.guardrail` (it was calling the non-existent `guardrail.run`) and
supports `--all`; the version checker now covers every shipped manifest (16
sources, was 6) and the marketplace manifests' silent drift to 3.1.0 is fixed;
`package-lock.json` is gone in favour of pnpm; CI runs `typecheck`,
`validate:skills` and `build` for the first time. Dead code removed:
`packages/core/src/capabilities/domains/cdr.ts` (3007 lines), `hashFile`,
`workspaceRel`, `hasProvenance`, `stringifyYamlValue`, `loadCodeGraphMarker`,
and the unused `$ref` machinery in `schema.ts`.
