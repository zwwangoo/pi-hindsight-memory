// Per-session transcript accumulator for the PI-Desktop host.
//
// Why this exists: upstream's agent_end write-back wants the WHOLE session (sessionManager.getBranch()
// entries). PI-Desktop stubs getBranch() -> [] and only gives agent_end the messages of the run that
// just finished (`event.messages` = agent-core `newMessages`). Writing back just that run makes
// upstream's planRetain see a non-continuing transcript and `replace` the server document
// `conversation:<session>` every turn: earlier runs' memories are deleted and re-extracted, i.e.
// data loss plus wasted LLM calls (docs/compatibility.md §2).
//
// The store remembers every run's messages per session, so the wrapper can hand upstream the full
// branch and upstream's cursor can `append` only what is new.
//
// Only what upstream's renderMessage reads is kept (user/assistant text, and for tool calls the
// name plus the one target argument actionLine prints), so entries stay tiny. Entries are mirrored
// to <dir>/<session>.jsonl so a restarted host process can rebuild the transcript instead of
// replacing the server document with a partial one.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Keep in sync with TARGET_KEYS / ACTION_TARGET_CAP in vendor/hindsight-pi.mjs (actionLine).
const TARGET_KEYS = ["file_path", "path", "notebook_path", "command", "pattern", "query", "url", "name", "id"];
const ARG_CAP = 300;
const DEFAULT_TTL_DAYS = 30;

export function defaultTranscriptDir() {
  return process.env.HINDSIGHT_PI_TRANSCRIPT_DIR || path.join(os.homedir(), ".hindsight", "pi-desktop-transcripts");
}

function compactArgs(args) {
  if (typeof args === "string") return args.trim().split("\n")[0].slice(0, ARG_CAP);
  if (!args || typeof args !== "object") return undefined;
  for (const k of TARGET_KEYS) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return { [k]: v.trim().split("\n")[0].slice(0, ARG_CAP) };
  }
  return undefined;
}

/** Reduce a host message to what upstream renders; null when it contributes nothing. */
export function compactMessage(m) {
  if (!m || typeof m !== "object") return null;
  if (m.role !== "user" && m.role !== "assistant") return null;
  if (typeof m.content === "string") return m.content.trim() ? { role: m.role, content: m.content } : null;
  if (!Array.isArray(m.content)) return null;
  const parts = [];
  for (const p of m.content) {
    if (!p || typeof p !== "object") continue;
    if (p.type === "text" && typeof p.text === "string" && p.text.trim()) {
      parts.push({ type: "text", text: p.text });
    } else if (p.type === "toolCall" && typeof p.name === "string") {
      const args = compactArgs(p.arguments);
      parts.push(args === undefined ? { type: "toolCall", name: p.name } : { type: "toolCall", name: p.name, arguments: args });
    }
  }
  return parts.length ? { role: m.role, content: parts } : null;
}

function toIso(ts) {
  const d = typeof ts === "number" || typeof ts === "string" ? new Date(ts) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function safeName(sessionId) {
  return String(sessionId).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);
}

export function createTranscriptStore({ dir = defaultTranscriptDir(), ttlDays = DEFAULT_TTL_DAYS } = {}) {
  const sessions = new Map();
  let dirReady = false;
  let pruned = false;

  const fileFor = (sessionId) => path.join(dir, `${safeName(sessionId)}.jsonl`);

  function ensureDir() {
    if (dirReady) return true;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      dirReady = true;
    } catch {
      /* disk is optional: the in-memory transcript still works for the life of the process */
    }
    return dirReady;
  }

  function pruneOld() {
    if (pruned) return;
    pruned = true;
    try {
      const cutoff = Date.now() - ttlDays * 86400_000;
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".jsonl")) continue;
        const file = path.join(dir, name);
        if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
      }
    } catch {
      /* best effort */
    }
  }

  function load(sessionId) {
    let cached = sessions.get(sessionId);
    if (cached) return cached;
    cached = [];
    try {
      for (const line of fs.readFileSync(fileFor(sessionId), "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry && entry.type === "message" && entry.message) cached.push(entry);
        } catch {
          /* a torn last line from a crash: skip it */
        }
      }
    } catch {
      /* no file yet */
    }
    sessions.set(sessionId, cached);
    return cached;
  }

  return {
    /**
     * Record one run's messages and return the session's full branch, in the entry shape upstream's
     * readPiEntries expects. The returned array is a snapshot.
     */
    append(sessionId, messages) {
      if (!sessionId) return [];
      const entries = load(sessionId);
      const fresh = [];
      for (const m of Array.isArray(messages) ? messages : []) {
        const message = compactMessage(m);
        if (message) fresh.push({ type: "message", timestamp: toIso(m.timestamp), message });
      }
      if (fresh.length) {
        entries.push(...fresh);
        if (ensureDir()) {
          pruneOld();
          try {
            fs.appendFileSync(fileFor(sessionId), fresh.map((e) => `${JSON.stringify(e)}\n`).join(""), { mode: 0o600 });
          } catch {
            /* keep going from memory */
          }
        }
      }
      return entries.slice();
    },
  };
}
