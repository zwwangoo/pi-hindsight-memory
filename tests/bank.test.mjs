import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { status, listPages, search, readPage, reflect } from "../src/panel/bank.mjs";

const API = "https://hindsight.test:1213";
const BANK = "test-bank";
const TOKEN = "tok_abcdefghijklmnop";

process.env.HINDSIGHT_CONFIG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hindsight-bank-")), "coding-agent.json");
fs.writeFileSync(
  process.env.HINDSIGHT_CONFIG,
  JSON.stringify({ serverMode: "self-hosted", apiUrl: API, bankId: BANK, apiToken: TOKEN }),
);

const realFetch = globalThis.fetch;
let seen = [];

function json(body, init = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
}

function installFetch(routes) {
  seen = [];
  globalThis.fetch = async (url, init = {}) => {
    seen.push({ url: String(url), method: init.method || "GET", headers: init.headers || {}, body: init.body });
    for (const [pattern, handler] of routes) {
      if (String(url).includes(pattern)) return handler(String(url), init);
    }
    return new Response("not found", { status: 404 });
  };
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

const baseRoutes = () => [
  ["/v1/version", () => json({ api_version: "0.8.6" })],
  [
    "/documents",
    () =>
      json({
        total: 4,
        items: [{ id: "git:abc" }, { id: "gitlog:repo" }, { id: "conversation:s1" }, { id: "survey-baseline:abc" }],
      }),
  ],
  ["/operations", () => json({ operations: [{ status: "completed" }, { status: "running" }] })],
  [
    "/knowledge-base/tree",
    () =>
      json({
        roots: [
          {
            id: "f1",
            name: "Core",
            kind: "folder",
            children: [{ id: "kp-1", name: "Core concepts", kind: "page", description: "what it is" }],
          },
        ],
      }),
  ],
];

test("status reports version, page count, buckets and pending operations", async () => {
  installFetch(baseRoutes());
  const result = await status();
  assert.equal(result.bank, BANK);
  assert.equal(result.apiUrl, API);
  assert.equal(result.version, "0.8.6");
  assert.equal(result.pages, 1);
  assert.equal(result.documents.total, 4);
  assert.equal(result.documents.git, 1);
  assert.equal(result.documents.gitlog, 1);
  assert.equal(result.documents.conversation, 1);
  assert.equal(result.documents.survey, 1);
  assert.equal(result.activeOperations, 1, "only non-terminal operations count");
  assert.equal(result.tokenMasked, "tok_…mnop");
  assert.deepEqual(result.warnings, []);
});

test("requests carry the bearer token and never put it in a URL", async () => {
  installFetch(baseRoutes());
  await status();
  const docCall = seen.find((c) => c.url.includes("/documents"));
  assert.equal(docCall.headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(!seen.some((c) => c.url.includes(TOKEN)), "token must not appear in URLs");
  const bankScoped = seen.filter((c) => !c.url.includes("/version"));
  assert.ok(bankScoped.length > 0);
  assert.ok(bankScoped.every((c) => c.url.startsWith(`${API}/v1/default/banks/`)), "bank-scoped base path");
});

test("401 maps to UNAUTHORIZED with an actionable hint", async () => {
  installFetch([
    ["/v1/version", () => json({ api_version: "0.8.6" })],
    ["/documents", () => new Response("nope", { status: 401 })],
    ["/knowledge-base/tree", () => new Response("nope", { status: 401 })],
    ["/operations", () => new Response("nope", { status: 401 })],
  ]);
  const result = await status();
  assert.equal(result.documents, null);
  assert.equal(result.warnings[0].code, "UNAUTHORIZED");
  await assert.rejects(
    () => listPages(),
    (e) => {
      assert.equal(e.code, "UNAUTHORIZED");
      assert.match(e.hint, /apiToken/);
      return true;
    },
  );
});

test("429 surfaces retryAfterMs", async () => {
  installFetch([
    ["/v1/version", () => json({ api_version: "0.8.6" })],
    ["/knowledge-base/tree", () => new Response("slow down", { status: 429, headers: { "retry-after": "7" } })],
  ]);
  await assert.rejects(
    () => listPages(),
    (e) => {
      assert.equal(e.code, "RATE_LIMITED");
      assert.equal(e.retryAfterMs, 7000);
      return true;
    },
  );
});

test("network failure maps to OFFLINE and mentions the host", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
  };
  await assert.rejects(
    () => status(),
    (e) => {
      assert.equal(e.code, "OFFLINE");
      assert.match(e.hint, /hindsight\.test/);
      return true;
    },
  );
});

