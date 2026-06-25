import type { AgentEvent } from "@dapei/desktop-contracts";

type Handler = (event: AgentEvent) => void;

/** 将 ACP notification 扇出到多个 UI 订阅方（Agent-Share） */
export class AcpEventDispatcher {
  private readonly handlers = new Set<Handler>();

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(event: AgentEvent): void {
    for (const h of this.handlers) h(event);
  }
}
