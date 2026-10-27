import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FIELDS, FIELD_BY_KEY, coercePatch, coerceField, fieldDefaults, FieldError } from "../src/panel/fields.mjs";
import { readConfig, saveConfig, resolveConnection, configPath } from "../src/panel/config.mjs";
import { PanelError, maskSecret, scrub } from "../src/panel/errors.mjs";

function tempConfigFile(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hindsight-panel-"));
  const file = path.join(dir, "coding-agent.json");
  if (contents !== undefined) fs.writeFileSync(file, contents);
  process.env.HINDSIGHT_CONFIG = file;
  return { dir, file };
}

const SAMPLE = {
  serverMode: "self-hosted",
  apiUrl: "https://hindsight.test:1213",
  bankId: "test-bank",
  autoInject: "pages",
  codebaseSurvey: false,
  apiToken: "test-token-0123456789abcdef",
  harness: { pi: { foo: 1 } },
};

// --- fields -------------------------------------------------------------------------------

test("every field has a default and a bilingual label", () => {
  for (const field of FIELDS) {
    assert.ok(field.key, "field without key");
    assert.ok(field.group, `${field.key} without group`);
    assert.ok("default" in field, `${field.key} without default`);
    assert.ok(field.label.en && field.label["zh-CN"], `${field.key} missing bilingual label`);
    assert.ok(field.help.en && field.help["zh-CN"], `${field.key} missing bilingual help`);
  }
  assert.equal(FIELD_BY_KEY.size, FIELDS.length, "duplicate field keys");
});

test("coerceField validates url, enum and number ranges", () => {
  const url = FIELD_BY_KEY.get("apiUrl");
  assert.equal(coerceField(url, "https://a.example.com///"), "https://a.example.com");
  assert.throws(() => coerceField(url, "ftp://a.example.com"), FieldError);

  const mode = FIELD_BY_KEY.get("autoInject");
  assert.equal(coerceField(mode, "pages"), "pages");
  assert.throws(() => coerceField(mode, "bogus"), FieldError);

  const timeout = FIELD_BY_KEY.get("injectTimeoutMs");
  assert.equal(coerceField(timeout, "9000"), 9000);
  assert.throws(() => coerceField(timeout, 0), FieldError);
  assert.throws(() => coerceField(timeout, 1000.5), FieldError);

  const bankId = FIELD_BY_KEY.get("bankId");
  assert.equal(coerceField(bankId, "test-bank"), "test-bank");
  assert.equal(coerceField(bankId, ""), "");
  assert.throws(() => coerceField(bankId, "bad/bank"), FieldError);
});

test("coercePatch rejects unknown keys instead of writing them", () => {
  const { values, errors } = coercePatch({ autoInject: "pages", nope: 1 });
  assert.deepEqual(values, { autoInject: "pages" });
  assert.equal(errors.nope, "unknown field");
});

// --- config read --------------------------------------------------------------------------

test("missing file reads as defaults with a create-on-save hint", () => {
  tempConfigFile(undefined);
  const view = readConfig();
  assert.equal(view.exists, false);
  assert.equal(view.parseError, null);
  assert.deepEqual(view.values, fieldDefaults());
  assert.ok(Object.values(view.sources).every((s) => s === "default"));
  assert.deepEqual(view.unknownKeys, []);
  assert.equal(view.fields.length, FIELDS.length);
  assert.ok(view.groups.length >= 4);
});

test("token is masked in the view payload", () => {
  tempConfigFile(JSON.stringify(SAMPLE));
  const view = readConfig();
  assert.notEqual(view.values.apiToken, SAMPLE.apiToken);
  assert.equal(view.values.apiToken, maskSecret(SAMPLE.apiToken));
  assert.equal(view.sources.apiToken, "file");
  assert.deepEqual(view.unknownKeys, ["harness"]);
});

test("broken JSON downgrades to a read-only parseError", () => {
  const { file } = tempConfigFile("{ not json ");
  const view = readConfig();
  assert.equal(view.exists, true);
  assert.match(view.parseError, /不是合法 JSON/);
  const before = fs.readFileSync(file, "utf8");
  assert.throws(
    () => saveConfig({ autoInject: "pages" }),
    (e) => e instanceof PanelError && e.code === "INVALID_CONFIG",
  );
  assert.equal(fs.readFileSync(file, "utf8"), before, "file must not be touched");
});

// --- config save --------------------------------------------------------------------------

