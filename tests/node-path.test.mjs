// PI-Desktop's GUI-launched PATH has no node, but the vendored extension spawns a bare `node` for
// background deepen. These tests pin the fix: append a real node directory, never shadow one.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { delimiter } from "node:path";
import { ensureNodeOnPath, hasNode } from "../src/node-path.mjs";

const NO_EXEC = "/nope/node";

function dirWithNode(mode = 0o755) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hindsight-node-"));
  const bin = path.join(dir, "node");
  fs.writeFileSync(bin, "#!/bin/sh\nexit 0\n", { mode });
  fs.chmodSync(bin, mode);
  return dir;
}

function dirWithoutNode() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hindsight-empty-"));
}

test("appends the node directory instead of prepending it", () => {
  const withNode = dirWithNode();
  const empty = dirWithoutNode();
  const env = { PATH: [empty, "/usr/bin"].join(delimiter) };
  const result = ensureNodeOnPath({ env, fallbackDirs: [withNode], execPath: NO_EXEC });

  assert.deepEqual(result, { ok: true, added: withNode });
  assert.equal(env.PATH, [empty, "/usr/bin", withNode].join(delimiter));
});

test("leaves a PATH that already resolves node untouched, and is idempotent", () => {
  const env = { PATH: dirWithoutNode() };
  ensureNodeOnPath({ env, fallbackDirs: [dirWithNode()], execPath: NO_EXEC });
  const after = env.PATH;
  const second = ensureNodeOnPath({ env, fallbackDirs: [dirWithNode()], execPath: NO_EXEC });

  assert.deepEqual(second, { ok: true, added: null });
  assert.equal(env.PATH, after);
});

test("reports ok:false and keeps PATH when no candidate holds an executable node", () => {
  const nonExec = dirWithNode(0o644);
  assert.equal(hasNode(nonExec), false);
  const env = { PATH: dirWithoutNode() };
  const original = env.PATH;
  const result = ensureNodeOnPath({ env, fallbackDirs: [dirWithoutNode(), nonExec], execPath: NO_EXEC });

  assert.deepEqual(result, { ok: false, added: null });
  assert.equal(env.PATH, original);
});

test("HINDSIGHT_NODE_BIN wins over the built-in fallbacks", () => {
  const explicit = dirWithNode();
  const env = { PATH: dirWithoutNode(), HINDSIGHT_NODE_BIN: path.join(explicit, "node") };
  const result = ensureNodeOnPath({ env, fallbackDirs: [dirWithNode()], execPath: NO_EXEC });

  assert.equal(result.added, explicit);
});
