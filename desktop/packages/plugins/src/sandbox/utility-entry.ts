/**
 * Utility Process 入口 — 由 Electron utilityProcess.fork 加载
 * 隔离不可信插件代码，见 dapei_desktop_tech_selection_v1.pdf §3.2
 */

export interface UtilityHostMessage {
  type: "ping" | "load-plugin" | "shutdown";
  payload?: unknown;
}

interface UtilityParentPort {
  on(event: "message", listener: (message: unknown) => void): void;
  postMessage(message: unknown): void;
}

const parentPort = (process as NodeJS.Process & { parentPort?: UtilityParentPort }).parentPort;

parentPort?.on("message", (msg: unknown) => {
  const message = msg as UtilityHostMessage;
  if (message?.type === "ping") {
    parentPort.postMessage({ type: "pong" });
  }
});

parentPort?.postMessage({ type: "ready" });
