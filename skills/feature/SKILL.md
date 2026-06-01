# dapei.feature skill

负责 feature 的 create/status/review/report/close 生命周期管理。

## 边界

| dapei 平台 | Agent |
|------------|-------|
| 目录脚手架、feature.yaml schema、状态机校验 | 理解 feature 目标、写 agents.md、做技术决策 |
| 输出结构化 feature.yaml | 理解「这个 feature 要做什么」 |

**禁止**：平台用硬编码模板替 Agent 做架构设计。

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
  - name: discover
    status: completed
  - name: design
    status: in_progress
  - name: implement
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
- **cognitive**：discover 阶段产出 as-is 文档
- **validation**：validate feature 触发测试发现与执行
- **workspace**：feature 创建于 workspace 根目录下