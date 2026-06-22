---
name: dapei-cognitive
description: Use when analyzing code repository behavior, understanding entry points, or documenting system architecture. Triggers on "analyze", "behavior", "discover", "orient", "cognitive" intents.
---

# dapei.cognitive skill

Engineering Cognitive Runtime 行为认知工作流。**只提供流程方法，不提供具体实现指导。**

## 边界

| dapei 平台 | Agent |
|------------|-------|
| 目录脚手架、产物 schema、evidence 校验、索引 | 读代码、判断栈、选择入口策略、生成候选与事实 |
| 输出结构化 YAML 契约 | 理解「这个入口做什么」 |

**禁止**：平台用 grep/regex/语言特定关键字替 Agent 做语义理解。

**禁止绕过**：紧急情况（如生产故障）不是跳过 artifact 记录的理由。
- 快速定位调用点 + 立即创建 artifact 是同时进行的，不是先后的
- grep/search 找到位置后必须写入 `docs/as-is/behavior/<id>.yaml`
- "先快速解决，回头再补文档" = 违反此 skill

## 路由能力

| 意图 | Capability |
|------|------------|
| 准备 discover 工作区 | `cognitive.discover` |
| 校验认知产物 | `cognitive.artifact.validate` |
| 写入并索引 | `cognitive.artifact.upsert` |
| 列出已确认产物 | `cognitive.artifact.list` |
| state draft（可选） | `cognitive.state.suggest` |

---

## 工作流（方法，非实现）

### Phase 1 — Orient（定向）

**目标**：判断这是什么项目、用什么语言/框架。

**Agent 自行决定怎么做**，常见起点包括：

- 看目录结构（如 `tree`）
- 读栈 manifest（如 `package.json`、`pom.xml`、`go.mod`、`Gemfile` 等——按实际存在的文件来）

**产出**：对 repo 的栈与布局判断（写在分析报告或 `_candidates.yaml` 的备注中）。

`cognitive.discover` 仅提供 `directory_tree` + `manifest_files` 路径，**不**替 Agent 下结论。

### Phase 1.5 — Sub-agent 委派（多 repo 时）

**当 workspace 含 ≥ 3 个 repo 或单个 repo > 1000 文件时**，Phase 1-3 不应在主 agent context 内串行执行 —— 读代码量会把主 context 撑爆。正确做法：

1. **主 agent** 用 AI 客户端的 sub-agent 原语（OpenCode `task(subagent_type="explore", run_in_background=true)` / Claude Code `Task tool` / Cursor `Explore`）唤起一个**专门做"读代码 + 写候选"的 explore sub-agent**。
2. **Sub-agent** 在自己的 context 里跑 Phase 1-3 全部工作：
   - 读 `directory_tree` + `manifest_files`
   - 决定入口策略（HTTP/RPC/事件/定时）
   - 列出候选清单到 `docs/as-is/behavior/_candidates.yaml`
3. **Sub-agent 回主 agent 一份 ≤ 1KB 的结构化摘要**（不要回代码原文）：
   ```yaml
   repo: <name>
   language: <lang>
   candidates_count: <n>
   top_candidates:
     - id: <entry-id>
       file: <path>
       why: "<一句话描述它做什么>"
       evidence_quality: high|medium|low
   risks_to_confirm: [<risk-id>, ...]
   ```
4. **主 agent** 拿到摘要后逐个调 `cognitive.artifact.upsert` / `cdr.entries.propose` —— 这是 schema-validated 的小写入，留在主 context 是必要的。

**80 repo workspace 的特殊模式**：用一个 explore sub-agent 跑 `repos.analyze --all`，主 agent 只收汇总；如果其中有 ≥ 5 个 repo 触发 Phase 4（deep dive），**按 repo 分组 fan-out 到 N 个 parallel sub-agent**，每个负责一个 repo 的 Phase 4，主 agent 在收到所有 sub-agent 摘要后再统一生成 cross-repo 视图（domain.compose / capability.map.synth）。

**工具映射**：见 Router SKILL.md 的 `## Tool Delegation Protocol` 与 `## Tool Support Matrix`。本 skill 不重复定义工具调用约定，只声明 **Phase 1-3 / 80+ repo 场景必须走 sub-agent**。

### Phase 2 — Strategy（入口策略）

