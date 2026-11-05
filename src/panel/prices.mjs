// Per-model token prices for the panel's cost estimate.
//
// Hindsight's llm-requests API reports tokens but never a price, so the user supplies unit prices
// (or fills them from the bundled catalog). They live in the plugin's own file next to
// coding-agent.json — never inside it, which belongs to the upstream extension.
// Every price is USD per 1,000,000 tokens; there is no currency conversion anywhere in the plugin.

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { configPath } from "./config.mjs";
import { PanelError } from "./errors.mjs";

const CURRENCY = "USD";
const FIELDS = ["input", "cached", "output"];
const MAX_MODELS = 200;
const MAX_NAME = 128;
const MAX_PRICE = 1_000_000;

export function pricesPath() {
  return process.env.HINDSIGHT_PRICES || path.join(path.dirname(configPath()), "pi-desktop-prices.json");
}

function emptyPrices() {
  return { currency: CURRENCY, models: {} };
}

function priceNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 && n <= MAX_PRICE ? n : undefined;
}

/** Keep only well-formed entries so a hand-edited file can never break the panel. */
function sanitizeModels(models) {
  const out = {};
  if (!models || typeof models !== "object") return out;
  for (const [name, entry] of Object.entries(models).slice(0, MAX_MODELS)) {
    if (!name || name.length > MAX_NAME || !entry || typeof entry !== "object") continue;
    const price = {};
    for (const field of FIELDS) {
      const n = priceNumber(entry[field]);
      price[field] = typeof n === "number" ? n : null;
    }
    if (FIELDS.some((field) => price[field] !== null)) out[name] = price;
  }
  return out;
}

/** `hindsight.prices.read` */
export function readPrices() {
  let text;
  try {
    text = fs.readFileSync(pricesPath(), "utf8");
  } catch (e) {
    if (e?.code === "ENOENT") return { prices: emptyPrices() };
    throw new PanelError("INTERNAL", `无法读取单价文件：${e?.code || e?.message}`);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    // A corrupt file must not lock the user out of re-saving prices.
    return { prices: emptyPrices(), warning: "单价文件无法解析，已忽略；保存后会被覆盖。" };
  }
  if (raw && typeof raw === "object" && raw.currency && raw.currency !== CURRENCY) {
    // Prices in another currency cannot be reused without a rate, and the plugin keeps none.
    return {
      prices: emptyPrices(),
      warning: `单价文件使用 ${String(raw.currency).slice(0, 8)}，插件现在统一使用 USD，已忽略旧单价；请重新填写或从价格目录填入，保存后会覆盖。`,
    };
  }
  return { prices: { currency: CURRENCY, models: sanitizeModels(raw?.models) } };
}

/** `hindsight.prices.save` — validates strictly (unlike read), then writes atomically. */
export function savePrices(input) {
  if (!input || typeof input !== "object") {
    throw new PanelError("INVALID_CONFIG", "单价数据格式无效");
  }
  const models = input.models && typeof input.models === "object" ? input.models : {};
  const entries = Object.entries(models);
  if (entries.length > MAX_MODELS) {
    throw new PanelError("INVALID_CONFIG", `最多保存 ${MAX_MODELS} 个模型的单价`);
  }
  const fields = {};
  const clean = { currency: CURRENCY, models: {} };
  for (const [name, entry] of entries) {
    if (!name || name.length > MAX_NAME) {
      throw new PanelError("INVALID_CONFIG", "模型名为空或过长");
    }
    const price = {};
    for (const field of FIELDS) {
      const n = priceNumber(entry?.[field]);
      if (n === undefined) fields[`${name}.${field}`] = `单价必须是 0 到 ${MAX_PRICE} 之间的数字`;
      price[field] = n === undefined ? null : n;
    }
    if (FIELDS.some((field) => price[field] !== null)) clean.models[name] = price;
  }
  if (Object.keys(fields).length) {
    throw new PanelError("INVALID_CONFIG", "有单价不是有效数字", { fields });
  }

  const file = pricesPath();
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(clean, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, file);
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw new PanelError("INTERNAL", `无法写入单价文件：${e?.code || e?.message}`);
  }
  return { prices: clean };
}

/* ------------------------------------------------------------------ catalog */

// Model-id prefix -> first-party vendor in the catalog. The same id is sold by many resellers at
// different prices, so a model is only matched when its vendor is unambiguous.
const VENDOR_PREFIXES = [
  [/^deepseek/i, "deepseek"],
  [/^claude/i, "anthropic"],
  [/^(gemini|gemma)/i, "google"],
  [/^(gpt|o\d|codex|chatgpt)/i, "openai"],
  [/^grok/i, "xai"],
  [/^(mistral|codestral|ministral|devstral|magistral|pixtral)/i, "mistral"],
  [/^kimi/i, "moonshotai"],
  [/^glm/i, "zai"],
];

let catalogCache;

function loadCatalog() {
  if (catalogCache === undefined) {
    try {
      const parsed = JSON.parse(fs.readFileSync(new URL("./price-catalog.json", import.meta.url), "utf8"));
      catalogCache = parsed?.vendors && parsed.currency === CURRENCY ? parsed : null;
    } catch {
      catalogCache = null;
    }
  }
  return catalogCache;
}

function lookup(catalog, model) {
  const vendor = VENDOR_PREFIXES.find(([pattern]) => pattern.test(model))?.[1];
  if (vendor) {
    const hit = catalog.vendors[vendor]?.[model];
    return hit ? { vendor, hit } : null;
  }
  const hits = Object.entries(catalog.vendors).filter(([, models]) => models[model]);
  return hits.length === 1 ? { vendor: hits[0][0], hit: hits[0][1][model] } : null;
}

/** `hindsight.prices.suggest` — catalog prices for the given model ids; unknown ones are listed. */
export function suggestPrices(names) {
  const catalog = loadCatalog();
  if (!catalog) {
    throw new PanelError("INTERNAL", "插件内置的价格目录不可用", { hint: "重新安装插件，或运行 scripts/sync-prices.mjs 重新生成。" });
  }
  const list = Array.isArray(names) ? [...new Set(names.filter((n) => typeof n === "string" && n))].slice(0, MAX_MODELS) : [];
  const suggestions = {};
  const unmatched = [];
  for (const name of list) {
    const found = name.length <= MAX_NAME ? lookup(catalog, name) : null;
    if (!found) {
      unmatched.push(name);
      continue;
    }
    const cached = priceNumber(found.hit.cached);
    suggestions[name] = {
      input: priceNumber(found.hit.input) ?? null,
      cached: typeof cached === "number" ? cached : null,
      output: priceNumber(found.hit.output) ?? null,
      vendor: found.vendor,
    };
  }
  return { suggestions, unmatched, catalogDate: catalog.generatedAt || null };
}
