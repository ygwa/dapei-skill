# 大培桌面端 — UI 与交互设计

> 状态：草案 v0.1  
> 关联：[architecture.md](./architecture.md) · 原型：[ui.tsx](./ui.tsx)

---

## 1. 产品定位

**大培桌面 = 工作空间启动器 + 产品认知浏览器 + Feature 执行指挥台**

深度编码仍由底层 OpenCode / Claude Code 驱动；GUI 负责空间、状态、确认与可视化。

| 层 | 职责 | 不做 |
|----|------|------|
| 桌面壳 | 工作空间 CRUD、Repo 维护、知识门户、Feature 阶段与确认 | 自研 LLM、深度多文件编辑 |
| Terminal / Agent | `@dapei` 对话、读码、sub-agent | — |
| dapei-engine | 确定性 capability | UI、PTY |

---

## 2. 全局页面结构

采用 **「启动层」+「工作空间壳层」** 两层，共 **8 个主视图**：

```
┌─────────────────────────────────────────────────────────┐
│  Layer 0 — 启动层（无 workspace 选中时）                  │
│    P0  工作空间选择 / 创建 / 初始化                        │
└─────────────────────────────────────────────────────────┘
                          │ 选中 workspace
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 1 — 工作空间壳（持久侧边栏 + 主内容区）             │
│    P1  概览（Dashboard）                                  │
│    P2  代码库（Repos）                                    │
│    P3  产品知识（Knowledge）                              │
│    P4  Feature 列表                                       │
│    P5  Feature 详情（含 Agent 指挥台）  ← 核心复杂页       │
│    P6  分析流水线（CDR Pipeline，可 V1 再开）                │
│    P7  设置                                              │
└─────────────────────────────────────────────────────────┘
```

复杂度集中在 **P5**；P6 可后置。

---

## 3. Layer 0：P0 工作空间选择 / 初始化

### 3.1 目标

让用户在约 30 秒内获得合规的 dapei workspace，并理解「知识会沉淀在哪些目录」。

### 3.2 布局示意

```
┌──────────────────────────────────────────────────┐
│  [Logo] 大培                          [设置] [?] │
├──────────────────────────────────────────────────┤
│   最近工作空间                                     │
│   ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│   │ mall-core  │ │ payment    │ │ + 打开…    │   │
│   │ 3 repos    │ │ 1 feature  │ │            │   │
│   │ 昨天       │ │ 2h 前      │ │            │   │
│   └────────────┘ └────────────┘ └────────────┘   │
│   [ 选择已有目录 ]    [ 新建工作空间 ]              │
└──────────────────────────────────────────────────┘
```

### 3.3 交互流程

**路径 A — 新建**

1. 选择父目录 + 输入 workspace 名称
2. 向导 Step 1：基本信息（名称、locale、default_branch）
3. 向导 Step 2：目录预览

```
./
├── .dapei/          ← 规则、schema、认知索引
├── repos/           ← 产品代码库基座池
├── docs/            ← 沉淀的产品知识
└── features/        ← 需求执行隔离区
```

4. 调用 `workspace.init` → 成功进入 P1
5. 可选 Step 3：立即添加第一个 repo（跳转 P2）

**路径 B — 打开已有**

1. 系统文件夹选择器
2. 调用 `workspace.validate`
3. 不合规 → 展示 errors +「修复缺失结构」或「另选目录」
4. 合规 → 写入「最近列表」→ 进入 P1

### 3.4 关键 UI 细节

- 卡片显示：`repos 数 / active features 数 / docs 资产数 / 上次打开时间`
- 版本徽章：本机 dapei skill 版本 vs workspace 版本，过期提示 sync
- **不在 P0 放置 Agent** — 纯空间管理

### 3.5 对应能力

`workspace.init` · `workspace.validate`

---

## 4. Layer 1 壳层：全局布局

选中 workspace 后的固定骨架（类似 VS Code / Linear）：

```
┌──────────┬────────────────────────────────────────────┐
│          │  TopBar: workspace名 · 维度徽章 · 同步状态  │
│  Side    ├────────────────────────────────────────────┤
│  Nav     │              Main Content (P1–P7)          │
│          ├────────────────────────────────────────────┤
│          │  Bottom Panel (可折叠): Terminal / Agent Log │
└──────────┴────────────────────────────────────────────┘
```

