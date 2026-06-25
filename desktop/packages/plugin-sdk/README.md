# @dapei/desktop-plugin-sdk

供 **外部插件** 使用的稳定表面。发布拆仓时可单独 npm 发包。

## 插件清单

文件名：`dapei-desktop-plugin.json`（见 `PLUGIN_SDK_VERSION` 与 contracts 类型）。

扫描目录：

- 用户级：`~/.dapei/plugins/<plugin-id>/`
- 工作空间级：`<workspace>/.dapei/plugins/<plugin-id>/`

## 扩展档位

| 档位 | contributes 字段 |
|------|------------------|
| L1 UI | `routes`, `sidebar`, `featurePanels` |
| L2 Integration | `agentBackends` |
| L3 Pipeline | `pipelineSteps` |

实现加载由 `@dapei/desktop-plugins` 的 `PluginHost` 完成。
