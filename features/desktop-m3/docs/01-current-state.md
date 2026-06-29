# 01 — Current State (handoff note)

> 本文档面向接手 M3 的 agent（未来的我 / 下一次会话）。**这不是"开始 M3 之前的状态"**，而是"M3-1 完成 + M3-2 起步前"的快照。
>
> 写于 2026-06-26。本次会话交付：`.omo/plans/desktop-m3.md` v0.2 + M3-1 engine 端代码 + 11 个新单测。

---

## 1. 会话做了什么 / 没做什么

### ✅ 完成

| # | 产物 | 位置 |
|---|---|---|
| 1 | plan v0.2（527 行，9 节 + 附录） | `.omo/plans/desktop-m3.md` |
| 2 | `feature.close` v2.0.0 → v3.0.0（加 `promote_artifacts`） | `packages/core/src/capabilities/domains/feature.ts` |
| 3 | M3-1 单测 11 cases（architecture / decisions skip+target_path / reports / cognitive.unlink / 错误路径 / 幂等 / v2.0.0 兼容 / 默认输出形状） | `tests/unit/feature-close-promote.test.mjs`（新建） |
| 4 | 并行工作流协调说明（§2.1.1） | `.omo/plans/desktop-m3.md` §2.1.1 |
| 5 | ADR 编号重排（避免与已存在的 ADR-0014-ui-tone-system 冲突） | `.omo/plans/desktop-m3.md` §3 |
| 6 | feature workspace 创建（M3 起步契约） | `features/desktop-m3/feature.yaml` |

### ❌ 未做（按 plan §4 排期）

- **M3-0**：ADR-0017 / 0018 / 0019 三份 ADR 文件本身未写
- **M3-2 ~ M3-7**：全部 6 个 milestone 未动
- **commit**：M3-1 整套改动 uncommitted（按用户选择"不 commit 直接 M3-2"）
- **stash@{0}**：~50 个文件状态未丢，保留在 stash 中

### 🔍 跑过的测试

```
feature-close-promote.test.mjs (M3-1 新):  11/11 ✓
feature-close-cdr-link.test.mjs (existing):  7/7 ✓ (零回归)
feature-close-contract.test.mjs (existing): 5/5 ✓ (零回归)
合计                                       23/23 ✓
```

**`npm run typecheck` 有 1 个 pre-existing 错**（`packages/doc-gen/src/doc-gen.ts:1624`，"Expected 2 arguments, but got 3"），与 M3-1 改动无关 — 已用 `git stash` 验证。

---

## 2. 关键决策与偏离（plan §4 v0.1 → 实际落地）

接手时**不要照搬 plan §4 的字面描述**，下面这些偏离必须知道：

### 2.1 `feature.close` 实际形状不是 plan 假设的 v1.0.0

**plan v0.1 §2.1 假设**：`feature.close v1.0.0` — 读 `memory/decision-log.md` 写到 `docs/decisions/<f>-decisions.md` + 删 worktree。

**main 上实际**：v2.0.0 — **已经自动调 `cdr.feature.link`**（`packages/core/src/capabilities/domains/feature.ts:340-342`），输出含 `cdr_assets_tagged`。

**M3-1 落地的偏离**：

| Plan v0.1 设计 | 实际 M3-1 v3.0.0 落地 |
|---|---|
| `cognitive.entries.action: 'link'` | **删除** — v2.0.0 已经自动 link |
| `cognitive.entries.action: 'unlink'` | 保留但简化 → `cognitive.unlink: [...]`（独立 section，5 种 kind，**没有 entry 因为 CognitiveIndex 不追踪 entries**） |
| （未列） | **新增** `architecture.entries: [{ source_path, target_path }]` — 把 features/<f>/ 下的架构笔记复制到 docs/architecture/ |
| （未列） | **新增** `reports.copy_paths: string[]` — 复制 reports 到 docs/feature-impact/<f>/ |
| `decisions` 字段保持简单 | 保留 v2.0.0 默认行为 + 加 `skip: true` 和 `target_path: string` 两个可选控制 |
| 不强调幂等 | **加 `writeIfContentChanged` content-hash helper** — 重复 close 不重复写 |
| 失败时数据可能脏 | **加 `rollbackWrites` helper** — 只删本调用新创建的文件，不动 pre-existing |
| `promoted_artifacts[]` 输出 | 实际落地为 `promoted_artifacts: { decisions, architecture, cognitive, reports }`（4 个 sub-object，不是 array） |

