---
"dapei-skill": minor
---

SKILL Router adds a Tool Delegation Protocol teaching AI clients how to invoke their native sub-agent (OpenCode `task()` / Claude Code Task tool / Cursor Explore / Copilot research-phase) for read-heavy capabilities (`repos.analyze --all`, `context.build`, `cdr.doc.generate`, `validate feature`) and native todo tools (TodoWrite / todowrite / Todo) for stage tracking. The cognitive skill gains a Phase 1.5 sub-agent delegation pattern for workspaces with ≥ 3 repos or any single repo > 1000 files. dapei itself does not grow a sub-agent scheduler or todo capability — clients use their native primitives, and main-agent context only ever holds structured summaries (≤ 1KB) returned by sub-agents. Tool Support Matrix documents per-client coverage.