**目标**：决定如何在本栈中定位行为入口。

**由 Agent 根据 Phase 1 结论自行选择策略**——平台不 prescribe 关键字、注解名、目录约定。

行为入口类型（概念层，非搜索关键词）：

- HTTP/RPC 入口
- 消息消费 / 事件订阅
- 定时任务
- 其他触发系统状态变化的外部边界

### Phase 3 — Candidates（候选清单）

**目标**：列出待深析的行为入口。

1. Agent 按 Phase 2 策略阅读代码
2. 理解每个入口**做什么**（语义，非签名）
3. 写入 `docs/as-is/behavior/_candidates.yaml`

候选允许 `inference` / `unknown`；深析后再升为 `fact`。

### Phase 4 — Deep Dive（逐个深析）

对每个 candidate：

1. 沿调用链追踪（Agent 自行决定读哪些文件）
2. 回答：**谁 / 在什么条件下 / 修改什么状态 / 产生什么事件**
3. 写入 `docs/as-is/behavior/<id>.yaml`
4. `cognitive.artifact.upsert` 校验并更新 index
5. 必要时同步 `docs/as-is/state-machines/<entity>.yaml`

### Phase 5 — Report

输出 `Conclusion / Risk / Needs Confirmation / Next Steps`。

---

## 产物契约（schema，非实现指导）

以下字段是**落盘格式**，不是「怎么找代码」的教程。

**Candidate 示例**：

```yaml
candidates:
  - id: order-create-candidate
    repo: sample-app
    summary: "<Agent 用自然语言描述该入口做什么>"
    entry: { type: api, method: POST, path: /orders }
    confidence: { level: medium, kind: inference, evidence_type: code_reading }
    derived_from: [agent.discover]
    sources: [{ file: src/routes/orders.ts, line: 6 }]
```

**Behavior 示例**：

```yaml
id: order-create
repo: sample-app
entry: { type: api, method: POST, path: /orders }
writes: [{ table: orders, operation: insert }]
events: [order.created]
calls: [PaymentClient]
risks: [partial_failure]
confidence: { level: high, kind: fact, evidence_type: direct_code }
sources: [{ file: src/routes/orders.ts, line: 12 }]
```

Evidence 规则：`fact` → `sources[]`；`inference` → `derived_from[]`；`unknown` → `reason`。

---

## 用户入口

```
@dapei analyze behavior for sample-app — orient the repo, build candidates from code reading, then deep-dive the highest-risk entries
```

```
@dapei list behaviors for sample-app
```

---

## 常见错误

| 错误 | 后果 |
|------|------|
| 用 grep/regex 替代语义分析 | 丢失调用链上下文，无法理解行为 |
| "紧急情况先用 grep，回头补文档" | 文档永远不会补，历史记录丢失 |
| Phase 1-3 没做完直接跳 Phase 4 | 候选清单不完整，深析方向错误 |
| inference 直接当 fact 使用 | confidence 降级，证据链断裂 |

## 红线 — 禁止行为

- **禁止用 grep 作为主要分析手段**
- **禁止在紧急情况下跳过 artifact 创建**
- **禁止跳过 Phase 直接输出 Report**

---

## 与其他 skill 的协作

- **feature**：`analyze-current-state` 阶段产出 behavior / state-machine artifact,作为后续 `gap-analysis` 与 `solution-design` 的事实基础
- **repos**：`cognitive.discover` 依赖 `repos.add` 已注册的目标 repo,`directory_tree` / `manifest_files` 来自 repo 本地文件
- **validation**：当 `validation.run` 发现未覆盖行为时,触发 `cognitive.artifact.upsert` 补全 behavior 文档
- **workflow**：`context.build` 在 L3 阶段注入 cognitive 索引摘要到 `runtime-context.md`
- **workspace**：`workspace.init` 创建 `docs/as-is/behavior` 与 `docs/as-is/state-machines` 目录,cognitive artifact 落盘位置

## 工具调用

- Phase 1-3 在多 repo 场景必须用 AI 客户端的 sub-agent（详见 Phase 1.5）。
- 全局约定见 Router SKILL.md `## Tool Delegation Protocol`。
- dapei 不提供 todo capability —— 用 AI 客户端原生的 TodoWrite / todowrite / Todo 工具。
