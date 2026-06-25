# desktop/packages

大培桌面端 **领域包** 层。与 `apps/electron`（应用壳）分离，便于单测与未来拆仓。

## 依赖图

```
                    apps/electron
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   desktop-ui      desktop-services    desktop-plugins
                          │                 │
              ┌───────────┼───────────┐     │
              ▼           ▼           ▼     ▼
        desktop-git  desktop-agent  desktop-knowledge
              │           │           │
              └───────────┴───────────┘
                          │
              desktop-engine-client
                          │
              desktop-contracts ◄── desktop-plugin-sdk
```

## 包一览

| 包 | npm 名 | 职责 |
|----|--------|------|
| [contracts](./contracts/) | `@dapei/desktop-contracts` | IPC、事件、插件 manifest **唯一类型源** |
| [plugin-sdk](./plugin-sdk/) | `@dapei/desktop-plugin-sdk` | 第三方插件开发入口（re-export + 约定） |
| [engine-client](./engine-client/) | `@dapei/desktop-engine-client` | 调用 dapei-engine / `runCapability` 的桥接 |
| [services](./services/) | `@dapei/desktop-services` | Workspace / Feature / Repos / Pipeline 等领域服务 |
| [agent](./agent/) | `@dapei/desktop-agent` | Agent-Share：ACP stdio JSON-RPC、Session、Backend 注册 |
| [git](./git/) | `@dapei/desktop-git` | Git 观测（branch、worktree、sync 状态） |
| [knowledge](./knowledge/) | `@dapei/desktop-knowledge` | CDR portal、资产索引、证据路径解析 |
| [plugins](./plugins/) | `@dapei/desktop-plugins` | 内置 PluginHost：发现、校验、加载 contributes |
| [ui](./ui/) | `@dapei/desktop-ui` | 共享 React 组件（无 IPC） |

## 分层规则

1. **contracts / plugin-sdk** 不依赖任何其他 desktop 包。
2. **renderer** 只依赖 `contracts`（经 preload）与 `ui`；禁止直接依赖 `services` / `engine-client`。
3. **main 进程** 组装 `services`、`agent`、`plugins`、`knowledge`。
4. **写操作** 必须经 `engine-client` → 引擎 capability；`git` / `knowledge` 只做读聚合。
5. 根仓库 `packages/core`（引擎）仅由 `engine-client` 对接，其他 desktop 包不得 import。

## 插件扩展点（见 architecture.md §7）

| 档位 | 注册位置 | 类型定义 |
|------|----------|----------|
| L1 UI | `plugins` → `PluginRegistry` | `contracts/plugin/contributes` |
| L2 Integration | `agent` → `AgentBackendRegistry` | `contracts/plugin` + `agent/backends` |
| L3 Pipeline | `services/pipeline` | 后续 ADR |

第三方插件作者应只依赖 `@dapei/desktop-plugin-sdk`，不依赖 `services` 或 `apps/electron`。
