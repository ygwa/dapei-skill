---
"dapei-skill": minor
---

CDR v0.5 — Cross-repo business rules. Two new read-only/compute capabilities (`cdr.business.crosslink` and `cdr.crossrepo.doc.generate`) surface cross-repo relationships that the AI has already encoded as business rules. The cross-link view lives at `docs/as-is/cross-repo/cross-links.yaml`; the portal section lives at `cross-repo/`. Phase 5.5 of `skills/cdr/SKILL.md` documents the AI's responsibility to recognise five recurring cross-repo patterns and write the corresponding business-rule kind. The engine does not infer cross-repo relationships from event-name heuristics.
