---
name: dapei-workspace
description: Initialize, validate, and inspect a dapei workspace (root-level repos/, features/, docs/, .dapei/). Use when initializing a new dapei workspace, validating the workspace contract, or reviewing the workspace overview.
---

# dapei.workspace skill

负责 workspace 初始化与结构校验。

## 边界

| dapei 平台 | Agent |
|------------|-------|
| 目录结构创建、schema 校验、元数据初始化 | 理解 workspace 业务范围、填充 docs |
| 输出结构化 workspace.yaml | 理解「这个 workspace 包含哪些 repo 和 feature」 |

**禁止**：平台替 Agent 写业务文档或做技术决策。

## 路由能力

| 意图 | Capability |
|------|------------|
| 初始化新 workspace | `workspace.init` |
| 生成 workspace 健康报告 | `workspace.report` |
| 校验 workspace 结构 | `workspace.validate` |
| 查看 workspace 概览 | `workspace.status` |
| 记录决策/风险/问题 | `memory.append` |
| 查询能力执行日志 | `audit.query` |

---

## 工作流（方法，非实现）

### Init（初始化）

**目标**：创建符合 dapei 规范的 workspace 结构。

1. 验证当前目录为空，或已经符合 dapei workspace contract
2. 在当前目录创建标准运行结构，不创建嵌套 `workspace/` 目录：

```
./
├── .dapei/
│   ├── workspace.yaml       # workspace 元数据
│   ├── commands.yaml        # capability 意图定义
│   ├── schemas/             # artifact schema
│   │   ├── behavior.schema.yaml
│   │   ├── state-machine.schema.yaml
│   │   └── evidence.schema.yaml
│   └── rules/               # dapei 规则
│       ├── naming.yaml
│       ├── layering.yaml
│       └── ddd.yaml
├── repos/                   # managed repo 基座池
├── features/                # feature 执行工作区
└── docs/
    ├── as-is/               # durable 现状认知
    │   └── behavior/
    ├── architecture/        # 架构知识
    └── decisions/           # 决策记录
```

3. 初始化 `.dapei/workspace.yaml`：
```yaml
version: 0.2
workspace:
  name: my-workspace
  root: .
  default_branch: main
  locale: zh-CN
```

4. 初始化 `.dapei/commands.yaml`（从模板复制）
5. 创建 `.gitkeep` 占位文件

### Validate（校验）

**目标**：检查 workspace 结构是否符合规范。

校验项：
1. 根目录存在且包含 `.dapei/` 目录
2. `.dapei/workspace.yaml` 存在且为有效 YAML
3. `repos/` 和 `features/` 目录存在
4. 所有 schema 文件格式正确
5. `commands.yaml` 语法正确

**校验输出**：
```yaml
validation:
  status: valid  # or invalid
  errors: []
  warnings:
    - repos/ is empty, consider adding repos
    - features/ has no active features
  checked_at: 2025-05-20T10:30:00Z
```

### Status（状态查看）

**目标**：输出 workspace 概览信息。

1. 读取 `.dapei/workspace.yaml`
2. 列出所有 repo 及其状态
3. 列出所有 feature 及其进度
4. 输出汇总报告

**产出示例**：
```markdown
# Workspace: my-workspace

## Repositories (2)
- payment-service [active] last_synced: 2025-05-19
- billing-core [active] last_synced: 2025-05-20

## Features (3)
- payment-refactor [active] stage: implementation
- auth-overhaul [active] stage: solution-design
- api-gateway [closed] stage: -

## Structure
- docs/as-is: 5 files
- docs/decisions: 12 files
- docs/architecture: 3 files
```

---

## 用户入口

```
@dapei init workspace
```

```
@dapei workspace validate
```

```
@dapei workspace status
```

---

## 与其他 skill 的协作

- **feature**：依赖 workspace 目录结构
- **repos**：repos 存放于当前 workspace root 的 `repos/` 下
- **cognitive**：workspace 下的 docs/ 目录用于 cognitive 产物
- **validation**：workspace validate 是 feature validate 的前置检查
