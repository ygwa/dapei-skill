import { broadcastPush } from "./push/broadcast.ts";
import type { AgentHost } from "@dapei/desktop-agent";

export function wireAgentPush(agent: AgentHost): void {
  agent.dispatcher.subscribe((event) => {
    broadcastPush({ channel: "dapei:agent:event", payload: event });
  });
}
