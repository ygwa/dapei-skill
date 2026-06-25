# @dapei/desktop-agent

Agent-Share 运行时（main 进程）。

```
src/
├── backends/    # AgentBackend 接口 + Registry（L2 插件注册点）
├── host/        # AgentHost、SessionManager
├── pty/         # PtyBridge
└── parser/      # EventParser → AgentEvent
```
