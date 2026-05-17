# dapei.skill

**AI Native Engineering Context OS** — 管理 Workspace 和 Feature 生命周期的 Agent Skill。

`dapei` 是一个遵循 [Agent Skills](https://agentskills.io) 开放标准的技能包，可以在 Claude Code、Cursor、Codex CLI、Gemini CLI 等任何兼容 Agent Skills 标准的 AI 编程工具中使用。

你不需要学习任何命令行工具。你只需要在 AI 对话中说 `@dapei`，Agent 会自动加载技能并按工程规范执行。

---

## 安装

`dapei.skill` 遵循 Agent Skills 标准，支持主流 AI 编程工具的原生安装方式。

### Claude Code

```bash
# 方式 1：从 GitHub 安装（推荐）
/install-skill https://github.com/ygwa/dapei-skill

# 方式 2：手动安装 — 将 skill 文件放入 Claude Code skills 目录
git clone https://github.com/ygwa/dapei-skill.git /tmp/dapei-skill
cp -r /tmp/dapei-skill/.agents/skills/dapei-skill ~/.claude/skills/dapei-skill
rm -rf /tmp/dapei-skill

# 安装后重启 Claude Code 会话，输入 /skills 验证
```

### Cursor

```bash
# 方式 1：通过 npx skills 安装
npx skills add ygwa/dapei-skill

# 方式 2：手动安装 — 将 skill 文件放入项目目录
git clone https://github.com/ygwa/dapei-skill.git /tmp/dapei-skill
mkdir -p .cursor/skills/dapei-skill
cp -r /tmp/dapei-skill/.agents/skills/dapei-skill/* .cursor/skills/dapei-skill/
rm -rf /tmp/dapei-skill

# 重新打开 Cursor 会话验证
```

### Codex CLI

```bash
# 从 GitHub 安装
$skill-installer install https://github.com/ygwa/dapei-skill/tree/main/.agents/skills/dapei-skill

# 或手动放置到 .agents/skills/ 目录
git clone https://github.com/ygwa/dapei-skill.git /tmp/dapei-skill
mkdir -p .agents/skills/dapei-skill
cp -r /tmp/dapei-skill/.agents/skills/dapei-skill/* .agents/skills/dapei-skill/
rm -rf /tmp/dapei-skill
```

### 项目级安装（团队共享）

如果希望团队所有成员自动获得 `dapei` 技能，可以将 Skill 文件直接提交到项目仓库中：

```bash
# 在项目根目录
mkdir -p .agents/skills/dapei-skill
# 从 dapei-skill 仓库复制 SKILL.md、scripts/、references/ 等到 .agents/skills/dapei-skill/
```

Agent Skills 标准定义了跨工具通用的 skill 查找路径：

| 工具 | 项目级路径 | 用户级路径 |
|------|-----------|-----------|
| Claude Code | `.claude/skills/<name>/` | `~/.claude/skills/<name>/` |
| Cursor | `.cursor/skills/<name>/` | `~/.cursor/skills/<name>/` |
| Codex CLI | `.agents/skills/<name>/` | 按用户配置 |
| 通用（Agent Skills 标准） | `.agents/skills/<name>/` | — |

> **说明**：安装后 Agent 在启动时只加载 skill 的 `name` 和 `description`（约 100 tokens）。当用户消息匹配到 skill 的描述时，Agent 才会动态加载完整的 `SKILL.md` 指令。这是 Agent Skills 标准的 Progressive Disclosure 机制，不会增加日常上下文负担。

---

## 快速开始

安装完成后，在你的 AI 编程工具中开始对话：

```text
@dapei 初始化当前项目 workspace
```

Agent 会：

1. 检查当前目录状态
2. 创建 `.dapei/`、`codebase/`、`docs/`、`features/` 等目录结构
3. 生成工程配置和 Agent 行为指引
4. 告诉你下一步该做什么

然后你可以继续：

```text
@dapei 把 mall-payment 和 mall-order 接入当前 workspace
```

```text
@dapei 创建 feature payment-refactor，目标是稳定支付回调，涉及 mall-payment,mall-order
```

```text
@dapei 推进 payment-refactor 到 solution-design，先做现状分析和 gap 分析
```

---

## 核心概念

### Workspace

Workspace 就是你的项目根目录。初始化后包含三个一级运行目录：

- **`codebase/`** — 托管的 Git 代码库
- **`docs/`** — 持久化的工程知识（业务、架构、标准、决策）
- **`features/`** — Feature 执行工作区

### Feature

Feature 是 `dapei` 的执行单元。每个 Feature 拥有隔离的工作空间：

```text
features/<feature>/
├── feature.yaml          # Feature manifest
├── agents.md             # Agent 行为指引
├── repos/                # 关联仓库（symlink / worktree）
├── docs/                 # 编号设计文档（01-现状 → 06-验收）
├── context/              # 上下文文件
├── memory/               # 决策、风险、时间线
├── tasks/                # 任务拆解
├── tests/                # 测试用例
└── reports/              # 日报、守护报告、架构审查
```

### Feature 生命周期

每个 Feature 按阶段推进，每个阶段有明确的输入和输出：

```text
analyze-current-state → gap-analysis → solution-design → task-breakdown → implementation → validation → acceptance
```

---

## 对话场景

### 初始化 Workspace

```text
@dapei 帮我初始化 dapei 的 workspace，并检查当前目录缺哪些基础结构。
```

### 接入代码库

```text
@dapei 把 mall-payment 和 mall-order 接入当前 dapei workspace。
如果本地没有就提示我补 Git 地址。
```

### 创建跨仓 Feature

```text
@dapei 创建一个 feature：payment-refactor，目标是稳定支付回调链路，涉及 mall-payment,mall-order。
创建后把我需要补充的上下文问题一次性列给我。
```

### 按阶段推进

```text
@dapei 从 analyze-current-state 开始推进 payment-refactor，
每完成一个阶段告诉我产出了哪些文档、还缺什么输入。
```

### 每日审查与报告

```text
@dapei 帮我 review 一下 payment-refactor 今天的变更，并更新日报。
重点告诉我：新增风险、架构漂移、阻塞项。
```

### 全局状态

```text
@dapei 汇总当前所有 feature 的状态，按风险和紧急程度排序。
```

### 高质量需求模板

在提需求时包含目标、范围、约束、验收、协作偏好这 5 类信息，可以显著提升 Agent 执行质量：

```text
@dapei 我们要做 payment-refactor。
目标：降低支付回调导致的订单状态不一致。
范围：mall-payment,mall-order；不改前端。
约束：不破坏现有接口兼容性，本周内可灰度。
验收：回调幂等、状态收敛时间<30s、补齐回归测试。
请你先做现状分析，再给我 gap 分析，阶段间先确认再继续。
```

---

## 确认卡点

建议在以下节点让 Agent 暂停确认后再继续：

| 节点 | 原因 |
|------|------|
| 进入 `solution-design` 前 | 方案决策影响实现方向 |
| 进入 `implementation` 前 | 代码变更不可轻易回退 |
| 发现高风险变更时 | 跨域依赖、数据模型、兼容性风险 |
| 进入 `acceptance` 前 | 验收标准决定交付质量 |

Agent 每次阶段回报统一包含：**结论 / 风险 / 待确认 / 下一步**。

---

## 当前项目状态

截至 2026-05-15，`dapei.skill` 已经从概念验证推进到可运行的 v0.1/v0.2 骨架。当前仓库里有三类内容：

- **Skill 入口**：`.agents/skills/dapei-skill/SKILL.md` 定义 `@dapei` 唤醒协议、核心意图和 Agent 行为约束。
- **确定性执行层**：`scripts/dapei` 负责 workspace 初始化、代码库注册、feature 创建、生命周期阶段校验、报告生成和状态查看。
- **设计与样例资产**：`DESIGN.md`、`docs/plans/*`、`.dapei/*`、`runtime/templates/*` 记录目标设计、生命周期 DAG、规则声明、文档模板和历史评审。

当前主线设计已经收敛为：用户当前目录就是 workspace root，运行期目录应是根级 `codebase/`、`docs/`、`features/`，不再默认创建嵌套的 `workspace/` 作为真实运行根。

## 已实现能力

| 能力 | 状态 | 说明 |
|------|------|------|
| Workspace 初始化 | 已实现 | 支持空目录、已符合结构目录、非符合目录拒绝初始化三种策略 |
| 代码库管理 | 已实现 | 支持 clone/register、sync、list，并写入 `.dapei/codebases.yaml` |
| Feature 创建 | 已实现 | 创建 `features/<feature>`、repo 映射、feature 分支、manifest、context、memory、tasks、reports 和编号设计文档 |
| 生命周期推进 | 部分实现 | 能校验阶段是否存在、检查前置阶段 marker、检查声明输出并写入完成 marker；尚不生成真实分析内容 |
| Feature 审查 | 部分实现 | 能生成提交摘要和 diff stat；尚未聚合测试、风险、架构漂移和任务进展 |
| 守护规则 | 初步实现 | `.dapei/rules/*.yaml` 已声明规则，但 `scripts/dapei-guardrail` 仍是少量硬编码检查 |
| 全局状态 | 已实现 | 能查看 feature 和 codebase 的基础状态 |
| `docs/agents.md` 生成 | 已实现 | 初始化 workspace 时生成基础 Agent 行为指引 |

## 整体 Review

当前实现和目标设计的主要差距不在目录结构，而在“结构是否真的会产出工程判断”。

| 设计预期 | 当前情况 | 差距 |
|------|------|------|
| Agent 用自然语言稳定调用完整工作流 | README 和 Skill 描述了自然语言入口，脚本仍依赖明确命令形态 | 缺少意图路由、中文别名、歧义澄清和命令映射层 |
| `docs/` 是可持续工程知识库 | 已有 glossary、decisions、workflows、plans，但业务/架构/标准骨架还不完整 | 缺少从 codebase 自动 bootstrap `docs/as-is`、`docs/architecture`、`docs/standards` 的流程 |
| Feature 创建时自动注入上下文 | 现在只生成 context 占位文件 | 缺少按阶段组装上下文包的 `context build` 能力、来源追踪和 token 预算 |
| 生命周期阶段能产出分析和设计 | 阶段校验和 marker 已有，编号文档模板已创建 | 缺少 repo 扫描、现状分析、gap 分析、方案综合、验收验证等真实执行逻辑 |
| Guardrail 可配置可演进 | 规则 YAML 已存在 | 缺少 YAML 规则解释器、severity、report/gate 模式和测试 |
| 本地验证支撑 acceptance | 生命周期里有 `local-validation` 阶段 | 缺少 repo 级 test/lint/build 命令注册、执行报告和失败阻断策略 |
| Feature 完成后反哺 workspace docs | 设计文档中已有 closed loop | 缺少 `archive feature` 或 closeout 命令，把决策、影响、约束写回 `docs/` |
| 多 feature 并行隔离 | 当前使用 codebase 工作树 + feature 分支 + feature repo symlink | 同一 repo 多 feature 并行会互相影响，后续应优先考虑 Git worktree |

还有一个需要刻意治理的历史遗留点：当前仓库里存在 `workspace/features/*` 样例，这可以作为开发 fixture 保留，但不应再被文档或新用户理解为目标运行结构。目标用户 workspace 仍应坚持根级 `features/`。

## 后续路线

| 优先级 | 能力 | 目标 |
|------|------|------|
| P0 | Context Builder | 增加 `dapei context build <feature> --stage <stage>`，把 `docs/`、repo 摘要、feature context 和任务输入组装成可审计上下文包 |
| P0 | Codebase → Docs Bootstrap | 扫描 `codebase/`，生成 repo inventory、技术现状、业务线索、架构证据和未知项 |
| P0 | Stage Runner | 让 analyze/gap/design/validation 阶段不只是检查文件，而是生成带证据的文档和报告 |
| P0 | Guardrail Engine | 解释 `.dapei/rules/*.yaml`，支持 report/gate、severity、证据和 remediation |
| P1 | Local Validation | 在 codebase registry 或 feature manifest 中注册 test/lint/build 命令，产出 validation/test report |
| P1 | Feature Closeout | 增加 feature archive/closeout，把 accepted design、decision、risk、impact 回写到 workspace docs |
| P1 | Git Worktree Isolation | 用 worktree 替代直接在 `codebase/<repo>` 切 feature 分支，支持多 feature 并行 |
| P2 | Reporting Automation | 聚合 commits、changed files、tasks、risks、decisions、tests、guardrails，形成真正可读的日报和审查报告 |
| P2 | Integrations | 在 local-first 前提下增加 GitHub/GitLab/CI/MCP/通知等可选 adapter |

## Skill 治理

随着 `dapei` 从单一 skill 变成一组工程工作流，需要把 skill 本身当成产品来治理：

1. **保持一个公共入口**：继续把 `@dapei` 作为用户心智入口，内部再按 intent 分派到 workspace、codebase、feature、context、guardrail、report、archive 等子流程。
2. **区分 prose 与 deterministic behavior**：`SKILL.md` 负责说明意图、边界和协作协议；可重复的状态变更必须落在 `scripts/`、schema、workflow YAML 或规则引擎里。
3. **为 skill 契约加版本**：`feature.yaml`、`.dapei/workspace.yaml`、workflow、rules、templates 都应有版本和迁移策略，避免样例、脚本、README 三处漂移。
4. **建立最小兼容测试集**：至少覆盖 init、create feature、run workflow、report、guardrail、status，以及旧 feature fixture 的迁移/兼容。
5. **治理上下文来源**：context pack 必须记录来源文件、层级、优先级、merge policy 和遗漏项，避免 Agent 在没有证据的情况下补故事。
6. **治理规则演进**：每条 guardrail 需要 rule id、目的、severity、检查类型、证据要求、修复建议和 report/gate 行为。
7. **治理样例资产**：`workspace/features/*` 这类 fixture 应明确标注为测试/示例，不参与目标 workspace contract 的宣传。

---

## 技术架构

```text
┌───────────────────────────────────────────────┐
│        用户层 (User Layer)                     │
│  @dapei <意图> — AI 对话是唯一入口              │
├───────────────────────────────────────────────┤
│        Skill 层 (Agent Skills Standard)        │
│  SKILL.md 意图识别 + Progressive Disclosure     │
├───────────────────────────────────────────────┤
│        编排层 (Orchestration)                   │
│  Agent 分析、设计、编码、总结                    │
├───────────────────────────────────────────────┤
│        执行层 (Deterministic Scripts)           │
│  scripts/dapei — 目录创建、分支管理、报告生成    │
├───────────────────────────────────────────────┤
│        上下文层 (Context System)                │
│  workspace.yaml 分层加载 → 运行时上下文          │
├───────────────────────────────────────────────┤
│        Workspace 层 (Workspace System)         │
│  codebase / docs / features 隔离与映射          │
└───────────────────────────────────────────────┘
```

**设计原则**：

- **Local-First** — 本地文件系统和 Git 是唯一数据源，不依赖任何 SaaS
- **对话优先** — 用户通过自然语言与 Agent 对话，而非手动执行脚本
- **脚本是内部执行层** — 可重复的状态变更由确定性命令完成，Agent 内部调用
- **跨工具通用** — 遵循 Agent Skills 标准，一次编写，在任何兼容工具中使用

---

## 兼容性

`dapei.skill` 遵循 [Agent Skills](https://agentskills.io) 开放标准，已验证或预期兼容的运行时：

| 工具 | 状态 |
|------|------|
| Claude Code | ✅ 已验证 |
| Cursor | ✅ 已验证 |
| Codex CLI | 🟡 预期兼容 |
| Gemini CLI | 🟡 预期兼容 |
| GitHub Copilot | 🟡 预期兼容 |
| Windsurf | 🟡 预期兼容 |

---

## 参考

| 文档 | 说明 |
|------|------|
| [DESIGN.md](DESIGN.md) | 技术设计说明 |
| [Target Design](docs/plans/2026-05-14-dapei-skill-target-design.md) | 目标设计与路线图 |
| `.dapei/workflows/feature-lifecycle.yaml` | Feature 生命周期定义 |
| `.dapei/commands.yaml` | 命令契约（供 Agent 内部使用） |
| `.agents/skills/dapei-skill/SKILL.md` | Skill 入口（Agent Skills 标准格式） |
| [Agent Skills 规范](https://agentskills.io/specification) | Agent Skills 开放标准 |

## 许可证

MIT
