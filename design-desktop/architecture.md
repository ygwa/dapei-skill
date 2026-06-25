# 大培桌面端 — 工程架构设计

> 状态：草案 v0.1  
> 关联：[ui-design.md](./ui-design.md) · 引擎契约：仓库根 `CLAUDE.md`、`agents.md`

---

## 1. 背景与目标

### 1.1 背景

大培（`dapei.skill`）当前是 **Skill + 确定性引擎**：

- 用户通过 `@dapei` 与 AI 对话
- 引擎通过 `runCapability(id, input, ctx)` 执行 workspace / repos / feature / CDR 等
- 知识沉淀在：`repos/`、`docs/`、`features/`、`.dapei/`

桌面端将上述契约 **可视化**，并通过 **Agent-Share** 串联 OpenCode / Claude Code。

### 1.2 架构目标

| 目标 | 说明 |
|------|------|
| **复用引擎** | 状态变更走 `@dapei/core` capability，桌面不重复 feature/git 写逻辑 |
| **模块化** | Feature、Git、Agent、知识浏览等独立成包，可单测 |
| **可插件化** | UI 面板、Agent 后端、门户渲染可插拔 |
| **进程安全** | Electron 主进程特权；渲染进程 typed IPC |
| **同仓演进** | 开发期 monorepo 内联；`@dapei/*` 可独立发版 |

### 1.3 非目标（第一版）

- 桌面内置 LLM / 自研 Agent 调度器
- 在 `@dapei/core` 内加入 UI 或框架 regex
- 替代 Cursor / VS Code 做深度编辑

---

## 2. 与现有仓库的关系

### 2.1 策略：同仓 `desktop/` 独立 pnpm workspace，不 fork 引擎

`desktop/` 为**嵌套 pnpm workspace**（自有 `pnpm-workspace.yaml` 与 lockfile），与根 `dapei-skill` 引擎同仓、未来可整目录拆出为独立产品。

```
dapei-skill/
├── desktop/                          # 独立 pnpm workspace 根
│   ├── apps/
│   │   └── electron/                 # @dapei/desktop-app
│   ├── packages/
│   │   ├── contracts/                # @dapei/desktop-contracts
│   │   ├── plugin-sdk/               # @dapei/desktop-plugin-sdk（第三方插件）
│   │   ├── engine-client/            # @dapei/desktop-engine-client
│   │   ├── services/                 # @dapei/desktop-services
│   │   ├── agent/                    # @dapei/desktop-agent
│   │   ├── git/                      # @dapei/desktop-git
│   │   ├── knowledge/                # @dapei/desktop-knowledge
│   │   ├── plugins/                  # @dapei/desktop-plugins（内置 Host）
│   │   └── ui/                       # @dapei/desktop-ui
│   ├── package.json
│   └── pnpm-workspace.yaml
├── packages/                         # 引擎 @dapei/core 等（根 workspace）
├── engine/
└── skills/
```

**注意**：根 `pnpm-workspace.yaml` **不**包含 `desktop/`；在 `desktop/` 目录内单独 `pnpm install`。

### 2.2 依赖方向（硬约束）

```
apps/electron (desktop-app)
    → @dapei/desktop-*
        → （未来）@dapei/core 等引擎包（npm 或 file: 协议）

desktop/packages/* · desktop/apps/*     # 不得依赖仓库根 skills/
packages/core（根）                       # 不得依赖 desktop/*
```

**红线**：`@dapei/core` 保持 headless；桌面逻辑不得污染 capability 域。

---

## 3. Monorepo 配置

### 3.1 `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'engine'
```

### 3.2 根脚本（规划）

```json
{
  "scripts": {
    "desktop:dev": "pnpm --filter @dapei/desktop dev",
    "desktop:build": "pnpm --filter @dapei/desktop build",
    "desktop:test": "pnpm --filter '@dapei/desktop-*' test"
  }
}
```

### 3.3 包命名

| 前缀 | 含义 | 运行环境 |
|------|------|----------|
| `@dapei/core` 等 | 引擎 / Skill | Node.js |
| `@dapei/desktop-*` | 桌面领域 | Node main + 部分 isomorphic |
| `@dapei/ui` | React 组件 | Renderer |
| `@dapei/desktop` | Electron 应用 | Main + Renderer |

---

## 4. 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation — apps/desktop/renderer (React + shadcn)       │
│  Pages: P0–P7（见 ui-design.md）                              │
└───────────────────────────┬─────────────────────────────────┘
                            │ @dapei/desktop-contracts (IPC)
┌───────────────────────────▼─────────────────────────────────┐
│  Application — apps/desktop/main                               │
│  IPC · windows · plugin host · file watchers                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Domain Services — @dapei/desktop-services                     │
│  Workspace · Feature · Repos · Knowledge · Pipeline            │
└───────┬─────────────────┬─────────────────┬─────────────────┘
        │                 │                 │
┌───────▼──────┐ ┌────────▼────────┐ ┌───────▼──────────────┐
│ desktop-git  │ │ desktop-agent   │ │ desktop-knowledge    │
└───────┬──────┘ └────────┬────────┘ └───────┬──────────────┘
        └─────────────────┼─────────────────┘
┌─────────────────────────▼───────────────────────────────────┐
│  Engine — @dapei/core · @dapei/router · @dapei/doc-gen         │
└─────────────────────────┬─────────────────────────────────────┘
┌─────────────────────────▼─────────────────────────────────────┐
│  Infrastructure — runtime-adapters · 用户 workspace 磁盘        │
└─────────────────────────────────────────────────────────────┘
```

