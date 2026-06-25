import type { LoadedPlugin } from "@dapei/desktop-contracts/plugin";
import { PLUGIN_SCAN_DIRS } from "@dapei/desktop-contracts/plugin";
import type { PluginRegistry } from "../registry/plugin-registry.ts";
import { createEmptyRegistry } from "../registry/plugin-registry.ts";

export interface PluginHost {
  init(): Promise<void>;
  registry: PluginRegistry;
  list(): LoadedPlugin[];
  enable(pluginId: string): Promise<void>;
  disable(pluginId: string): Promise<void>;
}

export function createPluginHostStub(): PluginHost {
  const registry = createEmptyRegistry();
  const plugins: LoadedPlugin[] = [];

  return {
    registry,
    list: () => plugins,
    init: async () => {
      void PLUGIN_SCAN_DIRS;
    },
    enable: async (_id) => {},
    disable: async (_id) => {}
  };
}
