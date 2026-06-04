// YAML transcript loader.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import type { Transcript } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "..", "fixtures", "conversations");

export function listTranscripts(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, ""));
}

export function loadTranscript(name: string): Transcript {
  const p = join(FIXTURE_DIR, `${name}.yaml`);
  if (!existsSync(p)) throw new Error(`transcript not found: ${p}`);
  const parsed = yaml.load(readFileSync(p, "utf8")) as Transcript;
  if (!parsed.name) parsed.name = name;
  return parsed;
}
