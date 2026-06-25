// M2-3 PluginHost contract test. Verifies:
//  - Zod allowlist enforcement
//  - L1 rejects pipelineSteps
//  - duplicate contribution ids are rejected
//  - init() registers valid plugins
//  - the real init flow loads the sample plugin from a
//    temp dir
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPluginHost } from "../../../../../../packages/plugins/src/host/plugin-host.ts";

function writeManifest(dir: string, manifest: object): void {
  writeFileSync(join(dir, "dapei-desktop-plugin.json"), JSON.stringify(manifest));
}

test("createPluginHost: init() with no plugins returns empty list", async () => {
  const host = createPluginHost();
  await host.init();
  assert.deepEqual(host.list(), []);
  assert.deepEqual(host.registry.sidebar, []);
});

test("createPluginHost: rejects invalid manifest (bad id)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-p-"));
  const pluginDir = join(tmp, ".dapei", "plugins", "bad"); mkdirSync(join(tmp, ".dapei", "plugins"), { recursive: true });
  mkdirSync(pluginDir);
  writeManifest(pluginDir, {
    id: "Bad ID With Spaces",  // invalid (regex rejects whitespace)
    version: "0.1.0",
    contributes: { sidebar: [] }
  });
  const host = createPluginHost();
  await host.init(tmp);
  assert.equal(host.list().length, 0, "should reject invalid id");
  rmSync(tmp, { recursive: true, force: true });
});

test("createPluginHost: rejects pipelineSteps (L3-only at L1)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-p-"));
  const pluginDir = join(tmp, ".dapei", "plugins", "l3-attempt"); mkdirSync(join(tmp, ".dapei", "plugins"), { recursive: true });
  mkdirSync(pluginDir);
  writeManifest(pluginDir, {
    id: "l3-attempt",
    version: "0.1.0",
    contributes: {
      pipelineSteps: [
        { id: "custom", label: "Custom", phase: "discover", module: "./step.js" }
      ]
    }
  });
  const host = createPluginHost();
  await host.init(tmp);
  assert.equal(host.list().length, 1, "plugin still loads but pipelineSteps is dropped");
  // Verify pipelineSteps was emptied by validation
  const plugin = host.list()[0];
  if (plugin) {
    assert.equal(plugin.manifest.contributes.pipelineSteps?.length ?? 0, 0);
  }
  rmSync(tmp, { recursive: true, force: true });
});

test("createPluginHost: rejects duplicate contribution ids across plugins", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-p-"));
  const p1 = join(tmp, ".dapei", "plugins", "p1");
  const p2 = join(tmp, ".dapei", "plugins", "p2");
  mkdirSync(join(tmp, ".dapei", "plugins"), { recursive: true });
  mkdirSync(p1);
  mkdirSync(p2);
  writeManifest(p1, {
    id: "p1",
    version: "0.1.0",
    contributes: { sidebar: [{ id: "shared", label: "P1", route: "/p1" }] }
  });
  writeManifest(p2, {
    id: "p2",
    version: "0.1.0",
    contributes: { sidebar: [{ id: "shared", label: "P2", route: "/p2" }] }
  });
  const host = createPluginHost();
  await host.init(tmp);
  // p2 should be skipped because of duplicate contribution id
  assert.equal(host.list().length, 1);
  assert.equal(host.list()[0]?.manifest.id, "p1");
  rmSync(tmp, { recursive: true, force: true });
});

test("createPluginHost: accepts the shipped sample plugin shape", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-p-"));
  const pluginDir = join(tmp, ".dapei", "plugins", "sample.dapei-welcome"); mkdirSync(join(tmp, ".dapei", "plugins"), { recursive: true });
  mkdirSync(pluginDir);
  writeManifest(pluginDir, {
    id: "sample.dapei-welcome",
    version: "0.1.0",
    name: "Dapei Welcome",
    contributes: {
      sidebar: [{ id: "sample.welcome", label: "Sample 插件", route: "/sample/welcome" }],
      routes: [{ id: "sample.welcome", path: "/sample/welcome", label: "Sample 插件" }]
    }
  });
  const host = createPluginHost();
  await host.init(tmp);
  assert.equal(host.list().length, 1);
  assert.equal(host.registry.sidebar.length, 1);
  assert.equal(host.registry.sidebar[0]?.label, "Sample 插件");
  assert.equal(host.registry.routes.length, 1);
  rmSync(tmp, { recursive: true, force: true });
});

test("createPluginHost: enable/disable toggles presence in list", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dapei-p-"));
  const pluginDir = join(tmp, ".dapei", "plugins", "toggle"); mkdirSync(join(tmp, ".dapei", "plugins"), { recursive: true });
  mkdirSync(pluginDir);
  writeManifest(pluginDir, {
    id: "toggle",
    version: "0.1.0",
    contributes: { sidebar: [{ id: "t1", label: "Toggle", route: "/t" }] }
  });
  const host = createPluginHost();
  await host.init(tmp);
  assert.equal(host.list().length, 1);
  assert.equal(host.list()[0]?.enabled, true);
  await host.disable("toggle");
  assert.equal(host.list()[0]?.enabled, false);
  await host.enable("toggle");
  assert.equal(host.list()[0]?.enabled, true);
  rmSync(tmp, { recursive: true, force: true });
});
