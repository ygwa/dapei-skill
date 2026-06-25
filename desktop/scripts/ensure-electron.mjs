#!/usr/bin/env node
/**
 * 校验 Electron 二进制是否完整；不完整时用系统 unzip 重新解压缓存包。
 * 修复 extract-zip 在部分 macOS 环境下漏解压 Frameworks 的问题。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(__dirname, "..");
const electronPkg = join(desktopRoot, "apps/electron/node_modules/electron");
const frameworkBinary = join(
  electronPkg,
  "dist/Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
);

function electronReady() {
  return existsSync(frameworkBinary);
}

function electronVersion() {
  return JSON.parse(readFileSync(join(electronPkg, "package.json"), "utf8")).version;
}

function findElectronZip() {
  const cacheRoot = join(process.env.HOME ?? "", "Library/Caches/electron");
  if (!existsSync(cacheRoot)) return null;

  const version = electronVersion();
  const targetName = `electron-v${version}-darwin-arm64.zip`;

  for (const hashDir of readdirSync(cacheRoot)) {
    const zipPath = join(cacheRoot, hashDir, targetName);
    if (existsSync(zipPath)) return zipPath;
  }
  return null;
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function checksumMatches(zipPath) {
  const checksumsPath = join(electronPkg, "checksums.json");
  if (!existsSync(checksumsPath)) return true;

  const checksums = JSON.parse(readFileSync(checksumsPath, "utf8"));
  const key = `electron-v${electronVersion()}-darwin-arm64.zip`;
  const expected = checksums[key];
  if (!expected) return true;

  return (await sha256(zipPath)) === expected;
}

function extractWithUnzip(zipPath, destDir) {
  rmSync(destDir, { recursive: true, force: true });
  execFileSync("unzip", ["-q", zipPath, "-d", destDir], { stdio: "inherit" });
  writeFileSync(join(electronPkg, "dist/version"), `v${electronVersion()}`);
  writeFileSync(join(electronPkg, "path.txt"), "Electron.app/Contents/MacOS/Electron");
}

async function main() {
  if (!existsSync(electronPkg)) {
    console.error("[ensure-electron] electron package not found — run pnpm install in desktop/");
    process.exit(1);
  }

  if (electronReady()) {
    console.log("[ensure-electron] Electron binary OK");
    return;
  }

  console.warn("[ensure-electron] incomplete Electron install detected — repairing…");

  let zipPath = findElectronZip();
  if (!zipPath) {
    console.log("[ensure-electron] running electron install.js…");
    execFileSync("node", ["install.js"], { cwd: electronPkg, stdio: "inherit" });
    zipPath = findElectronZip();
  }

  if (!zipPath) {
    console.error("[ensure-electron] no cached zip found after install.js");
    process.exit(1);
  }

  if (!(await checksumMatches(zipPath))) {
    console.warn("[ensure-electron] checksum mismatch — deleting cache and re-downloading");
    rmSync(dirname(zipPath), { recursive: true, force: true });
    execFileSync("node", ["install.js"], { cwd: electronPkg, stdio: "inherit" });
    zipPath = findElectronZip();
    if (!zipPath) process.exit(1);
  }

  if (!electronReady()) {
    console.log("[ensure-electron] extracting with system unzip:", zipPath);
    extractWithUnzip(zipPath, join(electronPkg, "dist"));
  }

  if (!electronReady()) {
    console.error("[ensure-electron] repair failed — Frameworks still missing");
    process.exit(1);
  }

  console.log("[ensure-electron] repair complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
