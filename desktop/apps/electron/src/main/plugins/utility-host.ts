import { utilityProcess } from "electron";
import { join } from "node:path";

/** 启动插件 Utility Process 沙箱（M2 完善消息协议） */
export function startPluginUtilityHost(): void {
  const entry = join(__dirname, "utility/plugin-host.js");
  try {
    const child = utilityProcess.fork(entry, [], { serviceName: "dapei-plugin-host" });
    child.on("message", (msg) => {
      console.info("[plugin utility]", msg);
    });
  } catch (err) {
    console.warn("[plugin utility] fork skipped in dev:", err);
  }
}
