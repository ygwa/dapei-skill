---
name: dapei-repos
description: Manage the repo registry — add/sync/list/check/analyze/remove repos under a dapei workspace. Use when adding a repo to the workspace, syncing repo state, listing managed repos, or analyzing a repo for technical inventory.
---

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

1. 验证 repo 名称和 Git remote URL
2. 将 repo 添加到 `repos/<name>/` 基座池
3. 更新 `.dapei/repos.yaml` 注册信息
4. 对齐默认分支并 fast-forward 到 `origin/<default>`
5. 后续 feature 创建时再映射 `features/<feature>/repos/<repo>` worktree
6. **可选**:传入 `auto_profile: true`,克隆完成后立即调 `cdr.profile`,
   写入 `docs/as-is/profiles/<name>.yaml`,返回 `profile_path`。
   默认 `false`(与 v1.0 行为一致)。

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

> **v2.0 BREAKING**: `repos.analyze` now defaults to `use_cdr: true`. The
> capability delegates to `cdr.profile` and writes a structured YAML
> profile to `docs/as-is/profiles/<repo>.yaml`. The legacy grep-style
> shape (with `repos[]`, `structure[]`, `apiEndpoints[]`, …) is still
> available via `{ use_cdr: false }` and will be removed in a future
> release. Existing callers must either accept the new shape or
> explicitly opt in to the legacy path.

**CDR-backed mode (`use_cdr: true`, default)**:

1. Resolve target repos (`--all` reads `repos.yaml`).
2. For each repo, call `cdr.profile` and capture the per-repo profile
   yaml path, language, manifest files, test commands, and CodeGraph
   block.
3. Return shape:
   ```ts
   {
     target: string,
     use_cdr: true,
     profiles: [{
       name: string,
       profile_path: string,      // relative to workspace root
       language: string | null,
       manifest_files: string[],
       test_commands: string[],
       codegraph: { available, version, backend, files_total?, apisurface_count?, reason? }
     }],
     next_step: string            // hint for the AI
   }
   ```
4. Side effect: `docs/as-is/profiles/<repo>.yaml` written per repo.

**Legacy mode (`use_cdr: false`, deprecated)**:

1. Run grep-style scan (find / grep over the repo).
2. Write `docs/as-is/repo-inventory.md`.
3. Return shape includes `repos[]`, `report`, plus `deprecated: true`
   so downstream consumers can detect the legacy path.

**分析产出示例** (CDR-backed):
```yaml
# docs/as-is/profiles/payment-service.yaml
repo: payment-service
language: nodejs
manifest_files:
  - package.json
  - tsconfig.json
test_commands:
  - npm test
directory_tree:
  - src
  - src/controllers
  - src/services
  - src/entities
codegraph:
  available: true
  version: 0.4.1
  backend: native
  files_total: 142
```

---

## 用户入口

```
@dapei repos add payment-service git@github.com:org/payment-service.git
```

```
@dapei repos add payment-service git@github.com:org/payment-service.git --auto-profile
```

(auto-profile: 在 add 完成后立即调 cdr.profile,等价于先 add 再调
`@dapei bootstrap payment-service`。)

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
