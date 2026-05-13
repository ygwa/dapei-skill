# dapei.skill Feature Enhancement Design

Date: 2026-05-13

## Context OS Enhancement Plan

This document captures the design for enhancing dapei.skill with:
- Codebase management (add, sync, list)
- Feature creation with repo mounting and feature branches
- Incremental code review on demand

---

## 1. System Interaction Mode

**Philosophy**: Natural language first. Users speak their intent, AI executes.

Examples:
```
@dapei 我想增加一个新代码库
@dapei 帮我看看现在有哪些需求在做
@dapei 创建一个支付优化的需求，涉及 mall-payment 和 mall-order
@dapei review payment-refactor
```

**Core Commands** (for AI router mapping):
- `codebase add` - 增加代码库
- `codebase sync` - 同步代码库
- `codebase list` - 查看代码库状态
- `feature create` - 创建需求
- `feature review` - 触发 review
- `feature scan` - 按需上下文扫描
- `feature status` - 查看需求进度

---

## 2. Codebase Management

### 2.1 codebase add

**Flow**:
```
User: @dapei 我想增加一个新代码库 mall-payment
AI:   请提供代码库的 Git URL（支持 git@... 或 https://...）
User: git@github.com:org/mall-payment.git
AI:   开始克隆... ✅ 完成
```

**Storage Structure**:
```
workspace/codebase/mall-payment/    # git repo
.dapei/codebases.yaml               # metadata registry
```

**codebases.yaml Schema**:
```yaml
codebases:
  - name: mall-payment
    path: workspace/codebase/mall-payment
    url: git@github.com:org/mall-payment.git
    added-at: 2026-05-13T10:30:00Z
    default-branch: master
```

### 2.2 codebase sync

**Flow**:
```
User: @dapei 同步 mall-payment
AI:   正在 fetch 最新代码... ✅ v2.3.1 (3天前)
```

**Implementation**: `git fetch origin` for each codebase

### 2.3 codebase list

**Flow**:
```
User: @dapei 看看现在有哪些代码库
AI:   📦 代码库 (3):
      • mall-payment  - v2.3.1, 3天前
      • mall-order    - v1.8.0, 今天
      • mall-product  - v3.0.0-beta, 1周前
```

---

## 3. Feature Management

### 3.1 feature create

**Flow**:
```
User: @dapei 创建一个支付优化的需求，涉及 mall-payment 和 mall-order
AI:   🏗️ 创建需求 "payment-refactor"...
      📦 挂载代码库:
      • mall-payment → 创建分支 feature/payment-refactor (基于 master@abc1234)
      • mall-order   → 创建分支 feature/payment-refactor (基于 master@def5678)
      ✅ 需求已创建
```

**Storage Structure**:
```
workspace/features/payment-refactor/
├── feature.yaml                    # feature metadata
├── context/                        # context documents
│   ├── business-context.md
│   ├── architecture-context.md
│   ├── repo-context.md
│   ├── feature-context.md
│   └── constraints.md
├── reports/                        # review outputs
└── tasks/                          # task breakdown

.dapei/features/payment-refactor.yaml   # global index
```

**feature.yaml Schema**:
```yaml
name: payment-refactor
repos:
  - name: mall-payment
    branch: feature/payment-refactor
    base-ref: abc1234        # master commit hash at creation
    base-time: 2026-05-13T10:00:00Z
  - name: mall-order
    branch: feature/payment-refactor
    base-ref: def5678
    base-time: 2026-05-13T10:00:00Z
created-at: 2026-05-13T10:00:00Z
```

**Branch Naming**: `feature/<feature-name>` in each repo

**Post-Creation Flow**:
After feature creation, AI prompts user to describe background and objective, then generates `feature-context.md`. Code scanning is on-demand (`@dapei 扫描一下代码库`).

### 3.2 feature review

**Trigger**: Manual via `@dapei review <feature-name>`

**Flow**:
```
User: @dapei review payment-refactor
AI:   🔍 分析 2026-05-12 到现在的所有提交:
      • 3 个新提交
      • 涉及 12 个文件
      • 新增 580 行，删除 120 行
      ✅ 报告已生成
```

