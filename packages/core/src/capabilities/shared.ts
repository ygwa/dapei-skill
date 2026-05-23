import { existsSync } from "node:fs";
import { join } from "node:path";
import { CapabilityError } from "../types.ts";
import type { Json } from "../types.ts";
import { read, runSafe } from "../../../runtime-adapters/src/system.ts";

export function requireFields(input: Record<string, Json>, required: string[]): void {
  for (const key of required) {
    if (input[key] === undefined || input[key] === null || input[key] === "") {
      throw new CapabilityError("INVALID_INPUT", `missing field: ${key}`);
    }
  }
}

export function parseReposYamlNames(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*- name:\s*"?([^"\s]+)"?/);
    if (m) out.push(m[1]);
  }
  return out;
}

export function featureRepoNames(featureYaml: string): string[] {
  const out: string[] = [];
  for (const line of featureYaml.split("\n")) {
    const m = line.match(/^\s*- name:\s*"([^"]+)"/);
    if (m) out.push(m[1]);
  }
  return out;
}

export function yamlStageList(workflowYaml: string): string[] {
  const out: string[] = [];
  for (const line of workflowYaml.split("\n")) {
    const m = line.match(/^\s*- id:\s*([a-zA-Z0-9-]+)\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

export function yamlStageRequires(workflowYaml: string, stage: string): string[] {
  const lines = workflowYaml.split("\n");
  let inStage = false;
  for (const line of lines) {
    if (line.match(new RegExp(`^\\s*- id:\\s*${stage}\\s*$`))) {
      inStage = true;
      continue;
    }
    if (inStage && line.match(/^\s*- id:\s*[a-zA-Z0-9-]+\s*$/)) break;
    if (inStage) {
      const m = line.match(/^\s*requires:\s*\[(.*)\]\s*$/);
      if (m) return m[1].split(",").map((x) => x.replace(/["\s]/g, "")).filter(Boolean);
    }
  }
  return [];
}

export function yamlStageOutputs(workflowYaml: string, stage: string): string[] {
  const lines = workflowYaml.split("\n");
  let inStage = false;
  let inOutputs = false;
  const out: string[] = [];
  for (const line of lines) {
    if (line.match(new RegExp(`^\\s*- id:\\s*${stage}\\s*$`))) {
      inStage = true;
      continue;
    }
    if (inStage && line.match(/^\s*- id:\s*[a-zA-Z0-9-]+\s*$/)) break;
    if (!inStage) continue;
    if (line.match(/^\s*outputs:\s*$/)) {
      inOutputs = true;
      continue;
    }
    if (inOutputs) {
      const m = line.match(/^\s*-\s+(.+)\s*$/);
      if (m) out.push(m[1].trim().replace(/\s*\(.*\)\s*$/, ""));
      else if (line.match(/^\s*[a-zA-Z_-]+:\s*$/)) break;
    }
  }
  return out;
}

export function detectRepoLanguage(repoPath: string): string {
  const items: string[] = [];
  if (existsSync(join(repoPath, "package.json"))) items.push("nodejs");
  if (existsSync(join(repoPath, "pom.xml"))) items.push("java-maven");
  if (existsSync(join(repoPath, "build.gradle")) || existsSync(join(repoPath, "build.gradle.kts"))) items.push("java-gradle");
  if (existsSync(join(repoPath, "pyproject.toml")) || existsSync(join(repoPath, "requirements.txt"))) items.push("python");
  if (existsSync(join(repoPath, "go.mod"))) items.push("go");
  if (existsSync(join(repoPath, "Cargo.toml"))) items.push("rust");
  return items.join(" ") || "unknown";
}

export function detectTestCommands(repoPath: string): string[] {
  const out: string[] = [];
  if (existsSync(join(repoPath, "package.json"))) {
    const pkg = read(join(repoPath, "package.json"));
    if (pkg.includes('"test"')) out.push("npm test");
    if (existsSync(join(repoPath, "pnpm-lock.yaml"))) out.push("pnpm test");
    if (existsSync(join(repoPath, "yarn.lock"))) out.push("yarn test");
  }
  if (existsSync(join(repoPath, "pyproject.toml")) || existsSync(join(repoPath, "requirements.txt"))) out.push("pytest");
  if (existsSync(join(repoPath, "go.mod"))) out.push("go test ./...");
  if (existsSync(join(repoPath, "Cargo.toml"))) out.push("cargo test");
  if (existsSync(join(repoPath, "pom.xml"))) out.push("mvn test");
  if (existsSync(join(repoPath, "build.gradle")) || existsSync(join(repoPath, "build.gradle.kts"))) out.push("./gradlew test");
  return [...new Set(out)];
}

export function defaultBranch(repoPath: string): string {
  const remoteHead = runSafe("git", ["-C", repoPath, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], repoPath).replace(/^origin\//, "");
  if (remoteHead) return remoteHead;
  if (runSafe("git", ["-C", repoPath, "show-ref", "--verify", "--quiet", "refs/heads/main"], repoPath) === "") return "main";
  if (runSafe("git", ["-C", repoPath, "show-ref", "--verify", "--quiet", "refs/heads/master"], repoPath) === "") return "master";
  return runSafe("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"], repoPath) || "main";
}
