import { broadcastPush } from "./push/broadcast.ts";
import type { AppContext } from "./bootstrap.ts";

export function wireAgentPush(ctx: AppContext): void {
  ctx.agent.dispatcher.subscribe((event) => {
    broadcastPush({ channel: "dapei:agent:event", payload: event });
  });
}
