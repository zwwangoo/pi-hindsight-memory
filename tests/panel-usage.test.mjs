import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// The server cuts day buckets at its local midnight; pin the zone so date assertions are stable.
process.env.TZ = "Asia/Shanghai";

const source = fs.readFileSync(new URL("../views/panel.js", import.meta.url), "utf8");
function panel(invoke = async () => ({ ok: true })) {
  const context = vm.createContext({
    document: { readyState: "loading", addEventListener() {}, querySelector() { return null; } },
    window: { pluginBridge: { invoke } }, console,
  });
  vm.runInContext(
    `${source}\nthis.__panel = { state, usageMarkup, loadUsage, fmtBucket, operationsPill, usageHistoryMarkup,
      estimateCost, fmtMoney, modelsBodyMarkup, priceDraftToPayload, priceEditorMarkup, renderStats, fillPrices, loadModels,
      documentsMarkup, diagStatusMarkup, usageDataMarkup };`,
    context,
  );
  return (code) => vm.runInContext(`__panel.${code}`, context);
}

const totals = (extra = {}) => ({
  requests: 9, statuses: { success: 8, error: 1 },
  tokens: { total: 3500, input: 3000, output: 500, cached: 1000, thoughts: null }, ...extra,
});

test("usage markup shows provider totals, unknown metrics and a retention warning", () => {
  const run = panel();
  run(`state.stats.usage = { loading: false, error: null, data: {
    bank: "test-bank", period: "7d", retentionDays: 3, buckets: [], totals: ${JSON.stringify(totals())} } }`);
  const html = run("usageMarkup()");
  assert.match(html, /3,500/);
  assert.match(html, /1,000/);
  assert.match(html, /—/);
  assert.match(html, /3 天/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test("usage markup escapes server data and offers retry for failed requests", () => {
  const run = panel();
  run(`state.stats.usage = { loading: false, data: null,
    error: { code: "HTTP_ERROR", message: "<script>bad</script>" } }`);
  const html = run("usageMarkup()");
  assert.match(html, /retry-usage/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("an unsupported server (404) shows a quiet note without a retry button", () => {
  const run = panel();
  run(`state.stats.usage = { loading: false, data: null, error: { code: "NOT_FOUND", message: "missing" } }`);
  const html = run("usageMarkup()");
  assert.match(html, /usage-unsupported/);
  assert.doesNotMatch(html, /retry-usage|inline-error/);
});

test("an empty period renders one line, not a grid of zeros", () => {
  const run = panel();
  run(`state.stats.usage = { loading: false, error: null, data: {
    bank: "b", period: "7d", trunc: "day", buckets: [],
    totals: { requests: 0, statuses: {}, tokens: { total: 0, input: 0, output: 0, cached: 0, thoughts: 0 } } } }`);
  const html = run("usageMarkup()");
  assert.match(html, /usage-empty/);
  assert.doesNotMatch(html, /usage-primary|usage-breakdown|usage-history/);
});

test("previous numbers stay on screen while another period loads", () => {
  const run = panel();
  run(`state.stats.usage = { loading: true, error: null, data: {
    bank: "b", period: "7d", trunc: "day", buckets: [],
    totals: ${JSON.stringify(totals({ tokens: { total: 4321, input: 1, output: 1, cached: 0, thoughts: null } }))} } }`);
  const html = run("usageMarkup()");
  assert.match(html, /4,321/);
  assert.doesNotMatch(html, /class="spinner"/);
});

test("the daily history lists the most recent day first", () => {
  const run = panel();
  const html = run(`usageHistoryMarkup({ trunc: "day", buckets: [
    { time: "2026-11-02T16:00:00+00:00", requests: 1, tokens: { total: 10 } },
    { time: "2026-11-04T16:00:00+00:00", requests: 3, tokens: { total: 30 } },
    { time: "2026-11-03T16:00:00+00:00", requests: 2, tokens: { total: 20 } } ] })`);
  const order = [...html.matchAll(/<th scope="row">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.equal(order.length, 3);
  assert.match(order[0], /5日|5/);
  assert.match(order[1], /4日|4/);
  assert.match(order[2], /3日|3/);
});

test("day buckets show a local calendar day without a clock time; hour buckets show the time", () => {
  const run = panel();
  // 16:00Z is local midnight of the next day in the pinned zone — the real server bucket shape.
  const day = run('fmtBucket("2026-11-03T16:00:00+00:00", "day")');
  assert.match(day, /4/);
  assert.doesNotMatch(day, /\d:\d\d/);
  assert.match(run('fmtBucket("2026-11-03T08:00:00Z", "hour")'), /\d:\d\d|\d时/);
  assert.equal(run('fmtBucket("not-a-date", "hour")'), "not-a-date");
});

test("operations pill reflects running extraction", () => {
  const run = panel();
  assert.match(run("operationsPill({ activeOperations: 2 })"), /data-level="warn"/);
  assert.match(run("operationsPill({ activeOperations: 0 })"), /data-level="ok"/);
});

test("cost: cached input uses the cache price, falls back to the input price, needs input+output", () => {
  const run = panel();
  const row = "{ tokens: { input: 1000000, cached: 400000, output: 100000, thoughts: 999999 } }";
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !~ ${expected}`);
  near(run(`estimateCost(${row}, { input: 2, cached: 0.5, output: 8 })`), 2.2);
  near(run(`estimateCost(${row}, { input: 2, cached: null, output: 8 })`), 2.8);
  assert.equal(run(`estimateCost(${row}, { input: 2, cached: 1, output: null })`), null);
  assert.equal(run(`estimateCost(${row}, undefined)`), null);
  // A cached count above input (bad data) can never produce a negative bill.
  assert.ok(run("estimateCost({ tokens: { input: 10, cached: 50, output: 0 } }, { input: 1, cached: 1, output: 1 })") >= 0);
});

test("money is always USD, with more precision for small amounts", () => {
  const run = panel();
  assert.equal(run("fmtMoney(12.345)"), "$12.35");
  assert.equal(run("fmtMoney(0.01234)"), "$0.0123");
  assert.equal(run("fmtMoney(NaN)"), "—");
});

const models = (partial = false) => `{ period: "7d", scanned: 432, partial: ${partial}, ${partial ? 'since: "2026-11-01T00:00:00Z",' : ""}
  models: [
    { model: "deepseek-flash", provider: "openai", requests: 400, missing: 0, tokens: { input: 1000000, output: 100000, cached: 400000, thoughts: 0 } },
    { model: "<img onerror=x>", provider: "", requests: 32, missing: 0, tokens: { input: 5, output: 5, cached: 0, thoughts: 0 } } ] }`;

test("model table prices what it can, flags the rest and escapes model names", () => {
  const run = panel();
  run(`state.stats.models = { loading: false, error: null, data: ${models()} }`);
  run(`state.stats.prices = { data: { models: { "deepseek-flash": { input: 2, cached: 0.5, output: 8 } } },
    draft: { models: { "deepseek-flash": { input: "2", cached: "0.5", output: "8" } } }, open: false }`);
  const html = run("modelsBodyMarkup()");
  assert.match(html, /\$2\.20/);
  assert.doesNotMatch(html, /price-currency|¥/);
  assert.match(html, /未设单价/);
  assert.match(html, /1 个模型未设单价/);
  assert.match(html, /&lt;img onerror=x&gt;/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /usage-warning/, "a complete scan carries no partial-data warning");
  assert.match(html, /price-editor/);
});

test("without any price the model table asks for prices instead of showing a fake cost", () => {
  const run = panel();
  run(`state.stats.models = { loading: false, error: null, data: ${models(true)} }`);
  run(`state.stats.prices = { data: { models: {} }, draft: { models: {} }, open: true, warning: "旧单价已忽略" }`);
  const html = run("modelsBodyMarkup()");
  assert.doesNotMatch(html, /[¥$]\d/);
  assert.match(html, /服务端只返回 token/);
  assert.match(html, /data-action="fill-prices"/);
  assert.match(html, /旧单价已忽略/);
  assert.match(html, /usage-warning/);
  assert.match(html, /之后的 432 次/);
  assert.match(html, /<details[^>]*price-editor[^>]*open/);
});

test("model errors: 404 is a quiet note, other failures are retryable", () => {
  const run = panel();
  run(`state.stats.models = { loading: false, data: null, error: { code: "NOT_FOUND", message: "x" } }`);
  assert.doesNotMatch(run("modelsBodyMarkup()"), /retry-models/);
  run(`state.stats.models = { loading: false, data: null, error: { code: "TIMEOUT", message: "x" } }`);
  assert.match(run("modelsBodyMarkup()"), /retry-models/);
});

test("price draft is validated before it is sent; blanks become null", () => {
  const run = panel();
  const ok = run(`priceDraftToPayload({ models: { m: { input: " 1.5 ", cached: "", output: "3" } } })`);
  assert.deepEqual(JSON.parse(JSON.stringify(ok.payload)), { models: { m: { input: 1.5, cached: null, output: 3 } } });
  assert.equal(Object.keys(ok.fieldErrors).length, 0);
  const bad = run(`priceDraftToPayload({ models: { m: { input: "abc", cached: "-1", output: "" } } })`);
  assert.deepEqual(Object.keys(bad.fieldErrors).sort(), ["m.cached", "m.input"]);
});

test("changing the usage period discards a slower previous response", async () => {
  const pending = [];
  const run = panel((channel, payload) => new Promise((resolve) => pending.push({ channel, payload, resolve })));
  const first = run('loadUsage("7d")');
  const second = run('loadUsage("1d")');
  assert.equal(pending[1].channel, "hindsight.bank.usage");
  assert.equal(pending[1].payload.period, "1d");
  pending[1].resolve({ ok: true, period: "1d", totals: { requests: 2 } });
  await second;
  pending[0].resolve({ ok: true, period: "7d", totals: { requests: 9 } });
  await first;
  assert.equal(run("state.stats.usage.data.totals.requests"), 2);
  assert.equal(run("state.stats.period"), "1d");
  assert.equal(run("state.stats.usage.loading"), false);
});

test("filling from the catalog only touches empty rows and reports what it could not match", async () => {
  const calls = [];
  const run = panel(async (channel, payload) => {
    calls.push({ channel, payload });
    if (channel === "hindsight.prices.suggest") {
      return { ok: true, suggestions: { "deepseek-flash": { input: 0.15, cached: 0.003, output: 0.6 } }, unmatched: ["mystery"] };
    }
    return { ok: true };
  });
  run(`state.stats.models = { data: { models: [{ model: "deepseek-flash" }, { model: "mine" }, { model: "mystery" }] } }`);
  run(`state.stats.prices = { data: { models: {} }, open: false, draft: { models: { mine: { input: "9", cached: "", output: "9" } } } }`);
  await run("fillPrices()");
  const ask = calls.find((c) => c.channel === "hindsight.prices.suggest");
  assert.deepEqual([...ask.payload.models].sort(), ["deepseek-flash", "mystery"], "a row the user already priced is not requested");
  assert.equal(run('state.stats.prices.draft.models["deepseek-flash"].output'), "0.6");
  assert.equal(run('state.stats.prices.draft.models["mine"].input'), "9");
  assert.equal(run("state.stats.prices.open"), true);
  assert.equal(run("state.stats.prices.filling"), false);
  const toast = calls.find((c) => c.channel === "ui.showToast");
  assert.match(toast.payload.message, /1 个模型[\s\S]*1 个在目录中找不到/);
});

test("unavailable document counts say so instead of showing zeros", () => {
  const run = panel();
  run(`state.diag.data = { warnings: [{ what: "documents", code: "TIMEOUT", message: "slow" }] }`);
  const html = run("documentsMarkup(null)");
  assert.match(html, /不是 0 篇/);
  assert.match(html, /TIMEOUT/);
  assert.doesNotMatch(html, /doc-row/);
});

test("document rows explain what Git commits and Git log mean, and a real zero stays a zero", () => {
  const run = panel();
  const html = run("documentsMarkup({ total: 5, git: 0, gitlog: 4, conversation: 1, survey: 0, other: 0 })");
  assert.match(html, /title="[^"]*deepen[^"]*"/);
  assert.match(html, /Git 日志/);
  assert.equal([...html.matchAll(/class="doc-count">0</g)].length, 3);
});

test("unknown pages and extraction state are dashes, not 0 or 'nothing running'", () => {
  const run = panel();
  const html = run("diagStatusMarkup({ apiUrl: 'u', bank: 'b', pages: null, activeOperations: null })");
  assert.doesNotMatch(html, />0</);
  assert.match(run("operationsPill({ activeOperations: null })"), /状态未知/);
});

test("models paint from the local cache first, then update from the server", async () => {
  const calls = [];
  const cached = { ok: true, cold: false, scanned: 1, partial: false, models: [{ model: "m", provider: "", requests: 1, missing: 0, tokens: { input: 1, output: 1, cached: 0, thoughts: 0 } }] };
  const synced = { ...cached, scanned: 2, models: [{ ...cached.models[0], requests: 2 }] };
  const run = panel(async (channel, payload) => {
    calls.push({ channel, payload });
    if (channel !== "hindsight.bank.usageModels") return { ok: true };
    if (payload.cacheOnly) {
      assert.equal(run("state.stats.models.loading"), true);
      return cached;
    }
    assert.equal(run("state.stats.models.data.scanned"), 1, "cached numbers are already on screen while the sync runs");
    return synced;
  });
  await run('loadModels("7d")');
  assert.deepEqual(calls.filter((c) => c.channel.endsWith("usageModels")).map((c) => !!c.payload.cacheOnly), [true, false]);
  assert.equal(run("state.stats.models.data.scanned"), 2);
});

test("a failed sync keeps the cached numbers instead of replacing them with an error", async () => {
  const cached = { ok: true, cold: false, scanned: 1, partial: false, models: [{ model: "m", provider: "", requests: 1, missing: 0, tokens: { input: 1, output: 1, cached: 0, thoughts: 0 } }] };
  const run = panel(async (channel, payload) => {
    if (channel !== "hindsight.bank.usageModels") return { ok: true };
    return payload.cacheOnly ? cached : { ok: false, error: { code: "TIMEOUT", message: "slow" } };
  });
  await run('loadModels("7d")');
  assert.equal(run("state.stats.models.data.scanned"), 1);
  assert.equal(run("state.stats.models.error"), null);
});

const summaryFor = (requests, total, extra = {}) => ({
  bank: "b", period: "7d", trunc: "day", limitedCoverage: false, trackedFrom: null,
  totals: { requests, statuses: { success: requests }, tokens: { total, input: total, output: 0, cached: 0, thoughts: 0 } },
  buckets: [], ...extra,
});
const modelsFor = (requests, total, extra) => ({ ok: true, cold: false, scanned: requests, partial: false, models: [], summary: summaryFor(requests, total, extra) });

test("the usage numbers follow the selected period, driven by the local aggregate", async () => {
  const byPeriod = { "1d": modelsFor(10, 1000), "7d": modelsFor(70, 7000), "30d": modelsFor(300, 30000) };
  const calls = [];
  const run = panel(async (channel, payload) => {
    calls.push(channel);
    return channel === "hindsight.bank.usageModels" ? byPeriod[payload.period] : { ok: true };
  });
  for (const [period, want] of [["1d", 10], ["7d", 70], ["30d", 300], ["1d", 10]]) {
    await run(`loadModels("${period}")`);
    assert.equal(run("state.stats.usage.data.totals.requests"), want, period);
    assert.equal(run("state.stats.usage.loading"), false);
  }
  assert.ok(!calls.includes("hindsight.bank.usage"), "the server's fixed-window stats are not consulted when local data exists");
});

test("the cached numbers of the new period replace the old ones before the sync returns", async () => {
  let release;
  const run = panel((channel, payload) => {
    if (payload.cacheOnly) return Promise.resolve(modelsFor(payload.period === "30d" ? 300 : 70, 1));
    return new Promise((resolve) => { release = () => resolve(modelsFor(payload.period === "30d" ? 301 : 71, 1)); });
  });
  const first = run('loadModels("7d")');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(run("state.stats.usage.data.totals.requests"), 70, "instant paint from cache");
  release(); await first;
  const second = run('loadModels("30d")');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(run("state.stats.usage.data.totals.requests"), 300, "the period switch is visible immediately, not stuck on the 7d figure");
  release(); await second;
  assert.equal(run("state.stats.usage.data.totals.requests"), 301);
});

test("without any local history the server's own stats are the fallback", async () => {
  const calls = [];
  const run = panel(async (channel, payload) => {
    calls.push(channel);
    if (channel === "hindsight.bank.usageModels") return { ok: false, error: { code: "NOT_FOUND", message: "tracing off" } };
    return { ok: true, bank: "b", period: payload.period, trunc: "day", buckets: [], totals: { requests: 5, statuses: {}, tokens: { total: 9, input: 9, output: 0, cached: 0, thoughts: 0 } } };
  });
  await run('loadModels("7d")');
  assert.ok(calls.includes("hindsight.bank.usage"));
  assert.equal(run("state.stats.usage.data.totals.requests"), 5);
  assert.equal(run("state.stats.usage.loading"), false);
});

test("a period longer than the tracked history says so; a covered one does not", () => {
  const run = panel();
  const limited = run(`usageDataMarkup(${JSON.stringify(summaryFor(5, 9, { limitedCoverage: true, trackedFrom: "2026-11-04T09:00:00.000Z" }))})`);
  assert.match(limited, /usage-warning/);
  assert.match(limited, /只累计了/);
  const covered = run(`usageDataMarkup(${JSON.stringify(summaryFor(5, 9))})`);
  assert.doesNotMatch(covered, /只累计了/);
});
