import type {
  AcpInitializeParams,
  AcpInitializeResult,
  AcpTextStreamParams,
  AcpToolCallRequestParams,
  JsonRpcNotification
} from "@dapei/desktop-contracts";
import {
  ACP_METHODS,
  acpTextStreamParamsSchema,
  acpToolCallRequestParamsSchema
} from "@dapei/desktop-contracts";
import type { AgentEvent } from "@dapei/desktop-contracts";
import { StdioJsonRpcTransport } from "./stdio-transport.ts";

export interface AcpClientOptions {
  transport: StdioJsonRpcTransport;
  onEvent?: (event: AgentEvent) => void;
}

/** ACP Client — 主进程侧，对接 OpenCode / Claude Code 等 ACP Server */
export class AcpClient {
  private readonly transport: StdioJsonRpcTransport;

  constructor(options: AcpClientOptions) {
    this.transport = options.transport;
    this.transport.onNotification((n) => this.handleNotification(n, options.onEvent));
  }

  async initialize(params: AcpInitializeParams): Promise<AcpInitializeResult> {
    return this.transport.request<typeof ACP_METHODS.initialize, AcpInitializeParams, AcpInitializeResult>(
      ACP_METHODS.initialize,
      params
    );
  }

  respondToolCall(id: number, result: unknown): void {
    this.transport.notify("agent/toolCallResult", { id, result });
  }

  private handleNotification(n: JsonRpcNotification, onEvent?: (event: AgentEvent) => void): void {
    if (n.method === ACP_METHODS.textStream) {
      const parsed = acpTextStreamParamsSchema.safeParse(n.params);
      if (parsed.success) {
        onEvent?.({ type: "message:assistant", text: parsed.data.delta });
      }
      return;
    }
    if (n.method === ACP_METHODS.toolCallRequest) {
      const parsed = acpToolCallRequestParamsSchema.safeParse(n.params);
      if (parsed.success) {
        onEvent?.({
          type: "tool:call",
          name: parsed.data.capabilityId,
          input: parsed.data.input
        });
      }
    }
  }
}

export type { AcpTextStreamParams, AcpToolCallRequestParams };
