import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import type { DesktopServices } from "@dapei/desktop-services";
import { startStaticServer, type StaticServer } from "@dapei/desktop-knowledge";
import { registerHandler } from "./router.ts";
import { broadcastPush } from "../push/broadcast.ts";

/**
 * Knowledge IPC handlers. M2-1 wires:
 *   portalBuild  — cdr.doc.generate
 *   portalUrl    — local-server URL (cached in this module)
 *   assetTree    — structured docs/as-is/ tree
 *   indexList    — cognitive index entries
 *
 * The portal server is started lazily on the first portalUrl
 * call after a workspace switch and kept alive until the
 * workspace changes again or the app quits.
 */
let currentServer: { server: StaticServer; workspaceRoot: string } | null = null;

async function getOrStartServer(workspaceRoot: string, ctx: WorkspaceContext): Promise<StaticServer> {
  if (currentServer && currentServer.workspaceRoot === workspaceRoot) {
    return currentServer.server;
  }
  if (currentServer) {
    await currentServer.server.stop();
    currentServer = null;
  }
  const server = await startStaticServer(workspaceRoot);
  currentServer = { server, workspaceRoot };
  // Reset the AppContext dimension back to workspace (we may
  // have been in feature dim) so subsequent cdr.doc.generate
  // succeeds.
  void ctx;
  return server;
}

export function registerKnowledgeHandlers(services: DesktopServices, getContext: () => WorkspaceContext): void {
  registerHandler("dapei:knowledge:portalBuild", async (_input, _ctx, engine) => {
    const ctx = getContext();
    const result = await services.knowledge.portalBuild();
    if (result.ok) {
      // Invalidate the cached server (the new portal has
      // a fresh .vitepress/dist/ directory).
      if (currentServer && currentServer.workspaceRoot === ctx.workspaceRoot) {
        await currentServer.server.stop();
        currentServer = null;
      }
      broadcastPush({
        channel: "dapei:workspace:mutated",
        payload: { scope: "workspace", keys: ["cdr.doc.generate"] }
      });
    }
    return result;
  }, { isWrite: true });

  registerHandler("dapei:knowledge:portalUrl", async (_input, _ctx, _engine) => {
    const ctx = getContext();
    try {
      const server = await getOrStartServer(ctx.workspaceRoot, ctx);
      return { ok: true, url: server.url };
    } catch (err) {
      return { ok: false, url: "", error: { code: "PORTAL_START_FAILED", message: (err as Error).message } };
    }
  });

  registerHandler("dapei:knowledge:assetTree", async () => {
    return services.knowledge.assetTree();
  });

  registerHandler("dapei:knowledge:indexList", async () => {
    return services.knowledge.indexList();
  });
}
