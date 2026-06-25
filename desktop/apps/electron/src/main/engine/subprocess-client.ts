import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CapabilityInvokeRequest, CapabilityInvokeResponse } from "@dapei/desktop-contracts";
import { evaluateDimension, StubEngineClient, validateWorkspaceContext, type EngineClient, type EngineErrorCode, type WorkspaceContext } from "@dapei/desktop-engine-client";

/**
 * SubprocessEngineClient invokes the root engine by spawning
 * `node --experimental-strip-types engine/dapei-engine.ts run ...`.
 *
 * Architectural contract (ADR-0008, ADR-0009):
 *  - The engine entry path is computed from `monorepoRoot` (the
 *    dapei-skill repo root) — that is the engine's HOME, not the
 *    user's workspace.
 *  - The user's workspace root, current feature, and dimension are
 *    passed via `WorkspaceContext` to `run()`. They are injected
 *    into the spawned child through env vars only; the parent's
 *    `process.env` is NEVER mutated.
 *  - One fresh child per call in M1. Wasteful (~150ms per call)
 *    but bulletproof for correctness and crash isolation. A
 *    future milestone may batch behind a long-lived utility
 *    process if a benchmark proves it matters.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the dapei-skill monorepo root. This is the engine's HOME
 * — it is the directory that contains `engine/dapei-engine.ts` and
 * `packages/core/`. It is NOT the user's workspace.
 *
 * Resolution order:
 *  1. `monorepoRoot` constructor argument (testable, preferred)
 *  2. `DAPEI_MONOREPO_ROOT` env var (override at runtime)
 *  3. Walk up from this file's location (dev fallback)
 */
export function resolveMonorepoRoot(explicit?: string): string {
  if (explicit) return resolve(explicit);
  if (process.env.DAPEI_MONOREPO_ROOT) return resolve(process.env.DAPEI_MONOREPO_ROOT);
  // Walk up from apps/electron/src/main/engine/subprocess-client.ts
  // to dapei-skill/.
  return resolve(__dirname, "../../../../..");
}

/**
 * The three env vars SubprocessEngineClient always sets on the
 * child. Set even when the value is empty so the engine's parser
 * does not have to distinguish "unset" from "set to empty".
 */
interface ChildEnvOverrides {
  DAPEI_WORKSPACE_ROOT: string;
  DAPEI_FEATURE: string;
  DAPEI_DIMENSION: string;
  DAPEI_ENGINE_HOME: string;
}

function envFromContext(ctx: WorkspaceContext, monorepoRoot: string): ChildEnvOverrides {
  return {
    DAPEI_WORKSPACE_ROOT: ctx.workspaceRoot,
    DAPEI_FEATURE: ctx.feature ?? "",
    DAPEI_DIMENSION: ctx.dimension,
    DAPEI_ENGINE_HOME: monorepoRoot
  };
}

export class SubprocessEngineClient implements EngineClient {
  private readonly monorepoRoot: string;
  private readonly executable: string;

  /**
   * @param monorepoRoot dapei-skill repo root (the engine's HOME). If
   *   omitted, resolved from env or walked up from this file.
   * @param executable Optional override of the Node executable. Defaults
   *   to `process.execPath` (Electron's bundled Node in production;
   *   system Node in dev). Tests may pass a stub.
   */
  constructor(monorepoRoot?: string, executable: string = process.execPath) {
    this.monorepoRoot = resolveMonorepoRoot(monorepoRoot);
    this.executable = executable;
  }

  async run(request: CapabilityInvokeRequest, ctx: WorkspaceContext): Promise<CapabilityInvokeResponse> {
    // 1. Validate context at the boundary. A bad context is a programmer
    //    error, not a runtime condition; refuse loud.
    try {
      validateWorkspaceContext(ctx);
    } catch (err: unknown) {
      return errorResponse("INVALID_CONTEXT", err instanceof Error ? err.message : String(err));
    }

    // 2. Enforce the dimension rule. ADR-0010. This is the engine-side
    //    gate; the UI must not be relied on for this.
    const decision = evaluateDimension(request.capabilityId, ctx.dimension);
    if (!decision.allow) {
      return errorResponse(decision.code, decision.message);
    }

    // 3. Build the input payload the engine expects. The engine reads
    //    `feature` from input (engine v0.10), not from env. We thread
    //    it through here for engine-side provenance tracking.
    const input: Record<string, unknown> = { ...request.input };
    if (ctx.feature !== undefined) input.feature = ctx.feature;

    const engineScript = join(this.monorepoRoot, "engine/dapei-engine.ts");
    const args = [
      "--experimental-strip-types",
      engineScript,
      "run",
      "--capability",
      request.capabilityId,
      "--input",
      JSON.stringify(input)
    ];

    const childEnv = { ...process.env, ...envFromContext(ctx, this.monorepoRoot) };

    return new Promise<CapabilityInvokeResponse>((resolvePromise) => {
      let child: ReturnType<typeof spawn> | undefined;
      try {
        child = spawn(this.executable, args, {
          cwd: ctx.workspaceRoot,
          env: childEnv,
          stdio: ["ignore", "pipe", "pipe"]
        });
      } catch (err: unknown) {
        resolvePromise(
          errorResponse("SPAWN_FAILED", err instanceof Error ? err.message : String(err))
        );
        return;
      }

      let stdout = "";
      let stderr = "";
      let killed = false;
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        resolvePromise(errorResponse("SPAWN_FAILED", err.message));
      });

      child.on("close", (code) => {
        if (killed) return;
        killed = true;
        if (code !== 0) {
          // engine writes errors to stderr via console.error
          const message = stderr.trim() || stdout.trim() || `engine exited with code ${code}`;
          resolvePromise(errorResponse("ENGINE_EXIT", message));
          return;
        }

        const trimmed = stdout.trim();
        if (!trimmed) {
          resolvePromise({ ok: true, data: null, sideEffects: [] });
          return;
        }

        // The engine prints result.data; if data is a plain string it
        // comes through as `text`. Otherwise JSON. See
        // engine/dapei-engine.ts:63-65.
        try {
          resolvePromise({ ok: true, data: JSON.parse(trimmed), sideEffects: [] });
        } catch {
          resolvePromise({ ok: true, data: { text: trimmed }, sideEffects: [] });
        }
      });
    });
  }
}

function errorResponse(code: EngineErrorCode, message: string): CapabilityInvokeResponse {
  return { ok: false, data: null, sideEffects: [], error: { code, message } };
}

/**
 * Factory: pick the right client based on env. `DAPEI_ENGINE_MODE=stub`
 * returns StubEngineClient (used by CI and smoke runs). Default is
 * SubprocessEngineClient.
 */
export function createEngineClient(opts?: { monorepoRoot?: string; executable?: string }): EngineClient {
  if (process.env.DAPEI_ENGINE_MODE === "stub") {
    return new StubEngineClient();
  }
  return new SubprocessEngineClient(opts?.monorepoRoot, opts?.executable);
}