**Review Scope**: All commits since last review (tracked via `last-review-at` in feature.yaml)

**Review Report Format**:
```markdown
# Daily Review: payment-refactor
Date: 2026-05-13

## 概览
- 📅 周期: 2026-05-12 → 2026-05-13
- 📝 新提交: 3 个
- 📊 变更: +580/-120 行

## 提交列表
| 时间 | 作者 | Commit | 消息 |
|------|------|--------|------|
| 10:30 | zhangsan | abc1234 | feat: add payment callback |
| 11:15 | lisi | def5678 | fix: null pointer in PayService |
| 14:00 | wangwu | ghi9012 | refactor: extract validator |

## 文件变更
| 文件 | 新增 | 删除 | 类型 |
|------|------|------|------|
| PayService.java | +120 | -30 | 修改 |
| OrderController.java | +80 | -20 | 修改 |
| new: PayValidator.java | +60 | -0 | 新增 |

## 架构合规 ✅
- Layering: ✅ 符合
- 依赖方向: ✅ 符合

## 测试覆盖 🟡
- PayService.java: ⚠️ 缺少单元测试

## 问题标注 ⚠️
- OrderController.java:45 - 异常处理不规范
- PayValidator.java:15 - 建议添加 null 检查
```

**Review Dimensions**:
1. 新增了什么 - 提交列表、涉及文件
2. 变更摘要 - 按文件/模块的改动概要
3. 架构合规 - 是否符合 layering 等规则
4. 问题标注 - 风险、写得不好的地方、bug 隐患
5. 测试覆盖 - 新代码是否有测试

---

## 4. Feature Status

**Flow**:
```
User: @dapei 看看现在有哪些需求
AI:   📋 需求概览 (2):
      🔵 payment-refactor  - implementation 阶段
         ├── mall-payment  - feature/payment-refactor (abc1234...8天前)
         └── mall-order    - feature/payment-refactor (def5678...8天前)
      🟡 order-optimize    - analyze-current-state 阶段
         └── mall-order    - feature/order-optimize (ghi9012...3天前)
```

---

## 5. Command Summary

| Command | Example |
|---------|---------|
| codebase add | `@dapei 我想增加一个新代码库 mall-payment` |
| codebase sync | `@dapei 同步 mall-payment` |
| codebase list | `@dapei 看看现在有哪些代码库` |
| feature create | `@dapei 创建一个支付优化的需求，涉及 mall-payment 和 mall-order` |
| feature review | `@dapei review payment-refactor` |
| feature scan | `@dapei 扫描一下代码库` |
| feature status | `@dapei 看看现在有哪些需求` |

---

## 6. Design Principles

1. **No side effects on user repos** - No git hooks in user codebases
2. **On-demand scanning** - User explicitly triggers code scanning
3. **Incremental review** - Review only new commits since last review
4. **Branch metadata** - Track base commit hash for future diff/reference
5. **Isolated feature workspaces** - Each feature has its own context directory

---

## CLI Reference (v0.2)

### Codebase Commands
- `dapei codebase add <name> <git-url>` - Add new codebase (interactive clone)
- `dapei codebase sync <name>` - Sync latest from origin
- `dapei codebase list` - List all codebases

### Feature Commands
- `dapei create feature <name> --repos repo1,repo2` - Create with branch creation
- `dapei review feature <name>` - Generate incremental review
- `dapei status feature` - Show all features and branch status

### Implementation Status (2026-05-14)
All commands implemented in `scripts/dapei`:
- ✅ codebase add/sync/list
- ✅ feature create (with feature branch creation and base-ref tracking)
- ✅ feature review (incremental, with last-review-at tracking)
- ✅ feature status
- ✅ IFS syntax fix applied

### Schema Files
- `.dapei/codebases.schema.yaml` - Codebase registry schema (v0.1)
- `.dapei/feature-v2.schema.yaml` - Enhanced feature manifest schema (v0.2)