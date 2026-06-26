/** Utility Process 入口 — 构建为 out/main/utility/plugin-host.js */

interface UtilityHostMessage {
  type?: string;
}

interface UtilityParentPort {
  on(event: "message", listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

const parentPort = (process as NodeJS.Process & { parentPort?: UtilityParentPort }).parentPort;

parentPort?.on("message", (event) => {
  const msg = event.data as UtilityHostMessage;
  if (msg?.type === "ping") {
    parentPort.postMessage({ type: "pong" });
  }
});

parentPort?.postMessage({ type: "ready" });