test("save keeps unknown keys and original key order, and writes a backup", () => {
  const { file } = tempConfigFile(JSON.stringify(SAMPLE, null, 2));
  const before = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = saveConfig({ autoInject: "recall", injectTimeoutMs: 12000 });

  const after = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(after.autoInject, "recall");
  assert.equal(after.injectTimeoutMs, 12000);
  assert.deepEqual(after.harness, before.harness, "unknown key preserved");
  assert.deepEqual(Object.keys(after).slice(0, Object.keys(before).length), Object.keys(before), "key order preserved");
  assert.equal(after.apiToken, SAMPLE.apiToken, "token untouched when not in patch");

  assert.ok(result.backupPath && fs.existsSync(result.backupPath), "backup written");
  assert.deepEqual(JSON.parse(fs.readFileSync(result.backupPath, "utf8")), before, "backup is the previous content");
  assert.equal(result.values.autoInject, "recall");
  assert.equal(result.sources.injectTimeoutMs, "file");

  // mode 600 and no temp files left behind
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const leftovers = fs.readdirSync(path.dirname(file)).filter((n) => n.includes(".tmp"));
  assert.deepEqual(leftovers, []);
  assert.equal(configPath(), file);
});

test("echoing the mask back never rewrites the token", () => {
  const { file } = tempConfigFile(JSON.stringify(SAMPLE));
  const view = readConfig();
  saveConfig({ apiToken: view.values.apiToken, autoInject: "pages" });
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).apiToken, SAMPLE.apiToken);
});

test("an empty token clears it, a new token replaces it", () => {
  const { file } = tempConfigFile(JSON.stringify(SAMPLE));
  readConfig();
  saveConfig({ apiToken: "new-token-123456" });
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).apiToken, "new-token-123456");
  readConfig();
  saveConfig({ apiToken: "" });
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).apiToken, "");
});

test("invalid values are rejected per field and nothing is written", () => {
  const { file } = tempConfigFile(JSON.stringify(SAMPLE));
  const before = fs.readFileSync(file, "utf8");
  assert.throws(
    () => saveConfig({ apiUrl: "ftp://bad", autoInject: "bogus" }),
    (e) => {
      assert.equal(e.code, "INVALID_CONFIG");
      assert.ok(e.fields.apiUrl, "apiUrl error surfaced");
      assert.ok(e.fields.autoInject, "autoInject error surfaced");
      return true;
    },
  );
  assert.equal(fs.readFileSync(file, "utf8"), before);
});

test("saving into a missing file creates it with defaults applied", () => {
  const { file } = tempConfigFile(undefined);
  const result = saveConfig({ bankId: "test-bank" });
  assert.equal(result.backupPath, null);
  const written = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(written, { bankId: "test-bank" });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test("resolveConnection needs an explicit bankId", () => {
  tempConfigFile(JSON.stringify({ ...SAMPLE, bankId: "" }));
  assert.throws(
    () => resolveConnection(),
    (e) => e.code === "INVALID_CONFIG" && /bankId/.test(e.message),
  );
});

test("scrub removes secrets from arbitrary text", () => {
  const secret = "test-token-0123";
  assert.ok(!scrub(`boom ${secret} oops`, secret).includes(secret));
  assert.equal(scrub("x".repeat(400)).length, 301);
});

// --- field semantics verified against upstream resolveConfig --------------------------------

test("autoUpdate is no longer a field but an existing key survives a save", () => {
  assert.equal(FIELD_BY_KEY.has("autoUpdate"), false, "autoUpdate must not be editable");

  const { file } = tempConfigFile(JSON.stringify({ ...SAMPLE, autoUpdate: false }, null, 2));
  const view = readConfig();
  assert.ok(view.unknownKeys.includes("autoUpdate"), "reported as an unknown key");
  assert.equal("autoUpdate" in view.values, false);

  // A patch touching it is rejected like any other unknown key ...
  const { errors } = coercePatch({ autoUpdate: true });
  assert.equal(errors.autoUpdate, "unknown field");

  // ... while saving something else leaves the key byte-identical (merge, not rebuild).
  saveConfig({ autoInject: "recall" });
  const after = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(after.autoUpdate, false);
  assert.equal(after.autoInject, "recall");
  assert.deepEqual(Object.keys(after), [...Object.keys(SAMPLE), "autoUpdate"], "key order preserved");
});

test("numeric mins mirror upstream falsy-defaults", () => {
  // upstream: raw.pageRefreshEveryTurns || 1 -> 0 behaves as 1, so 0 is rejected.
  assert.throws(() => coerceField(FIELD_BY_KEY.get("pageRefreshEveryTurns"), 0), FieldError);
  assert.equal(coerceField(FIELD_BY_KEY.get("pageRefreshEveryTurns"), 1), 1);

  // upstream: raw.seedLimit || 300 -> 0 means 300, so 0 is rejected.
  assert.throws(() => coerceField(FIELD_BY_KEY.get("seedLimit"), 0), FieldError);
  assert.equal(coerceField(FIELD_BY_KEY.get("seedLimit"), 1), 1);

  // upstream: raw.surveyRefreshCommits ?? 20, and the refresh only runs when > 0 -> 0 is legal.
  assert.equal(coerceField(FIELD_BY_KEY.get("surveyRefreshCommits"), 0), 0);
  assert.throws(() => coerceField(FIELD_BY_KEY.get("surveyRefreshCommits"), -1), FieldError);
});

test("saving surveyRefreshCommits=0 is accepted and recorded", () => {
  const { file } = tempConfigFile(JSON.stringify(SAMPLE));
  const result = saveConfig({ surveyRefreshCommits: 0 });
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).surveyRefreshCommits, 0);
  assert.equal(result.values.surveyRefreshCommits, 0);
  assert.equal(result.sources.surveyRefreshCommits, "file");
});

