# AI SDLC Workflow (v0.1)

Source of truth: `/.dapei/workflows/feature-lifecycle.yaml`

Execution principle:

1. Stage input must be complete before starting.
2. Stage output must be written to feature workspace.
3. Each stage updates memory and progress report.
4. Guardrail findings are always attached to report output.
