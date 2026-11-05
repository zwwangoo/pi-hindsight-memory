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

test("bank.usage returns aggregated stats through the panel envelope", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    bank_id: "test-bank", period: "7d", trunc: "day", start: "2026-11-01T00:00:00Z", buckets: [],
  }), { headers: { "content-type": "application/json" } });
  const result = await plugin.onPanelInvoke("hindsight.bank.usage", { period: "7d" });
  assert.equal(result.ok, true);
  assert.equal(result.totals.requests, 0);
  const invalid = await plugin.onPanelInvoke("hindsight.bank.usage", { period: "forever" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "INVALID_CONFIG");
});

test("model usage and price channels are routed through the panel envelope", async () => {
  process.env.HINDSIGHT_PRICES = path.join(path.dirname(file), "prices.json");
  globalThis.fetch = async () => new Response(JSON.stringify({ total: 1, items: [{ id: "x1", started_at: new Date().toISOString(), model: "m", input_tokens: 1, output_tokens: 1 }] }), { headers: { "content-type": "application/json" } });
  const models = await plugin.onPanelInvoke("hindsight.bank.usageModels", { period: "7d", refresh: true });
  assert.equal(models.ok, true);
  assert.equal(models.models[0].model, "m");
  const saved = await plugin.onPanelInvoke("hindsight.prices.save", { prices: { models: { m: { input: 1, output: 2 } } } });
  assert.equal(saved.ok, true);
  assert.equal((await plugin.onPanelInvoke("hindsight.prices.read")).prices.models.m.output, 2);
  const sug = await plugin.onPanelInvoke("hindsight.prices.suggest", { models: ["deepseek-flash"] });
  assert.equal(sug.ok, true);
  assert.equal(sug.suggestions["deepseek-flash"].input, 0.15);
  const bad = await plugin.onPanelInvoke("hindsight.prices.save", { prices: { models: { m: { input: "x" } } } });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, "INVALID_CONFIG");
});
