---
id: ADR-0010
title: "The dimension rule is enforced in the engine-client, not the UI"
status: proposed
date: 2026-06-25
deciders: [ygwa]
technical-story: "feature/desktop-m1-m2 (M1-5)"
---

## Problem Statement

ADR-0004 says "Workspace and Feature dimensions are physically separated". The desktop UI is one place to honour this rule: a user in the Feature dimension must not be able to write to the workspace dimension. Today there are two candidates for the enforcement point:

- **UI-side**: the P5 workbench hides `docs.*` write actions and `workspace.init` buttons when `dimension === "feature"`. The renderer never sends those capabilities to the engine.
- **Engine-side**: the engine-client refuses any `docs.*` / `cognitive.*` / `workspace.init` / `cdr.feature.link` capability call when the WorkspaceContext says `dimension: "feature"`, regardless of what the renderer asked for.

UI-side is friendlier (the button is not even there), but **trusting the UI for an authorization-style rule is wrong**. The renderer is JavaScript; it can be reloaded, debugged, replayed. The renderer is also the only place where a hostile plugin (L1+ in M2-3) could route a write. A wrong keystroke in the input box that types `docs.write` should be refused, not silently let through.

## Constraints

- The desktop main process is the only process in the desktop binary that talks to the engine. Every renderer call goes through `dapei:capability:run` IPC, which lands in the engine-client. There is no second path.
- The dimension rule is **per call**, not per session. The same renderer can call `workspace.status` (read, allowed in either dim) and `docs.write` (write, blocked in feature dim) in the same frame; the engine-client checks each call independently.
- The blocklist is **finite and engine-side**. It must not be a "block everything" or a "block nothing" default; it must enumerate the specific write capabilities that move the workspace dimension. Adding to the list is a one-line change with a single test (the dimension-rules self-check).

## Decision

The dimension rule is enforced **inside `SubprocessEngineClient.run`**, before the subprocess is spawned. The blocklist lives in `desktop/packages/engine-client/src/dimension-rules.ts` and is a small `ReadonlyArray<RegExp>`.

The check is:

```ts
// pseudo (real code in dimension-rules.ts)
if (ctx.dimension === "feature") {
  for (const re of FEATURE_DIMENSION_BLOCKLIST) {
    if (re.test(request.capabilityId)) {
      return errorResponse("DIMENSION_BLOCKED", `...`);
    }
  }
}
```

The blocklist, as of M1-1:

```ts
/^docs\.write$/, /^docs\.create$/, /^docs\.delete$/, /^docs\.update$/,
/^cognitive\.artifact\.upsert$/, /^cognitive\.index\.rebuild$/,
/^cdr\.index\.write$/, /^cdr\.feature\.link$/,
/^workspace\.init$/,
```

### Three guarantees this gives us

1. **The renderer cannot bypass it.** Renderer is the only writer of `CapabilityInvokeRequest`. The engine-client checks before any subprocess spawns. There is no "trusted" path.
2. **A new write capability is caught at integration time.** `desktop/scripts/check-dimension-rules.ts` scans `packages/core/src/capabilities/`, heuristically identifies write capabilities, and asserts every one is in the blocklist. The check runs in CI (M1-7+); a missing block fails the build.
3. **The UI can stay honest.** When the engine-client returns `DIMENSION_BLOCKED`, the renderer shows a friendly toast. The UI does not need to second-guess; the engine is the gate. The UI may still hide the button (defense in depth), but its absence is not the security boundary.

### Why a finite blocklist, not a namespace rule?

A namespace rule (`/^docs\./` blocks all `docs.*`) would be simpler but wrong. Some `docs.*` capabilities are reads (e.g., `docs.list`, `docs.search`) that the feature dimension absolutely should be able to call. The blocklist enumerates the *write* capabilities explicitly. False negatives are caught by the self-check script.

### Why regex, not an allowlist?

An allowlist ("only these capabilities may run in feature dim") would be safer but the feature dim needs to call ~20+ read capabilities (status, validate, list, search, etc.) and any new read would require a blocklist update. A denylist (what we have) requires updates only on new writes, and the self-check script makes those updates hard to forget.

### Heuristic: how `check-dimension-rules.ts` decides "write"

The scanner in `desktop/scripts/check-dimension-rules.ts` is conservative. It flags a capability as a write if its `.ts` body matches any of:

