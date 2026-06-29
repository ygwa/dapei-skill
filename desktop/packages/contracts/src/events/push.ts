import type { AgentEvent } from "./agent.ts";

/** Main → Renderer 统一推送信封 */
export type DesktopPushEvent =
  | { channel: "dapei:agent:event"; payload: AgentEvent }
  | { channel: "dapei:workspace:mutated"; payload: { scope: "workspace" | "feature"; keys?: string[] } }
  | { channel: "dapei:repos:syncProgress"; payload: { repo: string; percent: number } }
  | { channel: "dapei:pipeline:taskProgress"; payload: { taskId: string; status: string } }
  /** M3-2: lock / unlock the active dimension so the renderer can
   * disable write-capability buttons during the close wizard. */
  | { channel: "dapei:dimension:lock"; payload: { scope: "feature"; feature: string; reason: string } }
  | { channel: "dapei:dimension:unlock"; payload: { scope: "feature"; feature: string } }
  /** M3-3: feature close broadcast so P3 portal can highlight promoted
   * assets and the renderer can render the success banner. */
  | { channel: "dapei:feature:closed"; payload: { feature: string; promoted: "ok" | "error"; cdr_assets_tagged?: number; error?: { code: string; message: string } } };

export const DESKTOP_PUSH_CHANNEL = "dapei:push" as const;
