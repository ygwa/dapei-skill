import type { AgentEvent } from "./agent.ts";

/** Main → Renderer 统一推送信封 */
export type DesktopPushEvent =
  | { channel: "dapei:agent:event"; payload: AgentEvent }
  | { channel: "dapei:workspace:mutated"; payload: { scope: "workspace" | "feature"; keys?: string[] } }
  | { channel: "dapei:repos:syncProgress"; payload: { repo: string; percent: number } }
  | { channel: "dapei:pipeline:taskProgress"; payload: { taskId: string; status: string } };

export const DESKTOP_PUSH_CHANNEL = "dapei:push" as const;
