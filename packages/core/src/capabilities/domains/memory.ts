import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CapabilitySpec } from "../../types.ts";
import { CapabilityError } from "../../types.ts";
import { ensureDir, read, workspacePaths, write } from "../../../../runtime-adapters/src/system.ts";
import { requireFields } from "../shared.ts";

export type AnyCap = CapabilitySpec<any, any>;

const TYPE_TO_FILE: Record<string, string> = {
  decision: "decision-log.md",
  risk: "risk.md",
  question: "open-questions.md",
  note: "notes.md"
};

export const memoryAppend: AnyCap = {
  id: "memory.append",
  version: "1.0.0",
  inputSchema: {
    required: ["feature", "type", "content"],
    properties: {
      feature: { type: "string", minLength: 1 },
      type: { type: "string", enum: ["decision", "risk", "question", "note"] },
      content: { type: "string", minLength: 1 }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    requireFields(input, ["feature", "type", "content"]);
    const feature = String(input.feature);
    const type = String(input.type);
    const content = String(input.content);
    const p = workspacePaths(ctx.rootDir);
    const featureDir = join(p.featuresDir, feature);
    if (!existsSync(featureDir)) throw new CapabilityError("FEATURE_MISSING", `feature directory not found: ${feature}`);

    const fileName = TYPE_TO_FILE[type] || `${type}.md`;
    const memoryDir = join(featureDir, "memory");
    const filePath = join(memoryDir, fileName);
    ensureDir(memoryDir);

    const timestamp = new Date().toISOString();
    const entry = content.includes("##") ? content : `## ${type} ${timestamp}\n\n${content}`;
    const toWrite = existsSync(filePath) ? read(filePath) + "\n" + entry : entry;
    write(filePath, toWrite);

    return { ok: true, data: { feature, type, file: fileName }, sideEffects: ["memory file updated"], reportFragments: [`memory ${type} appended`] };
  }
};