---
name: dapei-workflow
description: Use when running workflow stages, managing feature stage progression, or building context bundles. Triggers on "workflow", "stage", "runStage", "context.build" intents.
---

# dapei.workflow skill

负责 stage DAG 推进与 context build 生命周期。

## 边界

| dapei 平台 | Agent |
|------------|-------|
| stage 状态机、DAG 拓扑排序、context build 流程 | 理解 stage 目标、执行具体任务、填充 context |
| 输出结构化 stage 进度和 context bundle | 理解「这个 stage 需要什么 context」 |

**禁止**：平台替 Agent 做业务决策或写代码。

**强制约束**：stage 顺序是 MANDATORY，不是建议。
- analyze-current-state → gap-analysis → solution-design → task-breakdown → implementation → local-validation → architecture-review → acceptance 的依赖是铁律
- "折中方案"、"快速确认"、"部分完成" 都等于违反 DAG
- 任何跳阶段的行为都需要正式的回滚流程，不是"这次例外"

## 路由能力

| 意图 | Capability |
|------|------------|
| 运行单个 stage | `workflow.runStage` |
| 查看 workflow 状态 | `workflow.status` |
| 构建 context bundle | `context.build` |

---

## 工作流（方法，非实现）

### Stage DAG（阶段有向无环图）

**标准 stage 顺序**：

```
analyze-current-state → gap-analysis → solution-design → task-breakdown → implementation → local-validation → architecture-review → acceptance
```

每个 stage 依赖前一个 stage 完成：

```yaml
stages:
  - name: analyze-current-state
    depends_on: []
    status: completed
  - name: gap-analysis
    depends_on: [analyze-current-state]
    status: in_progress
  - name: solution-design
    depends_on: [gap-analysis]
    status: pending
  - name: task-breakdown
    depends_on: [solution-design]
    status: pending
  - name: implementation
    depends_on: [task-breakdown]
    status: pending
  - name: local-validation
    depends_on: [implementation]
    status: pending
  - name: architecture-review
    depends_on: [local-validation]
    status: pending
  - name: acceptance
    depends_on: [architecture-review]
    status: pending
```

### runStage（执行阶段）

1. 验证依赖 stage 已完成
2. 检查 feature 状态允许此 stage 执行
3. 按 DAG 顺序执行 stage checklist
4. 更新 feature.yaml 中 stage 状态
5. 持久化 memory 到 `context/memory/`
6. 更新 progress report

**runStage 校验规则**：
- `solution-design` / `implementation` / `acceptance` 必须有用户确认
- `implementation` 之前必须完成 `task-breakdown`
- `local-validation` 之前必须完成 `implementation`
- `acceptance` 之前必须完成 `architecture-review`

### context.build（构建上下文）

按 stage 加载层叠 context：

1. **L1: Workspace Context** — workspace 全局信息
   - workspace.yaml 元数据
   - repos 列表和状态

2. **L2: Feature Context** — feature 级别信息
   - feature.yaml
   - `context/memory/` 历史记录

3. **L3: Stage-specific Context** — 按 stage 特化
   - `analyze-current-state`: cognitive.discover 输出与 as-is 证据
   - `solution-design`: `docs/03-business-design.md` 和 `docs/04-technical-design.md`
   - `implementation`: `docs/05-task-breakdown.md` 与 repo worktree
   - `local-validation`: `reports/validation-report.md`

4. **L4: Runtime Context** — 运行时聚合
   - `context/runtime-context.md`（最终输出）

### Memory（记忆持久化）

每个 stage 完成后，记录：

```yaml
- stage: solution-design
  completed_at: 2025-05-20T14:30:00Z
  duration: 2h 15m
  checkpoints:
    - "Reviewed repo structure"
    - "Identified 3 behavior entries"
    - "Designed state machine for Order"
  next_steps:
    - "Start implementation stage"
    - "Focus on payment flow"
```

---

## 用户入口

```
@dapei run workflow my-feature --stage implementation
```

```
@dapei context build my-feature --stage solution-design
```

```
@dapei workflow status my-feature
```

---

## 常见错误

| 错误 | 后果 |
|------|------|
| "用户说跳过就跳过" | 违反 DAG 约束，context 丢失上游信息 |
| "之前做过了，直接标记完成" | 实际没走确认流程，artifact 不完整 |
| "折中方案：只做轻量确认" | 确认点不能协商，轻量确认 ≠ 完成 |
| implementation → analyze-current-state → solution-design 回跳 | DAG 只允许向前推进，不允许回跳 |

## 红线 — 禁止行为

- **禁止跳阶段或"部分完成"阶段**
- **禁止用用户要求作为跳阶段的理由**
- **禁止"折中"确认点** — 确认点要么完成要么不完成
- **禁止在未完成前置 stage 的情况下运行后续 stage**

## Rationalization 堵口

| 借口 | 反驳 |
|------|------|
| "用户说跳过" | 用户无权覆盖 DAG 约束，这由平台强制 |
| "已经做过类似的" | 没走正式流程就不能标记完成 |
| "折中方案够好了" | "够好"等于违反 MANDATORY 约束 |
| "时间紧，先上线再说" | 时间压力不能作为跳流程的理由 |

---

## 与其他 skill 的协作

- **cognitive**：analyze-current-state 阶段使用 cognitive skill 生成 behavior 文档
- **repos**：workflow 执行依赖 repos 的 worktree 状态
- **validation**：validate stage 使用 validation skill 执行测试
- **feature**：workflow 操作 feature.yaml 的 stage 状态
