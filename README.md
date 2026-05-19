# dapei.skill

**AI Native Engineering Context OS** — 面向真实工程需求交付的 Agent Skill。

`dapei` 不是给用户使用的一组命令行工具，而是一个让 AI Agent 使用的工程工作流技能。用户在 AI 对话里表达意图，Agent 加载 `dapei.skill` 后，按照 skill 协议读取上下文、调用本地脚本、维护文档和推进 Feature 生命周期。

一句话：**用户通过 `@dapei` 驱动工程流程；脚本是 Agent 的内部确定性执行层。**

---

## 用户如何使用

用户不需要记 `scripts/dapei` 命令。推荐使用方式是在支持 Agent Skills 的 AI 工具中安装/加载本 skill，然后直接对 Agent 说：

```text
@dapei 初始化当前项目 workspace
```

```text
@dapei 接入 mall-payment 和 mall-order 两个代码库，并分析当前技术现状
```

```text
@dapei 创建 feature payment-refactor。
目标：稳定支付回调链路，降低订单状态不一致风险。
范围：mall-payment,mall-order。
约束：不破坏现有接口兼容性，本周内可灰度。
验收：回调幂等、订单状态收敛时间小于 30 秒、补齐回归测试。
先做现状分析和 gap 分析，进入技术方案前暂停确认。
```

```text
@dapei review payment-refactor 今天的变更，重点看架构漂移、性能风险、测试缺口和 docs 是否需要回写
```

Agent 应该负责：

- 判断用户意图
- 读取 `.agents/skills/dapei-skill/SKILL.md`
- 读取 workspace 中的 `docs/`、`.dapei/`、`features/`
- 在需要改变本地状态时调用内部脚本
- 把执行结果用 `结论 / 风险 / 待确认 / 下一步` 回报给用户

---

## 当前阶段

当前项目处于 **v0.2 Platform Skeleton** 阶段。

已经具备：

- 根级 workspace 契约：`codebase/`、`docs/`、`features/`
- 模块化内部执行层：`scripts/dapei` + `scripts/commands/*`
- Workspace 初始化
- Codebase add / sync / list / analyze
- Feature 创建、repo 映射、feature 分支、manifest、上下文、文档、任务、测试、报告目录
- Feature lifecycle DAG
- Runtime context bundle 生成
- 基础 workflow stage 校验与完成 marker
- 基础 validation / review / report

仍在建设：

- Codebase 深度反向分析
- 按阶段生成高质量现状分析、Gap、业务方案、技术设计、测试方案
- YAML Guardrail 规则引擎
- Git worktree 隔离
- Feature closeout 反向维护 `docs/`
- 更稳定的中文/英文自然语言意图路由
- GitHub、CI、浏览器验证、知识库和通知等可选 adapter

详细路线图见：[docs/plans/2026-05-17-dapei-roadmap.md](docs/plans/2026-05-17-dapei-roadmap.md)。

---

## 核心工作流

dapei 希望支持的完整工程闭环是：

1. 初始化 workspace：创建 `docs`、`codebase`、`features` 和 `.dapei`。
2. 接入 codebase：注册或克隆产品代码库。
3. 反向分析 codebase：从代码生成当前业务、技术、架构、测试和约束知识。
4. 需求评估：结合需求、`docs/` 和相关 codebase 做现状分析、gap 分析、业务方案和技术设计。
5. 创建 Feature：在 `features/<feature>` 下创建隔离执行空间，映射相关 repo，生成 feature 分支。
6. 动态注入上下文：根据阶段生成 `context/runtime-context.md`。
7. 打磨方案并拆任务：形成可 review 的业务方案、技术方案和任务计划。
8. 实施方案：Agent 在 feature 关联 repo 中实施代码变更。
9. Review 和日报：聚合提交、diff、风险、架构漂移、测试状态和 docs 回写项。
10. 测试方案与验证：生成测试用例、mock/stub 策略，执行本地验证并生成报告。
11. 需求闭环：验收后把业务规则、架构影响、决策和约束回写到 `docs/`。

---

## Workspace 模型

Workspace 是产品或业务域的工程宇宙。初始化后目标结构是：

