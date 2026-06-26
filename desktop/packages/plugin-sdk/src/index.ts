/**
 * @dapei/desktop-plugin-sdk
 *
 * 第三方插件作者依赖此包（+ contracts 类型），不依赖 electron app。
 */

export {
  DESKTOP_PLUGIN_MANIFEST_FILE,
  PLUGIN_SCAN_DIRS,
  type DesktopPluginManifest,
  type LoadedPlugin,
  type PluginContributes,
  type RouteContribution,
  type SidebarContribution,
  type FeaturePanelContribution,
  type AgentBackendContribution,
  type PipelineStepContribution
} from "@dapei/desktop-contracts";

export const PLUGIN_SDK_VERSION = "0.1.0";
