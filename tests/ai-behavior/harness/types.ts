// Shared types for the AI behavior test harness.
//
// A "transcript" is a YAML fixture describing:
//   - the user input,
//   - a sequence of expected agent actions (skill reads, tool calls, final responses),
//   - assertions the recorded trace must satisfy.
//
// The mock harness plays the transcript back, recording the actual outcome.
// The same validators can then be re-run against a real LLM trace, so the
// same fixture file works for both modes.

export type Action =
  | { kind: "load_skill"; skill: string }
  | { kind: "tool_call"; capability: string; input: Record<string, unknown>; expect?: "ok" | "error"; errorCode?: string }
  | { kind: "final_response"; content: string }
  | { kind: "write_file"; path: string; contains?: string[] }
  | { kind: "read_file"; path: string };

export interface Transcript {
  name: string;
  description: string;
  user_input: string;
  actions: Action[];
  asserts: Assert[];
  // If true, the runner expects the asserts to FAIL — this is a "negative
  // fixture" that documents a rule by failing when the rule is broken.
  expect_violations?: boolean;
}

export type Assert =
  | { kind: "output_sections"; sections: string[] }                              // all 4 sections present
  | { kind: "no_path_under"; path_prefix: string; allow: string[] }               // no writes under a forbidden prefix
  | { kind: "only_path_under"; path_prefix: string }                              // all writes inside this prefix
  | { kind: "capability_called"; capability: string; minTimes?: number }
  | { kind: "capability_not_called"; capability: string }
  | { kind: "no_skill_called_outside_workspace_or_features" }
  | { kind: "paused_at_stage"; stage: "solution-design" | "implementation" | "acceptance" }
  | { kind: "final_response_contains"; text: string }
  | { kind: "final_response_excludes"; text: string }
  | { kind: "stages_called_in_order"; stages: string[] };

export interface RecordedEvent {
  kind: "load_skill" | "tool_call" | "file_write" | "file_read" | "final_response" | "error";
  at: string;
  detail: Record<string, unknown>;
}

export interface Trace {
  transcriptName: string;
  events: RecordedEvent[];
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  errors: string[];
}
