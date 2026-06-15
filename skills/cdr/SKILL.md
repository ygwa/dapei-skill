---
name: dapei-cdr
description: Cognitive Discovery Runtime — Code-to-Knowledge extraction, domain composition, capability mapping, and documentation portal generation. Use when the user mentions "profile", "discover entries", "discover behaviors", "discover states", "compose domain", "capability map", "generate documentation", or "knowledge portal".
---

# dapei.cdr skill

Cognitive Discovery Runtime (CDR) 通过代码逆向推导，构建从微观到宏观的三层资产型知识体系。

## 用户入口

```
@dapei bootstrap mall-order
```

(One-shot: runs `cdr.profile` + `cdr.entries.candidate` in a single call.
The AI still owns `cdr.entries.propose` / `confirm` — see P3 red line.)

```
@dapei profile repo mall-order
```

```
@dapei discover entries for mall-order
```

```
@dapei discover behaviors for mall-order
```

```
@dapei discover states for Order in mall-order
```

```
@dapei compose domain Transaction from mall-order behaviors
```

```
@dapei compose business rule order-amount-positive for order-create
```

```
@dapei init capability map for E-Commerce Mall
```

```
@dapei suggest domains
@dapei synth capability map for E-Commerce Mall
@dapei render L1 portal
```

```
@dapei generate documentation portal
```

```
@dapei list assets
```

## 设计原则

| 原则 | 规则 |
|------|------|
| P0 **AI 是扫描器,引擎是校验器** (v0.3) | 引擎**不**用 regex/annotation 预设入口候选;返回代码文件清单后由 AI 决定入口;引擎仅校验 AI 提交的事实证据(file 存在、line 在范围) |
| P1 行为先于领域 | `domain` 产物必须携带 `derived_from: [behavior-id, …]`;禁止仅凭包名命名领域 |
| P2 入口驱动 | 深析仅从 `status: confirmed` 的入口开始 |
| P3 证据优先 | `kind=fact` 必须附带 `sources[]`(file/line/repo);`kind=inference` 必须有 `derived_from[]`;`kind=unknown` 必须有 `reason` |
| P4 增量更新 | `profile` / `entries` 携带 `revision`;代码变更 → `stale` 标记 |

## 三层知识结构

```
L1 宏观层 — 产品功能地图 (Capability Map)
  ↑ 聚类自
L2 领域层 — 领域模型 + 入口目录 (Domain + Entries)
  ↑ 推导自
L3 流程层 — 行为链路 + 状态机 + 业务规则 (Behavior + State + Rules)
```

## 边界

| dapei 平台 | Agent |
|------------|-------|
| **代码文件清单**(cdr.entries.candidate)、schema 校验、YAML 索引、**evidence 落盘校验** | **代码阅读、入口识别**、业务语义理解、行为追踪、规则提炼 |
| 目录管理、增量 stale 检测 | 确认入口、生成 fact 级产物 |
| VitePress 站点编译 | 不涉及(自动化生成) |

**关键不变量**:AI 永远不直接落盘。所有 `cdr.*.upsert` 路径必须先经引擎校验 evidence(`sources[].file` 必须存在于 `repos/<repo>/<file>`,`line` 必须在文件行数范围内)后才能写入 YAML。这是 P3 红线。

## 路由能力