### 4.1 侧边栏导航

| 图标 | 路由 | 能力 / 数据 |
|------|------|-------------|
| 概览 | `/` | `workspace.status`, `workspace.report` |
| 代码库 | `/repos` | `repos.list`, `repos.sync` |
| 产品知识 | `/knowledge` | `docs/as-is/*`, CDR portal |
| Features | `/features` | `features/*`, `feature.status` |
| 分析 | `/pipeline` | CDR 编排（V1） |
| 设置 | `/settings` | skill sync、Agent 路径、主题 |

> 原型 [ui.tsx](./ui.tsx) 中另有「架构与决策 (ADR)」入口，可作为 P3 子 Tab 或独立侧栏项；默认以 **产品知识** 聚合 CDR portal + ADR。

### 4.2 TopBar 常驻

- Workspace 名称
- **维度徽章**（全局蓝 / Feature 橙）— 进入 P5 时切换
- Git 同步状态（repos behind/ahead）
- Agent 连接状态（OpenCode / Claude Code attach 状态）

---

## 5. P1 概览（Dashboard）

### 5.1 作用

一屏回答：「这个产品 workspace 现在是什么状态？」

### 5.2 内容区块

```
┌─ 健康度 ─────────────────────────────────────────┐
│  ✓ 结构合规   ⚠ 2 repos 需 sync   ● 1 active feature │
└──────────────────────────────────────────────────┘

┌─ 代码库 (3) ──────┐  ┌─ 进行中 Feature (1) ────────┐
│ mall-payment      │  │ payment-refactor            │
│ mall-order        │  │ stage: implementation       │
│ [管理 →]          │  │ [进入 →]                    │
└───────────────────┘  └─────────────────────────────┘

┌─ 产品知识快照 ────────────────────────────────────┐
│  behaviors / domains / state-machines 计数        │
│  portal: 已生成 / 需重建                          │
│  [浏览知识 →]                                     │
└──────────────────────────────────────────────────┘

┌─ 建议下一步（规则驱动，非 LLM）────────────────────┐
│  · repo 落后 origin · feature 待确认 · 缺 capability map │
└──────────────────────────────────────────────────┘
```

### 5.3 交互

- 卡片点击跳转对应页面
- 「建议下一步」预填 capability 参数，跳转 P5 或 P6

---

## 6. P2 代码库（Repos）

### 6.1 作用

管理产品维度的 **repos 基座池**（分析来源 + feature worktree 基座，非 feature 内改码主战场）。

### 6.2 列表视图

| Repo | 分支 | 同步状态 | Profile | 操作 |
|------|------|----------|---------|------|
| mall-payment | main | ✓ 最新 | Java/Spring | Sync · 分析 · Terminal |

### 6.3 添加代码库（抽屉）

- 名称 + Git URL
- `management_mode`：clone / submodule（用户可读文案）
- `auto_profile` 开关
- 提交 → `repos.add` → 进度（clone → default branch → profile）

### 6.4 Repo 详情 `/repos/:name`

- Profile 摘要（`cdr.profile`）
- 入口点数量（entries confirmed / total）
- 关联 behaviors（cognitive index）
- **只读提示**：基座池用于分析与 worktree 来源，勿直接在此改业务代码

---

## 7. P3 产品知识（Knowledge）

### 7.1 作用

在 **Workspace 维度** 浏览沉淀的认知资产。

### 7.2 双模式 Tab

**Tab A — 门户视图（默认）**  
内嵌 `cdr.doc.generate` 产物（`.dapei/docs-portal/`）

- 业务模块 / Behaviors / State Machines / Business Rules / Cross-repo
- 点击 `sources[]` → 打开 `repos/<repo>/` 对应文件
- 「在 Agent 中追问」→ 带 behavior 上下文跳转 P5

**Tab B — 资产浏览器（Power User）**  
树形：`docs/as-is/behavior/`、`domains/`、`state-machines/`  
YAML 预览 + confidence 徽章（fact / inference / unknown）

**Tab C — 架构与决策（可选）**  
`docs/decisions/` ADR 列表与详情（原型 ui.tsx 独立侧栏项可合并于此）

