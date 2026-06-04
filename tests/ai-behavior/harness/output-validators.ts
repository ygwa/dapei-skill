// Output validators — pure functions that inspect a Trace and an assertion.
//
// Each validator returns a list of violation strings; empty list = pass.
// The runner aggregates all violations and reports the trace as failed if
// any are present.

import type { Assert, Trace, RecordedEvent } from "./types.ts";

export function validate(trace: Trace, asserts: Assert[]): string[] {
  const violations: string[] = [];
  for (const a of asserts) {
    violations.push(...validateOne(trace, a));
  }
  return violations;
}

function validateOne(trace: Trace, a: Assert): string[] {
  switch (a.kind) {
    case "output_sections":
      return assertOutputSections(trace, a.sections);
    case "no_path_under":
      return assertNoPathUnder(trace, a.path_prefix, a.allow);
    case "only_path_under":
      return assertOnlyPathUnder(trace, a.path_prefix);
    case "capability_called":
      return assertCapabilityCalled(trace, a.capability, a.minTimes ?? 1);
    case "capability_not_called":
      return assertCapabilityNotCalled(trace, a.capability);
    case "no_skill_called_outside_workspace_or_features":
      return assertNoSkillCalledOutsideWorkspaceOrFeatures(trace);
    case "paused_at_stage":
      return assertPausedAtStage(trace, a.stage);
    case "final_response_contains":
      return assertFinalResponseContains(trace, a.text);
    case "final_response_excludes":
      return assertFinalResponseExcludes(trace, a.text);
    case "stages_called_in_order":
      return assertStagesCalledInOrder(trace, a.stages);
    default: {
      const _exhaustive: never = a;
      return [`unknown assert kind: ${JSON.stringify(_exhaustive)}`];
    }
  }
}

function finalResponse(trace: Trace): RecordedEvent | undefined {
  return trace.events.find((e) => e.kind === "final_response");
}

function toolCalls(trace: Trace, capability?: string): RecordedEvent[] {
  return trace.events.filter(
    (e) => e.kind === "tool_call" && (!capability || (e.detail as any).capability === capability),
  );
}

function assertOutputSections(trace: Trace, sections: string[]): string[] {
  const fr = finalResponse(trace);
  if (!fr) return ["no final_response in trace"];
  const content = String((fr.detail as any).content ?? "");
  const missing = sections.filter((s) => !new RegExp(`(^|\\n)\\s*#*\\s*${escapeRe(s)}\\b`, "i").test(content));
  if (missing.length) return [`final_response missing sections: ${missing.join(", ")}`];
  return [];
}

function assertNoPathUnder(trace: Trace, prefix: string, allow: string[]): string[] {
  const allowLower = allow.map((a) => a.toLowerCase());
  const prefixLower = prefix.toLowerCase();
  const writes = trace.events.filter((e) => e.kind === "file_write");
  const violations: string[] = [];
  for (const w of writes) {
    const path = String((w.detail as any).path ?? "").toLowerCase();
    if (path.startsWith(prefixLower) && !allowLower.some((a) => path.startsWith(a))) {
      violations.push(`write to forbidden path ${path} (prefix=${prefix})`);
    }
  }
  return violations;
}

function assertOnlyPathUnder(trace: Trace, prefix: string): string[] {
  const prefixLower = prefix.toLowerCase();
  const writes = trace.events.filter((e) => e.kind === "file_write");
  const violations: string[] = [];
  for (const w of writes) {
    const path = String((w.detail as any).path ?? "").toLowerCase();
    if (!path.startsWith(prefixLower)) {
      violations.push(`write outside allowed prefix: ${path} (expected under ${prefix})`);
    }
  }
  return violations;
}

function assertCapabilityCalled(trace: Trace, cap: string, minTimes: number): string[] {
  const calls = toolCalls(trace, cap);
  if (calls.length < minTimes) {
    return [`capability ${cap} called ${calls.length} times, expected at least ${minTimes}`];
  }
  return [];
}

function assertCapabilityNotCalled(trace: Trace, cap: string): string[] {
  const calls = toolCalls(trace, cap);
  if (calls.length > 0) {
    return [`capability ${cap} should not have been called, but was called ${calls.length} times`];
  }
  return [];
}

function assertNoSkillCalledOutsideWorkspaceOrFeatures(trace: Trace): string[] {
  // engine-level writes to docs/ are fine if the workspace itself is the
  // boundary; here we mean the agent's own file_writes should never touch
  // repos/<name> directly (must go through repos.add / feature.create).
  const writes = trace.events.filter((e) => e.kind === "file_write");
  const violations: string[] = [];
  for (const w of writes) {
    const path = String((w.detail as any).path ?? "").toLowerCase();
    if (/^repos\//.test(path) && !/^repos\/.+\/__expected__\//.test(path)) {
      violations.push(`agent wrote directly to ${path}; must go through repos.add / feature.create`);
    }
  }
  return violations;
}

function assertPausedAtStage(trace: Trace, stage: string): string[] {
  // "Pause at stage" means: the agent recorded a final_response whose content
  // contains "Needs Confirmation" but did NOT proceed to the next stage's tool call.
  const fr = finalResponse(trace);
  if (!fr) return ["no final_response in trace; cannot assert pause"];
  const content = String((fr.detail as any).content ?? "");
  if (!/needs confirmation/i.test(content)) {
    return [`agent did not pause at stage ${stage}: no "Needs Confirmation" in final_response`];
  }
  // And it must not have called any capability for a later stage
  const STAGE_TO_CAP: Record<string, string[]> = {
    "solution-design": ["workflow.runStage"],
    "implementation": ["workflow.runStage"],
    "acceptance": ["feature.close"],
  };
  const afterIdx = trace.events.indexOf(fr);
  const laterCalls = trace.events.slice(afterIdx + 1).filter((e) => e.kind === "tool_call");
  for (const c of laterCalls) {
    const cap = (c.detail as any).capability;
    if (STAGE_TO_CAP[stage]?.includes(cap)) {
      return [`agent claimed pause at ${stage} but proceeded to call ${cap} after the response`];
    }
  }
  return [];
}

function assertFinalResponseContains(trace: Trace, text: string): string[] {
  const fr = finalResponse(trace);
  if (!fr) return ["no final_response in trace"];
  const content = String((fr.detail as any).content ?? "");
  if (!content.includes(text)) return [`final_response missing required text: ${JSON.stringify(text)}`];
  return [];
}

function assertFinalResponseExcludes(trace: Trace, text: string): string[] {
  const fr = finalResponse(trace);
  if (!fr) return ["no final_response in trace"];
  const content = String((fr.detail as any).content ?? "");
  if (content.includes(text)) return [`final_response must not include: ${JSON.stringify(text)}`];
  return [];
}

function assertStagesCalledInOrder(trace: Trace, stages: string[]): string[] {
  const calls = toolCalls(trace, "workflow.runStage");
  const called = calls.map((c) => (c.detail as any).input?.stage).filter(Boolean);
  let i = 0;
  for (const s of called) {
    if (i < stages.length && s === stages[i]) i++;
  }
  if (i < stages.length) {
    return [`workflow.runStage calls did not include expected sequence; saw ${called.join(" → ")}, expected prefix ${stages.join(" → ")}`];
  }
  return [];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
