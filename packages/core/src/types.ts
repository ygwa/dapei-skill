export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface CapabilityContext {
  rootDir: string;
  now: Date;
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
}

export class CapabilityError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
