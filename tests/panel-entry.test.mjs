import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const plugin = require("../main.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hindsight-entry-"));
const file = path.join(dir, "coding-agent.json");
fs.writeFileSync(file, JSON.stringify({ apiUrl: "https://hindsight.test:1213", bankId: "test-bank", autoInject: "pages" }));
process.env.HINDSIGHT_CONFIG = file;

test("exports the plugin lifecycle shape", async () => {
  assert.equal(typeof plugin.onLoad, "function");
  assert.equal(typeof plugin.onUnload, "function");
  assert.equal(typeof plugin.onPanelInvoke, "function");
  // `pi` is host-injected; without it the lifecycle hooks must be harmless no-ops.
  await plugin.onLoad();
  await plugin.onUnload();
});

test("onLoad registers the open-panel command and onUnload removes it", async () => {
  const calls = [];
  const opened = [];
  globalThis.pi = {
    commands: {
      register: async (c) => calls.push(["register", c.id, c.run]),
      unregister: async (id) => calls.push(["unregister", id]),
    },
    ui: { openPanel: async (o) => opened.push(o) },
  };
  try {
    await plugin.onLoad();
    await calls[0][2](); // the registered command opens the panel
    await plugin.onUnload();
  } finally {
    delete globalThis.pi;
  }
  assert.deepEqual(calls.map((c) => c.slice(0, 2)), [
    ["register", "hindsight-memory.open"],
    ["unregister", "hindsight-memory.open"],
  ]);
  assert.deepEqual(opened, [{ title: "Hindsight Memory" }]);
});

test("unknown channels are rejected, not silently ignored", async () => {
  const result = await plugin.onPanelInvoke("hindsight.nope", {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UNSUPPORTED");
});

test("config.read crosses the CJS -> ESM bridge and returns the full payload", async () => {
  const result = await plugin.onPanelInvoke("hindsight.config.read", {});
  assert.equal(result.ok, true);
  assert.equal(result.path, file);
  assert.equal(result.values.autoInject, "pages");
  assert.ok(Array.isArray(result.fields) && result.fields.length > 10);
  assert.ok(result.groups.some((g) => g.id === "connection"));
});

test("config.save returns field-level errors in the channel envelope", async () => {
  const bad = await plugin.onPanelInvoke("hindsight.config.save", { patch: { autoInject: "nope" } });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, "INVALID_CONFIG");
  assert.ok(bad.error.fields.autoInject);

  const good = await plugin.onPanelInvoke("hindsight.config.save", { patch: { autoInject: "recall" } });
  assert.equal(good.ok, true);
  assert.equal(good.values.autoInject, "recall");
  assert.ok(good.backupPath && fs.existsSync(good.backupPath));
});

test("a handler failure is turned into an envelope instead of rejecting", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
  };
  const result = await plugin.onPanelInvoke("hindsight.bank.status", {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "OFFLINE");
  assert.equal(typeof result.error.hint, "string");
});
