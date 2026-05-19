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

## 这个东西能做什么

目前 v0.2 在做的事情：

**把 AI 变成一个真正靠谱的协作对象**

- 帮你维护一个长期记忆的产品上下文（docs/）
- 帮你跟踪多个代码库的当前状态
- 帮你按 feature 隔离工作区，避免越改越乱
- 帮你把每次实施的结果（diff、风险、测试状态）沉淀成报告
- 验收后帮你把业务规则和架构决策回写到 docs/

**目前支持的工作流：**

```
workspace init
  → codebase add / sync / list / analyze
      → create feature（映射相关 repo）
          → context build（按阶段生成上下文包）
              → run workflow（按 DAG 推进 stage）
                  → validate / review / report
                      → 验收后回写 docs/
```

**仍在建设中的部分：**

- 更深度的 codebase 反向分析
- 高质量现状分析 / gap 分析 / 技术方案自动生成
- 可执行的 guardrail 规则引擎
- Git worktree 隔离（支持并行 feature）
- GitHub / CI / 浏览器等外部 adapter

路线图见：[docs/plans/2026-05-17-dapei-roadmap.md](docs/plans/2026-05-17-dapei-roadmap.md)。

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