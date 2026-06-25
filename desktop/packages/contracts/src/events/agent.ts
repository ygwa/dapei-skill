/** Main → Renderer 推送事件（Agent-Share、sync 进度等） */

export type AgentEvent =
  | { type: "session:ready"; sessionId: string }
  | { type: "session:closed"; sessionId: string }
  | { type: "message:user"; text: string }
  | { type: "message:assistant"; text: string; stage?: string }
  | { type: "tool:call"; name: string; input: unknown }
  | { type: "tool:result"; name: string; output: unknown; ok: boolean }
  | { type: "capability:invoked"; id: string; ok: boolean };

