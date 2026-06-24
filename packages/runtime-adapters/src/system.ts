import { execFileSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, readdirSync, statSync, cpSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomBytes } from "node:crypto";

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

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export function runWithResult(cmd: string, args: string[], cwd: string): RunResult {
  try {
    const stdout = execFileSync(cmd, args, { cwd, encoding: "utf8" });
    return { ok: true, stdout: stdout.trim(), stderr: "", code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number | null };
    return {
      ok: false,
      stdout: typeof e.stdout === "string" ? e.stdout : e.stdout ? e.stdout.toString() : "",
      stderr: typeof e.stderr === "string" ? e.stderr : e.stderr ? e.stderr.toString() : "",
      code: typeof e.status === "number" ? e.status : null
    };
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

export function atomicWrite(absPath: string, content: string): void {
  ensureDir(dirname(absPath));
  const tmpPath = `${absPath}.tmp.${randomBytes(8).toString("hex")}`;
  const fd = openSync(tmpPath, "w");
  try {
    writeFileSync(fd, content, "utf8");
  } finally {
    closeSync(fd);
  }
  // renameSync atomically moves the temp file to the target. On POSIX
  // this is a single inode swap; readers always see either the old
  // content or the new content, never a partial write. If rename
  // throws, the temp file is left behind for the operator to clean
  // up — the target file is untouched.
  renameSync(tmpPath, absPath);
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
  const resolvedRoot = resolve(rootDir);
  return {
    rootDir: resolvedRoot,
    workspaceName: basename(resolvedRoot),
    dapeiDir: resolve(resolvedRoot, ".dapei"),
    reposDir: resolve(resolvedRoot, "repos"),
    featuresDir: resolve(resolvedRoot, "features"),
    docsDir: resolve(resolvedRoot, "docs"),
    runtimeDir: resolve(resolvedRoot, "runtime")
  };
}

/**
 * Path-traversal guard. Resolves `rel` against `root` (which must
 * itself be absolute) and asserts the resolved path is still inside
 * `root`. Throws on:
 *   - `rel` is an absolute path (caller must use relative inputs)
 *   - `rel` contains `..` segments that escape root after resolution
 *   - `rel` resolves to root itself (returning rootDir would be ambiguous)
 *
 * The function does NOT consult the filesystem, so it does not protect
 * against pre-existing symlinks that point outside root. Callers that
 * need that guarantee should additionally `realpath` and re-check.
 */
export function safeJoinWithin(root: string, rel: string): string {
  if (!isAbsolute(root)) {
    throw new Error(`safeJoinWithin: root must be absolute, got ${root}`);
  }
  if (isAbsolute(rel)) {
    throw new Error(`safeJoinWithin: rel must be relative, got ${rel}`);
  }
  const resolvedRoot = resolve(root);
  const joined = resolve(resolvedRoot, rel);
  const relToRoot = relative(resolvedRoot, joined);
  if (relToRoot.startsWith("..") || isAbsolute(relToRoot)) {
    throw new Error(`safeJoinWithin: path traversal blocked: ${rel} escapes ${root}`);
  }
  return joined;
}