| 用户意图 | Capability | v0.3 说明 |
|----------|------------|----------|
| 生成 repo 技术画像 | `cdr.profile` | 移除 `frameworks` 字段(扫描器职责移交给 AI) |
| 一键 bootstrap(画像 + 入口候选) | `cdr.bootstrap` | **新增** — 串起 profile + entries.candidate;不调 propose/confirm(P3 红线) |
| 列出代码文件供 AI 读取 | `cdr.entries.candidate` | **新增** — 廉价文件清单 + 内容切片 |
| AI 提交一条入口(含 evidence) | `cdr.entries.propose` | **新增** — 引擎校验 file:line |
| 发现入口候选(薄封装) | `cdr.entries.prepare` | 退化为 `cdr.entries.candidate` 的别名,加 workflow 提示 |
| 确认入口 | `cdr.entries.confirm` | **要求 sources[]**;缺证据拒绝 |
| 发现行为链路 | `cognitive.discover` → `cognitive.artifact.upsert` | 不变 |
| 写入行为产物(结构化字段) | `cdr.behavior.upsert` | fact 级 sources 强校验 |
| 推导状态机 | `cdr.state.derive` | inference 草稿;sources 可选 |
| 聚合领域模型 | `cdr.domain.compose` | derived_from 强校验 |
| 组合业务规则 | `cdr.business.compose` | **新增(在 v0.2)** — 5 种 rule kind |
| 推荐领域聚类 | `cdr.domain.suggest` | **新增(v0.8)** — 引擎只读聚类,AI 审阅后 compose |
| 初始化功能地图 | `cdr.capability.map.init` | 不变 |
| 合成功能地图 | `cdr.capability.map.synth` | **新增(v0.8)** — 从 domains 自动聚类 + 引擎回填 spans_repos / fact_ratio |
| 列出所有资产 | `cdr.index.list` | 不变 |
| 生成文档门户 | `cdr.doc.generate` | 不变 |
| 渲染 L1 portal | `cdr.reversecluster.doc.generate` | **新增(v0.8)** — `/l1/` section + cluster-suggestions |

## 工作流

### Phase 0 — Profile（技术画像）

```
@dapei profile repo mall-order
```

**目标**：生成 repo 级技术画像，包含语言栈、框架、目录结构、测试命令。

**产出**：`docs/as-is/profiles/<repo>.yaml`

### Phase 1 — Entry Discovery（入口发现，v0.3 重设计）

```
@dapei discover entries for mall-order
```

**目标**：列出 repo 中的代码文件,让 AI 读取并识别入口,**引擎不做框架预设**。

**新流程**:

1. **引擎**: `runCapability('cdr.entries.candidate', {repo: 'mall-order'})`
   - 返回 `files[]`,每项含 `relpath` / `language` / `content`(已 inline)
   - 没有 framework 字段,没有 pattern 匹配
2. **AI** (在 chat session 中): 阅读 `content`,用 LLM 的理解力识别入口
   - 找出 Spring `@RestController` / NestJS `@Controller` / FastAPI `@app.get` / Express (app.get) / Quarkus / Ktor / Hapi / Axum / gRPC / GraphQL / 自定义路由 / 动态注册
3. **AI**: 对每个识别出的入口,调 `runCapability('cdr.entries.propose', {repo, id, type, file, line, method, path, sources: [{file, line, repo}]})`
   - 引擎校验 `sources[].file` 存在于 `repos/<repo>/<file>`
   - 引擎校验 `line` 在文件行数范围内
   - 通过则写入 `docs/as-is/entries/<repo>.yaml`(`status: candidate`)
4. **人 / AI**: 调 `runCapability('cdr.entries.confirm', {repo, entry_id, summary, priority, sources: [...]})` 标记为 `status: confirmed`
   - `sources[]` 是**必填**的——确认入口也必须指 evidence

**旧版(v0.2)废弃路径**: `cdr.entries.prepare` 现在退化为薄封装,内部调用 `cdr.entries.candidate` 后返回 workflow 描述;不再返回平台自动识别的 entry 列表。新代码请直接用 `cdr.entries.candidate` + `cdr.entries.propose`。

**产出**:`docs/as-is/entries/<repo>.yaml`(`status: candidate` → `status: confirmed`)

### Phase 2 — Behavior Mining（行为深析）

```
@dapei discover behaviors for mall-order
```

使用已有的 `cognitive.discover` + `cognitive.artifact.upsert` 工作流。

**v0.6 — Use structured calls**

`behavior.calls[]` 现在接受两种形态：

```yaml
# Legacy — 继续可用
calls: ["PaymentClient", "InventoryService"]

# Structured (v0.6 推荐) — 引擎会把 target_repo 提到 index
calls:
  - target: PaymentClient
    protocol: http
    target_repo: mall-payment
    evidence: { file: src/paymentClient.ts, line: 12, repo: mall-order }
  - target: order.events:order.created
    protocol: mq
    evidence: { file: src/events/publisher.ts, line: 3, repo: mall-order }
```

