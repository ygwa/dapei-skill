/** ACP 方法名常量 — 对齐 dapei_desktop_tech_selection_v1.pdf */

export const ACP_METHODS = {
  initialize: "initialize",
  textStream: "agent/textStream",
  toolCallRequest: "agent/toolCallRequest"
} as const;

export interface AcpClientInfo {
  name: string;
  version: string;
}

export interface AcpInitializeParams {
  clientInfo: AcpClientInfo;
  workspaceRoot: string;
  capabilities?: {
    ui?: { supportsRichCards?: boolean; supportsModals?: boolean };
  };
}

export interface AcpInitializeResult {
  capabilities?: {
    tools?: string[];
    supportedModels?: string[];
  };
}

export interface AcpTextStreamParams {
  delta: string;
  sessionId?: string;
}

export interface AcpToolCallRequestParams {
  capabilityId: string;
  input: Record<string, unknown>;
  sessionId?: string;
}

export interface AcpToolCallResult {
  approved: boolean;
  status: "success" | "cancelled" | "error";
  data?: unknown;
  error?: { code: string; message: string };
}
