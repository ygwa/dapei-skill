import { load, dump } from "js-yaml";
import { CapabilityError } from "./types.ts";

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

export function parseYamlDocument(content: string): Record<string, YamlValue> {
  if (!content || !content.trim()) {
    throw new CapabilityError("INVALID_YAML", "empty yaml document");
  }
  try {
    const doc = load(content);
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      throw new CapabilityError("INVALID_YAML", "yaml root must be an object");
    }
    return doc as Record<string, YamlValue>;
  } catch (err: any) {
    throw new CapabilityError("INVALID_YAML", err?.message || String(err));
  }
}

export function stringifyYamlValue(value: YamlValue, indent = 0): string {
  try {
    return dump(value, { indent: 2, skipInvalid: true }).trimEnd();
  } catch (err: any) {
    throw new CapabilityError("INVALID_YAML", err?.message || String(err));
  }
}

export function stringifyYamlDocument(doc: Record<string, YamlValue>): string {
  try {
    return dump(doc, { indent: 2, skipInvalid: true });
  } catch (err: any) {
    throw new CapabilityError("INVALID_YAML", err?.message || String(err));
  }
}
