import type { CapabilityInvokeRequest, CapabilityInvokeResponse } from "@dapei/desktop-contracts";

export interface EngineClientOptions {
  monorepoRoot: string;
}

export interface EngineClient {
  run(request: CapabilityInvokeRequest): Promise<CapabilityInvokeResponse>;
}

/** M0：占位实现；M1 接 subprocess dapei-engine 或 ACP tool bridge */
export class StubEngineClient implements EngineClient {
  async run(request: CapabilityInvokeRequest): Promise<CapabilityInvokeResponse> {
    return {
      ok: false,
      data: null,
      sideEffects: [],
      error: {
        code: "NOT_IMPLEMENTED",
        message: `EngineClient.run(${request.capabilityId}) — wire subprocess in apps/electron main`
      }
    };
  }
}

export type { CapabilityInvokeRequest, CapabilityInvokeResponse };