| 层 | 做 | 不做 |
|----|-----|------|
| Renderer | 路由、表单、可视化、确认闸门 | 直接 fs/spawn/runCapability |
| Main + Services | IPC、watch、调 capability | 读码、LLM |
| Engine | 确定性变更、证据校验 | UI、PTY（已废弃，改 ACP） |

---

## 5. 包拆解详设

> 各包内部目录与 `desktop/packages/README.md` 保持同步。

### 5.0 包依赖总览

| 包 | 依赖 |
|----|------|
| `contracts` | — |
| `plugin-sdk` | contracts |
| `engine-client` | contracts |
| `services` | contracts, engine-client |
| `agent` | contracts |
| `git` | — |
| `knowledge` | — |
| `plugins` | contracts, plugin-sdk |
| `ui` | — |
| `apps/electron` | 全部（按需引用） |

### 5.1 `@dapei/desktop-contracts`

全仓 IPC、事件、插件 API 的 **唯一类型源**。

```typescript
export interface CapabilityInvokeRequest {
  capabilityId: string;
  input: Record<string, unknown>;
  workspaceRoot: string;
  feature?: string;
}

export interface CapabilityInvokeResponse {
  ok: boolean;
  data: unknown;
  sideEffects: string[];
  artifactPaths?: string[];
  error?: { code: string; message: string };
}

export type AgentEvent =
  | { type: 'session:ready'; sessionId: string }
  | { type: 'message:user'; text: string }
  | { type: 'message:assistant'; text: string }
  | { type: 'tool:call'; name: string; input: unknown }
  | { type: 'tool:result'; name: string; output: unknown }
  | { type: 'capability:invoked'; id: string; ok: boolean };

export interface DesktopPluginManifest {
  id: string;
  version: string;
  contributes: {
    routes?: RouteContribution[];
    sidebar?: SidebarContribution[];
    featurePanels?: FeaturePanelContribution[];
    agentBackends?: AgentBackendContribution[];
  };
}
```

依赖：仅 TypeScript（可选 Zod 校验 payload）。

**子模块**：`src/ipc/` · `src/events/` · `src/plugin/`（manifest + contributes）

---

### 5.1a `@dapei/desktop-plugin-sdk`

第三方插件作者依赖面；re-export `contracts/plugin` 类型与常量。不依赖 electron app。

---

### 5.1b `@dapei/desktop-engine-client`

`EngineClient` 接口；对接根仓库 `dapei-engine` / `runCapability`。`services` 仅依赖此接口。

---

### 5.2 `@dapei/desktop-services`

桌面对外领域 API；写操作统一 `runCapability`。

| Service | Capability | 额外职责 |
|---------|------------|----------|
| `WorkspaceService` | `workspace.*` | 最近列表、打开/校验 |
| `ReposService` | `repos.*` | 列表聚合、同步进度事件 |
| `FeatureService` | `feature.*`, `workflow.*`, `context.build` | stage 视图、确认闸门 |
| `KnowledgeService` | `cdr.index.list`, `cdr.doc.generate` | portal 构建 |
| `PipelineService` | `cdr.bootstrap`, `cdr.pipeline.status` | CDR 流水线 UI |
| `AuditService` | `audit.query` | Agent 工具卡片数据 |

```typescript
export class FeatureService {
  constructor(
    private readonly engine: EngineClient,
    private readonly ctx: WorkspaceContext,
  ) {}

  async create(input: FeatureCreateInput) {
    return this.engine.run('feature.create', input, this.ctx);
  }

  async getStage(featureId: string): Promise<FeatureStageView> {
    const status = await this.engine.run('feature.status', {}, this.ctx);
    return mapToStageView(status, featureId);
  }
}
```

**原则**：Service 可读聚合多文件；**写**必须走 capability。

**子模块**：`workspace/` · `repos/` · `feature/` · `knowledge/` · `pipeline/`（含 `task-list.ts` 任务清单类型）· `audit/`

工厂：`createDesktopServices(engine, { rootDir })`

---