test("a 5xx body never leaks the token", async () => {
  installFetch([
    ["/v1/version", () => json({ api_version: "0.8.6" })],
    ["/knowledge-base/tree", () => new Response(`boom ${TOKEN} boom`, { status: 500 })],
  ]);
  await assert.rejects(
    () => listPages(),
    (e) => {
      assert.equal(e.code, "HTTP_ERROR");
      assert.ok(!e.message.includes(TOKEN), "token scrubbed from message");
      assert.match(e.message, /••••|tok_/);
      return true;
    },
  );
});

test("search flattens results and rejects an empty query", async () => {
  installFetch([
    [
      "/knowledge-base/search",
      () => json({ results: [{ id: "kp-1", name: "Core concepts", source_query: "q", snippet: "…hit…" }] }),
    ],
  ]);
  const result = await search("plugin design", 5);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].snippet, "…hit…");
  const call = seen.find((c) => c.url.includes("/search"));
  assert.match(call.url, /q=plugin%20design/);
  assert.match(call.url, /limit=5/);
  await assert.rejects(() => search("   "), (e) => e.code === "INVALID_CONFIG");
});

test("readPage tolerates body/markdown and maps 404 to a page-level hint", async () => {
  installFetch([
    ["/knowledge-base/pages/kp-1", () => json({ id: "kp-1", name: "Core", body: "hello", tags: ["a"], timestamp: "2026-10-27" })],
    ["/knowledge-base/pages/missing", () => new Response("gone", { status: 404 })],
  ]);
  const { page } = await readPage("kp-1");
  assert.equal(page.body, "hello");
  assert.equal(page.last_updated_at, "2026-10-27");
  await assert.rejects(
    () => readPage("missing"),
    (e) => {
      assert.equal(e.code, "NOT_FOUND");
      assert.match(e.message, /找不到页面/);
      return true;
    },
  );
});

test("unreachable version endpoint degrades to a null version instead of failing", async () => {
  installFetch([
    ["/v1/version", () => new Response("bad", { status: 502 })],
    ...baseRoutes().filter(([p]) => p !== "/v1/version"),
  ]);
  const result = await status();
  assert.equal(result.version, null);
  assert.equal(result.pages, 1);
});

test("reflect sends the server's budget enum (low|mid|high)", async () => {
  installFetch([["/reflect", () => json({ text: "answer", budget: "mid" })]]);

  const unknown = await reflect("why?", "medium");
  assert.equal(unknown.budget, "low", "anything outside the enum falls back to low");
  assert.equal(JSON.parse(seen.at(-1).body).budget, "low");

  const mid = await reflect("why?", "mid");
  assert.equal(mid.budget, "mid");
  assert.equal(mid.text, "answer");

  const high = await reflect("why?", "high");
  assert.equal(high.budget, "high");

  const fallback = await reflect("why?");
  assert.equal(fallback.budget, "low", "missing budget falls back to low, the cheap end");

  await assert.rejects(() => reflect("   "), (e) => e.code === "INVALID_CONFIG");
});

test("usage aggregates bank-scoped LLM stats without double-counting cached or reasoning tokens", async () => {
  installFetch([["/llm-requests/stats", () => json({
    bank_id: BANK, period: "7d", trunc: "day", start: "2026-11-01T00:00:00Z", retention_days: 3,
    buckets: [
      { time: "2026-11-01T00:00:00Z", statuses: { success: 2, error: 1 }, total: 3,
        tokens: { input: 1000, output: 200, cached: 400, thoughts: 80, total: 1200 } },
      { time: "2026-11-02T00:00:00Z", statuses: { success: 4 }, total: 4,
        tokens: { input: 2000, output: 300, cached: 600, thoughts: 120, total: 2300 } },
    ],
  })]]);
  const { usage } = await import("../src/panel/bank.mjs");
  const result = await usage();
  assert.equal(result.bank, BANK);
  assert.equal(result.period, "7d");
  assert.equal(result.retentionDays, 3);
  assert.deepEqual(result.totals, {
    requests: 7, statuses: { success: 6, error: 1 },
    tokens: { input: 3000, output: 500, cached: 1000, thoughts: 200, total: 3500 },
  });
  assert.equal(result.buckets.length, 2);
  const call = seen[0];
  assert.equal(call.url, `${API}/v1/default/banks/${BANK}/llm-requests/stats?period=7d&call_type=llm`);
  assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(!JSON.stringify(result).includes(TOKEN));
});

