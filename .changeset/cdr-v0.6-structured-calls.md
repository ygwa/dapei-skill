---
"dapei-skill": minor
---

CDR v0.6 — Structured calls. The `behavior.calls[]` field now accepts structured objects in addition to legacy strings. Per-entry validation enforces `target` (required for objects) and a protocol whitelist (`http | grpc | mq | event | rpc | other`). The cognitive index grows a `target_repos` field populated from explicit `target_repo` declarations on calls. The portal renders a "Cross-service calls" table for behaviors that span multiple repos. A silent bug in `cdr.behavior.upsert` that was coercing every call entry to the string `"[object Object]"` is fixed. No breaking changes; pre-v0.6 string calls keep working.
