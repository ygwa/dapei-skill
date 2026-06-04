// Mock LLM / agent harness.
//
// This module plays back a transcript deterministically. For each `tool_call`
// action in the transcript, it invokes the real dapei engine via
// `runCapability`. For each `write_file` it actually writes a file. For
// `final_response` it just stores the canned content.
//
// In a real-LLM mode (env DAPEI_AI_BEHAVIOR_USE_REAL_LLM=1) the harness would
// forward each action decision to an LLM; that path is left as a stub so the
// surface area is stable.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runCapability } from "../../../packages/core/src/index.ts";
import type { Action, Transcript, Trace } from "./types.ts";
import { TraceRecorder } from "./trace-recorder.ts";

export interface RunOptions {
  rootDir: string;
  now?: Date;
}

export async function runTranscript(transcript: Transcript, opts: RunOptions): Promise<Trace> {
  const recorder = new TraceRecorder(transcript.name);
  const errors: string[] = [];
  const now = opts.now ?? new Date();

  for (const action of transcript.actions) {
    try {
      await dispatch(action, recorder, opts.rootDir, now);
    } catch (err: any) {
      recorder.record({ kind: "error", detail: { action, message: err?.message, code: err?.code } });
      errors.push(`action ${action.kind} failed: ${err?.message ?? String(err)}`);
      // Continue recording so validators still see the trace
    }
  }

  const ok = errors.length === 0;
  return recorder.finish(ok, errors);
}

async function dispatch(action: Action, recorder: TraceRecorder, rootDir: string, now: Date): Promise<void> {
  switch (action.kind) {
    case "load_skill": {
      const path = join(rootDir, "skills", action.skill, "SKILL.md");
      // We don't actually need to load it; the test cares that the agent READ it.
      // For mock mode we just record the intent.
      recorder.record({ kind: "load_skill", detail: { skill: action.skill, path, loaded: existsSync(path) } });
      return;
    }

    case "tool_call": {
      const input: Record<string, unknown> = { ...action.input };
      // Honour confirmation gates by injecting confirmed=true when expected
      if (["solution-design", "implementation", "acceptance"].includes(String(input.stage ?? ""))) {
        if (input.confirmed === undefined) input.confirmed = false;
      }
      recorder.record({ kind: "tool_call", detail: { capability: action.capability, input } });

      if (action.expect === "error") {
        try {
          await runCapability(action.capability, input, { rootDir, now });
          // If we expected an error but got success, that's a trace error
          recorder.record({
            kind: "error",
            detail: { capability: action.capability, message: `expected error ${action.errorCode}, got ok` },
          });
        } catch (err: any) {
          if (action.errorCode && err?.code !== action.errorCode) {
            recorder.record({
              kind: "error",
              detail: { capability: action.capability, message: `expected error code ${action.errorCode}, got ${err?.code}` },
            });
          }
        }
        return;
      }

      await runCapability(action.capability, input, { rootDir, now });
      return;
    }

    case "write_file": {
      const fullPath = join(rootDir, action.path);
      mkdirSync(dirname(fullPath), { recursive: true });
      const content = (action.contains ?? []).join("\n") + "\n";
      writeFileSync(fullPath, content);
      recorder.record({ kind: "file_write", detail: { path: action.path, contains: action.contains } });
      return;
    }

    case "read_file": {
      const fullPath = join(rootDir, action.path);
      recorder.record({ kind: "file_read", detail: { path: action.path, exists: existsSync(fullPath) } });
      return;
    }

    case "final_response": {
      recorder.record({ kind: "final_response", detail: { content: action.content } });
      return;
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`unknown action kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
