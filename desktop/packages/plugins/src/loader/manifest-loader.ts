import type { DesktopPluginManifest } from "@dapei/desktop-contracts/plugin";

export interface ManifestLoader {
  load(pluginRoot: string): Promise<DesktopPluginManifest>;
}
