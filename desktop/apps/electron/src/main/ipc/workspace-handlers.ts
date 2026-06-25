import { dialog } from "electron";
import type { CapabilityInvokeResponse, WorkspaceOpenResult } from "@dapei/desktop-contracts";
import type { EngineClient, WorkspaceContext } from "@dapei/desktop-engine-client";
import { registerHandler, registerCapabilityProxy } from "./router.ts";
import { workspaceRegistry } from "../workspace/registry.ts";

/**
 * Workspace IPC handlers. M1-3 implements the launcher surface:
 *   dapei:workspace:listRecents — read ~/.dapei/desktop/recent.json
 *   dapei:workspace:pickDirectory — open a native directory picker
 *   dapei:workspace:open         — validate + register + set context
 *   dapei:workspace:init         — create + register + set context
 *   dapei:workspace:status       — engine proxy (already in M1-2)
 *   dapei:workspace:validate     — engine proxy
 *   dapei:workspace:report       — engine proxy
 *
 * Each of listRecents / open / init must update the AppContext
 * WorkspaceContext so subsequent capability calls target the
 * user's chosen workspace. setContext is provided by the caller.
 */
export function registerWorkspaceHandlers(
  setContext: (ctx: WorkspaceContext) => void,
  _getCurrentContext: () => WorkspaceContext
): void {
  registerCapabilityProxy("dapei:workspace:status", "workspace.status");
  registerCapabilityProxy("dapei:workspace:validate", "workspace.validate");
  registerCapabilityProxy("dapei:workspace:report", "workspace.report");

  registerHandler("dapei:workspace:listRecents", async () => {
    return workspaceRegistry.list();
  });

  registerHandler("dapei:workspace:pickDirectory", async () => {
    const win = await getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: "Select dapei workspace",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  registerHandler(
    "dapei:workspace:open",
    async (rawInput, _ctx, engine) => {
      const { path: workspacePath } = rawInput as { path: string };
      const validationResult = await engine.run(
        { capabilityId: "workspace.validate", input: {}, workspaceRoot: workspacePath },
        { workspaceRoot: workspacePath, dimension: "workspace" }
      );
      const validation = mapValidationResponse(validationResult);
      if (validation?.status === "invalid") {
        const result: WorkspaceOpenResult = {
          ok: false,
          path: workspacePath,
          name: workspacePath.split(/[/\\]/).filter(Boolean).pop() ?? workspacePath,
          validation,
          error: { code: "WORKSPACE_INVALID", message: validation.errors.join("; ") || "workspace validation failed" }
        };
        return result;
      }
      const entry = workspaceRegistry.add(workspacePath);
      setContext({ workspaceRoot: workspacePath, dimension: "workspace" });
      return {
        ok: true,
        path: workspacePath,
        name: entry.name,
        validation
      } satisfies WorkspaceOpenResult;
    }
  );

  registerHandler(
    "dapei:workspace:init",
    async (rawInput, _ctx, engine) => {
      const { parentDir, name } = rawInput as { parentDir: string; name: string };
      const workspacePath = joinPath(parentDir, name);
      const initResult = await engine.run(
        { capabilityId: "workspace.init", input: {}, workspaceRoot: workspacePath },
        { workspaceRoot: workspacePath, dimension: "workspace" }
      );
      if (!initResult.ok) {
        return {
          ok: false,
          path: workspacePath,
          name,
          error: { code: initResult.error?.code ?? "INIT_FAILED", message: initResult.error?.message ?? "workspace.init failed" }
        } satisfies WorkspaceOpenResult;
      }
      const entry = workspaceRegistry.add(workspacePath);
      setContext({ workspaceRoot: workspacePath, dimension: "workspace" });
      return {
        ok: true,
        path: workspacePath,
        name: entry.name,
        validation: { status: "valid", errors: [], warnings: [] }
      } satisfies WorkspaceOpenResult;
    }
  );
}

function mapValidationResponse(
  result: CapabilityInvokeResponse
): { status: "valid" | "warn" | "invalid"; errors: string[]; warnings: string[] } | undefined {
  if (!result.ok) return undefined;
  const data = result.data as { status?: "valid" | "warn" | "invalid"; errors?: string[]; warnings?: string[] } | undefined;
  if (!data) return undefined;
  return {
    status: data.status ?? "valid",
    errors: data.errors ?? [],
    warnings: data.warnings ?? []
  };
}

function joinPath(parentDir: string, name: string): string {
  const sep = parentDir.includes("\\") && !parentDir.includes("/") ? "\\" : "/";
  return parentDir.replace(/[/\\]+$/, "") + sep + name;
}

async function getFocusedWindow(): Promise<Electron.BrowserWindow | null> {
  const { BrowserWindow } = await import("electron");
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}
