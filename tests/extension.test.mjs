// The vendored upstream bundle loads through src/index.mjs, registers the four pi hooks, and a hook
// tolerates PI-Desktop's sessionManager stub (getBranch -> []). No network, no memory writes:
// HINDSIGHT_DISABLED keeps the upstream config resolver from building a runtime.
import test from "node:test";
import assert from "node:assert/strict";

process.env.HINDSIGHT_DISABLED = "1";
const { default: hindsight, nodePathStatus } = await import("../src/index.mjs");

test("wrapper registers the upstream hooks and survives the PI-Desktop ctx stub", async () => {
  const registered = [];
  hindsight({
    on: (ev, h) => registered.push([ev, h]),
    registerTool: (t) => registered.push([`tool:${t.name}`, t]),
  });

  const events = registered.map(([e]) => e).filter((e) => !e.startsWith("tool:"));
  for (const e of ["session_start", "before_agent_start", "agent_end", "session_shutdown"]) {
    assert.ok(events.includes(e), `missing hook ${e}`);
  }

  const cwd = "/tmp/hindsight-test-nonexistent";
  const agentEnd = registered.find(([e]) => e === "agent_end")[1];
  const out = await agentEnd(
    { messages: [{ role: "user", content: "hi" }] },
    {
      cwd,
      sessionManager: {
        getEntries: () => [],
        getBranch: () => [],
        getLeafId: () => null,
        getSessionFile: () => undefined,
        getSessionId: () => "test-session",
        getCwd: () => cwd,
      },
    },
  );
  assert.equal(out, undefined);
});

test("node is resolvable for the background deepen child", () => {
  assert.equal(nodePathStatus.ok, true);
});
