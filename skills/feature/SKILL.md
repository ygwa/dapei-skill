---
name: dapei-feature
description: Use when managing feature lifecycle, creating features, or checking feature status. Triggers on "feature", "create feature", "feature status", "close feature" intents.
---

# dapei.feature skill

负责 feature 的 create/status/review/report/close 生命周期管理。

## 边界

| dapei 平台 | Agent |
|------------|-------|
| 目录脚手架、feature.yaml schema、状态机校验 | 理解 feature 目标、写 agents.md、做技术决策 |
| 输出结构化 feature.yaml | 理解「这个 feature 要做什么」 |

**禁止**：平台用硬编码模板替 Agent 做架构设计。

**确认点约束**：阶段确认点（solution-design / implementation / acceptance）不能被 Agent 自行跳过。
- 确认点必须由用户明确确认，或用户在请求中明确要求连续推进
- "轻量确认"、"快速过一下"、"用户没时间" 不能替代正式确认与产物记录

## 路由能力

| 意图 | Capability |
|------|------------|
| 创建新 feature | `feature.create` |
| 查看 feature 状态 | `feature.status` |
| 获取/设置当前 stage | `feature.stage` |
| 管理 backlog 任务 | `feature.tasks` |
| 生成每日 review | `feature.review` |
| 报告 feature 进展 | `feature.report` |
| 执行 guardrail 检查 | `feature.guardrail` |
| 关闭 feature | `feature.close` |

---

## 工作流（方法，非实现）

### Create（创建）

1. 验证 feature name 符合命名规范（`[a-z0-9-]+`）
2. 创建 `features/<name>/` 目录结构
3. 初始化 `feature.yaml` 元数据
4. 初始化 `context/runtime-context.md`
5. 创建 `docs/` 目录骨架
6. 可选：初始化 `agents.md` 协作提示

**feature.yaml 示例**：
```yaml
name: payment-refactor
status: active
owner: alice
repos: [payment-service, billing-core]
objective: "重构支付链路，拆分账务与支付职责"
created: 2025-05-20
stages:
  - name: analyze-current-state
    status: completed
  - name: gap-analysis
    status: in_progress
  - name: solution-design
    status: pending
  - name: task-breakdown
    status: pending
  - name: implementation
    status: pending
  - name: local-validation
    status: pending
  - name: architecture-review
    status: pending
  - name: acceptance
    status: pending
```

### Status（状态查看）

读取 `feature.yaml`，输出：
- 当前 stage 和进度
- 各 repo 关联的 worktree 状态
- 待处理项摘要

### Report（报告生成）

1. 收集 `docs/` 下所有变更
2. 读取 `context/memory/` 历史记录
3. 执行 guardrail 检查
4. 生成 `reports/daily-report.md` 和 `reports/architecture-review.md`

### Guardrail（质量门禁）

运行以下检查：
- `context/runtime-context.md` 是否存在且非空
- `docs/as-is/` 下是否有行为文档
- feature.yaml 是否符合 schema
- 是否存在未解决的 risk 项

### Close（关闭）

1. 验证所有 stage 已完成
2. 生成决策日志 `docs/decisions/<feature>-decisions.md`
3. 生成影响文档 `docs/feature-impact/<feature>.md`
4. 更新 `feature.yaml` 状态为 `closed`
5. 归档 worktree（可选）

---

## 用户入口

```
@dapei create feature payment-refactor --repos payment-service,billing-core --objective "重构支付链路" --owner alice
```

```
@dapei status feature payment-refactor
```

```
@dapei report feature payment-refactor
```

```
@dapei close feature payment-refactor
```

---

## 与其他 skill 的协作

- **repos**：feature 依赖的 repo 映射到 worktree
- **cognitive**：analyze-current-state 阶段产出 as-is 文档
- **validation**：validate feature 触发测试发现与执行
- **workspace**：feature 创建于 workspace 根目录下

---

## 常见错误

| 错误 | 后果 |
|------|------|
| "用户说跳过确认点" | 需要显式确认或连续推进意图，不能把沉默当确认 |
| "快速过一下就行" | 确认点要么完成要么不完成，没有"快速版" |
| "用户没时间，等会儿补" | 确认点不能延迟，历史记录会不完整 |
| 跳阶段推进 | 违反 workflow DAG 约束 |

## 红线 — 禁止行为

- **禁止 Agent 自行跳过或弱化确认点**
- **禁止在未完成前置 stage 的情况下关闭 feature**
- **禁止用"用户要求"作为跳流程的理由**

## Rationalization 堵口

| 借口 | 反驳 |
|------|------|
| "用户说跳过" | 用户可以明确确认推进，但不能省略必要产物和 stage 记录 |
| "快速过一下就行" | 确认点没有"快速版"，完成就是完成 |
| "用户没时间，等演示完再补" | 确认点不能延迟，演示不能替代正式确认 |
| "反正代码都写完了，确认只是形式" | 代码写完 ≠ 通过确认，确认是独立的 gate |
