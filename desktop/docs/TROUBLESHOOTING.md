# 大培桌面端 — 故障排查

> M1 已知问题与排查路径

## Electron 启动失败（macOS）

```
Library not loaded: @rpath/Electron Framework.framework
```

修复：

```bash
cd desktop && pnpm ensure-electron
```

原因：`electron` 的 `install.js` 用 `extract-zip` 偶发漏解压
`Frameworks/`。`ensure-electron` 用系统 `unzip` 重新解压完整
包。`pnpm dev` / `postinstall` 已自动调用。

## Engine subprocess spawn 失败

```
error: spawn node ENOENT
```

或：

```
error: Cannot find module '/path/to/engine/dapei-engine.ts'
```

修复：确认根仓库的 `engine/dapei-engine.ts` 存在，且
`DAPEI_ENGINE_HOME` 或 `DAPEI_MONOREPO_ROOT` 指向 dapei-skill
根目录。`SubprocessEngineClient` 缺省从
`apps/electron/src/main/engine/subprocess-client.ts` 向上
5 层解析 dapei-skill 根。

## Capability 返回 NOT_IMPLEMENTED

桌面走的是 `StubEngineClient`。检查环境变量
`DAPEI_ENGINE_MODE`：

```bash
echo $DAPEI_ENGINE_MODE
# 应为空或等于 "stub" (后者故意用 stub)
```

`StubEngineClient` 故意返回 `{ok:false, error:{code:NOT_IMPLEMENTED}}`，
**不**模拟数据。M1 不允许 dev 模式（与 production 不同）。如
果你看到 NOT_IMPLEMENTED 但 `DAPEI_ENGINE_MODE=stub` 是故意的，
说明你想跑 fixture / 离线模式。

## Dimension BLOCKED

```
{ ok: false, error: { code: "DIMENSION_BLOCKED", message: "..." } }
```

正常的 feature 维度拦截。能力名命中 blocklist（见
`desktop/packages/engine-client/src/dimension-rules.ts`）。

如果想验证哪些被 block：

```bash
cd desktop && pnpm check:dimension-rules
# 输出: 31 write capabilities total; 15 workspace-dim writes, all covered by blocklist
```

如果 blocklist 与 engine 实际 capability 不一致：扫不到（漏
抓）会让维护者加 regex；扫错了（误抓）会拒掉正常调用。
两种情况都让 `pnpm check:dimension-rules` 失败并指出缺失
的 capability。

## Agent chat 没有回应

检查 `agent.listBackends`：

```bash
# 临时在 renderer console 跑
await window.dapei.agent.listBackends()
// → [{id: "mock", installed: true}, {id: "opencode", installed: false}]
```

- 看到两个 backend 表示 `createAgentHost` 注册成功。
- `opencode.installed = false` 表示 `opencode` 二进制不在
  PATH 上。`/usr/local/bin/opencode acp` 应该能跑（如果
  opencode 装了）。本机没装也没关系，**自动 fall back to
  mock**。
- 完全没有返回：检查 main process 启动 log 是否有
  `createAgentHost` 异常。

## Recent workspaces 列表不更新

`~/.dapei/desktop/recent.json` 是 source of truth。如果文件
损坏，listRecents 返回 `[]`。修复：删文件重启。

```bash
rm ~/.dapei/desktop/recent.json
```

下次 init / open 重新写入。

## 启动层 "P0 启动失败" 红色 banner

读 error text。常见原因：
- `WORKSPACE_INVALID`: 选了一个不空的目录，引擎的
  `workspace.validate` 拒掉
- `INIT_FAILED`: 同上 + git init 失败
- `HANDLER_THREW`: 看 main process 完整 stack

## P5 chat 出现 "no session"

未点过 Attach Agent。先点 **Attach Agent** 再发消息。

## P5 stage 推进失败

引擎返回 `ok:false`。Main process log 会有 engine exit code +
stderr。`workflow.runStage` 的 input `{feature, stage, confirmed}`
被 Zod 严格校验：feature 必须 kebab-case、stage 必须非空、
confirmed 可选 boolean。

## TypeScript 编译错

- `Cannot find name 'node:test'` / `Cannot find name 'node:path'` →
  在 package 的 tsconfig.json 加 `"compilerOptions": { "types": ["node"] }`
  并把 `@types/node` 加进 devDependencies。
- `Cannot find module 'zod'` → 加进 dependencies。
- `Cannot find module '@dapei/desktop-*'` → 检查
  `desktop/apps/electron/electron.vite.config.ts` 的 resolve.alias
  段（M1 用了 alias 指向 `../../packages/<name>/src`）。

## pnpm install 失败

```bash
cd desktop && pnpm install --frozen-lockfile
```

如果 lockfile 跟 package.json 不一致：先 `pnpm install`（不传
`--frozen-lockfile`）让 pnpm 重新 lock。然后 `git add
desktop/pnpm-lock.yaml`。

## CI 上 typecheck 失败但本地通过

CI 跑的是 `--frozen-lockfile`。如果有人改 package.json 但
没更新 lockfile，CI 会拒绝。修复：本地 `pnpm install` 让
lockfile 同步，commit `desktop/pnpm-lock.yaml`。

## MacOS 上 Electron binary 损坏

参考第一节。`pnpm ensure-electron` 修复。如果反复损坏：
检查 `~/Library/Caches/electron/` 下是否有残缺 zip，删了重装。
