// Local, incremental aggregate of the call-level LLM trace (per model, per UTC hour).
//
// Hindsight can only list traced calls one by one, each carrying its full prompt and answer
// (~45 KB a call, ~20 MB per 500), so re-reading the window on every view takes 5–11 s. Calls never
// change once finished, so the panel reads them once, keeps only the numbers, and afterwards fetches
// just what is newer than a watermark. No prompt or answer text is ever written to disk.

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { configPath } from "./config.mjs";

const MAX_BANKS = 5;
const VERSION = 1;

export function usageCachePath() {
  return process.env.HINDSIGHT_USAGE_CACHE || path.join(path.dirname(configPath()), "pi-desktop-llm-usage.json");
}

export function emptyEntry() {
  return { watermark: null, ids: {}, from: null, hours: {}, updatedAt: 0 };
}

function readFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(usageCachePath(), "utf8"));
    return parsed?.version === VERSION && parsed.banks && typeof parsed.banks === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function validEntry(entry) {
  return (
    entry &&
    typeof entry === "object" &&
    (entry.watermark === null || typeof entry.watermark === "string") &&
    entry.ids && typeof entry.ids === "object" &&
    entry.hours && typeof entry.hours === "object"
  );
}

/** A corrupt or foreign file is treated as "no cache": the next sync simply rebuilds it. */
export function loadEntry(key) {
  const entry = readFile()?.banks?.[key];
  return validEntry(entry) ? { ...emptyEntry(), ...entry } : emptyEntry();
}

export function saveEntry(key, entry) {
  const file = readFile() ?? { version: VERSION, banks: {} };
  file.banks[key] = entry;
  const keys = Object.keys(file.banks);
  if (keys.length > MAX_BANKS) {
    keys
      .sort((a, b) => (file.banks[a].updatedAt || 0) - (file.banks[b].updatedAt || 0))
      .slice(0, keys.length - MAX_BANKS)
      .forEach((stale) => delete file.banks[stale]);
  }
  const target = usageCachePath();
  const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(file), "utf8");
    fs.renameSync(tmp, target);
  } catch {
    // The cache is an optimisation: a read-only home must not break the panel.
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
  }
}
