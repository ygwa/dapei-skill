# 01-current-state

> 当前状态分析 — desktop 端 M0 收尾、M1+M2 起步

## 仓库维度（dapei-skill /）

- 当前在 `main` 分支，最新 commit `3217af5`（fix(types): extend Index*Entry provenance fields + cast applyProvenance result）。
- `packages/core` / `packages/cdr` / `packages/doc-gen` / `packages/router` / `packages/runtime-adapters` 5 个包；`engine/dapei-engine.ts` 是 CLI 入口。
- 已 ship 到 v3.2.0（CHANGELOG 显示），CDR 已到 v0.8（reverse-cluster）。
- 已有 feature 工作流样本：`features/cdr-portal-aggregation/` 是最近的 feature workspace 范例。
- `docs/decisions/` 已有 6 份 ADR（modular monorepo / evidence-first / AI as scanner / two-dimension boundary / deterministic engine no LLM / treesitter default finding layer）。

## desktop/ 维度

| 状态 | 内容 |
|------|------|
| **已完成** | pnpm workspace（11 个包 + 1 个 app）拓扑、`electron-vite` 三段构建、IPC 通道形状、`SubprocessEngineClient` 真实接 engine、Preload 暴露 `window.dapei`、ACP transport 骨架、共享 UI 组件（`WorkspaceLayout` / `StageStepper` 等）、P0/P1/P2/P4/P5 框架页面（用 mock-data） |
| **未做** | 砍 mock、EngineClient 契约锁定、IPC router + Zod 校验、P0 真实 init/validate/recents、P2 真接 repos、P4 真接 feature.list、P5 Inspector 真实化、Agent-Share 真接 OpenCode、P3 Knowledge portal 内嵌、PluginHost 真实化 |
| **质量门** | `pnpm -r typecheck` 干净（11 包全绿） |

## 引擎与能力（`engine/dapei-engine.ts`）

实测可调用的 capability：

| capability | 状态 | 备注 |
|------------|------|------|
| `workspace.init` | ✅ 存在 | 触发 `init workspace` legacy |
| `repos.{add,sync,list,check,analyze}` | ✅ 存在 | 5 个 |
| `feature.{create,review,report,close,status}` | ✅ 存在 | 5 个 |
| `cognitive.{discover,artifact.list,artifact.validate,artifact.upsert,state.suggest}` | ✅ 存在 | 5 个 |
| `context.build` | ✅ 存在 | |
| `workflow.runStage` | ✅ 存在 | 接受 `confirmed` |
| `validation.run` | ✅ 存在 | |
| `workspace.{status,validate,report}` | ⚠️ 待 grep 确认 | M1-1 第一步 |
| `feature.list` | ⚠️ 待 grep 确认 | M1-1 第一步 |
| `repos.profile` | ⚠️ 待 grep 确认 | M1-1 第一步 |

**契约**：
- 入口：`node --experimental-strip-types engine/dapei-engine.ts run --capability <id> --input '<json>'`
- 输入：capability + input JSON
- 输出 stdout：JSON 文本或纯文本
- 工作空间根：`DAPEI_WORKSPACE_ROOT` 环境变量（默认 `cwd`）
- 退出码：非 0 = 错误

## 差距分析（Gaps）

| Gap | 影响 | 落在 M |
|-----|------|--------|
| 缺 `EngineClient` 契约锁定（`WorkspaceContext` 形状未定） | main 透传不清 | M1-1 |
| IPC 通道形状未定，Zod 校验缺 | handler 易写错 | M1-2 |
| 启动层 `listRecents` / `open` / `init` / `pickDirectory` 全部 mock | P0 不能真用 | M1-3 |
| P1 / P2 / P4 读 mock | 三页是演示 | M1-4 |
| P5 框架存在但无真 stage / 无真 inspector | 核心页是空壳 | M1-5 |
| Agent-Share `createAgentHostStub`，ACP 没真接 | Agent 维度空 | M1-6 |
| 缺 P3 Knowledge 真页 | portal 不能用 | M2-1 |
| Inspector 缺 EvidenceCard / ToolCallCard | 证据链是空 | M2-2 |
| PluginHost 没真实现 | 扩展点空 | M2-3 |
| 维度规则只在 UI 徽章，缺强制拦截 | 安全边界薄 | M1-5 |
| 缺 CI 友好的 Electron e2e | 不可回归 | 风险表已标注 |

## 决策未定项（v0.1 plan 内已决策）

详见 `.omo/plans/desktop-m1-m2.md` §0：
- 发版形态：暂不发版，仓库内 dev
- M1-6 节奏：一次到位
- capability 缺失退路：缺失则补，不破坏
