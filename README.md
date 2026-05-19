# dapei.skill

一个在真实项目里，长期和 AI 一起工作时逐步沉淀出来的工程协作方式。

没有银弹。很多内容甚至很朴素。但它们确实帮我们减少了一些真实的麻烦：

- AI 上下文越写越漂
- 需求理解老有偏差
- 架构做着做着失控
- Spec 越写越长但没人看
- 多 Agent 协作后上下文彻底崩掉

所以我们把这些经验整理成了 skills，希望能帮大家少踩一些坑。

---

## 怎么用

你不需要记任何命令。直接在 AI 对话里说：

```text
@dapei 初始化当前项目 workspace
```

```text
@dapei 接入 mall-payment 和 mall-order，分析当前技术现状
```

```text
@dapei 创建 feature payment-refactor
目标：稳定支付回调链路，降低订单状态不一致风险
范围：mall-payment,mall-order
约束：不破坏现有接口兼容性，本周内可灰度
验收：回调幂等、订单状态收敛时间小于 30 秒、补齐回归测试
先做现状分析，进入技术方案前暂停确认
```

```text
@dapei review payment-refactor 今天的变更，重点看架构漂移和测试缺口
```

AI 会帮你读上下文、写文档、维护 feature 状态，最后用"结论 / 风险 / 待确认 / 下一步"回报给你。

---

## 工作流是什么样的

下面是我们实际使用时的完整过程。不是理论，而是我们真实踩出来的。

### 第一步：准备好你的上下文

在开始任何需求之前，先让 AI 理解你的代码库：

```text
@dapei 接入 mall-payment 和 mall-order，分析当前技术现状
```

AI 会从代码库里提取技术栈、模块边界、API、数据库、消息队列、依赖关系等信息，写入 `docs/as-is/` 和 `docs/architecture/`。这些内容会作为长期记忆，让之后每个新需求都能站在一个清晰的起点上，而不是每次都从零翻代码。

（目前这一步是基础版，未来会做更深的业务架构反向分析。）

### 第二步：为需求创建独立的工作区

```text
@dapei 创建 feature payment-refactor
目标：稳定支付回调链路，降低订单状态不一致风险
范围：mall-payment,mall-order
```

这会在 `features/payment-refactor/` 下创建一个独立空间，并把 `mall-payment` 和 `mall-order` 通过符号链接映射进来。AI 在这个空间里工作，不会影响 codebase 里的其他内容。

每个 feature 工作区里有：

- `repos/` — 映射进来的代码库
- `docs/01-06` — 现状分析 / gap 分析 / 业务方案 / 技术设计 / 任务拆解 / 验收
- `context/` — AI 按阶段生成的上下文包
- `memory/` — 决策、风险、待确认问题
- `reports/` — 进度、review、验证报告

### 第三步：端到端地设计和调研

AI 会在 feature 工作区里逐步推进：

```
现状分析 → Gap 分析 → 业务方案 → 技术设计 → 任务拆解 → 验收标准
```

每到一个关键节点（技术方案、实施、验收），AI 会停下来让你确认，而不是直接往下走。

这个过程中，AI 会不断从 `docs/` 和 `codebase/` 里拿上下文，填充到 feature 的各个文档里。你会看到：

- 当前代码里哪些地方可能会出问题
- 为什么现有架构会导致这个需求里的问题
- 改动涉及哪些模块、哪些接口、哪些边界

### 第四步：在多个代码库里实施

方案确认后，AI 在 `features/payment-refactor/repos/` 下对应的代码库里工作。每个 repo 都有自己的 feature branch（比如 `feature/payment-refactor`），变更隔离在那里。

因为 feature 工作区天然就是完整的上下文，AI 在看 diff、review 代码、做决策时，始终知道：

- 这个改动在整个需求里处于什么位置
- 涉及的其他 repo 目前改了什么
- 当前的实施进度和风险点

### 第五步：验证

