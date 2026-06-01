# dapei.repos skill

负责 repos 的 add/sync/list/analyze 生命周期管理。

## 边界

| dapei 平台 | Agent |
|------------|-------|
| repo 元数据存储、worktree 映射、索引 | 理解 repo 业务域、选择分析入口 |
| 输出结构化 repo.yaml | 理解「这个 repo 做什么」 |

**禁止**：平台用 grep/正则替 Agent 做语义分析。

## 路由能力

| 意图 | Capability |
|------|------------|
| 添加 repo 到 workspace | `repos.add` |
| 同步 repo 最新状态 | `repos.sync` |
| 检查 repo 健康状态 | `repos.check` |
| 列出已管理 repo | `repos.list` |
| 分析 repo 架构 | `repos.analyze` |
| 移除 repo | `repos.remove` |

---

## 工作流（方法，非实现）

### Add（添加）

1. 验证 repo 路径存在或是有效 remote URL
2. 创建 `repos/<name>/` 工作目录
3. 初始化 `repo.yaml` 元数据
4. 检测栈类型（Node/Python/Go/Java）和测试框架
5. 创建初始 worktree 映射

**repo.yaml 示例**：
```yaml
name: payment-service
path: repos/payment-service
type: remote
url: git@github.com:org/payment-service.git
stack: node
test_framework: jest
branches:
  main: worktree
  feature/*: ephemeral
```

### Sync（同步）

1. fetch remote 最新状态
2. 更新 `repo.yaml` 中的 last_synced 时间戳
3. 检查是否有新的 branch 映射需求

### List（列表）

输出 workspace 下所有已注册 repo：
```yaml
repos:
  - name: payment-service
    status: active
    last_synced: 2025-05-20
  - name: billing-core
    status: active
    last_synced: 2025-05-19
```

### Analyze（分析）

1. 扫描 repo 目录结构
2. 读取 manifest 文件（package.json, go.mod, pom.xml 等）
3. 检测测试命令和验证方式
4. 收集架构证据（目录结构、入口点）
5. 输出 `docs/as-is/repo-inventory.md`
6. 可选：生成 `docs/architecture/technical-current-state.md`

**分析产出示例**：
```yaml
repo: payment-service
stack: node
language: typescript
frameworks:
  - express (web framework)
  - typeorm (ORM)
test_commands:
  - npm test (unit)
  - npm run test:e2e (e2e)
entry_points:
  - src/index.ts (HTTP server)
  - src/workers/payment.ts (message consumer)
directories:
  - src/controllers (HTTP handlers)
  - src/services (business logic)
  - src/entities (typeorm models)
```

---

## 用户入口

```
@dapei repos add payment-service --path ./repos/payment-service --type local
```

```
@dapei repos sync payment-service
```

```
@dapei repos list
```

```
@dapei repos analyze payment-service
```

```
@dapei repos analyze --all
```

---

## 与其他 skill 的协作

- **feature**：feature 依赖 repo 的 worktree 映射
- **cognitive**：analyze 产出 as-is 文档供 cognitive 阶段使用
- **validation**：分析阶段检测测试框架供 validation 使用
- **workspace**：repos 在 workspace 根目录下管理