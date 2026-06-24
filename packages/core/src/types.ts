export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface CapabilityContext {
  rootDir: string;
  now: Date;
  /**
   * v0.10 — optional feature name in whose workflow this capability
   * call is running. When set, cdr.* write capabilities record it on
   * the artifact as `created_by_feature` (and `updated_by_feature` on
   * subsequent updates), and the audit log records it on every entry.
   * Unset means the call is workspace-scoped (workspace indexing,
   * agent exploration, smoke tests). M4 populates this from
   * `runCapability` so callers don't have to thread it manually.
   */
  feature?: string;
}

export interface CapabilitySpec<I extends Json = Json, O extends Json = Json> {
  id: string;
  version: string;
  inputSchema: {
    required?: string[];
    properties?: Record<
      string,
      {
        type?: "string" | "number" | "boolean" | "object" | "array";
        enum?: Array<string | number | boolean>;
        minLength?: number;
      }
    >;
    additionalProperties?: boolean;
  };
  confirmGate?: "solution-design" | "implementation" | "acceptance" | null;
  outputs?: string[];
  execute: (ctx: CapabilityContext, input: I) => Promise<CapabilityResult<O>>;
}

export interface CapabilityResult<T extends Json = Json> {
  ok: boolean;
  data: T;
  sideEffects: string[];
  reportFragments: string[];
  /**
   * v0.10 — workspace-relative paths of any files the capability
   * wrote or modified. `runCapability` reads this field and includes
   * it in the audit entry as `artifact_paths_written[]` so closeout
   * and provenance tooling can correlate call → file. Optional; a
   * capability that does no file I/O simply omits it.
   */
  artifactPaths?: string[];
}

export class CapabilityError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
