// Plugin-level defaults that differ from upstream's, applied as the LOWEST-priority config layer.
//
// Upstream resolves config as: environment variables -> ~/.hindsight/coding-agent.json (-> harness
// section), later layers overriding earlier ones (vendor/hindsight-pi.mjs loadConfig). So exporting
// a default as an env var only fills a hole: any value the user saved in coding-agent.json (or set
// as a real env var) still wins. process.env is inherited by the background deepen child, which
// reads the same variables, so the pages that deepen syncs to the server get the same schedule.
//
// A field opts in with `env` (the upstream variable) in src/panel/fields.mjs; its `default` is the
// plugin default, shown by the panel as "default" and applied here.

import { FIELDS } from "./panel/fields.mjs";

/** Set plugin defaults on `env` where the user has not. Returns the variables it set. */
export function applyPluginDefaults(env = process.env) {
  const applied = {};
  for (const field of FIELDS) {
    if (!field.env) continue;
    const current = env[field.env];
    if (current !== undefined && String(current).trim() !== "") continue;
    env[field.env] = String(field.default);
    applied[field.env] = String(field.default);
  }
  return applied;
}
