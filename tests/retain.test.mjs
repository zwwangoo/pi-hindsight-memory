// Write-back behaviour of the wrapped upstream extension against a fake Hindsight server.
//
// PI-Desktop gives agent_end only the messages of the run that just ended and a stub getBranch().
// Without the transcript store, upstream's planRetain sees a non-continuing transcript on every run
// and `replace`s the server document with that single run. These tests drive the REAL vendored
// extension through the wrapper and assert on the POST /memories bodies it sends.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { compactMessage, createTranscriptStore } from "../src/transcript-store.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hindsight-pi-"));
// src/index.mjs builds its default store at module load, and the module is cached for the whole
// file: point it at a temp dir before anything imports it so no test touches the real ~/.hindsight.
process.env.HINDSIGHT_PI_TRANSCRIPT_DIR = tmp();

// ---- transcript store (unit) ---------------------------------------------------------------

test("compactMessage keeps only what upstream renders and drops tool results", () => {
  assert.equal(compactMessage({ role: "toolResult", content: [{ type: "text", text: "big output" }] }), null);
  assert.equal(compactMessage({ role: "user", content: "   " }), null);
  assert.deepEqual(compactMessage({ role: "user", content: "hi" }), { role: "user", content: "hi" });
  const out = compactMessage({
    role: "assistant",
    content: [
      { type: "thinking", thinking: "secret" },
      { type: "text", text: "done" },
      { type: "toolCall", name: "Write", arguments: { file_path: "/a/b.txt", content: "x".repeat(50000) } },
      { type: "toolCall", name: "Bash", arguments: { command: "ls\nrm -rf /" } },
    ],
  });
  assert.deepEqual(out.content, [
    { type: "text", text: "done" },
    { type: "toolCall", name: "Write", arguments: { file_path: "/a/b.txt" } },
    { type: "toolCall", name: "Bash", arguments: { command: "ls" } },
  ]);
});

test("store accumulates runs per session and rebuilds from disk after a restart", () => {
  const dir = tmp();
  const store = createTranscriptStore({ dir });
  const run1 = [{ role: "user", content: "one", timestamp: 1000 }, { role: "assistant", content: [{ type: "text", text: "a1" }] }];
  const run2 = [{ role: "user", content: "two", timestamp: 2000 }];

  assert.equal(store.append("s1", run1).length, 2);
  const full = store.append("s1", run2);
  assert.deepEqual(full.map((e) => e.message.content), ["one", [{ type: "text", text: "a1" }], "two"]);
  assert.equal(full[0].timestamp, new Date(1000).toISOString(), "timestamp is stable across calls");
  assert.equal(store.append("other", run2).length, 1, "sessions are isolated");

  const restarted = createTranscriptStore({ dir });
  const after = restarted.append("s1", [{ role: "user", content: "three" }]);
  assert.equal(after.length, 4);
  assert.deepEqual(after.slice(0, 3).map((e) => e.timestamp), full.map((e) => e.timestamp), "prefix identical after restart");

  const mode = fs.statSync(path.join(dir, "s1.jsonl")).mode & 0o777;
  assert.equal(mode, 0o600);
});

test("store survives a torn line, hostile session ids and an unwritable directory", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "s2.jsonl"), `${JSON.stringify({ type: "message", timestamp: "t", message: { role: "user", content: "ok" } })}\n{"type":"mess`);
  assert.equal(createTranscriptStore({ dir }).append("s2", []).length, 1);

  const store = createTranscriptStore({ dir });
  store.append("../../etc/passwd", [{ role: "user", content: "x" }]);
  assert.ok(fs.readdirSync(dir).every((f) => !f.includes("/")), "no path traversal");
  assert.ok(!fs.existsSync(path.join(dir, "..", "..", "etc")));

  const blocked = path.join(tmp(), "file");
  fs.writeFileSync(blocked, "not a dir");
  const inMemory = createTranscriptStore({ dir: path.join(blocked, "sub") });
  assert.equal(inMemory.append("s3", [{ role: "user", content: "x" }]).length, 1);
  assert.equal(inMemory.append("s3", [{ role: "user", content: "y" }]).length, 2);
});

