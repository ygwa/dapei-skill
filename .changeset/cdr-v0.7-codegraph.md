---
"dapei-skill": minor
---

CDR v0.7 — CodeGraph integration. The [lzehrung/codegraph] CLI is wired in via a new `runtime-adapters/src/codegraph.ts` adapter with graceful degradation: every CodeGraph-backed capability (`cdr.profile`, `cdr.entries.candidate`, `cdr.behavior.upsert`, the new `cdr.stale.scan`) falls back to its v0.3-0.6 strategy when the CLI is missing. The new `cdr.stale.scan` populates the v0.4 StaleFields reservation with blast-radius-based marking. The fake-codegraph CLI fixture (`tests/fixtures/fake-codegraph/codegraph`) makes the test suite run identically in CI and on developer machines.
