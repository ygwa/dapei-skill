import type { CapabilitySpec } from "./types.ts";

export class CapabilityRegistry {
  private readonly map = new Map<string, CapabilitySpec<any, any>>();

  register(spec: CapabilitySpec<any, any>): void {
    if (this.map.has(spec.id)) {
      throw new Error(`duplicate capability id: ${spec.id}`);
    }
    this.map.set(spec.id, spec);
  }

  registerMany(specs: Array<CapabilitySpec<any, any>>): void {
    for (const s of specs) this.register(s);
  }

  get(id: string): CapabilitySpec<any, any> | undefined {
    return this.map.get(id);
  }

  all(): Record<string, CapabilitySpec<any, any>> {
    return Object.fromEntries(this.map.entries());
  }
}