开发完成后，AI 会基于需求理解生成测试用例，然后执行本地验证：

- API 测试：通过 curl 调用本地起的服务
- 浏览器测试：通过 agent-browser 操作页面
- 回归测试：在相关模块上跑测试套件

如果基础设施不够强（比如有些后台服务 AI 很难直接调），我们通常会：

- 打桩 / mock 外部系统
- 对事件驱动的消费方做事件回放
- 临时构建测试 token

这一步会生成 `reports/test-report.md` 和 `reports/validation-report.md`。

### 第六步：验收后闭环

需求验证通过后，AI 会把这次开发的内容同步回 `docs/`：

- 业务规则有没有变化
- 架构有没有漂移
- 哪些决策需要记录
- 哪些风险需要更新

这样，下一个需求来的时候，AI 又能基于最新的上下文开始。

---

## 核心概念

### Workspace

产品或业务域的工程工作区。初始化后结构是：

```
<workspace-root>/
├── .dapei/        # 配置、workflow、规则
├── codebase/      # 托管的产品代码库
├── docs/          # 长期产品 / 业务 / 架构知识
├── features/      # 每个需求的隔离执行空间
└── runtime/       # 模板和 AI 规则
```

### Feature

每个需求进入一个独立的 feature 工作区，里面有：

```
features/<feature>/
├── feature.yaml       # 需求清单
├── repos/             # 映射的代码库（符号链接）
├── docs/              # 现状分析、gap、方案、任务、验收
├── context/           # AI 用的阶段性上下文包
├── memory/            # 决策、风险、待确认问题
├── tasks/             # backlog 和计划
├── tests/             # 测试计划
└── reports/           # 进度、review、验证报告
```

### 上下文分层

AI 每次进入新 stage 时，会根据当前阶段从 docs/、codebase/、feature/ 中聚合相关上下文，生成 `context/runtime-context.md`。优先级是：

```
1. global: 标准 / AI 规则
2. workspace: 现状 / 架构 / 工作流
3. domain: 业务 / 领域 / 术语
4. repo: 代码库证据
5. feature: feature 自己的文档和上下文
6. runtime: 任务和执行状态
```

---

## 设计原则

- **AI-first UX**：用户通过对话使用，不需要学内部脚本
- **Local-first**：文件系统 + Git 是唯一的事实来源
- **确定性优先**：可重复的状态变更由脚本执行，不靠 Agent 口头约定
- **证据优先**：代码库分析必须区分证据、推断和未知
- **Feature 隔离**：每个需求独立记录、验证、沉淀
- **闭环**：验收后把业务规则和架构决策回写到 docs/

---

## 安装

把 skill 放到 AI 工具支持的位置，然后用 `@dapei` 对话即可。

### Claude Code

```bash
git clone https://github.com/ygwa/dapei-skill.git /tmp/dapei-skill
cp -R /tmp/dapei-skill/.agents/skills/dapei-skill ~/.claude/skills/
```

### Cursor

把 `.cursor/rules/dapei-core.mdc` 加入项目，AI 就会按 dapei 协作方式工作。

---

## 验证

克隆后跑 smoke test 确认所有模块完整：

```bash
bash scripts/smoke-test.sh
```

---

## 参考

| 文档 | 说明 |
| --- | --- |
| [agents.md](agents.md) | 本仓库的 Agent 协作约束 |
| [DESIGN.md](DESIGN.md) | 技术设计说明 |
| [docs/plans/2026-05-17-dapei-roadmap.md](docs/plans/2026-05-17-dapei-roadmap.md) | 路线图 |
| [.dapei/workflows/feature-lifecycle.yaml](.dapei/workflows/feature-lifecycle.yaml) | Feature 生命周期 DAG |
| [.agents/skills/dapei-skill/SKILL.md](.agents/skills/dapei-skill/SKILL.md) | Agent Skill 入口 |

---

## License

MIT