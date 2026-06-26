# @dapei/desktop-engine-client

桌面端与根仓库 **dapei-engine** 之间的唯一桥接层。

- 定义 `EngineClient` 接口
- 实现（subprocess 或直连 `@dapei/core`）在 M1 填入
- `desktop-services` 只依赖此接口，不直接 spawn 进程
