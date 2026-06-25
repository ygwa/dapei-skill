import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

const pkgSrc = (name: string) => resolve(__dirname, "../../packages", name, "src");

const workspacePackages = [
  "@dapei/desktop-contracts",
  "@dapei/desktop-engine-client",
  "@dapei/desktop-services",
  "@dapei/desktop-agent",
  "@dapei/desktop-git",
  "@dapei/desktop-knowledge",
  "@dapei/desktop-plugins",
  "@dapei/desktop-plugin-sdk"
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
          "utility/plugin-host": resolve(__dirname, "src/utility/plugin-host.ts")
        }
      }
    },
    resolve: {
      alias: {
        "@dapei/desktop-contracts": pkgSrc("contracts"),
        "@dapei/desktop-engine-client": pkgSrc("engine-client"),
        "@dapei/desktop-services": pkgSrc("services"),
        "@dapei/desktop-agent": pkgSrc("agent"),
        "@dapei/desktop-git": pkgSrc("git"),
        "@dapei/desktop-knowledge": pkgSrc("knowledge"),
        "@dapei/desktop-plugins": pkgSrc("plugins"),
        "@dapei/desktop-plugin-sdk": pkgSrc("plugin-sdk")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@dapei/desktop-contracts"] })],
    resolve: {
      alias: {
        "@dapei/desktop-contracts": pkgSrc("contracts")
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        "@dapei/desktop-contracts": pkgSrc("contracts"),
        "@dapei/desktop-plugin-sdk": pkgSrc("plugin-sdk"),
        "@dapei/desktop-ui": pkgSrc("ui")
      }
    },
    plugins: [tailwindcss(), react()]
  }
});
