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

## 已实现能力

| 能力 | 状态 | 说明 |
|------|------|------|
| Workspace 初始化 | ✅ 已实现 | 空目录 / conforming / non-conforming 三种策略 |
| 代码库管理 | ✅ 已实现 | 克隆、同步、列表、元数据注册 |
| Feature 创建 | ✅ 已实现 | 隔离工作区、分支映射、文档模板 |
| 生命周期推进 | ✅ 已实现 | DAG 阶段校验、完成标记 |
| Feature 审查 | ✅ 已实现 | 提交汇总、增量 review、日报 |
| 守护规则 | ✅ 已实现 | 基础报告模式（分层、DDD、API、命名） |
| 全局状态 | ✅ 已实现 | Feature 和 Codebase 状态概览 |
| `docs/agents.md` 生成 | ✅ 已实现 | Workspace 级 Agent 行为指引 |

## 规划中能力

| 能力 | 优先级 | 说明 |
|------|--------|------|
| Context Builder | 🔴 高 | 按阶段从 docs 组装 feature 上下文包 |
| Codebase → Docs Bootstrap | 🔴 高 | 分析代码库自动生成 `docs/as-is/` |
| 代码分析引擎 | 🔴 高 | 扫描仓库生成带证据的现状和 Gap 文档 |
| YAML 规则引擎 | 🔴 高 | 替代硬编码守护检查 |
| 验证与测试执行 | 🔴 高 | 仓库级 lint / test / build |
| Feature → Docs 回写 | 🟡 中 | 验收后将设计和决策沉淀回 `docs/` |
| Git Worktree 隔离 | 🟡 中 | 多 Feature 并行时仓库隔离 |
| 报告聚合与自动化 | 🟡 中 | 深度报告和定时日报 |
| 集成适配器 | 🟢 低 | GitHub / GitLab / CI / 通知 / MCP |

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
