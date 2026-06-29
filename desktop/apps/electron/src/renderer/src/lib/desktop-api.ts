import type { DesktopApi } from "@dapei/desktop-contracts";

function createDevDesktopApi(): DesktopApi {
  return {
    version: "0.1.0-dev",
    workspace: {
      listRecents: async () => [],
      open: async (path) => ({
        ok: true,
        path,
        name: path.split(/[/\\]/).pop() ?? path,
        validation: { status: "warn", errors: [], warnings: ["dev stub"] }
      }),
      pickDirectory: async () => null,
      init: async (parentDir, name) => {
        const path = `${parentDir.replace(/[/\\]$/, "")}/${name}`;
        return {
          ok: true,
          path,
          name,
          validation: { status: "warn", errors: [], warnings: ["dev stub"] }
        };
      }
    },
    repos: {
      list: async () => [],
      add: async () => ({ ok: false, error: { code: "DEV_STUB", message: "dev stub" } }),
      sync: async () => ({ ok: false, synced: [], error: { code: "DEV_STUB", message: "dev stub" } }),
      profile: async () => ({ ok: false, error: { code: "DEV_STUB", message: "dev stub" } })
    },
    features: {
      list: async () => [],
      status: async () => ({ stage: null }),
      stage: async () => ({ stage: null }),
      runStage: async () => ({ ok: false, error: { code: "DEV_STUB", message: "dev stub" } }),
      context: async () => ({ ok: false, error: { code: "DEV_STUB", message: "dev stub" } }),
      tasks: async () => ({ ok: true, text: "" }),
      create: async () => ({ ok: false, error: { code: "DEV_STUB", message: "dev stub" } }),
      prepareClose: async () => {
        throw { code: "DEV_STUB", message: "dev stub — run main process for real preflight" };
      },
      closeWithPromote: async () => ({ ok: false, error: { code: "DEV_STUB", message: "dev stub" } })
    },
    knowledge: {
      portalBuild: async () => ({ ok: false, error: { code: "DEV_STUB", message: "dev stub" } }),
      portalUrl: async () => ({ ok: false, url: "", error: { code: "DEV_STUB", message: "dev stub" } }),
      assetTree: async () => [],
      indexList: async () => ({ ok: true, behaviors: [], stateMachines: [] })
    },
    agent: {
      list: async () => [],
      listBackends: async () => [
        { id: "mock", label: "Mock Agent (CI / dev)", installed: true },
        { id: "opencode", label: "OpenCode (ACP)", installed: false }
      ],
      attach: async () => ({ ok: true, sessionId: "dev-stub-session", backendId: "mock" }),
      detach: async () => ({ ok: true }),
      send: async () => ({ ok: true })
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