```text
<workspace-root>/
├── .dapei/        # dapei 配置、命令契约、workflow、rules
├── codebase/      # 托管或注册的产品代码库
├── docs/          # 持久化产品、业务、架构、标准、决策知识
├── features/      # 每个需求的隔离执行空间
└── runtime/       # 模板和 AI 运行规则
```

注意：目标运行结构是根级 `codebase/ docs/ features/`。不要再创建嵌套的 `workspace/` 运行根。历史样例如果存在，只能作为 fixture 或迁移参考。

---

## Docs 知识层

`docs/` 是长期知识层，不是一次性输出目录。

规划结构：

```text
docs/
├── as-is/              # 当前业务、技术、仓库现状
├── business/           # 业务规则、流程、场景
├── domain/             # 领域模型、实体、关系
├── architecture/       # 应用架构、技术架构、集成架构
├── standards/          # 编码、测试、架构、安全、性能约束
├── glossary/           # 术语表
├── decisions/          # ADR / 决策记录
├── feature-impact/     # 已完成 Feature 的影响沉淀
├── integrations/       # 外部系统和依赖
├── observability/      # 日志、指标、链路、告警
├── playbooks/          # 操作手册、发布、回滚、排障
└── specs/              # 需求、方案、接口、测试设计
```

核心循环：

```text
codebase/ 反向分析 → docs/ 持久知识 → features/ 执行需求 → 验收后回写 docs/
```

---

## Feature 执行空间

每个需求都应该进入一个独立的 Feature 工作区：

```text
features/<feature>/
├── feature.yaml
├── agents.md
├── repos/                 # 关联代码库，当前支持 symlink，未来支持 worktree
├── docs/
│   ├── 01-current-state.md
│   ├── 02-gap-analysis.md
│   ├── 03-business-design.md
│   ├── 04-technical-design.md
│   ├── 05-task-breakdown.md
│   └── 06-acceptance.md
├── context/
│   ├── runtime-context.md
│   ├── business-context.md
│   ├── architecture-context.md
│   ├── repo-context.md
│   └── constraints.md
├── memory/
│   ├── decision-log.md
│   ├── tradeoff.md
│   ├── risk.md
│   ├── open-questions.md
│   └── timeline.md
├── tasks/
├── tests/
├── reports/
└── artifacts/
```

生命周期：

```text
analyze-current-state
→ gap-analysis
→ solution-design
→ task-breakdown
→ implementation
→ local-validation
→ architecture-review
→ acceptance
```

在 `solution-design`、`implementation`、`acceptance` 前，Agent 默认应该停下来让用户确认。

---

## Agent 内部执行层

以下命令不是主要用户界面，而是 Agent 在执行 `@dapei` 意图时可调用的确定性工具。用户通常不需要直接运行它们。

```text
scripts/
├── dapei                     # 内部 CLI dispatcher
├── dapei-guardrail           # Guardrail report entrypoint
├── lib/
│   └── core.sh               # 共享路径、解析、模板、Git helper
└── commands/
    ├── workspace.sh          # init workspace
    ├── codebase.sh           # add/sync/list/analyze
    ├── feature.sh            # create feature and feature files
    ├── context.sh            # runtime context bundle
    ├── workflow.sh           # lifecycle stage runner
    ├── validation.sh         # local validation
    └── report.sh             # review/report/status
```

内部命令能力：

```bash
scripts/dapei init workspace
scripts/dapei codebase add <name> <git-url>
scripts/dapei codebase sync <name|--all>
scripts/dapei codebase list
scripts/dapei codebase analyze <name|--all>
scripts/dapei create feature <name> --repos repo1,repo2 --objective "..."
scripts/dapei context build <feature> --stage <stage>
scripts/dapei run workflow <feature> --stage <stage>
scripts/dapei validate feature <feature>
scripts/dapei review feature <feature>
scripts/dapei report feature <feature>
scripts/dapei status feature
```

文档中保留这些命令，是为了说明 Agent 的内部执行能力，以及方便 skill 开发者调试。对最终使用者，应优先呈现 `@dapei ...` 对话入口。

---

## 架构

