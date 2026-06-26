/** capability:run 请求/响应 — renderer 经 allowlist 调用 */

export interface CapabilityInvokeRequest {
  capabilityId: string;
  input: Record<string, unknown>;
  workspaceRoot: string;
  feature?: string;
}

export interface CapabilityInvokeResponse {
  ok: boolean;
  data: unknown;
  sideEffects: string[];
  artifactPaths?: string[];
  error?: { code: string; message: string };
}
