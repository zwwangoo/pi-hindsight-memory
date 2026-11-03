// Wrapper contract for the transcript branch (no network: the upstream extension is disabled, we only
// test what the wrapper hands to a handler). Own file = own process, so env set here cannot leak into
// the end-to-end test in retain.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.HINDSIGHT_DISABLED = "1";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hindsight-wrap-"));
process.env.HINDSIGHT_PI_TRANSCRIPT_DIR = tmp();
// A config path that cannot exist, so nothing here can ever read the real ~/.hindsight config.
process.env.HINDSIGHT_CONFIG = path.join(tmp(), "none.json");

const { createTranscriptStore } = await import("../src/transcript-store.mjs");

// ---- wrapper laziness ----------------------------------------------------------------------

test("the transcript is only recorded when upstream actually asks for the branch", async () => {
  const { adaptForPiDesktop } = await import("../src/index.mjs");
  const store = createTranscriptStore({ dir: tmp() });
  const ctx = { sessionManager: { getSessionId: () => "lazy", getBranch: () => [] } };
  const messages = [{ role: "user", content: "hello" }];
  const capture = (factory) => {
    let handler;
    adaptForPiDesktop({ on: (_e, h) => (handler = h) }, (api) => factory(api), store);
    return handler;
  };

  // A disabled workspace: the handler never evaluates getBranch -> nothing is recorded.
  let seen;
  const never = capture((api) => api.on("agent_end", () => {}));
  never({ messages }, ctx);
  assert.equal(store.append("lazy", []).length, 0, "no transcript for a workspace that never asked");

  // An enabled workspace asks via getBranch?.() and gets the accumulated transcript.
  const asks = capture((api) => api.on("agent_end", (ev, c) => (seen = c.sessionManager.getBranch?.())));
  asks({ messages }, ctx);
  assert.equal(seen.length, 1);
  asks({ messages: [{ role: "user", content: "again" }] }, ctx);
  assert.equal(seen.length, 2);

  // Asking twice for the same event must not record the run twice.
  const twice = capture((api) => api.on("agent_end", (ev, c) => [c.sessionManager.getBranch?.(), c.sessionManager.getBranch?.()]));
  const [first, second] = twice({ messages: [{ role: "user", content: "once" }] }, ctx);
  assert.equal(first.length, 3);
  assert.equal(second, first);

  // Other events keep the old contract: getBranch is undefined.
  let other = "unset";
  capture((api) => api.on("before_agent_start", (ev, c) => (other = c.sessionManager.getBranch)))({}, ctx);
  assert.equal(other, undefined);
});

test("retainSessions=false keeps the transcript off disk and gives upstream no branch", async () => {
  const { adaptForPiDesktop } = await import("../src/index.mjs");
  const dir = tmp();
  const store = createTranscriptStore({ dir });
  const ctx = { sessionManager: { getSessionId: () => "off", getBranch: () => [] } };
  const prev = process.env.HINDSIGHT_RETAIN_SESSIONS;
  process.env.HINDSIGHT_RETAIN_SESSIONS = "false";
  try {
    let branch = "unset";
    let handler;
    adaptForPiDesktop({ on: (_e, h) => (handler = h) }, (api) => api.on("agent_end", (ev, c) => (branch = c.sessionManager.getBranch?.())), store);
    handler({ messages: [{ role: "user", content: "secret" }] }, ctx);
    assert.equal(branch, undefined);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    if (prev === undefined) delete process.env.HINDSIGHT_RETAIN_SESSIONS;
    else process.env.HINDSIGHT_RETAIN_SESSIONS = prev;
  }
});

