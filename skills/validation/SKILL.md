# dapei.validation skill

负责测试命令发现、执行与 validation 报告生成。

## 边界

| dapei 平台 | Agent |
|------------|-------|
| 测试命令发现、测试执行、报告聚合 | 理解测试失败原因、修复问题 |
| 输出结构化 validation-report.yaml | 理解「哪些验证未通过」 |

**禁止**：平台替 Agent 修复代码或修改测试本身。

## 路由能力

| 意图 | Capability |
|------|------------|
| 发现 repo 测试命令 | `validation.detect` |
| 执行测试并收集结果 | `validation.execute` |
| 执行完整验证流程 | `validation.run` |
| 获取验证报告路径 | `validation.report` |

---

## 工作流（方法，非实现）

### Detect（发现）

**目标**：识别 repo 中所有可用的测试命令。

1. 读取 repo manifest（package.json, Makefile, pom.xml 等）
2. 识别测试命令类型：
   - `npm test` / `yarn test` (Node)
   - `pytest`, `tox` (Python)
   - `go test` (Go)
   - `mvn test`, `gradle test` (Java)
3. 识别验证命令：
   - lint (eslint, flake8, golangci-lint)
   - type-check (tsc, mypy)
   - format-check (prettier, black)
4. 输出发现结果

**产出示例**：
```yaml
repo: payment-service
detected_commands:
  - type: unit_test
    command: npm test
    coverage: npm run test:coverage
  - type: e2e_test
    command: npm run test:e2e
  - type: lint
    command: npm run lint
  - type: type_check
    command: npm run type-check
```

### Execute（执行）

**目标**：按指定顺序执行验证命令并收集结果。

1. 按优先级执行命令（lint → type-check → unit → e2e）
2. 捕获 stdout/stderr 和退出码
3. 解析测试结果（如 JUnit XML, TAP, JSON 格式）
4. 记录每项验证的 pass/fail 状态

**产出示例**：
```yaml
results:
  - command: npm run lint
    status: pass
    duration: 12s
  - command: npm run type-check
    status: pass
    duration: 8s
  - command: npm test
    status: fail
    duration: 45s
    failures: 2
    errors: 0
    details:
      - test/users.test.ts:42 "should create user" FAILED
      - test/orders.test.ts:15 "should process order" FAILED
```

### Report（报告）

**目标**：生成结构化验证报告。

1. 聚合所有执行结果
2. 计算总体通过/失败率
3. 输出 `reports/validation-report.md`

**报告结构**：
```markdown
# Validation Report: payment-refactor

## Summary
- **Total**: 4 commands
- **Passed**: 3
- **Failed**: 1
- **Duration**: 1m 23s

## Failed Validations

### npm test (Unit Tests)
- 2 failures
- `test/users.test.ts:42` - "should create user"
- `test/orders.test.ts:15` - "should process order"

## Next Steps
- [ ] Fix failing unit tests
- [ ] Re-run validation
```

---

## 用户入口

```
@dapei validate feature payment-refactor --stage implement
```

```
@dapei validate repo payment-service --detailed
```

---

## 与其他 skill 的协作

- **repos**：validation 在 repo 上下文中执行
- **feature**：validate feature 调用 repos.analyze 获取测试命令
- **cognitive**：validation 失败可触发 cognitive artifact 更新
- **workspace**：validation 报告输出到 `features/<name>/reports/`