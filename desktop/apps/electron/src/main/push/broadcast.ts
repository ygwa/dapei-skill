import type { BrowserWindow } from "electron";
import type { DesktopPushEvent } from "@dapei/desktop-contracts";
import { DESKTOP_PUSH_CHANNEL } from "@dapei/desktop-contracts";

const windows = new Set<BrowserWindow>();

export function registerPushWindow(win: BrowserWindow): void {
  windows.add(win);
  win.on("closed", () => windows.delete(win));
}

export function broadcastPush(event: DesktopPushEvent): void {
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(DESKTOP_PUSH_CHANNEL, event);
    }
  }
}