test("dependsOn metadata is declared for the conditional fields", () => {
  const dep = (key) => FIELD_BY_KEY.get(key).dependsOn;

  assert.deepEqual(dep("reflectTimeoutMs"), { key: "autoInject", in: ["reflect"] });
  assert.deepEqual(dep("injectTimeoutMs"), { key: "autoInject", in: ["pages", "recall", "reflect"] });
  assert.deepEqual(dep("surveyModel"), { key: "codebaseSurvey", in: [true] });
  assert.deepEqual(dep("surveyRefreshCommits"), { key: "codebaseSurvey", in: [true] });
  assert.deepEqual(dep("apiUrl"), { key: "serverMode", in: ["self-hosted", "cloud"] });

  // Every dependency must point at a real field, otherwise the view can never enable it.
  for (const field of FIELDS) {
    if (!field.dependsOn) continue;
    assert.ok(FIELD_BY_KEY.has(field.dependsOn.key), `${field.key} depends on unknown ${field.dependsOn.key}`);
  }

});

test("an inactive field's value is still validated but never rejected for being inactive", () => {
  const { file } = tempConfigFile(JSON.stringify({ ...SAMPLE, autoInject: "none" }));
  // autoInject=none makes reflectTimeoutMs inactive; saving it anyway must work.
  saveConfig({ reflectTimeoutMs: 45000 });
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).reflectTimeoutMs, 45000);
  // ...but its own range still applies.
  assert.throws(
    () => saveConfig({ reflectTimeoutMs: 0 }),
    (e) => e.code === "INVALID_CONFIG" && Boolean(e.fields.reflectTimeoutMs),
  );
});

test("optInOnly needs a non-empty optInPaths in the file", () => {
  const { file } = tempConfigFile(JSON.stringify(SAMPLE));
  const before = fs.readFileSync(file, "utf8");
  assert.throws(
    () => saveConfig({ optInOnly: true }),
    (e) => {
      assert.equal(e.code, "INVALID_CONFIG");
      assert.ok(e.fields.optInOnly, "error is attached to the optInOnly field");
      assert.match(e.fields.optInOnly, /optInPaths/);
      return true;
    },
  );
  assert.equal(fs.readFileSync(file, "utf8"), before, "nothing written");

  // An empty / non-string array counts as "no paths".
  tempConfigFile(JSON.stringify({ ...SAMPLE, optInPaths: ["  ", 42] }));
  assert.throws(
    () => saveConfig({ optInOnly: true }),
    (e) => e.code === "INVALID_CONFIG" && Boolean(e.fields.optInOnly),
  );

  // With a real path the same patch goes through.
  const { file: withPaths } = tempConfigFile(JSON.stringify({ ...SAMPLE, optInPaths: ["/repo"] }));
  saveConfig({ optInOnly: true });
  const after = JSON.parse(fs.readFileSync(withPaths, "utf8"));
  assert.equal(after.optInOnly, true);
  assert.deepEqual(after.optInPaths, ["/repo"]);
  // Turning it off is always allowed.
  saveConfig({ optInOnly: false });
  assert.equal(JSON.parse(fs.readFileSync(withPaths, "utf8")).optInOnly, false);
});

test("a pre-existing broken optInOnly does not block unrelated saves", () => {
  const { file } = tempConfigFile(JSON.stringify({ ...SAMPLE, optInOnly: true }));
  saveConfig({ bankId: "test-bank" });
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).bankId, "test-bank");
});