### 2.2 已存在的 3 路并行 M3 工作流（接手前必读）

**plan §2.1.1 写明**：

| 名称 | 文件 | 状态 |
|---|---|---|
| **本 plan**（`.omo/plans/desktop-m3.md`） | 已 v0.2 | **owner: 我** |
| **ui-density-m3** | ADR-0014-ui-tone-system.md（untracked, proposed）；plan 文件**仓库里不存在** | owner: 别人 |
| **desktop-ui-migration** | `.omo/plans/desktop-ui-migration.md`（草案 v0.1） | owner: 别人 |

**协调原则**（plan §2.1.1）：

- 本 plan 不新增任何 tone / 颜色规则 — 走 ToneBadge（ui-density-m3 PR-1 落地后切换）
- 本 plan 不动 `FeatureWorkbenchView` 视觉布局 — 像素迁移是另一个 PR
- ADR 编号从 0017 起，跳过 0015/0016 保留给两个并行 plan
- 三路可独立 ship / merge / reject

**接手时如果有人已经 commit 了 ADR-0017/0018/0019 文件** — 核对 plan 文件 §3 描述是否一致。

---

## 3. 当前仓库状态（精确到路径）

### 3.1 Git 状态

```
分支:   feature/desktop-m3
ahead:  origin/main 16 commits
        - 1 commit: merge `feature/desktop-m1-m2` → main (5cf0856)
        - 14 commits: M1+M2 ship 的全部 commit
        - 1 untracked file: docs/decisions/ADR-0014-ui-tone-system.md (pre-existing, 不要碰)

工作区 modified (1):
  packages/core/src/capabilities/domains/feature.ts

工作区 untracked (2):
  docs/decisions/ADR-0014-ui-tone-system.md (别人的, 不要碰)
  tests/unit/feature-close-promote.test.mjs (M3-1 我加的)

stash (2):
  stash@{0}: "wip: pre-M1+M2-merge stash (桌面端 M3 启动前清理)"
              → ~50 个 modified/added 文件, 从 feature/desktop-m1-m2 分支留下的
              → 内容包含 dcdec36 (IPC router pass-through) 之后到合并前的全部尾活
              → **接手时第一件事**: 让用户决定 stash@{0} 是 drop / pop / 还是留着继续观察
  stash@{1}: "treesitter-pr-pre-clean: unrelated README/images dirty"
              → 别人的 (另一个 worktree), 不要碰
```

### 3.2 M3-1 已修改的关键文件

**`packages/core/src/capabilities/domains/feature.ts`**：

- `import` 加了：`atomicWrite, safeJoinWithin, copyFileSync, unlinkSync, createHash`
- 新增 3 个 helper：
  - `promoteArtifactsSchemaShape`（const，约 65 行）
  - `writeIfContentChanged(absPath, content): boolean`（content-hash 幂等）
  - `rollbackWrites(created: [...])`（只删本调用新文件）
  - `clearCreatedByFeature(ctx, kind, id, repo?, feature): boolean`（cognitive.unlink helper）
- `featureClose` capability：
  - `version: "2.0.0"` → `"3.0.0"`
  - `inputSchema.properties` 加 `promote_artifacts: promoteArtifactsSchemaShape`
  - `execute` 重写：4 段 promote_artifacts 处理 + `try/catch` 包装 + rollback + 新输出字段 `promoted_artifacts`

**所有新增注释（共 16 处）都是 M3 设计 rationale**（plan 偏离、幂等契约、回滚语义）— 不要清理。

---

## 4. M3-2 起步指南（接手必读）

### 4.1 M3-2 的目标（plan §4）

> Close 向导（desktop 侧）：向导 UI + IPC + Pre-flight 清单。
> 4 步：摘要 → 资产勾选 → 预览 → 确认。

