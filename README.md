# dapei.skill

`dapei.skill` 是一个面向 AI 协作开发的 Context OS。

它的核心不是让你手写脚本命令，而是让你通过自然语言和 AI 对话，把一个 Feature 从“需求”推进到“交付与沉淀”。

## 先说清楚：你和谁交互

在这个项目里，推荐交互方式是：

- 你和 AI 对话
- AI 按你的意图调用 `dapei` 脚本和工程约束
- AI 回写 Feature 文档、上下文、任务、报告

也就是说：脚本是 AI 的执行工具，不是主要的人机入口。

## 对话入口（Wake-up Protocol）

为了让 AI 稳定进入 dapei 工作模式，建议统一使用唤醒前缀：

- `@dapei <你的意图>`

示例：

```text
@dapei 初始化当前项目 workspace
@dapei 接入 mall-payment 和 mall-order 两个仓库
@dapei 创建 feature payment-refactor，目标是稳定支付回调
@dapei 推进 payment-refactor 到 gap-analysis
@dapei review payment-refactor 并生成日报
```

推荐约定：

- 一条消息只表达一个主意图（创建 / 推进 / 审查 / 报告）。
- 带上 feature 名称，避免 AI 误判上下文。
- 涉及高风险改动时，明确要求“先方案后实现”。

## 已实现能力（从用户视角）

当前已经实现并可用于日常协作的能力：

1. 用对话拉起 Workspace 和代码库管理
- 你告诉 AI 想接入哪些仓库。
- AI 可以初始化 workspace、登记 codebase、同步仓库状态。

2. 用对话创建 Feature 工作区
- 你告诉 AI Feature 名称、目标、涉及仓库。
- AI 会创建隔离工作区、映射 repos、准备分支和文档骨架。

3. 用对话推进生命周期阶段
- 你可以让 AI 执行“现状分析/Gap 分析/方案设计/任务拆解”等阶段。
- AI 会校验阶段依赖，输出阶段记录和完成标记。

4. 用对话做进展审查和报告
- 你可以让 AI 做 feature review（提交与变更摘要）。
- 你可以让 AI 生成日报和架构审查报告。

5. 用对话获取全局态势
- 你可以随时问 AI：当前有哪些 Feature 在推进、每个 Feature 的分支和状态是什么。

## 你应该怎么和 AI 说

下面这些是可以直接复制给 AI 的表达方式。

### 场景 1：初始化一个新项目协作空间

可直接对 AI 说：

```text
@dapei 帮我初始化 dapei 的 workspace，并检查当前目录缺哪些基础结构。
```

补充信息建议：

- 项目名称
- 默认分支（如 `main`）
- 语言/框架（用于后续上下文理解）

### 场景 2：接入已有代码库

可直接对 AI 说：

```text
@dapei 把 mall-payment 和 mall-order 接入当前 dapei workspace。
如果本地没有就提示我补 Git 地址。
```

补充信息建议：

- 仓库名称
- Git URL
- 是否需要立即同步到最新远端

### 场景 3：创建一个跨仓 Feature

可直接对 AI 说：

```text
@dapei 创建一个 feature：payment-refactor，目标是稳定支付回调链路，涉及 mall-payment,mall-order。
创建后把我需要补充的上下文问题一次性列给我。
```

补充信息建议：

- feature 名称（建议 kebab-case）
- 业务目标（尽量具体）
- 涉及仓库
- 成功标准（验收口径）

### 场景 4：让 AI 按阶段推进，而不是一次性“写完”

可直接对 AI 说：

```text
@dapei 从 analyze-current-state 开始推进 payment-refactor，
每完成一个阶段告诉我产出了哪些文档、还缺什么输入。
```

你也可以继续说：

```text
@dapei 继续到 gap-analysis。
```

```text
@dapei 继续到 solution-design。
```

推荐做法：

- 每个阶段结束后，让 AI 先给你“结论+风险+待确认项”
- 你确认后再进入下一阶段

### 场景 5：做每日同步与风险复盘

可直接对 AI 说：

```text
@dapei 帮我 review 一下 payment-refactor 今天的变更，并更新日报。
重点告诉我：新增风险、架构漂移、阻塞项。
```

推荐让 AI 固定输出：

- 今天做了什么
- 风险变化
- 未决问题
- 明天计划

### 场景 6：快速看全局推进状态

可直接对 AI 说：

```text
@dapei 汇总当前所有 feature 的状态，按风险和紧急程度排序。
```

适用人群：

- TL/架构师做全局排期
- PM 做跨团队同步

## 高质量对话模板

为了让 AI 执行更稳，推荐你在提需求时包含这 5 类信息：

1. 目标
- 你希望最终改变什么

2. 范围
- 涉及哪些仓库/模块
- 明确哪些不在本次范围

3. 约束
- 架构边界、兼容性、上线窗口、安全要求

4. 验收
- 你如何判断“完成”

5. 协作偏好
- 你希望 AI 一次做完，还是分阶段回报

一个完整示例：

```text
@dapei 我们要做 payment-refactor。
目标：降低支付回调导致的订单状态不一致。
范围：mall-payment,mall-order；不改前端。
约束：不破坏现有接口兼容性，本周内可灰度。
验收：回调幂等、状态收敛时间<30s、补齐回归测试。
请你先做现状分析，再给我 gap 分析，阶段间先确认再继续。
```

## 什么时候该让 AI “停一下先确认”

建议在这些节点让 AI 暂停并确认：

- 进入 `solution-design` 前
- 进入 `implementation` 前
- 发现高风险变更（跨域依赖、数据模型变更、兼容性风险）时
- 进入 `acceptance` 前

可直接说：

```text
@dapei 先暂停，给我一个决策清单：每个选项的收益、风险、回滚成本。
```

## 使用体验优化建议（下一步）

从用户体验角度，建议优先做这 5 件事：

1. 固化唤醒词与意图识别
- 统一入口 `@dapei`，并支持“创建/推进/审查/报告/状态”常见表达。

2. 增加对话确认卡点
- 在 `solution-design`、`implementation`、`acceptance` 前，AI 自动进入“先确认后执行”模式。

3. 提供角色化提示词模板
- PM 模板、TL 模板、开发模板，减少每次从零描述成本。

4. 增加“最小输入提示”
- 当用户信息不足时，AI 只追问 3 个关键字段：目标、范围、验收。

5. 输出统一摘要格式
- 每次阶段回报统一输出：`结论 / 风险 / 待确认 / 下一步`。

## 当前版本边界（避免误解）

当前版本已经能跑通基本流程，但还不是最终形态。请把它当作可执行骨架：

- guardrail 目前是基础报告模式，不是完整规则引擎。
- 报告能力目前以骨架和结构化记录为主，不是完全自动洞察。
- `context build` 等高级上下文打包能力还在后续规划。

## 参考

- 设计说明：`DESIGN.md`
- 生命周期定义：`.dapei/workflows/feature-lifecycle.yaml`
- 命令契约：`.dapei/commands.yaml`
- 实现审查：`docs/plans/2026-05-14-current-implementation-review.md`