**每个调用的字段**：
- `target`（必填）：被调的 service / topic 名
- `protocol`（推荐）：`http | grpc | mq | event | rpc | other`
- `target_repo`（推荐）：被调方所属的 repo 名——AI **必须显式声明**，引擎不做语义推断
- `evidence`（推荐）：单条 SourceRef，指向**调用点**（不是定义点）

**为什么需要 target_repo**：portal 渲染时，**Cross-service calls** 段只列有 `target_repo` 的调用；cognitive-index 的 `target_repos` 字段只从**显式**声明的调用中抽取。**不声明 = 引擎无信息可记录**，与 v0.5 的"AI 自由填写"行为相同。

**从已确认的入口出发**，沿调用链追踪：
1. 识别数据库写入 (`writes`)
2. 识别事件发布 (`events`)
3. 识别外部调用 (`calls`)
4. 识别潜在风险 (`risks`)

**产出**：`docs/as-is/behavior/<id>.yaml`

### Phase 3 — State Mining（状态推导）

```
@dapei discover states for Order in mall-order
```

**从已有 behavior 中推导实体状态机**。

**产出**：`docs/as-is/state-machines/<entity>.yaml`

### Phase 4 — Domain Composition（领域聚类）

```
@dapei compose domain Transaction from mall-order behaviors
```

**将零散的 behavior 聚类为领域模型**，必须携带 `derived_from`。

**产出**：`docs/as-is/domains/<domain>.yaml`

### Phase 5 — Capability Map（功能地图）

```
@dapei init capability map for E-Commerce Mall
```

**初始化产品级功能大图**，关联已有领域。

**产出**：`docs/as-is/capabilities/product-map.yaml`

### Phase 5.5 — Cross-repo Business Rules（v0.5 跨仓库业务规则）

```
@dapei build cross-repo rules
@dapei build cross-repo portal
```

**目标**：把"一个仓库做完某动作，另一个仓库在什么业务语义下做什么动作"沉淀为**业务规则**——不是图，是**规则**。引擎读所有 `business-rule` 的 `applies_to[]`，按 `(id, repo)` 复合键反查 `index.behaviors[]`，输出 `docs/as-is/cross-repo/cross-links.yaml`，分组渲染到 portal `/cross-repo/`。

**问自己**（AI 主动识别）：

| 跨仓库关系类型 | 业务语义 | 写哪种 kind？ |
|---|---|---|
| A 服务的 HTTP 调用到达 B 服务 | 同步集成 | `kind: authorization`（谁可以调）或 `kind: sla`（超时约束） |
| A 服务 publish 事件 → B 服务 MQ consumer 触发 | 异步补偿 | `kind: compensation`（"如果 A 失败要 rollback 什么"） |
| A 服务 publish 事件 → B 服务要在 N 秒内消费 | 时延约束 | `kind: sla`（明确写 "must be captured within 30s"） |
| A 服务和 B 服务共享同一行 DB 记录 | 一致性 | `kind: invariant`（"X 字段两边必须一致"） |
| A 服务状态机触发 B 服务状态机 | 状态推进 | `kind: sla`（"A 切到 PENDING_PAYMENT 后 B 必须 30s 内切到 PAID"） |

**每识别出一条跨仓库关系，就调** `cdr.business.compose` 写一条规则：

- `applies_to: [behavior_id_in_repo_a, behavior_id_in_repo_b, ...]` —— 把两边的 behavior id 都填进去
- `kind` 按上表选
- `confidence.kind = fact` 时必须带 `sources[]`（指向被识别为订阅者的代码，例如 `subscriber.handle(event)` 的文件行号）

**对引擎的要求**：

引擎做的是**只读计算**——不写 behavior / 不写 business-rule。AI 端必须**主动**调 `cdr.business.compose` 把跨仓库关系**先**沉淀成业务规则，然后 `cdr.business.crosslink` 才能算出来。**这是 v0.5 的本质：业务规则是 AI 端的责任，跨仓库视图是引擎端的呈现。**

**`@dapei build cross-repo rules` 调用的能力**：`cdr.business.crosslink`
**`@dapei build cross-repo portal` 调用的能力**：`cdr.crossrepo.doc.generate`

**产物**：
- `docs/as-is/cross-repo/cross-links.yaml`（引擎计算结果，分组 by kind）
- `.dapei/docs-portal/cross-repo/`（portal 渲染，按 kind 分组页面 + Mermaid 关系图）

