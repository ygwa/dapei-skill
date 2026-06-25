# @dapei/desktop-services

领域服务层：**读聚合 + 调 capability 写**。由 `apps/electron` main 进程实例化。

## 模块

| 目录 | Service | 引擎 capability（规划） |
|------|---------|-------------------------|
| `workspace/` | WorkspaceService | `workspace.*` |
| `repos/` | ReposService | `repos.*` |
| `feature/` | FeatureService | `feature.*`, `workflow.*`, `context.build` |
| `knowledge/` | KnowledgeService | `cdr.index.list`, `cdr.doc.generate` |
| `pipeline/` | PipelineService | `cdr.bootstrap`, `cdr.pipeline.status` |
| `pipeline/task-list.ts` | 任务清单类型 | 未来 `cdr.entries.tasklist.*` |
| `audit/` | AuditService | `audit.query` |

## 工厂

```ts
createDesktopServices(engine, { rootDir })
```
