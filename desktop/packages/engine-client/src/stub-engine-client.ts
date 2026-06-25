import type { CapabilityInvokeRequest, CapabilityInvokeResponse } from "@dapei/desktop-contracts";
import type { EngineClient } from "./types.ts";

/**
 * StubEngineClient is the desktop's offline / CI / smoke-test engine.
 * It implements EngineClient with the same shape as SubprocessEngineClient
 * but never spawns anything. Every call returns NOT_IMPLEMENTED, which
 * the renderer is expected to surface honestly (no fake data).
 *
 * Set DAPEI_ENGINE_MODE=stub to wire this in main; or pass it
 * explicitly to the bootstrap.
 */
export class StubEngineClient implements EngineClient {
  async run(
    request: CapabilityInvokeRequest,
    _ctx: import("./types.ts").WorkspaceContext
  ): Promise<CapabilityInvokeResponse> {
    return {
      ok: false,
      data: null,
      sideEffects: [],
      error: {
        code: "NOT_IMPLEMENTED",
        message: `StubEngineClient.run(${request.capabilityId}) — set DAPEI_ENGINE_MODE=real (default) to use SubprocessEngineClient`
      }
    };
  }
}