```text
┌───────────────────────────────────────────────┐
│ User Layer                                    │
│ 用户通过 @dapei 表达工程意图                   │
├───────────────────────────────────────────────┤
│ Skill Layer                                   │
│ .agents/skills/dapei-skill/SKILL.md            │
│ 唤醒协议、行为约束、Agent 协作边界              │
├───────────────────────────────────────────────┤
│ Agent Orchestration Layer                     │
│ Agent 解释意图、读取上下文、选择阶段、回报结果   │
├───────────────────────────────────────────────┤
│ Deterministic Execution Layer                 │
│ scripts/dapei + scripts/commands/*.sh          │
│ 目录、Git、模板、上下文、报告、验证等状态变更    │
├───────────────────────────────────────────────┤
│ Context Layer                                 │
│ .dapei/workspace.yaml + context build          │
│ docs/codebase/feature/runtime 分层上下文        │
├───────────────────────────────────────────────┤
│ Governance Layer                              │
│ .dapei/rules/*.yaml + dapei-guardrail          │
│ 架构、命名、API、DDD、质量和风险约束             │
├───────────────────────────────────────────────┤
│ Workspace Layer                               │
│ codebase / docs / features / runtime           │
└───────────────────────────────────────────────┘
```

设计原则：

- **AI-first UX**：用户通过对话使用，不直接学习内部脚本。
- **Local-first**：本地文件系统和 Git 是核心事实来源。
- **Deterministic core**：可重复的状态变更由脚本执行，避免只靠 Agent 口头约定。
- **Evidence-first**：代码库反向分析必须区分证据、推断和未知。
- **Context-aware**：每个阶段都有可审计的 runtime context。
- **Feature-isolated**：需求以 Feature 为单位执行、记录、验证和沉淀。
- **Extensible**：分析器、验证器、报告器、规则和 adapter 都应该模块化演进。

---

## 安装与加载

目前 `dapei.skill` 不是一个已经发布到统一 marketplace 的包，也不假设存在通用的 `install skills` 命令。推荐把它当成一个可版本化的 Agent Skill 源码包：把 `.agents/skills/dapei-skill/` 放到目标 Agent 支持的 skill 或规则目录里，然后在对话中使用 `@dapei ...`。

### Claude Code

Claude Code 原生支持 `SKILL.md` 目录式 skills。可以按团队需要选择用户级或项目级加载：

```bash
git clone https://github.com/ygwa/dapei-skill.git /tmp/dapei-skill
mkdir -p ~/.claude/skills
cp -R /tmp/dapei-skill/.agents/skills/dapei-skill ~/.claude/skills/dapei-skill
```

项目级共享：

```bash
mkdir -p .claude/skills
cp -R /path/to/dapei-skill/.agents/skills/dapei-skill .claude/skills/dapei-skill
```

### Codex

Codex 支持通过 Skills 界面创建、管理和使用 `SKILL.md` 工作流；在本地/项目化场景中，也可以保留本仓库的通用 Agent Skills 布局：

```text
.agents/skills/dapei-skill/SKILL.md
```

如果你的 Codex 环境支持项目级 skills，直接把 `.agents/skills/dapei-skill/` 提交到项目中即可。否则通过 Codex 的 Skills 管理界面导入或创建同名 skill，并以本仓库的 `SKILL.md` 作为内容来源。

### Cursor

Cursor 当前主线是 Rules 和 `AGENTS.md`，不是 `.cursor/skills`。在 Cursor 中使用 dapei 时，建议把本仓库的协作约束转成项目规则：

```text
.cursor/rules/dapei-core.mdc
```

或者在项目根目录维护 `AGENTS.md`，说明用户入口是 `@dapei ...`，Agent 在需要确定性状态变更时调用内部脚本。

### 交付给用户的入口

无论运行在 Claude Code、Codex、Cursor 还是其它兼容 Agent Skills 的工具里，用户入口都应该保持一致：

```text
@dapei 初始化当前项目 workspace
```

脚本命令只作为 Agent 内部执行层、维护者调试或 CI/smoke test 使用。

---

## 未来规划

### P0：让当前平台完整可信

- 确保 `runtime/`、`scripts/commands/`、`scripts/lib/` 被提交。
- 增加 smoke test，覆盖 init、codebase analyze、create feature、context build、workflow、validate、report。
- 清理历史 `workspace/` fixture 的定位，明确它只是测试/样例。
- 确保 README 中的用户入口是 `@dapei`，脚本只作为内部执行层出现。

