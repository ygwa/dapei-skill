# 大培桌面端设计文档

> 本目录存放大培（dapei）桌面应用的产品与工程设计方案。  
> 状态：**草案 v0.1** · 技术栈：React、Electron、TypeScript、Tailwind CSS、shadcn/ui

## 文档索引

| 文档 | 内容 |
|------|------|
| [ui-design.md](./ui-design.md) | 产品定位、页面结构（P0–P7）、布局、交互流、Agent-Share GUI、路由表 |
| [architecture.md](./architecture.md) | pnpm workspace 包拆解、分层架构、IPC、插件化、测试与分期落地 |

## 原型

| 文件 | 说明 |
|------|------|
| [ui.tsx](./ui.tsx) | 早期 UI 线框 React 原型（工作空间概览、Feature 执行区、知识图谱等） |

## 设计原则（摘要）

1. **大培桌面 = 工作空间操作系统壳**，不是又一个 IDE。
2. **引擎复用**：业务状态变更走 `@dapei/core` 的 `runCapability`；桌面不重复实现 feature / git 写逻辑。
3. **AI 委托**：深度编码由底层 OpenCode / Claude Code 驱动；GUI 负责空间、阶段、确认与可视化（Agent-Share 模式）。
4. **双维度可见**：Workspace 维度（全局 `docs/`）与 Feature 维度（`features/<f>/`）在 UI 中明确区分。
5. **本地优先**：工作空间即磁盘目录契约（`repos/`、`docs/`、`features/`、`.dapei/`），与 Skill 层一致。

## 与主仓库的关系

- **Skill / 引擎**：仓库根 `SKILL.md`、`packages/core`、`engine/` — 行为契约与确定性执行。
- **桌面端**：`apps/desktop` + `packages/desktop-*`（见 [architecture.md](./architecture.md)）— 待实现。
- **本目录**：设计阶段的单一信息源，实现前以本文档为准；重大变更应同步更新并考虑写入 `docs/decisions/` ADR。

## 阅读顺序

1. [ui-design.md](./ui-design.md) — 先理解用户看到什么、怎么操作。
2. [architecture.md](./architecture.md) — 再理解代码如何拆包、如何接引擎。
3. [ui.tsx](./ui.tsx) — 对照可视化原型（导航项与 ui-design 略有演进，以 ui-design 为准）。