### 5.3 `@dapei/desktop-git`

Git **观测与展示**；写操作委托 `ReposService.sync` 等。

| 模块 | 功能 |
|------|------|
| `GitStatusReader` | branch、ahead/behind、dirty |
| `WorktreeInspector` | feature worktree 路径 |
| `SyncScheduler` | 触发 `repos.sync` |

与 `@dapei/runtime-adapters` 分工：

- `runtime-adapters`：capability 内部 `run('git', ...)`
- `desktop-git`：UI 向结构化状态，可缓存、watch

稳定后可抽 `@dapei/git-core` 共用。

---

### 5.4 `@dapei/desktop-agent`

Agent-Share：**一个 Agent 进程，多 UI 表面订阅**。

```
AgentHost
 ├── AgentBackendRegistry    # opencode | claude-code | custom
 ├── SessionManager          # per-workspace / per-feature
 ├── PtyBridge               # node-pty
 ├── ContextInjector         # runtime-context、维度规则
 └── EventParser             # stdout → AgentEvent
```

| 作用域 | Session | cwd 默认 |
|--------|---------|----------|
| Workspace | 0–1 | workspace root |
| Feature | 0–1 per feature | `features/<f>/` |

```typescript
export interface AgentBackend {
  id: 'opencode' | 'claude-code' | string;
  detect(): Promise<{ installed: boolean; path?: string }>;
  spawn(opts: AgentSpawnOptions): Promise<AgentSession>;
}
```

---

### 5.5 `@dapei/desktop-knowledge`

| 模块 | 功能 |
|------|------|
| `PortalBuilder` | `cdr.doc.generate` |
| `PortalServer` | 本地静态服务（避免 file:// CORS） |
| `AssetIndex` | cognitive index + `docs/as-is/**` |
| `EvidenceResolver` | `sources[]` → 绝对路径 |

依赖 `@dapei/doc-gen`，不复制 VitePress 模板。

---

### 5.6 `@dapei/desktop-plugins`

扫描路径：

```
~/.dapei/plugins/
<workspace>/.dapei/plugins/   # 可选
```

流程：读 manifest → Zod 校验 → 注册 contributes → main 动态 import（信任目录/签名）。

---

### 5.7 `@dapei/ui`

共享 React + shadcn：Shell、StageStepper、EvidenceCard、DimensionBadge、ToolCallCard。  
不直接 IPC；由 `apps/desktop/renderer` 提供 hooks。

---

### 5.8 `apps/desktop`

```
apps/desktop/
├── electron.vite.config.ts
├── package.json                 # @dapei/desktop
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── ipc/
│   │   ├── windows/
│   │   └── bootstrap.ts
│   ├── preload/
│   │   └── api.ts
│   └── renderer/
│       ├── main.tsx
│       ├── routes/
│       ├── features/
│       └── hooks/
└── resources/
```

**Main 启动序列**

1. `loadConfig`（`~/.dapei/desktop/config.json`）
2. `PluginHost.init()`
3. `WorkspaceRegistry.loadRecents()`
4. `createLauncherWindow()`
5. 打开 workspace 后：`FileWatcher` + `PortalServer` + `AgentHost`

---

## 6. IPC 设计

### 6.1 通道

```
dapei:workspace:*      # open, validate, init, status
dapei:repos:*          # list, add, sync
dapei:feature:*        # create, status, stage, close
dapei:knowledge:*      # portalBuild, getUrl, assetTree
dapei:agent:*          # attach, send, subscribe, injectContext
dapei:capability:run   # allowlist 兜底
dapei:plugin:*         # list, enable, disable
```

### 6.2 事件（Main → Renderer）

Agent 输出、文件变更、sync 进度经 `webContents.send`。

### 6.3 `capability:run` 安全

Renderer 仅允许 allowlist；`repos.remove`、`feature.close` 等需二次确认 token。

---

## 7. 插件化

### 7.1 三档（分期）

| 档位 | 扩展点 | 版本 |
|------|--------|------|
| **L1 UI** | 路由、侧栏、Feature 面板 | M1 |
| **L2 Integration** | AgentBackend、编辑器、Git 托管 API | M2 |
| **L3 Pipeline** | CDR 步骤、门户主题 | M3 |

MVP：**L1 + AgentBackend**；不开放任意 capability 注册。

### 7.2 Manifest 示例

```json
{
  "id": "acme.cursor-bridge",
  "version": "1.0.0",
  "main": "./dist/main.js",
  "renderer": "./dist/renderer.js",
  "contributes": {
    "sidebar": [
      { "id": "acme.cursor", "label": "在 Cursor 打开", "route": "/acme/cursor" }
    ],
    "agentBackends": [
      { "id": "cursor-agent", "label": "Cursor Agent", "module": "./backends/cursor.js" }
    ]
  }
}
```