### Phase 5.7 — Reverse-cluster to L1（v0.8 反向聚类为 L1）

```
@dapei suggest domains
@dapei synth capability map for E-Commerce Mall
@dapei render L1 portal
```

**目标**：从已经写好的 behavior / business-rule 反向聚类出**候选 domain** 和**候选 capability map**，让 AI 端审阅、命名、调优后再 commit。**引擎永远不直接写 `domain.yaml` —— compose 仍然是 AI 端的事**。

**两阶段流水线**（建议调用顺序）：

```
cdr.domain.suggest
   ↓  写入 docs/as-is/cross-repo/domain-suggestions.yaml
   ↓  AI 审阅 clusters[], 选有用的
cdr.domain.compose (人工逐条)
   ↓  写入 docs/as-is/domains/<domain>.yaml
cdr.capability.map.synth
   ↓  读取 composed domains + suggestions, 回填 spans_repos/fact_ratio
   ↓  写入 docs/as-is/capabilities/product-map.yaml
cdr.reversecluster.doc.generate
   ↓  读取 product-map + suggestions
   ↓  渲染 .dapei/docs-portal/l1/
```

**第一步：`cdr.domain.suggest`**

引擎按 4 种边类型把 cognitive index 的 behaviors 聚类为连通分量：

| 边类型 | 强度 | 数据来源 |
|--------|------|----------|
| shared-events | 强（weight 4） | `behavior.events[]` 共享 |
| shared-writes | 中（weight 3） | `behavior.writes[].table` 共享 |
| cross-repo-calls | 中（weight 2） | `behavior.calls[].target_repo` |
| business-rule | 弱（weight 1） | `business-rule.applies_to[]` 同时引用两边 |

聚类结果是**只读建议**，写到 `docs/as-is/cross-repo/domain-suggestions.yaml`。每个 cluster 带：

- `suggested_name` + `suggested_domain_slug` + `naming_reason`（从 events 高频主语推断）
- `confidence: high | medium | low`（high = shared-events + 跨 repo）
- `behavior_keys[]`、`repos[]`、`evidence[]`

**AI 端做什么**：读 yaml，挑出**置信度够高**的 cluster，逐个调 `cdr.domain.compose` 把它们落实成 domain。每个 compose 出来的 domain 才有 `derived_from` 红线保护。

**第二步：`cdr.capability.map.synth`**

引擎读 domain 来源（按优先级）：
1. `input.manual_domains[]`（AI 端预备的精选清单）
2. `docs/as-is/domains/**/*.yaml`（已 compose 的）
3. `domain-suggestions.yaml`（仅当 `use_suggested_domains: true`）

对每个 capability，引擎从 cognitive index 反查 spans_repos / behavior_count / fact_ratio —— **这是 AI 端没办法自己算的客观指标**。结果写到 `docs/as-is/capabilities/product-map.yaml`（与 v0.3 的 `cdr.capability.map.init` 同文件，但字段更丰富）。

**第三步：`cdr.reversecluster.doc.generate`**

读 product-map + domain-suggestions，渲染 `/l1/`：
- `l1/index.md` — 产品全景 + Mermaid 总图（capability 子图 + 跨 repo 关系）
- `l1/<capability-id>.md` — 每个 capability 的详情页
- `l1/cluster-suggestions.md` — cdr.domain.suggest 的建议原文，方便 AI 对照

**关键约束**：

- `cdr.domain.suggest` **绝不**调 `cdr.domain.compose` —— 这是 P1 红线的延伸：建议和 commit 分两步。
- `cdr.capability.map.synth` 是幂等可重入的；不传 `manual_domains[]` 时自动从 composed + suggested 拿。
- 空工作区是合法状态：synth 写 `status: empty` 头，doc gen 渲染 empty-state l1/index.md，AI 看得到明确的下一步指引。

**`@dapei suggest domains` 调用的能力**：`cdr.domain.suggest`
**`@dapei synth capability map for X` 调用的能力**：`cdr.capability.map.synth`
**`@dapei render L1 portal` 调用的能力**：`cdr.reversecluster.doc.generate`

