import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { bootstrapApp } from "./bootstrap.ts";
import { registerPushWindow } from "./push/broadcast.ts";

let appContext: ReturnType<typeof bootstrapApp> | undefined;

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
  appContext = bootstrapApp(win);
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
