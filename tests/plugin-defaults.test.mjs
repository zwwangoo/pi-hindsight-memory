// Plugin defaults that differ from upstream's (today: the knowledge-page refresh schedule).
//
// The decisive check drives the REAL vendored deepen engine against a fake Hindsight server and
// reads the cron it sends for each knowledge page, so it proves upstream's actual precedence
// (env < coding-agent.json) rather than our reading of it. Everything is isolated in a temp HOME.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { applyPluginDefaults } from "../src/plugin-defaults.mjs";
import { FIELD_BY_KEY } from "../src/panel/fields.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PAGES = ["Component map", "Core concepts", "Conventions and patterns", "Key decisions and rationale", "Initiatives and enhancements"];

test("page refresh defaults to once a day, not upstream's hourly", () => {
  const f = FIELD_BY_KEY.get("pageTriggerCron");
  assert.equal(f.default, "H H * * *");
  assert.equal(f.env, "HINDSIGHT_PAGE_TRIGGER_CRON");
  assert.equal(FIELD_BY_KEY.get("pageTriggerType").default, "cron");
});

test("applyPluginDefaults fills only holes and reports what it set", () => {
  const env = {};
  assert.deepEqual(applyPluginDefaults(env), { HINDSIGHT_PAGE_TRIGGER_CRON: "H H * * *" });
  assert.equal(env.HINDSIGHT_PAGE_TRIGGER_CRON, "H H * * *");

  const mine = { HINDSIGHT_PAGE_TRIGGER_CRON: "5 4 * * *" };
  assert.deepEqual(applyPluginDefaults(mine), {});
  assert.equal(mine.HINDSIGHT_PAGE_TRIGGER_CRON, "5 4 * * *", "an explicit env var is never overwritten");

  const blank = { HINDSIGHT_PAGE_TRIGGER_CRON: "  " };
  applyPluginDefaults(blank);
  assert.equal(blank.HINDSIGHT_PAGE_TRIGGER_CRON, "H H * * *", "blank counts as unset, as upstream treats it");
});

// ---- real upstream, fake server -------------------------------------------------------------

async function pageCrons(configExtra) {
  const patches = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method !== "GET") patches.push({ method: req.method, url: req.url, body });
      const tree = {
        roots: PAGES.map((name, i) => ({
          id: `kp-${i}`,
          kind: "page",
          name,
          description: "d",
          mental_model_id: `mm-${i}`,
          tags: ["knowledge:x"],
          // An existing hourly page on the server: deepen must decide whether to re-sync it.
          trigger: { refresh_cron: "1 * * * *", refresh_after_consolidation: false, tags_match: "all", mode: "delta" },
          children: [],
        })),
      };
      const out = req.url.endsWith("/version") ? { api_version: "1.0.0" } : req.url.includes("knowledge-base/tree") ? tree : { items: [], roots: [], total: 0 };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "hindsight-defaults-"));
  const cfgFile = path.join(home, "coding-agent.json");
  fs.writeFileSync(cfgFile, JSON.stringify({ serverMode: "self-hosted", apiUrl: url, apiToken: "t", bankId: "probe", codebaseSurvey: false, autoUpdate: false, ...configExtra }));
  const env = {
    ...process.env,
    HOME: home,
    HINDSIGHT_CONFIG: cfgFile,
    HINDSIGHT_LOG_FILE: path.join(home, "log"),
    HINDSIGHT_DIAG_FILE: path.join(home, "diag"),
  };
  delete env.HINDSIGHT_PAGE_TRIGGER_CRON;
  delete env.HINDSIGHT_PAGE_TRIGGER_TYPE;
  applyPluginDefaults(env); // what src/index.mjs does at load, before upstream resolves config

  await new Promise((resolve) => {
    // async spawn: the fake server lives in this process, so a sync spawn would deadlock it.
    const child = spawn(process.execPath, ["vendor/deepen.js", "--repo", ROOT, "--harness", "pi"], { cwd: ROOT, env, stdio: "ignore" });
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  server.close();
  return patches.flatMap((p) => p.body.match(/"refresh_cron":"([^"]*)"/g) ?? []).map((m) => m.slice(16, -1));
}

test("upstream deepen: no cron in coding-agent.json -> pages are re-synced to once a day", async () => {
  const crons = await pageCrons({});
  assert.equal(crons.length, PAGES.length, `expected one patch per page, got ${JSON.stringify(crons)}`);
  for (const c of crons) {
    const [min, hour, dom, mon, dow] = c.split(" ");
    assert.ok(/^\d+$/.test(min) && /^\d+$/.test(hour), `daily cron with a fixed hour, got "${c}"`);
    assert.deepEqual([dom, mon, dow], ["*", "*", "*"]);
  }
});

test("upstream deepen: a cron saved in coding-agent.json wins over the plugin default", async () => {
  assert.deepEqual(await pageCrons({ pageTriggerCron: "7 3 * * 1" }), Array(PAGES.length).fill("7 3 * * 1"));
  const hourly = await pageCrons({ pageTriggerCron: "H * * * *" });
  assert.equal(hourly.length, PAGES.length);
  for (const c of hourly) assert.ok(/^\d+ \* \* \* \*$/.test(c), `explicit hourly stays hourly, got "${c}"`);
});

test("upstream deepen: manual trigger sends no cron", async () => {
  assert.deepEqual(await pageCrons({ pageTriggerType: "manual" }), []);
});
