/** IPC channel 命名 — main 注册 handler 时与 renderer invoke 保持一致 */

export const IPC_CHANNELS = {
  app: {
    monorepoRoot: "dapei:app:monorepoRoot"
  },
  workspace: {
    listRecents: "dapei:workspace:listRecents",
    open: "dapei:workspace:open",
    pickDirectory: "dapei:workspace:pickDirectory",
    init: "dapei:workspace:init",
    status: "dapei:workspace:status",
    validate: "dapei:workspace:validate"
  },
  repos: {
    list: "dapei:repos:list",
    add: "dapei:repos:add",
    sync: "dapei:repos:sync",
    profile: "dapei:repos:profile"
  },
  feature: {
    create: "dapei:feature:create",
    list: "dapei:feature:list",
    status: "dapei:feature:status",
    stage: "dapei:feature:stage",
    close: "dapei:feature:close"
  },
  knowledge: {
    portalBuild: "dapei:knowledge:portalBuild",
    portalUrl: "dapei:knowledge:portalUrl",
    assetTree: "dapei:knowledge:assetTree"
  },
  agent: {
    attach: "dapei:agent:attach",
    send: "dapei:agent:send",
    injectContext: "dapei:agent:injectContext",
    event: "dapei:agent:event"
  },
  capability: {
    run: "dapei:capability:run"
  },
  plugin: {
    list: "dapei:plugin:list",
    enable: "dapei:plugin:enable",
    disable: "dapei:plugin:disable"
  },
  push: {
    subscribe: "dapei:push"
  }
} as const;

export type IpcChannel =
  | (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS][keyof (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]];
