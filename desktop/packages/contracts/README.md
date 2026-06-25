# @dapei/desktop-contracts

全桌面 workspace 的 **IPC / 事件 / 插件类型** 唯一来源。main、preload、renderer、plugin-sdk 均从此引用。

## 目录

```
src/
├── ipc/           # invoke 通道名 + payload 类型
├── events/        # Main → Renderer 推送事件
└── plugin/        # manifest + contributes 扩展点
```

## 原则

- 仅类型与常量，无 Node/Electron 依赖。
- 不在此实现 handler 或业务逻辑。
