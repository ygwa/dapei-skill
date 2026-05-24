# dapei.workflow skill

负责 stage DAG 推进与 context build 生命周期。

## 边界

| dapei 平台 | Agent |
|------------|-------|
| stage 状态机、DAG 拓扑排序、context build 流程 | 理解 stage 目标、执行具体任务、填充 context |
| 输出结构化 stage 进度和 context bundle | 理解「这个 stage 需要什么 context」 |

**禁止**：平台替 Agent 做业务决策或写代码。

## 路由能力

| 意图 | Capability |
|------|------------|
| 运行单个 stage | `workflow.runStage` |
| 构建 context bundle | `context.build` |
| 查看 workflow 状态 | `workflow.status` |

---

## 工作流（方法，非实现）

### Stage DAG（阶段有向无环图）

**标准 stage 顺序**：

```
discover → design → implement → validate → close
```

每个 stage 依赖前一个 stage 完成：

```yaml
stages:
  - name: discover
    depends_on: []
    status: completed
  - name: design
    depends_on: [discover]
    status: in_progress
  - name: implement
    depends_on: [design]
    status: pending
  - name: validate
    depends_on: [implement]
    status: pending
  - name: close
    depends_on: [validate]
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
- `solution-design` 必须有用户确认
- `implement` 之前必须有 `discover` 和 `design`
- `validate` 之前必须有 `implement`
- `close` 之前必须有 `validate`

### context.build（构建上下文）

按 stage 加载层叠 context：

1. **L1: Workspace Context** — workspace 全局信息
   - workspace.yaml 元数据
   - repos 列表和状态

2. **L2: Feature Context** — feature 级别信息
   - feature.yaml
   - `context/memory/` 历史记录

3. **L3: Stage-specific Context** — 按 stage 特化
   - `discover`: cognitive.discover 输出
   - `design`: `docs/design/` 决策稿
   - `implement`: `docs/as-is/` 行为文档
   - `validate`: `reports/validation-report.md`

4. **L4: Runtime Context** — 运行时聚合
   - `context/runtime-context.md`（最终输出）

### Memory（记忆持久化）

每个 stage 完成后，记录：

```yaml
- stage: design
  completed_at: 2025-05-20T14:30:00Z
  duration: 2h 15m
  checkpoints:
    - "Reviewed repo structure"
    - "Identified 3 behavior entries"
    - "Designed state machine for Order"
  next_steps:
    - "Start implement stage"
    - "Focus on payment flow"
```

---

## 用户入口

```
@dapei run workflow my-feature --stage implement
```

```
@dapei context build my-feature --stage design
```

```
@dapei workflow status my-feature
```

---

## 与其他 skill 的协作

- **cognitive**：discover 阶段使用 cognitive skill 生成 behavior 文档
- **repos**：workflow 执行依赖 repos 的 worktree 状态
- **validation**：validate stage 使用 validation skill 执行测试
- **feature**：workflow 操作 feature.yaml 的 stage 状态