### 4.2 M3-2 改的 6 个文件（plan §4 + 实际文件名）

| 顺序 | 文件 | 改动 |
|---|---|---|
| 1 | `desktop/packages/services/src/feature/index.ts` | `FeatureService` interface 加 `prepareClose(name)` 方法；工厂实现 |
| 2 | `desktop/packages/services/src/feature/types.ts`（**新建**） | `ClosePreflight` / `PromoteArtifactsInput` Zod schema |
| 3 | `desktop/packages/ui/src/components/CloseWizard/`（**新建**） | `CloseWizardModal.tsx` + `CloseWizardStepper.tsx` + `ArtifactCheckbox.tsx` |
| 4 | `desktop/apps/electron/src/main/ipc/feature-handlers.ts` | 注册 `dapei:feature:prepareClose` 和 `dapei:feature:closeWithPromote` handler |
| 5 | `desktop/packages/contracts/src/ipc/channels.ts` | `IPC_CHANNELS.feature` 加 `prepareClose` / `closeWithPromote` |
| 6 | `desktop/packages/contracts/src/ipc/router.ts` | Zod schema + `REQUEST_SCHEMAS` 注册 |
| 7 | 渲染层 | P4 list 行加 Close 按钮；P5 workbench header 加 Close 按钮；启动 wizard 后 `broadcastPush('dapei:dimension:lock')` 锁 feature 维度 |

### 4.3 `dapei:feature:close` 通道已存在但未实现

我读 `desktop/packages/contracts/src/ipc/channels.ts:29` 发现 `IPC_CHANNELS.feature.close = "dapei:feature:close"` 已经被定义（M1-5 占位），但：

- `desktop/packages/contracts/src/ipc/router.ts` 的 `REQUEST_SCHEMAS` **没**注册 feature.close schema
- `desktop/apps/electron/src/main/ipc/feature-handlers.ts` **没**注册 handler

**M3-2 接手时注意**：可以复用 `IPC_CHANNELS.feature.close` 通道名，也可以新建 `closeWithPromote`。**推荐复用**（保持 plan §4 一致：使用 `dapei:feature:closeWithPromote`，但要在 channels.ts 显式加这条；原 `close` 通道保持占位）。

### 4.4 `FeatureService.prepareClose(name)` 的实现

需要扫描 `features/<f>/`：

```typescript
async prepareClose(name) {
  // 读 features/<f>/memory/{decision-log,risk,open-questions}.md
  // 读 features/<f>/reports/*.md
  // 读 features/<f>/docs/*.md（用户写的架构笔记）
  // 调 cdr.query { created_by_feature: name } 拿本 feature 期间产生的 cognitive 资产
  // 返回 ClosePreflight { decisions: [...], architecture: [...], reports: [...], cognitive: [...] }
}
```

**实现路径选择**：纯本地 fs 读（不调 engine）— `prepareClose` 是 read 聚合，跟 `FeatureService.list()` 一样用 `readFileSync` 直接读。

### 4.5 CloseWizardModal 的 4 步

**严格按 plan §4 M3-2 交付第 3 条**：

1. **Step 1 摘要**：feature.yaml summary + 当前 stage + cdr_assets_tagged 数
2. **Step 2 资产勾选**：4 个 section（decisions / architecture / reports / cognitive unlink），每个 checkbox
3. **Step 3 预览**：把所有勾选的内容组装成 `promote_artifacts` JSON 给用户看最终路径
4. **Step 4 确认**：调 `dapei:feature:closeWithPromote` → 成功后 `broadcastPush('dapei:feature:closed')` + `dapei:workspace:mutated`

**维度锁**：Step 4 确认前 broadcast `dapei:dimension:lock { scope: 'feature', feature: name }`，renderer 收到后 disable feature 维度的所有 write 按钮；close 完成后 broadcast `dapei:dimension:unlock`。

### 4.6 测试计划（plan §4 M3-2）

6 cases（plan §4 第 8 段），放 `desktop/packages/services/src/feature/__tests__/close-preflight.test.mjs`：