test("usage preserves unavailable token totals in older responses rather than reporting zero", async () => {
  installFetch([["/llm-requests/stats", () => json({
    bank_id: BANK, period: "1d", trunc: "hour", start: "2026-11-01T00:00:00Z",
    buckets: [{ time: "2026-11-01T01:00:00Z", statuses: { success: 5 }, total: 5 }],
  })]]);
  const { usage } = await import("../src/panel/bank.mjs");
  const result = await usage("1d");
  assert.equal(result.totals.requests, 5);
  assert.deepEqual(result.totals.tokens, { input: null, output: null, cached: null, thoughts: null, total: null });
  assert.ok(!Object.hasOwn(result, "retentionDays"));
  assert.match(seen[0].url, /period=1d&call_type=llm$/);
});

test("usage handles empty history and supports all documented periods", async () => {
  installFetch([["/llm-requests/stats", () => json({
    bank_id: BANK, period: "30d", trunc: "day", start: "2026-10-01T00:00:00Z", retention_days: null, buckets: [],
  })]]);
  const { usage } = await import("../src/panel/bank.mjs");
  const result = await usage("30d");
  assert.equal(result.period, "30d");
  assert.equal(result.retentionDays, null);
  assert.equal(result.totals.requests, 0);
  assert.deepEqual(result.totals.tokens, { input: 0, output: 0, cached: 0, thoughts: 0, total: 0 });
  await assert.rejects(() => usage("all"), (e) => e.code === "INVALID_CONFIG");
});

test("usage returns actionable compatibility errors without affecting bank status", async () => {
  installFetch(baseRoutes());
  const { usage } = await import("../src/panel/bank.mjs");
  await assert.rejects(() => usage(), (e) => e.code === "NOT_FOUND" && /LLM/.test(e.hint));
  assert.equal((await status()).pages, 1);
});

test("usage rejects malformed stats instead of displaying fabricated zero usage", async () => {
  installFetch([["/llm-requests/stats", () => json({ detail: "unexpected payload" })]]);
  const { usage } = await import("../src/panel/bank.mjs");
  await assert.rejects(() => usage(), (e) => e.code === "HTTP_ERROR");
});

import { usageCachePath } from "../src/panel/usage-cache.mjs";

let seq = 0;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const call = (model, input, output, cached, extra = {}) => ({
  id: `call-${++seq}`, provider: "openai", model, status: "success", started_at: ago(60_000),
  input_tokens: input, output_tokens: output, cached_tokens: cached, thoughts_tokens: 5,
  total_tokens: input + output, ...extra,
});
const listRoute = (handler) => [["/llm-requests?", (url) => json(handler(new URL(url)))]];
test.beforeEach(() => fs.rmSync(usageCachePath(), { force: true }));

test("usageModels groups the call-level trace by model, busiest first", async () => {
  installFetch(listRoute(() => ({
    total: 4, items: [call("a", 100, 10, 40), call("b", 10, 1, 0), call("a", 200, 20, 60), call("a", null, 5, null)],
  })));
  const { usageModels } = await import("../src/panel/bank.mjs");
  const result = await usageModels("7d", { refresh: true });
  assert.equal(result.partial, false);
  assert.equal(result.cold, false);
  assert.equal(result.scanned, 4);
  assert.deepEqual(result.models.map((m) => [m.model, m.requests]), [["a", 3], ["b", 1]]);
  assert.deepEqual(result.models[0].tokens, { input: 300, output: 35, cached: 100, thoughts: 15 });
  assert.equal(result.models[0].missing, 2, "null token fields are counted as missing, not as zero usage");
  assert.match(seen[0].url, /llm-requests\?start_date=[^&]+&limit=500&offset=0$/);
  assert.equal(seen[0].headers.Authorization, `Bearer ${TOKEN}`);
});

