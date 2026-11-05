#!/usr/bin/env node
// Regenerate src/panel/price-catalog.json from the models.dev catalog that PI-Desktop ships.
//
// Usage: node scripts/sync-prices.mjs [path/to/models.dev/api.json]
//
// PI-Desktop prices its own turns from this catalog (USD per 1M tokens), so the panel's cost
// estimate starts from the same numbers. Only first-party vendors are extracted: the same model id
// is listed by many resellers at different prices, and the first-party price is the reference.
// Tiered / long-context pricing is intentionally dropped; the base rate is used.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SOURCE = "/Applications/PI-Desktop.app/Contents/Resources/models.dev/api.json";
const VENDORS = ["deepseek", "anthropic", "google", "openai", "xai", "mistral", "moonshotai", "zai"];
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "panel", "price-catalog.json");

const source = process.argv[2] || DEFAULT_SOURCE;
let api;
try {
  api = JSON.parse(fs.readFileSync(source, "utf8"));
} catch (e) {
  console.error(`cannot read ${source}: ${e.message}`);
  process.exit(1);
}

const number = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

const vendors = {};
let count = 0;
for (const vendor of VENDORS) {
  const models = api[vendor]?.models;
  if (!models) {
    console.error(`vendor missing in source: ${vendor}`);
    process.exit(1);
  }
  vendors[vendor] = {};
  for (const [id, model] of Object.entries(models).sort(([a], [b]) => a.localeCompare(b))) {
    const input = number(model?.cost?.input);
    const output = number(model?.cost?.output);
    if (input === null || output === null) continue;
    vendors[vendor][id] = { input, cached: number(model.cost.cache_read), output };
    count += 1;
  }
}

const catalog = {
  currency: "USD",
  unit: "per 1M tokens",
  source: "PI-Desktop models.dev catalog",
  generatedAt: new Date().toISOString().slice(0, 10),
  vendors,
};
fs.writeFileSync(OUT, `${JSON.stringify(catalog)}\n`);
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${count} models from ${VENDORS.length} vendors`);
