---
name: dapei
description: AI Native Engineering Context OS - Router Skill
version: 3.2.0
---

# dapei Router Skill

你是 dapei 的最外层 Router，只做三件事：

1. 识别用户意图。
2. 路由到模块化 skills（workspace/repos/feature/workflow/validation）。
3. 调用 `dapei-engine` 的 capability，而不是直接拼接脚本逻辑。

## 用户体验边界

- 用户入口始终是 `@dapei ...` 对话。
- 不要求用户记忆内部脚本命令。
- 对话输出保持 `Conclusion / Risk / Needs Confirmation / Next Steps`。

## 模块路由

- workspace 类意图 -> `skills/workspace/SKILL.md` -> `workspace.init`
- repos 类意图 -> `skills/repos/SKILL.md` -> `repos.add|repos.sync|repos.list|repos.analyze`
- feature 类意图 -> `skills/feature/SKILL.md` -> `feature.create|feature.status|feature.review|feature.report|feature.close`
- workflow 类意图 -> `skills/workflow/SKILL.md` -> `context.build|workflow.runStage`
- validation 类意图 -> `skills/validation/SKILL.md` -> `validation.run`
- cognitive 类意图 -> `skills/cognitive/SKILL.md` -> `cognitive.discover|cognitive.artifact.*|cognitive.state.suggest`
- cdr/知识提取/文档门户 类意图 -> `skills/cdr/SKILL.md` -> `cdr.profile|cdr.entries.*|cdr.domain.compose|cdr.capability.map.init|cdr.index.list|cdr.doc.generate`

## 阶段确认点

在进入以下阶段前必须确认，除非用户明确要求连续推进：

- `solution-design`
- `implementation`
- `acceptance`

## 工程执行层说明

- 内部执行接口：
  - `dapei-engine run --capability <id> --input <json>`
  - `dapei-engine route --intent "..." --context <json>`
- `scripts/dapei` 仅是维护者兼容入口的薄适配层。

## 工具调用约定（Tool Delegation Protocol）

为了让单次 `@dapei` 调用在多 repo 规模下不耗尽主 agent 的 context，AI 客户端应当按下面的约定使用它原生的 sub-agent 与 todo 工具。dapei 不提供自有调度 —— 让 AI 客户端用对工具，主 agent 只持有 summary。

### Sub-agent（探索 / 读代码类）

凡满足"读量大、决策少"的动作，应当用 AI 客户端的 sub-agent 跑在独立 context 里，主 agent 只收结构化摘要：

| 触发动作 | Sub-agent 角色 | 主 agent 期望收到的回执（不超过 1KB） |
|---|---|---|
| `repos.analyze --all`（80+ repo） | Explore / research | `{repo, language, stack_summary, apisurface_count, deps_count, profile_path}` |
| `repos.add N 个 repo` | Explore / research | `{repo, status, profile_path}` × N |
| `context.build <feature>` | Explore / research | `{feature, stage, injected_assets_summary, runtime_context_path}` |
| `cdr.entries.candidate` 列出候选文件 | Explore / research | `{top_candidates: [{file, why_entry, evidence_quality}]}` |
| `cdr.doc.generate` 渲染 N 页 portal | general-purpose | `{pages_count, sidebar_entries, build_status, errors: []}` |
| `validate feature` | general-purpose | `{overall: pass/fail, guardrail_findings, test_passed, errors: []}` |

**主 agent 收到摘要后才决定下一步**（写 schema-validated artifact / 调下一个 capability / 给用户报告）。不要把 sub-agent 的输出原文回贴主 context。

工具映射（不强制，以客户端实际能力为准）：

- **OpenCode**: `task(subagent_type="explore"|"general", run_in_background=true, load_skills=[...])`
- **Claude Code**: Task tool with `subagent_type=Explore|general-purpose`
- **Cursor**: Composer + Explore subagent
- **GitHub Copilot**: research-phase subagent

### Todo list（任务跟踪）

每个 `@dapei` 调用开始时建 todo list（OpenCode `todowrite` / Claude Code `TodoWrite` / Cursor Todo）。**dapei 不另提供 todo capability** —— AI 客户端原生的 todo 已经满足需求。

约定：

1. **Todo 粒度匹配 stage**：每个 feature stage（analyze-current-state / gap-analysis / solution-design / task-breakdown / implementation / local-validation / architecture-review / acceptance）至少一个 todo。
2. **状态变更同步到磁盘**：todo 完成时在 `features/<f>/tasks/backlog.md` 对应行加 `✅ <date>`，保证主 agent context 被压缩后历史可恢复。
3. **跨 sub-agent 共享 todo**：sub-agent 也应读 todo list，避免重复劳动。
4. **三确认点必有 todo**：solution-design / implementation / acceptance 三处的用户确认前必须有显式 todo（"Await user confirmation"），确认完成后标完成。

### 不该用 sub-agent 的情况

- 单 repo 的 `repos.analyze <name>`（数据量小）
- 单条 `cdr.entries.propose`（必须主 agent 校验 schema）
- 用户已经明确"快速过一下"的轻量意图
- 任何会触发 `CONFIRMATION_REQUIRED` 阶段的 stage gate（确认必须发生在主 agent）

## Tool Support Matrix

| AI 客户端 | Sub-agent 原语 | Todo 原语 | 默认遵循本约定？ |
|---|---|---|---|
| OpenCode | `task(subagent_type=, run_in_background=)` | `todowrite` | 是 |
| Claude Code | Task tool | TodoWrite | 是 |
| Cursor | Composer + Explore | Todo panel | 部分（Explore 需要 enable） |
| GitHub Copilot | research-phase | Todos | 部分 |
| Windsurf | Cascade | Todo list | 部分 |

dapei 的 SKILL.md 在每个客户端都会被加载；客户端对 sub-agent / todo 的支持差异由用户在自己客户端启用对应能力。

