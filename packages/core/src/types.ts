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
   * agent exploration, smoke tests). The capability runner
   * (`runCapabilityWith`) populates this from the input envelope so
   * callers don't have to thread it manually.
   */
  feature?: string;
  /**
   * v2.0 — cross-capability dispatcher injected by the runner. Kernel
   * capabilities use it to call sibling capabilities (e.g. feature.close
   * → cdr.feature.link) without importing the package that implements
   * them. The callback runs against the same spec set the caller was
   * resolved from. Absent when a capability is invoked outside the
   * runner; callers MUST fail loudly rather than skip the call.
   */
  dispatch?: (id: string, input: Record<string, Json>) => Promise<{ result: CapabilityResult }>;
}

/**
 * Validation contract for a single input property, mirroring what
 * `validateInputSchema` in `schema.ts` actually implements: scalar type
 * plus enum/minLength, recursive `items` for arrays and nested
 * `properties`/`required`/`additionalProperties` for objects.
 */
export interface PropertyDef {
  type?: "string" | "number" | "boolean" | "object" | "array";
  enum?: readonly (string | number | boolean)[];
  minLength?: number;
  items?: PropertyDef;
  properties?: Record<string, PropertyDef>;
  required?: readonly string[];
  additionalProperties?: boolean;
}

export interface InputSchema {
  required?: readonly string[];
  properties?: Record<string, PropertyDef>;
  additionalProperties?: boolean;
}

export interface CapabilitySpec<I extends Json = Json, O extends Json = Json> {
  id: string;
  version: string;
  inputSchema: InputSchema;
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
   * wrote or modified. The runner reads this field and includes
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
