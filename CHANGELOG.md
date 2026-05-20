# Changelog

All notable changes to `dapei.skill` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-05-20

### Added
- 全面升级 Agent 编排逻辑
- 更详细的阶段汇报格式（结论/风险/待确认/下一步）
- 上下文分层加载策略

### Changed
- 优化意图识别路由表
- 细化各阶段的上下文加载优先级

---

## [1.1.0] - 2026-05-17

### Added
- 增强 codebase 分析能力
- 新增 `context build` 命令
- 新增 guardrail 引擎
- Feature 命令增强

### Changed
- 改进 smoke test 覆盖率

---

## [1.0.0] - 2026-05-13

### Added
- 初始稳定版本
- Workspace 初始化
- Codebase 接入和分析
- Feature 生命周期管理（8阶段 DAG）
- 现状分析、Gap 分析、方案设计、任务拆解
- 实施、验证、架构审查、验收
- 上下文分层加载
- 证据优先的分析规范