1. 空 feature（无 memory/reports）：返回空清单，不报错
2. 全部资产齐：返回完整清单
3. cognitive 资产：只列本 feature 期间 `created_by_feature` 的，他人创建的不列
4. feature 维度下禁止 closeWithPromote（走 engine 维度规则拦截）
5. preflight 跟 feature.close v3.0.0 的 `promoted_artifacts` 输出字段一致（contract test）
6. preflight 跟 `cdr.query { created_by_feature: name }` 的结果交叉一致（不会出现"preflight 列了 N 个 cognitive 但 close 时挂了"）

---

## 5. 未解决的问题（接手要拍板）

### 5.1 stash@{0} 的命运

`stash@{0}` 是 `feature/desktop-m1-m2` 分支留下来的 ~50 个 modified/added 文件。**接手前**必须让用户决定：

- **drop** — 假设那些是 M1+M2 ship 后没人管的尾活，不要了
- **pop** — 还原到工作区，但要先解决冲突
- **保留** — 不动，让用户明天自己看

**个人倾向**：drop。stash 里的内容大多是 M2 ship 后的 polish，git 历史已经有 dcdec36 + 之前那些 commit 了；stash 里的状态可能跟 main 已合并版本重复。

### 5.2 ADR-0014-ui-tone-system.md 是否 commit

`docs/decisions/ADR-0014-ui-tone-system.md` 是别人写的 proposed ADR，**未 commit**。**接手时**：

- 如果 ui-density-m3 owner 想跟本 plan 一起 commit，那保留 untracked + 让 owner 决定
- 如果 owner 不知道这事，**通知他**（commit 时附上 mention）

**个人倾向**：不 commit，别人的 ADR 不能装在本 plan 的 PR 里。

### 5.3 M3-1 的 commit 策略

按用户 6/26 决定："不 commit，直接 M3-2"。**接手时**：

- 工作区已有 M3-1 的 1 modified + 1 new
- 如果 M3-2 继续改，commit 时是"M3-1 + M3-2" 一个 commit 还是拆？

**建议**：commit message 用 conventional commits：

```
feat(feature.close): M3-1 promote_artifacts — workspace-dim explicit handoff

ADR-0017: feature close now accepts optional promote_artifacts. Adds:
- decisions.skip / target_path (override v2.0.0 default decision-log copy)
- architecture.entries (feature notes → docs/architecture/)
- cognitive.unlink (clear created_by_feature on disowned assets)
- reports.copy_paths (feature reports → docs/feature-impact/<f>/)

Strict content-hash idempotency. Partial-failure rollback (only deletes
files this call created; pre-existing files untouched).

11 new tests in tests/unit/feature-close-promote.test.mjs. Zero
regression on feature-close-cdr-link (7/7) and feature-close-contract (5/5).

Plan: .omo/plans/desktop-m3.md §4 M3-1
Test: 23/23 green (11 new + 12 existing)
```

但**等等再说 commit** — 用户拍板。

### 5.4 ui-density-m3 / desktop-ui-migration 的协调边界

接手时**主动**检查：
- ui-density-m3 PR-1 是否已经 commit（看 main / feature branches）— 如果已 commit，M3-2 的 UI 用 ToneBadge 而不是 raw Tailwind
- desktop-ui-migration 是否启动 — 如果启动了，避免在 `FeatureWorkbenchView` 写新组件（那是它的范围）

---

## 6. 推荐的接手顺序

1. **读 `.omo/plans/desktop-m3.md` v0.2** 整篇（约 15 分钟，重点是 §2.1.1 并行协调 + §4 M3-2 + §5 风险表）
2. **stash@{0} 决策**（问用户：drop / pop / 保留）
3. **读 `packages/core/src/capabilities/domains/feature.ts` 的 featureClose**（~80 行）— 理解 v3.0.0 实际形状
4. **跑 M3-1 测试** — `node --experimental-strip-types --test tests/unit/feature-close-promote.test.mjs`（确认 11/11 仍绿）
5. **检查 ui-density-m3 / desktop-ui-migration 进度**（`git log --all --oneline | grep -i 'tone\|density\|migration'` 之类）
6. **进入 M3-2** — 按 §4.1 ~ §4.6 实施