**产物**：
- `docs/as-is/cross-repo/domain-suggestions.yaml`（建议清单，可覆盖重写）
- `docs/as-is/capabilities/product-map.yaml`（合成的功能地图）
- `.dapei/docs-portal/l1/`（L1 portal section，与 `/cross-repo/` 平级）

### Phase 6 — Documentation Portal（文档门户）

```
@dapei generate documentation portal
```

**自动编译所有认知资产为 VitePress 静态站点**：
- L1 功能地图 → 首页 + 能力页
- L2 领域模型 → 领域页 + Mermaid 模块关系图
- L3 行为/状态 → 流程页 + Mermaid 流程图/状态图
- 代码溯源链接 → 可点击跳转源文件

**产出**：`.dapei/docs-portal/`（VitePress 项目）

启动预览：
```bash
cd .dapei/docs-portal && npx vitepress dev
```

## 产物目录结构

```
docs/as-is/
├── profiles/           ← L0 技术画像
├── entries/            ← L2 入口目录
├── behavior/           ← L3 行为链路
├── state-machines/     ← L3 状态机
├── business-rules/     ← L3 业务规则
├── domains/            ← L2 领域模型
└── capabilities/       ← L1 功能地图

.dapei/
├── cognitive/index.yaml ← 统一资产索引
└── docs-portal/         ← VitePress 生成站点
```

## 红线

- **禁止**跳过 Entry 确认直接生成 behavior
- **禁止** domain 产物缺少 `derived_from`
- **禁止**用 grep 替代语义分析
- **禁止**将 CodeGraph 静态拓扑直接作为业务事实
- **禁止**(v0.3)在引擎里写 framework-specific regex/annotation 扫描器——AI 已经会读代码,引擎只需要校验 AI 提交的 evidence
- **禁止**(v0.3)`cdr.entries.confirm` / `cdr.behavior.upsert` 在 `kind=fact` 时不带 `sources[]`——引擎直接拒收
- **禁止**(v0.3)AI 直接写 YAML 文件——必须通过 `runCapability` 让引擎校验后再落盘

## 兼容性

原有 `cognitive.*` 能力保持不变。CDR 是扩展层,不是替代层。

| 旧意图 | 映射 |
|--------|------|
| `@dapei analyze behavior for X` | → `cognitive.discover` (不变) |
| `@dapei list behaviors` | → `cognitive.artifact.list` (不变) |
| `@dapei cognitive validate` | → `cognitive.artifact.validate` (不变) |

## v0.3 迁移指南(从 v0.2 升级)

| v0.2 | v0.3 |
|------|------|
| `@dapei discover entries for X` → `cdr.entries.prepare` 返回 `entries[]` 平台扫描结果 | `@dapei discover entries for X` → `cdr.entries.candidate` 返回 `files[]`,**AI 读 content 后**调 `cdr.entries.propose` |
| `entries[].framework` = "spring" / "nestjs" / "fastapi" / "express" | 字段**不存在**——AI 不需要这个分类 |
| `entries[].discovered_by` = "platform" / "platform-annotation" | `discovered_by` = "ai" 统一 |
| `cdr.entries.confirm` 仅需 `summary` | `cdr.entries.confirm` **必须**带 `sources[]` |
| `cdr.profile` 包含 `frameworks: [...]` | `frameworks` 字段**移除**——AI 从 `manifest_files` 推断 |
| 引擎硬编码 4 套 framework regex(150 行) | 引擎 0 行 framework 知识——AI 处理 |

测试侧迁移:`tests/unit/cdr.test.mjs` 中 35 个"扫到 @GetMapping" 类断言被替换为"拒收 line 99999" / "拒收 file 不存在" / "kind=fact 无 sources 拒收" 三类 evidence-validation 断言;`tests/ai-behavior/cdr-ai-as-scanner.yaml` 新增 L4 transcript fixture 覆盖完整 candidate → propose → confirm 流程。

## 与其他 skill 的协作

- **feature**：`feature.create` 注入 CDR 索引摘要到 `related-cdr-context.md`
- **repos**：`cdr.profile` 替代 `repos.analyze` 中的语义 grep 部分
- **workflow**：`context.build` v3 注入 profile + entries + behavior 摘要表
- **validation**：未来 COG-001 门禁：进入 `solution-design` 前需 ≥1 confirmed entry + ≥1 fact behavior
