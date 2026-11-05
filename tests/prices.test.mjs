import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hindsight-prices-"));
process.env.HINDSIGHT_PRICES = path.join(dir, "prices.json");
const { readPrices, savePrices, suggestPrices } = await import("../src/panel/prices.mjs");

test.beforeEach(() => fs.rmSync(process.env.HINDSIGHT_PRICES, { force: true }));

test("no file yet reads as empty USD prices", () => {
  assert.deepEqual(readPrices(), { prices: { currency: "USD", models: {} } });
});

test("prices round-trip in USD; blank fields stay null and all-blank models are dropped", () => {
  const saved = savePrices({
    models: {
      "deepseek-flash": { input: "1", cached: "", output: 2 },
      unused: { input: "", cached: null, output: "" },
    },
  });
  assert.deepEqual(saved.prices, { currency: "USD", models: { "deepseek-flash": { input: 1, cached: null, output: 2 } } });
  assert.deepEqual(readPrices().prices, saved.prices);
  assert.equal(JSON.parse(fs.readFileSync(process.env.HINDSIGHT_PRICES, "utf8")).currency, "USD");
  assert.deepEqual(fs.readdirSync(dir), ["prices.json"], "no temp file is left behind");
});

test("a caller-supplied currency cannot change what is stored", () => {
  const saved = savePrices({ currency: "CNY", models: { m: { input: 1, output: 2 } } });
  assert.equal(saved.prices.currency, "USD");
});

test("save rejects non-numeric or negative prices with field errors and writes nothing", () => {
  assert.throws(() => savePrices(null), (e) => e.code === "INVALID_CONFIG");
  assert.throws(
    () => savePrices({ models: { m: { input: "abc", cached: -1, output: 1 } } }),
    (e) => e.code === "INVALID_CONFIG" && "m.input" in e.fields && "m.cached" in e.fields && !("m.output" in e.fields),
  );
  assert.equal(fs.existsSync(process.env.HINDSIGHT_PRICES), false);
});

test("a legacy non-USD file is ignored with a warning instead of being reinterpreted", () => {
  fs.writeFileSync(process.env.HINDSIGHT_PRICES, JSON.stringify({ currency: "CNY", models: { m: { input: 1, output: 4 } } }));
  const result = readPrices();
  assert.deepEqual(result.prices, { currency: "USD", models: {} });
  assert.match(result.warning, /CNY[\s\S]*USD/);
  savePrices({ models: { m: { input: 1, output: 4 } } });
  assert.equal(readPrices().warning, undefined, "saving replaces the legacy file");
});

test("a corrupt or hand-edited file never breaks the panel", () => {
  fs.writeFileSync(process.env.HINDSIGHT_PRICES, "{not json");
  const broken = readPrices();
  assert.deepEqual(broken.prices, { currency: "USD", models: {} });
  assert.match(broken.warning, /无法解析/);
  fs.writeFileSync(process.env.HINDSIGHT_PRICES, JSON.stringify({ models: { ok: { input: 1 }, bad: { input: "x" }, nope: 5 } }));
  assert.deepEqual(readPrices().prices, { currency: "USD", models: { ok: { input: 1, cached: null, output: null } } });
});

test("catalog suggestions match first-party prices and match PI-Desktop's own rates", () => {
  const { suggestions, unmatched } = suggestPrices(["deepseek-flash", "claude-sonnet-5-5", "gemini-3.8-flash", "qwen3.5:9b-mlx", "Auto", "deepseek-flash"]);
  assert.deepEqual(suggestions["deepseek-flash"], { input: 0.15, cached: 0.003, output: 0.6, vendor: "deepseek" });
  assert.deepEqual(suggestions["claude-sonnet-5-5"], { input: 2, cached: 0.1, output: 10, vendor: "anthropic" });
  assert.equal(suggestions["gemini-3.8-flash"].vendor, "google");
  assert.deepEqual(unmatched, ["qwen3.5:9b-mlx", "Auto"], "unknown ids are reported, duplicates collapsed");
});

test("catalog never guesses: wrong vendor prefix or junk input yields no match", () => {
  assert.deepEqual(suggestPrices(["deepseek-not-real", "x".repeat(300), 5, null]).suggestions, {});
  assert.deepEqual(suggestPrices("nope"), { suggestions: {}, unmatched: [], catalogDate: suggestPrices([]).catalogDate });
});