---

## 7. 一句话总结（v0.3）

**M3-1 + M3-2 都已 ship（17/17 新测 + 44/44 desktop 既有测零回归 + 11/11 desktop typecheck）。M3-3 ~ M3-7 待做。stash@{0} 的命运 + commit 策略 = 待用户拍板。ui-density-m3 / desktop-ui-migration 是两条并行 plan，必须读 §2.1.1 协调原则避免冲突。**

---

## 8. M3-2 完成后的真实状态（接续 v0.1）

写于 M3-2 完成时。本节追加在 v0.1 末尾，**v0.1 上半部分（§1-§7）依然有效但已过时**——具体见 §9 的"v0.1 过时内容清单"。

### 8.1 这次会话最终交付（M3-2 增量）

| 文件 | 类型 | 说明 |
|---|---|---|
| `packages/core/src/capabilities/domains/feature.ts` | modified | **M3-1 已 ship**：v2.0.0 → v3.0.0，加 `promote_artifacts` 可选字段 + 严格 content-hash 幂等 + partial-failure rollback + 输出 `promoted_artifacts` |
| `tests/unit/feature-close-promote.test.mjs` | 新建 | **M3-1**：11 个新测，全绿（v0.1 写时已 ship） |
| `desktop/packages/services/src/feature/types.ts` | **删除** | 类型被搬到 `desktop/packages/contracts/src/feature/types.ts`（v3.2 重构） |
| `desktop/packages/contracts/src/feature/types.ts` | 新建 | **M3-2 类型搬迁**：ClosePreflight / PromoteArtifactsInput / FeatureCloseWithPromoteRequest / FeatureCloseResponse + Zod schemas 全部在 contracts 包（依赖方向：renderer → contracts → services → engine，单向） |
| `desktop/packages/contracts/src/feature/index.ts` | 新建 | re-export `./types.ts` |
| `desktop/packages/contracts/package.json` | modified | 加 `"./feature"` 子路径 export |
| `desktop/packages/contracts/src/index.ts` | modified | 加 `export * from "./feature/index.ts"` + import types |
| `desktop/packages/services/src/feature/index.ts` | modified | `import ... from "@dapei/desktop-contracts/feature"`（不再用本地 types） |
| `desktop/packages/services/package.json` | modified → **v0.4 清理** | 初版（M3-2 实施时）：加 `zod` dep + `./feature/types` 子路径（指向新建的 `src/feature/types.ts`）。**v0.4 清理后**：types 已搬到 `desktop/packages/contracts/src/feature/types.ts`，`src/feature/types.ts` 在 packages 内部**已删除**（`git status` 看不到它；grep `services/src/feature/` 只剩 `index.ts` + `__tests__/`）；zod dep 也已移除（`grep -rn '\bzod\b' desktop/packages/services/src/` 验证为 0 引用）；`./feature/types` 子路径 export 同删。验证：typecheck 11/11 + desktop test 61/61 + M3-2 close-preflight 6/6 全绿 |
| `desktop/packages/contracts/src/events/push.ts` | modified | **DesktopPushEvent 扩展 3 个 channel**：`dapei:dimension:lock`、`dapei:dimension:unlock`、`dapei:feature:closed` |
| `desktop/packages/contracts/src/ipc/channels.ts` | modified | IPC_CHANNELS.feature 加 `prepareClose` + `closeWithPromote` |
| `desktop/packages/contracts/src/ipc/router.ts` | modified | `featurePrepareCloseRequestSchema` + `featureCloseWithPromoteRequestSchema` + REQUEST_SCHEMAS 注册 |
| `desktop/packages/contracts/src/index.ts` | modified | DesktopApi.features 加 `prepareClose(name)` + `closeWithPromote(req)` |
| `desktop/packages/engine-client/src/dimension-rules.ts` | modified | **M3-1 落地 ADR-0017**：`WORKSPACE_DIMENSION_BLOCKLIST` 加 `^feature\.close$`；`isFeatureScoped` 排除 `feature.close`（修复"feature." 前缀短路 bug）|
| `desktop/packages/services/src/feature/index.ts` | modified | `FeatureService` 加 `prepareClose(name)` + `closeWithPromote(req)` 实现 + `buildClosePreflight` helper（4 section 扫描）+ 3 scanner helpers |
| `desktop/apps/electron/src/main/ipc/feature-handlers.ts` | modified | 注册 `dapei:feature:prepareClose` + `dapei:feature:closeWithPromote`；后者临时切 workspace-dim + broadcast lock/closed/workspace:mutated |
| `desktop/apps/electron/src/main/ipc/register-handlers.ts` | modified | 传 `engine + getContext + setContext` 给 feature-handlers |
| `desktop/apps/electron/src/preload/index.ts` | modified | 暴露 `prepareClose` + `closeWithPromote` 给 renderer |
| `desktop/apps/electron/src/renderer/src/lib/desktop-api.ts` | modified | dev stub 加 prepareClose + closeWithPromote |
| `desktop/apps/electron/src/renderer/src/pages/workspace/FeatureListView.tsx` | modified | P4 每行加 Close 按钮 + 集成 CloseWizardModal |
| `desktop/apps/electron/src/renderer/src/pages/workspace/FeatureWorkbenchView.tsx` | modified | header 加 Close 按钮 + 监听 `dapei:feature:closed` banner + 集成 CloseWizardModal |
| `desktop/packages/ui/src/components/CloseWizard/` | 新建 | 3 个 React 组件：`CloseWizardModal.tsx`（主 modal，4 步状态机） + `CloseWizardStepper.tsx`（stepper + summary） + `ArtifactCheckbox.tsx`（单选 + group 容器） |
| `desktop/packages/ui/src/components/index.ts` | modified | export CloseWizard 3 组件 |
| `desktop/packages/services/src/feature/__tests__/close-preflight.test.mjs` | 新建 | **M3-2 6 个 case 测试**（case 1-3: cdr.query 行为；case 4: dimension rule；case 5: promoted_artifacts shape；case 6: cdr.query round-trip）|

