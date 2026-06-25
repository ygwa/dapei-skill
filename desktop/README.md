# 大培桌面端

独立 **pnpm workspace**，与仓库根 `dapei-skill` 引擎同仓、未来可整目录拆出。

## 目录

```
desktop/
├── apps/electron/          @dapei/desktop-app
└── packages/               见 packages/README.md
    ├── contracts/          IPC / 事件 / 插件类型
    ├── plugin-sdk/         第三方插件 SDK
    ├── engine-client/      dapei-engine 桥接接口
    ├── services/           领域服务（workspace / feature / pipeline…）
    ├── agent/              Agent-Share
    ├── git/                Git 观测
    ├── knowledge/          CDR portal / 资产
    ├── plugins/            PluginHost
    └── ui/                 共享 React 组件
```

## 开发

```bash
cd desktop && pnpm install
pnpm dev          # Electron + HMR
pnpm typecheck    # 全 workspace
pnpm build        # 产出 out/
```

仓库根：`pnpm desktop:dev`

### 环境变量（Main）

| 变量 | 含义 |
|------|------|
| `DAPEI_MONOREPO_ROOT` | 指向 `dapei-skill/` 根（默认从 `out/main` 向上解析） |
| `DAPEI_ENGINE_MODE=stub` | 使用 `StubEngineClient`，不 spawn 子进程 |
| `DAPEI_WORKSPACE_ROOT` | 与引擎一致的 workspace 根目录 |

### M0 已接线基础设施

- **Main**：`bootstrap.ts`、IPC stub、`SubprocessEngineClient`、Utility Process fork、push 广播
- **Preload**：`window.dapei`（workspace / capability / events.subscribe）
- **Renderer**：Tailwind 4、React Router 7（HashRouter）、TanStack Query、Zustand、P0/P1 占位页
- **Agent**：ACP stdio transport + `AcpSessionManager` 骨架（M1 接 OpenCode）

### Electron 启动失败（macOS）

若出现 `Library not loaded: @rpath/Electron Framework.framework`：

```bash
cd desktop && pnpm ensure-electron
```

原因：`electron` 的 `install.js` 使用 `extract-zip` 解压时，偶发漏掉 `Frameworks/`。`ensure-electron` 会用系统 `unzip` 从缓存重新解压完整包。`pnpm dev` / `postinstall` 已自动调用。

设计文档：[`../design-desktop/`](../design-desktop/)