test("usageModels reads only newer calls on later syncs and never double-counts the boundary", async () => {
  const first = call("m", 10, 1, 0, { started_at: ago(120_000) });
  const second = call("m", 20, 2, 0, { started_at: ago(60_000) });
  installFetch(listRoute(() => ({ items: [second, first] })));
  const { usageModels } = await import("../src/panel/bank.mjs");
  assert.equal((await usageModels("7d", { refresh: true })).models[0].requests, 2);

  const fresh = call("m", 30, 3, 0, { started_at: ago(10_000) });
  installFetch(listRoute(() => ({ items: [fresh, second] })));   // the boundary call comes back again
  const result = await usageModels("7d", { refresh: true });
  const sentStart = new URL(seen[0].url).searchParams.get("start_date");
  assert.ok(Date.parse(sentStart) > Date.now() - 100_000, "asks only for calls since the watermark, not the whole window");
  assert.equal(result.models[0].requests, 3);
  assert.equal(result.models[0].tokens.input, 60);
});

test("usageModels does not count unfinished calls until they finish, and holds the watermark back", async () => {
  const running = call("m", null, null, null, { status: "running", started_at: ago(30_000) });
  const done = call("m", 5, 1, 0, { started_at: ago(20_000) });
  installFetch(listRoute(() => ({ items: [done, running] })));
  const { usageModels } = await import("../src/panel/bank.mjs");
  assert.equal((await usageModels("7d", { refresh: true })).models[0].requests, 1);

  installFetch(listRoute(() => ({ items: [done, { ...running, status: "success", input_tokens: 8, output_tokens: 2, cached_tokens: 0, thoughts_tokens: 0 }] })));
  const result = await usageModels("7d", { refresh: true });
  assert.equal(result.models[0].requests, 2);
  assert.equal(result.models[0].tokens.input, 13, "the finished call is counted once, with its final tokens");
});

test("usageModels answers shorter periods from the same cache without another request", async () => {
  installFetch(listRoute(() => ({ items: [call("m", 1, 1, 0, { started_at: ago(60_000) }), call("m", 1, 1, 0, { started_at: ago(3 * 86_400_000) })] })));
  const { usageModels } = await import("../src/panel/bank.mjs");
  assert.equal((await usageModels("7d", { refresh: true })).scanned, 2);
  const day = await usageModels("1d");
  assert.equal(day.scanned, 1);
  assert.equal(seen.length, 1, "the 1d view reuses the synced window");
});

test("usageModels cacheOnly never hits the network: cold when empty, instant once synced", async () => {
  installFetch(listRoute(() => ({ items: [call("m", 1, 1, 0)] })));
  const { usageModels } = await import("../src/panel/bank.mjs");
  const cold = await usageModels("7d", { cacheOnly: true });
  assert.equal(cold.cold, true);
  assert.equal(seen.length, 0);
  await usageModels("7d", { refresh: true });
  const warm = await usageModels("7d", { cacheOnly: true });
  assert.equal(warm.cold, false);
  assert.equal(warm.scanned, 1);
  assert.equal(seen.length, 1);
});

test("usageModels caps one sync, reports where the data starts, and keeps prompts off disk", async () => {
  let n = 0;
  installFetch(listRoute(() => ({
    items: Array.from({ length: 500 }, () => call("m", 1, 1, 0, { started_at: ago(1000 + 1000 * n++), input: [{ content: "SECRET PROMPT" }] })),
  })));
  const { usageModels } = await import("../src/panel/bank.mjs");
  const result = await usageModels("30d", { refresh: true });
  assert.equal(seen.length, 6, "stops at the page cap instead of downloading the whole trace");
  assert.equal(result.scanned, 3000);
  assert.equal(result.partial, true);
  assert.ok(Date.parse(result.since) > Date.now() - 4000 * 1000);
  const onDisk = fs.readFileSync(usageCachePath(), "utf8");
  assert.ok(!onDisk.includes("SECRET PROMPT"), "only counters are persisted");
  assert.ok(!onDisk.includes(TOKEN));
});

test("usageModels rebuilds from a corrupt cache file and maps a 404 to an actionable error", async () => {
  installFetch(listRoute(() => ({ items: [call("m", 1, 1, 0)] })));
  fs.writeFileSync(usageCachePath(), "{not json");
  const { usageModels } = await import("../src/panel/bank.mjs");
  assert.equal((await usageModels("7d", { refresh: true })).scanned, 1);
  installFetch([]);
  await assert.rejects(() => usageModels("7d", { refresh: true }), (e) => e.code === "NOT_FOUND" && /TRACE/.test(e.hint));
  await assert.rejects(() => usageModels("forever"), (e) => e.code === "INVALID_CONFIG");
});