---

## 8. UI 页面与包对照

| UI（ui-design.md） | 包 | Service |
|--------------------|-----|---------|
| P0 | desktop-services | WorkspaceService |
| P1 | desktop-services, desktop-git | WorkspaceService |
| P2 | desktop-services, desktop-git | ReposService |
| P3 | desktop-knowledge | KnowledgeService |
| P4 | desktop-services | FeatureService |
| P5 | desktop-agent, desktop-services | AgentHost, FeatureService |
| P6 | desktop-services | PipelineService |
| P7 | apps/desktop/main | config, PluginHost |

---

## 9. 数据流示例

### 9.1 创建 Feature

```
Renderer submit → IPC feature:create
→ FeatureService → runCapability('feature.create')
→ GitWorktreeInspector.refresh()
→ AgentHost.offerAttach(featureId)
→ navigate /features/:id
```

### 9.2 Agent-Share 消息

```
Renderer agent:send → PtyBridge.write
→ OpenCode 处理（可能调 dapei-engine）
→ EventParser → agent:event + audit
→ ChatProjection + ToolCallCard
```

### 9.3 重建门户

```
knowledge:portalBuild → cdr.doc.generate
→ PortalServer.restart → webview 刷新
```

---

## 10. 技术栈

| 项 | 选型 |
|----|------|
| 桌面 | Electron 33+ |
| 构建 | electron-vite 或 Electron Forge + Vite |
| 前端 | React 19, React Router 7 |
| 样式 | Tailwind CSS 4（`@tailwindcss/vite`），shadcn/ui（M1 初始化） |
| 状态 | TanStack Query（服务端/IPC 缓存）+ Zustand（UI 局部） |
| Agent 协议 | **ACP**（Agent Client Protocol）stdio JSON-RPC；PTY 已废弃 |
| 插件沙箱 | Electron **Utility Process**（`utility/plugin-host.js`） |
| 校验 | Zod |
| 测试 | Vitest（packages）, Playwright（E2E） |

### Renderer 推送 → Query 失效

Main 经 `dapei:push` 广播 `DesktopPushEvent`；Preload `events.subscribe` 暴露给 renderer；`useDesktopPushInvalidation` 在 `dapei:workspace:mutated` 时局部 `invalidateQueries`。

### 环境变量

| 变量 | 设置方 | 含义 |
|------|--------|------|
| `DAPEI_WORKSPACE_ROOT` | Main | 与 engine 一致 |
| `DAPEI_FEATURE` | Agent attach | 当前 feature |
| `DAPEI_DIMENSION` | Agent attach | `workspace` \| `feature` |

---

## 11. 测试策略

| 层级 | 内容 |
|------|------|
| desktop-services | Service ↔ capability 映射 |
| desktop-agent | EventParser、Session 生命周期 |
| desktop-contracts | schema 往返 |
| E2E | P0 建 workspace → P2 加 repo → P4 建 feature |
| 边界 | eslint：renderer 不得 import `@dapei/core` |

---

## 12. 分期落地

### M0 — 骨架（2–3 周）

- `apps/desktop` + `desktop-contracts` + `desktop-services`（Workspace、Repos）
- P0 / P1 / P2 + IPC
- 底栏 Terminal（cwd 绑定）

### M1 — Feature + Agent（3–4 周）

- `desktop-agent`、`desktop-git`
- P4 / P5、Stage Stepper
- Agent-Share v1
- `@dapei/ui` 基础组件

### M2 — 知识 + 插件 L1（3–4 周）

- `desktop-knowledge`、P3
- `desktop-plugins` L1
- 确认闸门、audit 卡片

### M3 — 流水线 + 生态

- P6、Close 向导
- AgentBackend 插件、外链编辑器

---

## 13. 开放问题（待 ADR）

| # | 问题 | 倾向 |
|---|------|------|
| 1 | 桌面与 skill 同版本号？ | 同 major，desktop 独立 minor |
| 2 | Portal webview vs BrowserView？ | BrowserView + 本地 server |
| 3 | 插件任意 capability？ | 否；Main allowlist + 确认 |
| 4 | 抽 `@dapei/git-core`？ | desktop-git 稳定后 |
| 5 | 单仓 vs 独立 repo？ | 先单仓 |

---

## 14. 决策摘要

| 决策 | 结论 |
|------|------|
| 仓库形态 | monorepo + `apps/desktop` + `@dapei/desktop-*` |
| 业务逻辑 | 写操作一律 capability；Service 编排与视图聚合 |
| Git / Feature | `desktop-git` 观测 + `FeatureService` / `ReposService` 写 |
| Agent | `desktop-agent`，Agent-Share，不内置 LLM |
| 插件 | L1 UI + L2 Integration 优先 |
| UI | React + Electron + Tailwind + shadcn |
