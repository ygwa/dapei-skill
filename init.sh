#!/usr/bin/env bash

# dapei.skill v0.1 工程初始化脚本
set -euo pipefail

echo "开始初始化 dapei.skill v0.1 工程环境..."

# 1) 核心目录
mkdir -p .agents/skills/dapei-skill/scripts
mkdir -p .claude/skills/dapei-skill/scripts
mkdir -p .cursor/rules
mkdir -p docs/{architecture,business,domain,glossary,decisions,standards,workflows}
mkdir -p runtime/{ai-rules,templates}
mkdir -p codebase features
mkdir -p .dapei/{workflows,rules}

# 2) Git
if [ ! -d ".git" ]; then
  git init
  echo "Git 仓库初始化完成"
fi

# 3) Skill
cat > .claude/skills/dapei-skill/SKILL.md <<'SKILL'
---
name: dapei
description: AI Native Engineering Context OS - 管理 Workspace 和 Feature 生命周期
---

# dapei.skill 核心指令集

## 核心指令 (Slash Commands)
- /init-workspace
- /create-feature <name>
- /sync-context
- /report

## 行为准则
1. 始终优先阅读 `docs/` 中的架构文档。
2. 所有代码修改必须在 `features/<name>/repos` 映射的仓库中进行。
3. 遵循 `runtime/ai-rules/` 中的安全与规范限制。
SKILL

cp .claude/skills/dapei-skill/SKILL.md .agents/skills/dapei-skill/SKILL.md

# 4) Cursor 规则
cat > .cursor/rules/dapei-core.mdc <<'RULE'
---
description: dapei.skill 全局工程核心规则
globs: ["**/*"]
alwaysApply: true
---
# dapei.skill 全局规范

- 架构原则：遵循 DDD 分层。
- 工作流：AI 禁止绕过 Feature 工作区直接修改 `codebase`，必须通过 `@dapei create feature` 开启新任务。
- 上下文：在开始任务前，先读取 `docs/` 与 `.dapei/`。
RULE

# 5) 基础文档占位（仅在文件不存在时创建，避免覆盖已有内容）
if [ ! -f "DESIGN.md" ]; then
  : > DESIGN.md
fi
if [ ! -f "README.md" ]; then
  : > README.md
fi

echo "初始化完成。下一步：填充 .dapei/workspace.yaml 并创建第一个 feature。"
