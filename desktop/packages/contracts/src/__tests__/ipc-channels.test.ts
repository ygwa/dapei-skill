// M1-2 IPC channel contract test. Verifies:
//  - REQUEST_SCHEMAS contains the M1-2 demonstrative channels
//  - Schemas reject extra / missing fields
//  - All channel IDs are unique
import test from "node:test";
import assert from "node:assert/strict";
import { IPC_CHANNELS, REQUEST_SCHEMAS } from "../index.ts";

test("IPC_CHANNELS: workspace namespace has the M1-2 demonstrative channel", () => {
  assert.equal(IPC_CHANNELS.workspace.status, "dapei:workspace:status");
  assert.equal(IPC_CHANNELS.workspace.validate, "dapei:workspace:validate");
});

test("IPC_CHANNELS: repos namespace has the M1-2 demonstrative channel", () => {
  assert.equal(IPC_CHANNELS.repos.list, "dapei:repos:list");
  assert.equal(IPC_CHANNELS.repos.profile, "dapei:repos:profile");
});

test("IPC_CHANNELS: feature namespace has the M1-2 demonstrative channel", () => {
  assert.equal(IPC_CHANNELS.feature.list, "dapei:feature:list");
  assert.equal(IPC_CHANNELS.feature.stage, "dapei:feature:stage");
});

test("REQUEST_SCHEMAS: covers the three M1-2 demonstrative channels", () => {
  assert.ok(REQUEST_SCHEMAS[IPC_CHANNELS.workspace.status], "workspace.status schema missing");
  assert.ok(REQUEST_SCHEMAS[IPC_CHANNELS.repos.list], "repos.list schema missing");
  assert.ok(REQUEST_SCHEMAS[IPC_CHANNELS.feature.list], "feature.list schema missing");
});

test("workspace.status: accepts empty object", () => {
  const schema = REQUEST_SCHEMAS[IPC_CHANNELS.workspace.status]!;
  assert.doesNotThrow(() => schema.parse({}));
});

test("workspace.status: rejects extra fields (.strict)", () => {
  const schema = REQUEST_SCHEMAS[IPC_CHANNELS.workspace.status]!;
  assert.throws(() => schema.parse({ extra: "field" }));
});

test("repos.list: accepts empty object", () => {
  const schema = REQUEST_SCHEMAS[IPC_CHANNELS.repos.list]!;
  assert.doesNotThrow(() => schema.parse({}));
});

test("repos.list: rejects extra fields", () => {
  const schema = REQUEST_SCHEMAS[IPC_CHANNELS.repos.list]!;
  assert.throws(() => schema.parse({ repo: "mall-payment" }));
});

test("feature.list: accepts empty object", () => {
  const schema = REQUEST_SCHEMAS[IPC_CHANNELS.feature.list]!;
  assert.doesNotThrow(() => schema.parse({}));
});

test("feature.list: rejects extra fields", () => {
  const schema = REQUEST_SCHEMAS[IPC_CHANNELS.feature.list]!;
  assert.throws(() => schema.parse({ feature: "payment-refactor" }));
});

test("channel name uniqueness across all namespaces", () => {
  const seen = new Set<string>();
  const all: string[] = [];
  for (const ns of Object.values(IPC_CHANNELS)) {
    for (const v of Object.values(ns)) {
      all.push(v);
    }
  }
  for (const c of all) {
    assert.ok(!seen.has(c), `duplicate channel: ${c}`);
    seen.add(c);
  }
  assert.ok(seen.size === all.length);
  assert.ok(all.length >= 15, `expected at least 15 channels, got ${all.length}`);
});
