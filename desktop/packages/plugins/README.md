# @dapei/desktop-plugins

**内置**插件宿主（main 进程）。第三方作者面向 `@dapei/desktop-plugin-sdk`。

```
src/
├── loader/     # 读取 dapei-desktop-plugin.json
├── registry/   # 合并 contributes → 路由/侧栏/AgentBackend 等
└── host/       # PluginHost 生命周期
```

扫描路径见 `@dapei/desktop-contracts/plugin` 的 `PLUGIN_SCAN_DIRS`。
