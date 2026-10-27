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
