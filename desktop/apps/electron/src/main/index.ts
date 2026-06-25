import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { bootstrapApp } from "./bootstrap.ts";
import { registerPushWindow } from "./push/broadcast.ts";
import type { WorkspaceContext } from "@dapei/desktop-engine-client";

let appContext: ReturnType<typeof bootstrapApp> | undefined;

/**
 * Build the initial WorkspaceContext at app boot. In M1-1 this is a
 * no-op default: the renderer will open the Launcher, the user picks
 * or creates a workspace, and the workspace handler will call
 * appContext.setContext(...). Until then, the context points at the
 * engine's HOME (the dapei-skill monorepo root); capability calls
 * against it are deterministic but may not be meaningful.
 */
function initialContext(): WorkspaceContext {
  const monorepoRoot = process.env.DAPEI_MONOREPO_ROOT ?? join(__dirname, "../../../..");
  return {
    workspaceRoot: monorepoRoot,
    dimension: "workspace"
  };
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "大培",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.on("ready-to-show", () => win.show());
  registerPushWindow(win);

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  appContext = bootstrapApp(win, initialContext());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

export { appContext };
