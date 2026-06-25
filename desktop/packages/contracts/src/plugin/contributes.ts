/** 插件 manifest — 磁盘文件名建议 dapei-desktop-plugin.json */

export interface RouteContribution {
  id: string;
  path: string;
  label: string;
  /** renderer 入口模块，相对插件包根目录 */
  module?: string;
}

export interface SidebarContribution {
  id: string;
  label: string;
  icon?: string;
  route: string;
}

export interface FeaturePanelContribution {
  id: string;
  label: string;
  /** Feature 工作台右栏 Inspector 插槽 */
  slot: "inspector" | "context";
  module: string;
}

export interface AgentBackendContribution {
  id: string;
  label: string;
  /** main 进程加载的 backend 模块 */
  module: string;
}

export interface PipelineStepContribution {
  id: string;
  label: string;
  /** L3：自定义 CDR 流水线步骤 UI */
  phase: string;
  module: string;
}

export interface PluginContributes {
  routes?: RouteContribution[];
  sidebar?: SidebarContribution[];
  featurePanels?: FeaturePanelContribution[];
  agentBackends?: AgentBackendContribution[];
  pipelineSteps?: PipelineStepContribution[];
}