### 7.3 Portal 过期

顶部条：「认知资产已更新，[重建门户]」→ `cdr.doc.generate`

---

## 8. P4 Feature 列表

### 8.1 作用

Feature 执行入口；强调 **Feature 与 workspace 知识分离**。

### 8.2 列表

- 筛选：active / closed / 待确认 / 按 repo
- 展示：名称、stage、repos、上次活动时间

### 8.3 创建 Feature 向导

| Step | 内容 | 引擎 |
|------|------|------|
| 1 | 名称、objective、约束 | 表单 |
| 2 | 选择 repos（多选） | `feature.create` 输入 |
| 3 | worktree 策略预览 | `features/<f>/repos/<repo>` |
| 4 | 初始 stage（默认 analyze-current-state） | |
| 5 | 完成 → 跳转 P5 | `feature.create` |

创建后自动：生成 `runtime-context.md`、注入 related cognitive context；提示是否 attach Agent。

---

## 9. P5 Feature 详情 — Agent-Share 核心页

路由：`/features/:featureId`

### 9.1 Agent-Share 理念

**一个 Agent 会话，多个 UI 表面共享**（借鉴 Emacs agent-share）：

```
                    ┌─────────────────┐
                    │  OpenCode /     │
                    │  Claude Code    │  ← 唯一「大脑」进程
                    │  (PTY 子进程)    │
                    └────────┬────────┘
                             │ 事件流 / PTY
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ 对话面板  │  │ Stage    │  │ Inspector │
        │ (共享)   │  │ 进度条   │  │ 证据/文件 │
        └──────────┘  └──────────┘  └──────────┘
```

**原则**

- GUI **不**自调 LLM 读码；读码走 Agent
- GUI **可**直调 `dapei-engine` 做确定性操作（status、validate、sync）
- 对话面板与底栏 Terminal 为**同一会话**
- GUI 向 Agent **注入结构化上下文**（feature、stage、选中 behavior），不塞大量原文

### 9.2 布局（三栏 + 底栏）

```
┌─ Feature Header ─────────────────────────────────────────────────┐
│ payment-refactor · implementation · [Feature 维度 · 隔离中]        │
│ repos · [Sync worktrees] [Close feature]                         │
└──────────────────────────────────────────────────────────────────┘

┌ Stage Stepper ───────────────────────────────────────────────────┐
│ ●现状 → ●差距 → ○方案 → ○任务 → ●实现 → … → ○验收                  │
│                              ↑ 待确认闸门 (solution-design 等)      │
└──────────────────────────────────────────────────────────────────┘

┌─ 左 280px ──┬─ 中 弹性 ──────────────┬─ 右 360px ─────────────────┐
│ Context     │ Agent 对话 / 报告       │ Inspector                    │
│ · 目标      │ [用户 / Agent 消息]     │ · 证据链 · capability 结果    │
│ · 关联认知  │ [工具调用卡片]          │ · todo (backlog.md)          │
│ · 文档树    │ 输入 @dapei …           │ [确认进入下一阶段]            │
└─────────────┴────────────────────────┴────────────────────────────┘

┌─ Bottom: Terminal (共享 Agent PTY) ─────────────────── [折叠] ────┐
│ cwd: features/<f>/repos/<repo> 或 feature root                    │
└───────────────────────────────────────────────────────────────────┘
```

### 9.3 左栏 — Feature Context

- `feature.yaml` 目标 / 约束
- `context/related-cognitive-context.md` 摘要
- 本地树：`features/<f>/docs/`、`memory/`、`tasks/backlog.md`

### 9.4 中栏 — Agent 对话（结构化投影）

| 消息类型 | UI |
|----------|-----|
| 用户 / Agent 文本 | 气泡 + 阶段标签 |
| `dapei-engine run` | ToolCallCard：capability、结果 ✅/❌ |
| sub-agent 返回 | 折叠卡片，默认 ≤1KB 摘要（对齐 SKILL.md） |
| `CONFIRMATION_REQUIRED` | 横幅 + 确认 / 修改后再议 |

输入框：支持 `@dapei`、快捷芯片（现状分析、build context、validate）。

### 9.5 右栏 — Inspector