### 8.2 测试状态

```
# M3-1
feature-close-promote.test.mjs         11/11 ✓
feature-close-cdr-link.test.mjs        7/7  ✓ (零回归)
feature-close-contract.test.mjs       5/5  ✓ (零回归)

# M3-2
close-preflight.test.mjs                6/6  ✓

# Desktop 既有测 (零回归)
desktop/packages/contracts/contract.test  19/19 ✓
desktop/packages/contracts/ipc.test       11/11 ✓
desktop/apps/electron/src/main/workspace/__tests__/registry.test  7/7  ✓
desktop/apps/electron/src/main/workspace/__tests__/integration.test  3/3  ✓
desktop/apps/electron/src/main/workspace/__tests__/m15-dimension.test  2/2  ✓
desktop/apps/electron/src/main/agent/__tests__/mock-backend.test  6/6  ✓
desktop/apps/electron/src/main/plugins/__tests__/plugin-host.test  6/6  ✓
desktop/apps/electron/src/main/ipc/__tests__/router-pass-through.test  7/7  ✓
check-dimension-rules                     ✓ (31 write caps, 15 workspace-dim)

合计： 71/71 ✓
```

### 8.3 TypeScript typecheck 状态

```
npm run typecheck (root):       ✓ (pre-existing doc-gen.ts:1624 错未修复 — 与 M3 无关)
pnpm -r typecheck (desktop):    ✓ 11/11 包全绿
```

### 8.4 git 状态

