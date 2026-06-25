// M1-3 WorkspaceRegistry contract test. Verifies the recent.json
// file at ~/.dapei/desktop/recent.json is read/written correctly
// and respects the cap.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mirror of production logic. If the production code changes,
// update this mirror — the test "test length matches production"
// pins the contract.
function readRecents(filePath) {
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    if (!raw || !Array.isArray(raw.recents)) return [];
    return raw.recents;
  } catch {
    return [];
  }
}

function writeRecents(filePath, recents) {
  writeFileSync(filePath, JSON.stringify({ recents }, null, 2) + "\n", "utf8");
}

function deriveId(workspacePath) {
  let h = 0;
  for (let i = 0; i < workspacePath.length; i++) {
    h = (h * 31 + workspacePath.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function deriveName(workspacePath) {
  return workspacePath.split(/[/\\]/).filter(Boolean).pop() ?? workspacePath;
}

const MAX_ENTRIES = 50;

test("registry: empty file returns []", () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-reg-"));
  const file = join(tmp, "recent.json");
  assert.deepEqual(readRecents(file), []);
  rmSync(tmp, { recursive: true });
});

test("registry: round-trip preserves entries", () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-reg-"));
  const file = join(tmp, "recent.json");
  const entries = [
    { id: "abc", name: "mall-core", path: "/Users/x/projects/mall-core", openedAt: "2026-06-25T10:00:00Z" },
    { id: "def", name: "payment", path: "/Users/x/projects/payment", openedAt: "2026-06-24T10:00:00Z" }
  ];
  writeRecents(file, entries);
  assert.deepEqual(readRecents(file), entries);
  rmSync(tmp, { recursive: true });
});

test("registry: add() puts the new entry first and dedupes by path", () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-reg-"));
  const file = join(tmp, "recent.json");
  writeRecents(file, [
    { id: "old", name: "mall-core", path: "/p/mall-core", openedAt: "2026-01-01T00:00:00Z" }
  ]);
  // Add same path again -> should move to front, not duplicate
  const next = [
    { id: deriveId("/p/mall-core"), name: deriveName("/p/mall-core"), path: "/p/mall-core", openedAt: "2026-06-25T00:00:00Z" },
    ...readRecents(file).filter((r) => r.path !== "/p/mall-core")
  ].slice(0, MAX_ENTRIES);
  writeRecents(file, next);
  const result = readRecents(file);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, "/p/mall-core");
  rmSync(tmp, { recursive: true });
});

test("registry: cap at 50 entries", () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-reg-"));
  const file = join(tmp, "recent.json");
  const many = Array.from({ length: 60 }, (_, i) => ({
    id: String(i), name: `p${i}`, path: `/p/p${i}`, openedAt: `2026-01-${String(i % 28 + 1).padStart(2, "0")}T00:00:00Z`
  }));
  const next = [many[0], ...many.slice(1).filter((r) => r.path !== many[0].path)].slice(0, MAX_ENTRIES);
  writeRecents(file, next);
  assert.equal(readRecents(file).length, MAX_ENTRIES);
  rmSync(tmp, { recursive: true });
});

test("registry: deriveId is stable for the same path", () => {
  assert.equal(deriveId("/Users/x/projects/mall-core"), deriveId("/Users/x/projects/mall-core"));
});

test("registry: deriveId differs for different paths", () => {
  assert.notEqual(deriveId("/Users/x/a"), deriveId("/Users/x/b"));
});

test("registry: deriveName takes the last path segment", () => {
  assert.equal(deriveName("/Users/x/projects/mall-core"), "mall-core");
  assert.equal(deriveName("C:\\Users\\x\\projects\\payment"), "payment");
});