- 选中 behavior → 证据链 + 「追问 Agent」
- capability 结果 → YAML/JSON 友好展示
- Todo：解析 `tasks/backlog.md` + Agent todo 事件
- 阶段闸门：solution-design / implementation / acceptance

### 9.6 底栏 — Terminal

- Tab：`Agent` | `Shell` | `Portal Dev`
- cwd：全局操作 → workspace root；改代码 → `features/<f>/repos/<repo>`

### 9.7 关键交互流

**进入 Feature 自动 attach**

```
打开 P5 → 检查存活 session → 无则 spawn opencode/claude
→ injectContext(feature.yaml, runtime-context, stage, 维度规则)
→ 对话面板显示「Agent 已就绪」
```

**阶段推进（确认闸门）**

```
点击 Stage → 检查前置 → 需确认则 Inspector 展开清单
→ 用户确认 → workflow / Agent 推进 → 更新 Stepper
```

**从 P3 跳入**

```
选中 behavior → 选 feature → P5 Inspector 预填 → 输入框预填追问
```

**Close Feature**

```
向导选择回写 docs → 强调 Feature → Workspace 维度切换
→ feature.close → 跳转 P3 高亮新资产
```

---

## 10. P6 分析流水线（V1）

面向「有 repos、docs 仍空」：

```
repos.add → profile → entries.* → behavior → state → domain → doc.generate
```

- 纵向 Stepper + 每步状态（pending / running / done / needs AI）
- 「需要 AI」→ 「在 Agent 中继续」
- 进度可持久化（如 `.dapei/pipeline-state.json`，实现时定义）

---

## 11. P7 设置

| 分组 | 项 |
|------|-----|
| Agent | 默认工具、可执行路径、启动参数 |
| Skills | sync 源、版本、一键 sync |
| 编辑器 | Cursor / VS Code 外链 |
| 工作空间 | default_branch、management_mode |
| 外观 | 主题、Terminal 字号 |

---

## 12. 维度规则在 UI 中的体现

| 场景 | 视觉 |
|------|------|
| P1–P4、P3 | TopBar：**Workspace 维度**（蓝） |
| P5 | TopBar：**Feature 维度 · &lt;name&gt;**（橙） |
| P5 尝试改全局 docs | 拦截：「请通过 Feature Close 回写」 |
| Close 向导 | 明示 Feature → Workspace 知识合并 |

与 `agents.md` 双维度规则一致。

---

## 13. React Router 路由表

```typescript
/                                    → P0 Launcher
/w/:workspaceId/                     → P1 Dashboard
/w/:workspaceId/repos                → P2 列表
/w/:workspaceId/repos/:name          → P2 详情
/w/:workspaceId/knowledge            → P3 portal
/w/:workspaceId/knowledge/assets     → P3 资产树
/w/:workspaceId/features             → P4 列表
/w/:workspaceId/features/:id         → P5 详情
/w/:workspaceId/features/:id/:stage? → P5 深链 stage
/w/:workspaceId/pipeline             → P6
/w/:workspaceId/settings             → P7
```

`workspaceId`：目录路径 stable hash 或用户 slug，登记在 `~/.dapei/desktop/recent.json`。

---

## 14. UI 模块与页面对照

| 产品模块 | 页面 | 核心交互 |
|----------|------|----------|
| 1. 工作空间选择初始化 | P0 | `workspace.init` / `validate` |
| 2. 产品上下文与知识 | P1 + **P3** | CDR portal + 证据链 |
| 3. Feature 列表与流程 | **P4 + P5** | worktree + Agent-Share |

---

## 15. 分期（UI 视角）

| 版本 | 页面 | Agent |
|------|------|-------|
| M0 | P0、P1、P2、Shell | 仅底栏 Terminal |
| M1 | P4 创建、P5 骨架、Stage Stepper | Agent-Share v1：PTY + 消息镜像 |
| M2 | P3 Portal、证据链、确认闸门 | ToolCallCard、audit |
| M3 | P6、Close 向导 | sub-agent 摘要卡片 |

---

## 16. 技术栈（表现层）

- React 19 + React Router 7
- Tailwind CSS + shadcn/ui
- TanStack Query（服务端/capability 状态）+ Zustand（UI 局部）
- 共享组件包 `@dapei/ui`（见 [architecture.md](./architecture.md)）
