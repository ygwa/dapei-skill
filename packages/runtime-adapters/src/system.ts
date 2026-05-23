import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, cpSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function run(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf8" }).trim();
}

export function runSafe(cmd: string, args: string[], cwd: string): string {
  try {
    return run(cmd, args, cwd);
  } catch {
    return "";
  }
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function read(path: string): string {
  return readFileSync(path, "utf8");
}

export function write(path: string, content: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf8");
}

export function copyIfMissing(src: string, target: string): void {
  if (!existsSync(src) || existsSync(target)) return;
  ensureDir(dirname(target));
  cpSync(src, target);
}

export function isEffectivelyEmpty(dir: string): boolean {
  if (!existsSync(dir)) return true;
  const list = readdirSync(dir).filter((x: string) => ![".DS_Store", ".gitkeep"].includes(x));
  return list.length === 0;
}

export function isConformingWorkspace(dir: string): boolean {
  if (existsSync(join(dir, ".dapei"))) return true;
  let count = 0;
  if (existsSync(join(dir, "repos"))) count++;
  if (existsSync(join(dir, "docs"))) count++;
  if (existsSync(join(dir, "features"))) count++;
  return count >= 2;
}

export function listFilesRecursively(base: string, ext: string[], max = 50): string[] {
  const out: string[] = [];
  const skip = [".git", "node_modules", "dist", "build", "vendor", "__pycache__", "target", ".next"];
  function walk(dir: string) {
    if (out.length >= max) return;
    for (const name of readdirSync(dir)) {
      if (skip.includes(name)) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (ext.some((e) => p.endsWith(e))) out.push(p);
      if (out.length >= max) return;
    }
  }
  if (existsSync(base)) walk(base);
  return out;
}

export function workspacePaths(rootDir: string) {
  return {
    rootDir: resolve(rootDir),
    dapeiDir: resolve(rootDir, ".dapei"),
    reposDir: resolve(rootDir, "repos"),
    featuresDir: resolve(rootDir, "features"),
    docsDir: resolve(rootDir, "docs"),
    runtimeDir: resolve(rootDir, "runtime")
  };
}