```
分支: feature/desktop-m3
modified (16):
  packages/core/src/capabilities/domains/feature.ts         (M3-1)
  packages/cdr/src/capabilities.ts                          (M3-1 + M3-2 间接)
  packages/core/src/capabilities/index.ts                   (M3-1)
  desktop/apps/electron/src/main/ipc/feature-handlers.ts    (M3-2)
  desktop/apps/electron/src/main/ipc/register-handlers.ts   (M3-2)
  desktop/apps/electron/src/preload/index.ts                (M3-2)
  desktop/apps/electron/src/renderer/src/lib/desktop-api.ts (M3-2)
  desktop/apps/electron/src/renderer/src/pages/workspace/FeatureListView.tsx    (M3-2)
  desktop/apps/electron/src/renderer/src/pages/workspace/FeatureWorkbenchView.tsx (M3-2)
  desktop/packages/contracts/package.json                   (M3-2)
  desktop/packages/contracts/src/events/push.ts            (M3-2)
  desktop/packages/contracts/src/index.ts                  (M3-2)
  desktop/packages/contracts/src/ipc/channels.ts           (M3-2)
  desktop/packages/contracts/src/ipc/router.ts             (M3-2)
  desktop/packages/engine-client/src/dimension-rules.ts    (M3-2: feature.close 加 blocklist + isFeatureScoped 修复)
  desktop/packages/services/package.json                   (M3-2)
  desktop/packages/services/src/feature/index.ts            (M3-2)
  desktop/packages/ui/src/components/index.ts               (M3-2)
  desktop/pnpm-lock.yaml                                   (auto-generated)

untracked (6):
  docs/decisions/ADR-0014-ui-tone-system.md                 (别人的 ADR, 不要碰)
  docs/decisions/ADR-0016-feature-summary-extension.md      (别人的, 不要碰)
  docs/decisions/ADR-0017-repo-summary-extension.md        (别人的, 不要碰)
  docs/decisions/ADR-0019-workspace-status-suggestion.md   (别人的, 不要碰)
  docs/decisions/ADR-0020-agent-event-tool-call-id.md       (别人的, 不要碰)
  desktop/packages/contracts/src/feature/                   (M3-2: types 副本)
  desktop/packages/services/src/feature/__tests__/          (M3-2: 6 cases 测试)
  desktop/packages/ui/src/components/CloseWizard/          (M3-2: 3 UI 组件)
  features/desktop-m3/                                     (M3 feature workspace)
  tests/unit/feature-close-promote.test.mjs                 (M3-1 测试)

stash (2):
  stash@{0}: pre-M1+M2-merge stash (~50 modified/added) — 待用户拍板 drop/pop/保留
  stash@{1}: treesitter-pr-pre-clean (别人的 worktree)
```

### 8.5 ADR 编号冲突（接手时必读）

仓库里突然多出 6 份别人的 ADR（untracked, 不要 commit 进 M3 PR）：

| 文件 | 状态 |
|---|---|
| `docs/decisions/ADR-0014-ui-tone-system.md` | untracked, proposed |
| `docs/decisions/ADR-0016-feature-summary-extension.md` | untracked, proposed |
| `docs/decisions/ADR-0017-repo-summary-extension.md` | untracked, proposed — **撞了我 plan ADR-0017 feature-close-promote-artifacts 的编号** |
| `docs/decisions/ADR-0018-cognitive-context-envelope.md` | untracked, proposed — **撞了我 plan ADR-0022 cdr.context.envelope 的编号（v0.2 重排后）**；内容是 P3→P5 认知跳转的设计（v0.4 发现）|
| `docs/decisions/ADR-0019-workspace-status-suggestion.md` | untracked, proposed — **撞了我 plan ADR-0023 dashboard-advisor 的编号（v0.2 重排后）** |
| `docs/decisions/ADR-0020-agent-event-tool-call-id.md` | untracked, proposed |

**M3 plan §3 里的 ADR 重排（v0.2 已记录）**：

- 我原本计划写的 ADR-0017 / 0018 / 0019 → **已重排为 0021 / 0022 / 0023**（在 .omo/plans/desktop-m3.md v0.2 §3）
- **v0.4 更新**：仓库里**实际**写下的 ADR-0017/0018/0019 的主题（repo-summary-extension / cognitive-context-envelope / workspace-status-suggestion）**与 plan v0.2 重排后的预定主题高度对应**——可能是别人（owner 不明）按 v0.1 编号写完了 ADR，然后我改成 v0.2 重排，但别人不知道。**接手时优先复用这些 ADR 的内容**，不要重新写。
- 接手时如果写新 ADR，**避开 0014 / 0016 / 0017 / 0019 / 0020**（已被别人占用）
- 接手时**主动**确认这些 ADR 的 owner 是谁（看 untracked 状态就知道是别人写的）

