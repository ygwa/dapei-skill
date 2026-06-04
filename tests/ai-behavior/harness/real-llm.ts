// Real-LLM stub.
//
// This module is the seam where a real LLM provider would be plugged in.
// Today it only re-exports the mock; the interface is shaped so that
// swapping in OpenAI / Anthropic / Claude Code etc. is mechanical.
//
// Enable with env var DAPEI_AI_BEHAVIOR_USE_REAL_LLM=1 — when that is set
// and a real provider is configured, this module returns the real-LLM
// runner instead of the mock.

import { runTranscript } from "./mock-llm.ts";
import type { RunOptions } from "./mock-llm.ts";
import type { Transcript, Trace } from "./types.ts";

export const USING_REAL_LLM = process.env.DAPEI_AI_BEHAVIOR_USE_REAL_LLM === "1";

export async function runWithCurrentBackend(transcript: Transcript, opts: RunOptions): Promise<Trace> {
  if (USING_REAL_LLM) {
    // When real-LLM support is added, dispatch here. For now this is a
    // guard so users get a clear message if they flip the env var.
    throw new Error(
      "DAPEI_AI_BEHAVIOR_USE_REAL_LLM=1 is set but no real-LLM provider is configured. " +
      "Unset the variable to use the mock harness, or implement real-llm.ts.",
    );
  }
  return runTranscript(transcript, opts);
}
