---
name: dapei-cdr
description: Cognitive Discovery Runtime — Code-to-Knowledge extraction, domain composition, capability mapping, and documentation portal generation. Use when the user mentions "profile", "discover entries", "discover behaviors", "discover states", "compose domain", "capability map", "generate documentation", or "knowledge portal".
---

# dapei.cdr skill

Cognitive Discovery Runtime (CDR) 通过代码逆向推导，构建从微观到宏观的三层资产型知识体系。

## 用户入口

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
@dapei init capability map for E-Commerce Mall
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
| P1 行为先于领域 | `domain` 产物必须携带 `derived_from: [behavior-id, …]`；禁止仅凭包名命名领域 |
| P2 入口驱动 | 深析仅从 `status: confirmed` 的入口开始 |
| P3 证据优先 | `kind=fact` 必须附带 `sources[]`（文件/行号/符号） |
| P4 增量更新 | `profile` / `entries` 携带 `revision`；代码变更 → `stale` 标记 |

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
| CodeGraph 索引、入口候选提取、schema 校验、YAML 索引 | 代码阅读、业务语义理解、行为追踪、规则提炼 |
| 目录管理、增量 stale 检测 | 确认入口、生成 fact 级产物 |
| VitePress 站点编译 | 不涉及（自动化生成） |

## 路由能力

| 用户意图 | Capability |
|----------|------------|
| 生成 repo 技术画像 | `cdr.profile` |
| 发现入口候选 | `cdr.entries.prepare` |
| 确认入口 | `cdr.entries.confirm` |
| 发现行为链路 | `cognitive.discover` → `cognitive.artifact.upsert` |
| 写入行为产物（结构化字段） | `cdr.behavior.upsert` |
| 推导状态机 | `cdr.state.derive` |
| 聚合领域模型 | `cdr.domain.compose` |
| 初始化功能地图 | `cdr.capability.map.init` |
| 列出所有资产 | `cdr.index.list` |
| 生成文档门户 | `cdr.doc.generate` |

## 工作流

### Phase 0 — Profile（技术画像）

```
@dapei profile repo mall-order
```

**目标**：生成 repo 级技术画像，包含语言栈、框架、目录结构、测试命令。

**产出**：`docs/as-is/profiles/<repo>.yaml`

### Phase 1 — Entry Discovery（入口发现）

```
@dapei discover entries for mall-order
```

**目标**：自动扫描 Controller/Handler/Listener/Consumer 等入口文件，生成候选列表。

**产出**：`docs/as-is/entries/<repo>.yaml`（`status: candidate`）

Agent 介入确认，将有价值的入口标记为 `status: confirmed`。

### Phase 2 — Behavior Mining（行为深析）

```
@dapei discover behaviors for mall-order
```

使用已有的 `cognitive.discover` + `cognitive.artifact.upsert` 工作流。

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

## 兼容性

原有 `cognitive.*` 能力保持不变。CDR 是扩展层，不是替代层。

| 旧意图 | 映射 |
|--------|------|
| `@dapei analyze behavior for X` | → `cognitive.discover` (不变) |
| `@dapei list behaviors` | → `cognitive.artifact.list` (不变) |
| `@dapei cognitive validate` | → `cognitive.artifact.validate` (不变) |

## 与其他 skill 的协作

- **feature**：`feature.create` 注入 CDR 索引摘要到 `related-cdr-context.md`
- **repos**：`cdr.profile` 替代 `repos.analyze` 中的语义 grep 部分
- **workflow**：`context.build` v3 注入 profile + entries + behavior 摘要表
- **validation**：未来 COG-001 门禁：进入 `solution-design` 前需 ≥1 confirmed entry + ≥1 fact behavior