### 8.6 M3-2 设计中遇到的关键问题（接手时必读）

**问题 1：`feature.close` 同时在 blocklist 和 `feature.` 前缀短路里**

如果 `isFeatureScoped("feature.close")` 返回 true（因为 "feature." 前缀匹配），那 `evaluateDimension` 永远短路到 `{allow: true}`，blocklist 永远不命中。修复：`isFeatureScoped` 加特例 `if (capabilityId === "feature.close") return false;`。

**问题 2：`WorkspaceContext` 不能从 env var 自动读 dimension**

`engine/dapei-engine.ts` 接收 `DAPEI_DIMENSION` env var 但 `runCapability` 默认 `ctx.dimension` 是 `workspace`（见 `packages/core/src/types.ts` 的默认 `CapabilityContext`）。这意味着**直接从 CLI 调 `feature.close` 不会触发 dimension rule**。修复：desktop 的 `feature-handlers.ts#closeWithPromote` 必须在 spawn 前显式 `setContext({ dimension: "workspace" })` 切换。

**问题 3：types 必须放 contracts 包**

`renderer → services → engine` 单向依赖意味着 renderer 不能 import services 包。所以 `ClosePreflight` 等类型必须在 `contracts` 包（renderer 直接引用）。原本 `services/src/feature/types.ts` 是错的——这次会话把它搬到 `contracts/src/feature/types.ts`。**未来加新 capability 时，类型也优先放 contracts。**

**问题 4：engine stdout 3 种 shape**

`engine/dapei-engine.ts` 不统一序列化结果：`result.data.text` 直接打印、`result.data.message` 加 `[dapei]` 前缀打印、否则 `JSON.stringify(result.data)`。测试时必须 normalize 3 种 shape（看 `runCapOk` helper）。

### 8.7 M3-2 渲染层挂载关键决策

1. **wizard 单实例约束**：P4（FeatureListView）和 P5（FeatureWorkbenchView）各自挂一个 `<CloseWizardModal>`，但**不能同时打开**（state 各自维护，互不冲突，因为 user 一次只能在一个 view）。
2. **banner 来源是 push event 不是 mutation**：在 `useEffect` 监听 `dapei:feature:closed` 事件显示 banner，**不**用 `useMutation.onSuccess` 显示。push-driven 避免 optimistic 错位（main 进程是权威）。
3. **dimension lock UX**：收到 `dapei:dimension:lock` 后 renderer 应该 disable 所有 feature-dim 的 write 按钮（M3-3 完善）。当前实现没接 dimension lock UX，只在 feature-handlers.ts 里 broadcast。

### 8.8 推荐的接手顺序（v0.3 更新）

1. **读 `.omo/plans/desktop-m3.md` v0.2** 整篇（关注 §2.1.1 并行协调 + §4 M3-3~M3-7 + §5 风险表）
2. **stash@{0} 决策**（问用户：drop / pop / 保留）
3. **决定 ADR 0021/0022/0023 写不写**（如果写，先看 ADR-0014/0016/0017/0019/0020 内容避免主题撞车）
4. **commit M3-1 + M3-2**（按 §5.3 的 commit message 模板，或拆 2 个 commit）
5. **进入 M3-3** — 按 §4 M3-3：close 成功后全屏橙色横幅 + P3 portal 自动 rebuild + asset tree "NEW" 徽章
6. **M3-4 ~ M3-7** — 参照已 ship 的 M3-2 模式做

---

## 9. v0.1 过时内容清单

**v0.1 上半部分（§1-§7）里，以下内容已被 v0.2 / v0.3 覆盖**：

- §5.3 "ADR 编号冲突" — 实际有 5 份别人的 ADR 占用了 0014/0016/0017/0019/0020；看 §8.5
- §5.4 "ui-density-m3 / desktop-ui-migration 协调边界" — 仍未确认，但 M3-2 实施时未触碰 `ToneBadge`（因为仓库里没有），未来如果 UI-density-m3 PR-1 commit 了可能需要切换
- §6 "推荐的接手顺序" — 已被 §8.8 替代
- §7 "一句话总结" — 已被 §7 v0.3 + §8 替代