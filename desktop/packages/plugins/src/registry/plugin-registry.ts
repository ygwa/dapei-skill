import type {
  AgentBackendContribution,
  FeaturePanelContribution,
  PipelineStepContribution,
  RouteContribution,
  SidebarContribution
} from "@dapei/desktop-contracts/plugin";

export interface PluginRegistry {
  routes: RouteContribution[];
  sidebar: SidebarContribution[];
  featurePanels: FeaturePanelContribution[];
  agentBackends: AgentBackendContribution[];
  pipelineSteps: PipelineStepContribution[];
}

export function createEmptyRegistry(): PluginRegistry {
  return {
    routes: [],
    sidebar: [],
    featurePanels: [],
    agentBackends: [],
    pipelineSteps: []
  };
}
