---
"dapei-skill": minor
---

CDR v0.4 — Multi-repo merge. Per-repo namespace for behavior, state-machine, domain, and business-rule artifacts (writes go to `docs/as-is/<section>/<repo>/<id>.yaml`). The cognitive index now dedupes per-repo entries on `(id, repo)` instead of `id` alone. `cdr.state.derive` and `cognitive.state.suggest` resolve behavior paths via the index (with a legacy fallback for pre-v0.4 artifacts). `cdr.doc.generate` emits per-repo portal pages. Two new fixtures (`mall-order`, `mall-payment`) ship with a dedicated cross-repo merge integration test.