test("store prunes transcripts older than the TTL", () => {
  const dir = tmp();
  const old = path.join(dir, "old.jsonl");
  fs.writeFileSync(old, "");
  const past = new Date(Date.now() - 40 * 86400_000);
  fs.utimesSync(old, past, past);
  createTranscriptStore({ dir, ttlDays: 30 }).append("fresh", [{ role: "user", content: "x" }]);
  assert.ok(!fs.existsSync(old));
  assert.ok(fs.existsSync(path.join(dir, "fresh.jsonl")));
});

// ---- end to end: wrapper + real vendored upstream + fake server -----------------------------
//
// Everything below is fixed at file top, BEFORE src/index.mjs is imported: upstream reads its config
// path and log paths at module load, so a late env change would silently point it at the real
// ~/.hindsight config and bank.
const posts = [];
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = req.url ?? "";
    const send = (obj) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (url.endsWith("/version")) return send({ api_version: "1.0.0", features: { observations: true } });
    if (url.endsWith("/config")) return send({ config: { store_document_text: true } });
    if (req.method === "POST" && url.endsWith("/memories")) {
      posts.push(JSON.parse(body));
      return send({ success: true, operation_id: `op-${posts.length}` });
    }
    if (url.includes("/operations/")) return send({ status: "completed" });
    return send({});
  });
});
await new Promise((r) => fake.listen(0, "127.0.0.1", r));
const FAKE_URL = `http://127.0.0.1:${fake.address().port}`;
const home = tmp();
const configFile = path.join(home, "coding-agent.json");
fs.writeFileSync(
  configFile,
  JSON.stringify({
    serverMode: "self-hosted",
    apiUrl: FAKE_URL,
    apiToken: "t",
    bankId: "e2e-bank",
    autoInject: "none",
    autoSeed: false,
    codebaseSurvey: false,
    autoUpdate: false,
  }),
);
Object.assign(process.env, {
  HINDSIGHT_CONFIG: configFile,
  HINDSIGHT_API_URL: FAKE_URL,
  HINDSIGHT_API_TOKEN: "t",
  HINDSIGHT_BANK_ID: "e2e-bank",
  HINDSIGHT_LOG_FILE: path.join(home, "plugin.log"),
  HINDSIGHT_DIAG_FILE: path.join(home, "diag.jsonl"),
  HINDSIGHT_USAGE_FILE: path.join(home, "usage.jsonl"),
});
delete process.env.HINDSIGHT_DISABLED;
const { default: hindsight } = await import("../src/index.mjs");

test("successive runs of one session are written back as replace once, then append", async (t) => {
  t.after(() => fake.close());

  const handlers = {};
  hindsight({ on: (ev, h) => (handlers[ev] = h), registerTool: () => {} });

  const cwd = home;
  const ctx = {
    cwd,
    sessionManager: {
      getEntries: () => [],
      getBranch: () => [], // PI-Desktop's stub
      getLeafId: () => null,
      getSessionFile: () => undefined,
      getSessionId: () => "e2e-session",
      getCwd: () => cwd,
    },
  };
  const run = (user, reply) => [
    { role: "user", content: user, timestamp: Date.now() },
    { role: "assistant", content: [{ type: "text", text: reply }], timestamp: Date.now() },
  ];

  await handlers.agent_end({ type: "agent_end", messages: run("first question", "first answer") }, ctx);
  await handlers.session_shutdown({}, ctx); // flush: write-back is fire-and-forget otherwise
  await handlers.agent_end({ type: "agent_end", messages: run("second question", "second answer") }, ctx);
  await handlers.session_shutdown({}, ctx);
  await handlers.agent_end({ type: "agent_end", messages: run("third question", "third answer") }, ctx);
  await handlers.session_shutdown({}, ctx);

  assert.equal(posts.length, 3, `expected 3 write-backs, got ${posts.length}`);
  const items = posts.map((p) => p.items[0]);
  assert.ok(items.every((i) => i.document_id === "conversation:e2e-session"));

  // Run 1: nothing on the server yet -> a plain write of the whole transcript.
  assert.equal(items[0].update_mode, undefined);
  assert.match(items[0].content, /first question/);

  // Runs 2 and 3: append ONLY the new turns. Before the fix these were `replace` with the single
  // last run, deleting the earlier runs' memories on the server.
  for (const [i, word] of [[1, "second"], [2, "third"]]) {
    assert.equal(items[i].update_mode, "append", `run ${i + 1} must append`);
    assert.match(items[i].content, new RegExp(`${word} question`));
    assert.doesNotMatch(items[i].content, /first question/, `run ${i + 1} must not resend earlier turns`);
  }
});