效果：fresh clone 后 skill 可安装、Agent 可调用、内部脚本路径完整。

### P1：Codebase → Docs Bootstrap

- 扫描技术栈、模块边界、API、DB、MQ、依赖、测试命令。
- 生成 repo inventory、业务现状、技术现状、应用架构、集成架构、技术栈。
- 所有结论标注 evidence / inference / unknown。

效果：需求评估前，AI 已经有当前系统基线。

### P1：Context Engineering V1

- 为 analysis、gap、design、implementation、validation、review、closeout 定义 context profile。
- 加上下文优先级：P0 必读、P1 重要、P2 可选、P3 历史参考。
- 记录每块上下文来源、层级、纳入原因和遗漏项。

效果：Agent 不再每次重新翻仓库，而是拿到阶段化上下文包。

### P1：真实的 Feature 规划和设计生成

- 生成现状分析、Gap、业务方案、技术设计、任务拆解、验收设计。
- 技术设计包含背景、目标、现状、方案、数据模型、API、DB、时序图、流程图、状态图、风险和 rollout。
- 进入 implementation 前形成可 review 的方案。

效果：AI 实施前先形成工程判断。

### P1：验证、测试方案和 Guardrail

- 从需求和技术方案生成测试计划。
- 支持 curl/API、browser、mock/stub、MQ/异步事件验证策略。
- 让 validation 消费测试计划并产出结构化结果。
- 把 `.dapei/rules/*.yaml` 变成真正可执行的 Guardrail Engine。

效果：验收可重复，Review 可约束。

### P2：并行 Feature 和闭环沉淀

- 支持 Git worktree 隔离。
- 提升日报和 Review 聚合质量。
- 增加 `feature close/archive`。
- 将业务规则、架构影响、API/DB 变更、决策和风险回写到 `docs/`。

效果：多个 Feature 可以并行执行，每完成一个需求，长期知识都会变厚。

### P3：自然语言路由和外部 Adapter

- 中文/英文意图映射。
- GitHub/GitLab/CI/Browser/知识库/通知等可选 adapter。
- 保持 local-first，外部系统只作为增强。

效果：用户只通过自然语言驱动完整生命周期。

---

## Skill 开发与验证

这些命令面向 skill 维护者，不是普通用户入口。

语法检查：

```bash
bash -n scripts/dapei
find scripts/commands scripts/lib -type f | sort | xargs -I{} bash -n {}
```

如果仓库中存在 `scripts/smoke-test.sh`，优先运行它：

```bash
scripts/smoke-test.sh
```

---

## 参考文档

| 文档 | 说明 |
| --- | --- |
| [agents.md](agents.md) | 本仓库 Agent 协作约束，说明用户入口和内部脚本边界 |
| [DESIGN.md](DESIGN.md) | 技术设计说明 |
| [docs/plans/2026-05-17-dapei-roadmap.md](docs/plans/2026-05-17-dapei-roadmap.md) | 当前路线图 |
| [docs/plans/2026-05-15-modular-refactor.md](docs/plans/2026-05-15-modular-refactor.md) | 模块化重构记录 |
| [.dapei/workflows/feature-lifecycle.yaml](.dapei/workflows/feature-lifecycle.yaml) | Feature 生命周期定义 |
| [.dapei/commands.yaml](.dapei/commands.yaml) | 命令契约 |
| [.agents/skills/dapei-skill/SKILL.md](.agents/skills/dapei-skill/SKILL.md) | Agent Skill 入口 |
| [Agent Skills Specification](https://agentskills.io/specification) | Agent Skills 开放标准 |
| [Claude Code Skills](https://code.claude.com/docs/en/skills) | Claude Code 的 skill 目录、`SKILL.md` 和加载机制 |
| [OpenAI Codex Plugins and Skills](https://openai.com/academy/codex-plugins-and-skills/) | Codex 中 plugins 与 skills 的产品边界 |
| [Cursor Rules](https://docs.cursor.com/en/context) | Cursor 的 Rules 与 `AGENTS.md` 机制 |

---

## License

MIT
