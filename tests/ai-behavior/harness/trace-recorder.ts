// Trace recorder: collects events emitted by the agent harness as it plays
// back a transcript, and produces a Trace object that the validators consume.
//
// Events are pushed in append-only order; the recorder never mutates past
// events. This matches the AGENTS.md "evidence first" principle — we keep a
// full record of what the agent did, in order, with timestamps.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RecordedEvent, Trace } from "./types.ts";

export class TraceRecorder {
  private events: RecordedEvent[] = [];
  private readonly startedAt = new Date().toISOString();

  record(ev: Omit<RecordedEvent, "at">): void {
    this.events.push({ ...ev, at: new Date().toISOString() });
  }

  finish(ok: boolean, errors: string[] = []): Trace {
    return {
      transcriptName: this.transcriptName,
      events: this.events.slice(),
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      ok,
      errors,
    };
  }

  // Dump the full trace as JSON for debugging or regression capture.
  dump(trace: Trace, dir: string): void {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${trace.transcriptName}.trace.json`);
    writeFileSync(file, JSON.stringify(trace, null, 2));
  }

  private readonly transcriptName: string;
  constructor(transcriptName: string) {
    this.transcriptName = transcriptName;
  }
}
