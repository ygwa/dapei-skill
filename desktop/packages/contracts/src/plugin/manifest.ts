import type { PluginContributes } from "./contributes.ts";

export const DESKTOP_PLUGIN_MANIFEST_FILE = "dapei-desktop-plugin.json";

export const PLUGIN_SCAN_DIRS = {
  user: "~/.dapei/plugins",
  workspace: ".dapei/plugins"
} as const;

export interface DesktopPluginManifest {
  id: string;
  version: string;
  name?: string;
  description?: string;
  /** main 进程入口（可选；仅 contributes 时可为空） */
  main?: string;
  /** renderer 聚合入口（可选） */
  renderer?: string;
  contributes: PluginContributes;
  /** 最低桌面端版本 */
  engines?: { desktop?: string };
}

export interface LoadedPlugin {
  manifest: DesktopPluginManifest;
  rootDir: string;
  enabled: boolean;
}
