// Make `node` resolvable for the background children the vendored extension spawns.
//
// PI-Desktop is launched from a GUI session, so the plugin host inherits
// PATH=/usr/bin:/bin:/usr/sbin:/sbin, which usually has no `node` (Homebrew installs to
// /opt/homebrew/bin). Upstream shells out to a bare `node` for the background seed/deepen engine
// (vendor/hindsight-pi.mjs startBackgroundSeed) and the daemon starter, and swallows the spawn
// error — so without this, git history is never ingested and the bank never reports `synced`.
//
// Fix: when PATH has no executable `node`, append the first directory that does. Appending (not
// prepending) keeps the host's own resolution authoritative; we only fill a hole.

import { accessSync, constants } from "node:fs";
import { delimiter, dirname, join } from "node:path";

/** Conventional install locations, in preference order. */
export const FALLBACK_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"];

/** True when `dir` holds an executable `node` (a dangling symlink does not count). */
export function hasNode(dir) {
  try {
    accessSync(join(dir, "node"), constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Append a node directory to `env.PATH` if needed. Candidates: $HINDSIGHT_NODE_BIN's directory,
 * the directory of the running executable (plain-node runs), then FALLBACK_DIRS.
 * Returns { ok, added } — `added` is the appended directory, or null when nothing changed.
 */
export function ensureNodeOnPath({ env = process.env, execPath = process.execPath, fallbackDirs = FALLBACK_DIRS } = {}) {
  const parts = (typeof env.PATH === "string" ? env.PATH : "").split(delimiter).filter(Boolean);
  if (parts.some(hasNode)) return { ok: true, added: null };

  const candidates = [env.HINDSIGHT_NODE_BIN && dirname(env.HINDSIGHT_NODE_BIN), dirname(execPath), ...fallbackDirs];
  const dir = candidates.find((d) => d && hasNode(d));
  if (!dir) return { ok: false, added: null };

  env.PATH = [...parts, dir].join(delimiter);
  return { ok: true, added: dir };
}
