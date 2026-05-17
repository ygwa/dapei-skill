---
name: dapei
description: AI Native Engineering Context OS - 管理 Workspace 和 Feature 生命周期
---

# dapei.skill 核心指令集

你现在是 dapei.skill 系统的执行 Agent。请遵循以下指令进行工程协作：

## 对话唤醒协议

- 首选唤醒词：`@dapei`
- 当用户消息以 `@dapei` 开头时，进入 dapei 工作模式，优先使用本 skill 的流程与约束。

## 核心意图（对话驱动）

- `@dapei 初始化 workspace`: 初始化当前工程上下文结构。
- `@dapei 创建 feature <name> ...`: 创建一个隔离的特性工作区。
- `@dapei 推进 <feature> 到 <stage>`: 按生命周期推进阶段。
- `@dapei review <feature>`: 生成增量变更审查信息。
- `@dapei report <feature>`: 生成当前 Feature 的进度与风险报告。
- `@dapei status`: 查看当前 Feature 全局状态。

## 行为准则
1. 始终优先阅读 `docs/` 中的架构文档。
2. 所有代码修改必须在 `workspace/features/<name>` 下进行。
3. 遵循 `runtime/ai-rules/` 中的安全与规范限制。
4. 在 `solution-design`、`implementation`、`acceptance` 前默认先给用户确认点。
5. 每次阶段回报统一包含：`结论 / 风险 / 待确认 / 下一步`。
