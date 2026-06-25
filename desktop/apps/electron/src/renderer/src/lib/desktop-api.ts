import type { DesktopApi } from "@dapei/desktop-contracts";

/** 浏览器直开 Vite dev server 时的 stub（Electron 走 preload） */
function createDevDesktopApi(): DesktopApi {
  return {
    version: "0.1.0-dev",
    workspace: {
      listRecents: async () => [],
      open: async (path) => ({
        ok: true,
        path,
        name: path.split(/[/\\]/).pop() ?? path,
        validation: { status: "valid", errors: [], warnings: [] }
      }),
      pickDirectory: async () => null,
      init: async (parentDir, name) => {
        const path = `${parentDir.replace(/[/\\]$/, "")}/${name}`;
        return {
          ok: true,
          path,
          name,
          validation: { status: "valid", errors: [], warnings: [] }
        };
      }
    },
    capability: {
      run: async (request) => ({
        ok: false,
        data: null,
        sideEffects: [],
        error: { code: "DEV_STUB", message: `dev stub: ${request.capabilityId}` }
      })
    },
    events: {
      subscribe: () => () => {}
    }
  };
}

export function ensureDesktopApi(): DesktopApi {
  if (typeof window === "undefined") {
    throw new Error("ensureDesktopApi called outside browser");
  }
  if (!window.dapei) {
    window.dapei = createDevDesktopApi();
  }
  return window.dapei;
}

export function getDesktopApi(): DesktopApi | null {
  if (typeof window === "undefined") return null;
  return window.dapei ?? null;
}
