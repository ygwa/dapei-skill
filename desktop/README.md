# 大培桌面端

> **桌面端 = 工作空间启动器 + 产品认知浏览器 + Feature 执行指挥台**
> 深度编码由底层 Agent（OpenCode ACP）驱动；GUI 负责空间、状态、确认与可视化。

## 当前状态

**M1 shipped** (commit TBD on `feature/desktop-m1-m2`).

M1 包含：

- 真实接 engine（`engine/dapei-engine.ts` 通过 subprocess 调用）
- P0 启动层：recents 持久化、原生目录选择器、validate + setContext
- P1 Dashboard：status / 资产健康
- P2 Repos：list / add / sync
- P4 Features：list / create / status / stage
- P5 Workbench：左 context / 中 agent 对话 / 右 Inspector + 阶段确认闸门
- Agent-Share v1：ACP stdio JSON-RPC，mock backend（CI）+ opencode backend（真）
- 维度规则（ADR-0010）由 engine-client 强制，不依赖 UI 自觉
- 6 份 ADR（0007-0011、0010）作为工程决策的可追溯记录
- 48 个 node:test + dimension self-check 全部 green

详细能力清单见 [`docs/M1-acceptance.md`](docs/M1-acceptance.md)。

## 目录

```
desktop/
├── apps/electron/          @dapei/desktop-app (Electron 壳 + Renderer)
└── packages/               见 packages/README.md
    ├── contracts/          IPC / 事件 / 插件 manifest 类型
    ├── plugin-sdk/         第三方插件 SDK
    ├── engine-client/      dapei-engine 桥接 + 维度规则
    ├── services/           领域服务（workspace/repos/feature/...）
    ├── agent/              Agent-Share (ACP stdio + mock + opencode)
    ├── git/                Git 观测
    ├── knowledge/          CDR portal / 资产
    ├── plugins/            PluginHost
    └── ui/                 共享 React 组件
```

设计文档：[`../design-desktop/`](../design-desktop/)。
实现 plan：[`../.omo/plans/desktop-m1-m2.md`](../.omo/plans/desktop-m1-m2.md)。

## 开发

```bash
cd desktop && pnpm install
pnpm dev          # Electron + HMR
pnpm typecheck    # 全 workspace
pnpm test         # 48 tests + dimension self-check
pnpm build        # 产出 out/
```

仓库根：`pnpm desktop:dev` / `pnpm desktop:typecheck` /
`pnpm desktop:build`。

### 环境变量（Main）

| 变量 | 含义 |
|------|------|
| `DAPEI_MONOREPO_ROOT` | 指向 `dapei-skill/` 根（默认从 `out/main` 向上解析） |
| `DAPEI_ENGINE_MODE=stub` | 使用 `StubEngineClient`，不 spawn 子进程 |
| `DAPEI_WORKSPACE_ROOT` | 与引擎一致的 workspace 根目录 |

## 测试

| 命令 | 覆盖 |
|------|------|
| `pnpm test:contract` | 19 — EngineClient + dimension-rules 契约 |
| `pnpm test:ipc` | 11 — IPC 通道 + Zod schema 契约 |
| `pnpm test:registry` | 7 — `~/.dapei/desktop/recent.json` registry |
| `pnpm test:integration` | 3 — 端到端 subprocess + 引擎 capability |
| `pnpm test:dimension` | 2 — 端到端 dimension 拦截 |
| `pnpm test:agent` | 6 — MockAgentBackend 脚本对话 |
| `pnpm check:dimension-rules` | 自检：扫 core capabilities 对齐 blocklist |
| `pnpm test` | 全部 |

CI 不跑 Electron e2e（macOS runner 慢；Electron 在 xvfb 难测）。
E2E 在本地跑 [`docs/M1-acceptance.md`](docs/M1-acceptance.md) 8 步。

## 故障排查

[`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)

## ADR 索引

- [ADR-0007](../docs/decisions/ADR-0007-desktop-versioning.md) — 桌面端版本与 Skill 同 major、独立 minor
- [ADR-0008](../docs/decisions/ADR-0008-engine-client.md) — EngineClient 是契约不是实现
- [ADR-0009](../docs/decisions/ADR-0009-workspace-context.md) — WorkspaceContext 通过 spawn-env 注入
- [ADR-0010](../docs/decisions/ADR-0010-dimension-rule-engine-client.md) — 维度规则在 engine-client 拦截
- [ADR-0011](../docs/decisions/ADR-0011-acp-stdio-agent.md) — Agent-Share v1 用 ACP stdio JSON-RPC

## 路线

- **M1** (shipped) — engine 真实化 + Agent-Share v1
- **M2** (next) — Knowledge portal 内嵌 + EvidenceCard/ToolCallCard + PluginHost L1
- **M3** (later) — 流水线 + 生态
