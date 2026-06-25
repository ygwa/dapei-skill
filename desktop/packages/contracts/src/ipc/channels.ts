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
    runStage: "dapei:feature:runStage",
    context: "dapei:feature:context",
    tasks: "dapei:feature:tasks",
    close: "dapei:feature:close"
  },
  knowledge: {
    portalBuild: "dapei:knowledge:portalBuild",
    portalUrl: "dapei:knowledge:portalUrl",
    assetTree: "dapei:knowledge:assetTree"
  },
  agent: {
    list: "dapei:agent:list",
    attach: "dapei:agent:attach",
    detach: "dapei:agent:detach",
    send: "dapei:agent:send",
    injectContext: "dapei:agent:injectContext",
    event: "dapei:agent:event",
    listBackends: "dapei:agent:listBackends"
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
