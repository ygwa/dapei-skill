import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import type { CapabilityInvokeRequest, CapabilityInvokeResponse } from "@dapei/desktop-contracts";
import type { EngineClient } from "@dapei/desktop-engine-client";
import { StubEngineClient } from "@dapei/desktop-engine-client";

/** 从 electron out/main 向上解析 monorepo 根（dapei-skill/） */
export function resolveMonorepoRoot(): string {
  if (process.env.DAPEI_MONOREPO_ROOT) return process.env.DAPEI_MONOREPO_ROOT;
  return resolve(__dirname, "../../../../..");
}

/**
 * 通过 subprocess 调用仓库根 `engine/dapei-engine.ts`。
 * 与 `scripts/dapei` 一致，使用 `node --experimental-strip-types`。
 */
export class SubprocessEngineClient implements EngineClient {
  constructor(private readonly monorepoRoot: string = resolveMonorepoRoot()) {}

  async run(request: CapabilityInvokeRequest): Promise<CapabilityInvokeResponse> {
    const engineScript = join(this.monorepoRoot, "engine/dapei-engine.ts");
    const input = { ...request.input };
    if (request.feature) input.feature = request.feature;

    const args = [
      "--experimental-strip-types",
      engineScript,
      "run",
      "--capability",
      request.capabilityId,
      "--input",
      JSON.stringify(input)
    ];

    const workspaceRoot = request.workspaceRoot || this.monorepoRoot;

    return new Promise((resolvePromise) => {
      const child = spawn(process.execPath, args, {
        cwd: workspaceRoot,
        env: { ...process.env, DAPEI_WORKSPACE_ROOT: workspaceRoot, DAPEI_ENGINE_HOME: this.monorepoRoot },
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        if (code !== 0) {
          resolvePromise({
            ok: false,
            data: null,
            sideEffects: [],
            error: {
              code: "ENGINE_EXIT",
              message: stderr.trim() || stdout.trim() || `engine exited with code ${code}`
            }
          });
          return;
        }

        const trimmed = stdout.trim();
        if (!trimmed) {
          resolvePromise({ ok: true, data: null, sideEffects: [] });
          return;
        }

        try {
          resolvePromise({ ok: true, data: JSON.parse(trimmed), sideEffects: [] });
        } catch {
          resolvePromise({ ok: true, data: { text: trimmed }, sideEffects: [] });
        }
      });

      child.on("error", (err) => {
        resolvePromise({
          ok: false,
          data: null,
          sideEffects: [],
          error: { code: "SPAWN_FAILED", message: err.message }
        });
      });
    });
  }
}

export function createEngineClient(): EngineClient {
  if (process.env.DAPEI_ENGINE_MODE === "stub") {
    return new StubEngineClient();
  }
  return new SubprocessEngineClient();
}