- `confirmGate:` declared (writes gate; reads don't)
- `outputs: [` declared (writes declare durable outputs)
- calls `write(...)`, `update*(...)`, `upsert(...)`, `delete(...)`, `remove(...)`, `archive(...)`, `close(...)`, `link(...)`
- calls `ensureDir(...)` (creates directories — a write)
- calls `writeFileSync(...)` (Node built-in write)

This is intentionally broad; false positives are OK (the maintainer sees a flag and adds the regex if appropriate). False negatives are bad (an unwritten write slips through). When in doubt the script flags it; the human decides.

## Alternatives Considered

### Option A: UI hides the buttons, no engine check
- **Pros:** No new code in the engine-client. UI feels right.
- **Cons:** The renderer is the only security boundary. A wrong input in the agent panel (`@dapei write docs/foo.md`) would reach the engine and the engine does not know the call came from a feature-dim renderer. **Rejected.**

### Option B: Engine-side namespace rule
- **Pros:** Single regex covers everything under `docs.`, `cognitive.`, etc. Easier to remember.
- **Cons:** Blocks reads too. The feature dim would lose access to `workspace.status`, `feature.status`, `docs.list`, `cognitive.artifact.list`, etc. **Rejected.**

### Option C: Engine-side finite blocklist (chosen)
- **Pros:** Granular. Reads are always allowed. Writes are explicit. Self-check script catches gaps. False-negative cost is "a write slips through for one release until the maintainer adds the regex" — low blast radius because the engine itself mostly refuses cross-dimension writes (the `feature.create` capability, for example, refuses to run inside an active feature directory).
- **Cons:** Maintainer has to remember to add a regex when adding a new write capability. The self-check script is the safety net.

### Option D: Reject in the engine (`packages/core`) and pass dimension as part of `CapabilityContext`
- **Pros:** Defense in depth. The engine itself becomes aware of dimensions.
- **Cons:** `CapabilityContext` is shared between desktop and Skill callers. Adding `dimension` to it changes the engine's stable API; every Skill caller has to opt in or get a default. The Skill itself is a single-dimension tool (it acts on the workspace dimension by definition), so making it engine-aware adds noise. **Deferred** — revisit when the Skill starts operating inside Feature dimension worktrees.

## Consequences

### Positive
- The dimension rule is a real boundary, not a UX nicety. ADR-0004 stops being aspirational.
- The self-check script (`pnpm check:dimension-rules`) is a 200ms build-time guardrail. Adding a write capability without the block fails the build.
- The error code `DIMENSION_BLOCKED` is a stable contract — the renderer can branch on it and show a friendly toast without parsing strings.

### Negative
- The maintainer must add a regex on every new write capability. This is the central maintenance burden.
- The self-check script's heuristic can flag false positives. The maintainer is occasionally asked to add a regex for a read that happens to call `ensureDir` (e.g., to create a temp scratch dir). The maintainer decides.
- The dimension rule is **engine-side, not engine-internal**. The desktop is the gate; if a future consumer of the engine (the Skill, a third-party tool) does not implement the same blocklist, the rule is bypassed. This is acceptable because the desktop is the only consumer that has a "dimension" notion; the Skill and CLIs act on the workspace dimension by default.

### Neutral
- The error code is `DIMENSION_BLOCKED`; the rest of the engine-client error codes (`ENGINE_EXIT`, `SPAWN_FAILED`, `PARSE_FAILED`, `INVALID_CONTEXT`, `NOT_IMPLEMENTED`) follow the same shape and the renderer can branch on the union.

## References

- `desktop/packages/engine-client/src/dimension-rules.ts`
- `desktop/packages/engine-client/src/types.ts` (DimensionDecision, EngineErrorCode)
- `desktop/apps/electron/src/main/engine/subprocess-client.ts` (calls `evaluateDimension` before spawn)
- `desktop/scripts/check-dimension-rules.ts` (self-check)
- `desktop/packages/engine-client/src/__tests__/contract.test.mjs` (covered regexes)
- ADR-0004 (two-dimension boundary)
- ADR-0008 (EngineClient contract)
- ADR-0009 (WorkspaceContext injection)
- `.omo/plans/desktop-m1-m2.md` §M1-5
