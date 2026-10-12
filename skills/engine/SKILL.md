---
name: dapei-engine
description: How to locate and invoke the executable dapei engine that every other skill depends on. Use when a skill tells you to call a capability (workspace.init, repos.analyze, feature.close, cdr.* …), when you must run a deterministic state change, or when you cannot find the engine entry point.
---

# dapei.engine skill

其它 skill 只描述「该做什么」，真正执行的是引擎。这个 skill 只有一个职责：
**让 agent 在任何环境里都能找到并调用引擎。**

## 边界

| 引擎负责 | Agent 负责 |
|---|---|
| typed capability、输入 schema 校验、证据校验、审计日志 | 判断该调哪个能力、准备输入、读懂输出 |

**禁止**：引擎不存在时假装调用成功。找不到引擎就停下来说明缺什么，
不要用「我分析了一下」替代能力调用。

## 引擎入口（按顺序解析，第一个存在的就是答案）

| 顺序 | 入口 | 前提 |
|---|---|---|
| 1 | `node <repo>/skills/engine/dapei-engine.js run --capability <id> --input '<json>'` | 装了本 skill 就有：单文件、**内嵌模板**、无需 TypeScript / `node_modules` / 任何 node flag（Node ≥ 20） |
| 2 | `bash <repo>/scripts/dapei …` | 有仓库检出时的统一入口；自动在源码与产物间选择（`DAPEI_USE_BUNDLE=1` 强制产物） |
| 3 | `node --experimental-strip-types <repo>/engine/dapei-engine.ts run …` | 源码模式（Node ≥ 22.6），改完 `.ts` 立刻生效 |

- `<repo>` 是 dapei-skill 检出目录；`DAPEI_ENGINE_HOME` 可显式指定（`scripts/dapei` 会设置它）。
- 入口 1 可以**整份拷贝到任何目录**：它把 `runtime/templates/**` 编译进了自己，
  初始化工作区时不需要旁边有任何源码树。
- 找不到以上任何一个：明确报告「缺少引擎入口」，并给出上面这张表。

## 路由能力

本 skill 不引入新能力，它只负责让已有能力**可达**：

| 意图 | 动作 |
|---|---|
| 执行某个能力（`workspace.init`、`repos.analyze`、`feature.close`、`cdr.*` …） | `node <entry> run --capability <id> --input '<json>'` |
| 判断用户一句话该落到哪个能力 | `node <entry> route --intent "<自然语言>"`，再按回执执行 |
| 通过阶段确认门 | 原命令加 `confirmed: true`（`CONFIRMATION_REQUIRED` 之后） |

## 调用形态

```
node <entry> run --capability <id> --input '<json>'      # 执行能力
node <entry> route --intent "<自然语言>" [--context '<json>']   # 意图 → 能力
```

- 成功：stdout 是 JSON envelope（`{"ok": true, "data": …}`，带 `text` 字段时直接打印文本）。
- 失败：非零退出码 + `[dapei][error] <code>: <message>`（如 `CONFIRMATION_REQUIRED`、
  `ENGINE_HOME_NOT_FOUND`、`INVALID_INPUT`）。把它当作事实回报，不要绕过。
- 阶段确认门（`solution-design` / `implementation` / `acceptance`）必须由用户确认，
  再带 `confirmed: true` 重跑。

## 用户入口

```
@dapei workspace status
```

```
@dapei audit query
```

（用户仍然只用 `@dapei` 说话；引擎调用是 agent 的内部动作，不要求用户记命令。）

## 与其他 skill 的协作

- **全部 skill**：任何「调用能力」的动作都先在这里解析入口。
- **workflow / feature**：阶段推进与确认门依赖引擎返回的 `CONFIRMATION_REQUIRED`。
- **cdr**：`cdr.*` 能力是本 skill 入口 1 的 bundle 里就带的，不需要额外安装。
