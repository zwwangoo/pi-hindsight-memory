// PI-Desktop wrapper for the official Hindsight pi extension (vendor/hindsight-pi.mjs, unmodified).
//
// Two host adaptations, both applied before the upstream factory runs:
//   1. PATH: upstream spawns a bare `node` for background seeding/deepening, and PI-Desktop's
//      GUI-launched PATH has no node. See src/node-path.mjs.
//   2. Transcript: PI-Desktop stubs ctx.sessionManager.getBranch() -> [] (a truthy, empty "branch")
//      and gives agent_end only the messages of the run that just ended. Passing either through
//      makes upstream write back nothing (empty branch) or replace the server document with the
//      last run alone (event.messages), losing every earlier run. So the wrapper accumulates each
//      session's runs (src/transcript-store.mjs) and answers getBranch() on agent_end with the full
//      transcript; upstream's cursor then appends only what is new. Every other event sees
//      getBranch undefined, which upstream treats as "no branch".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import hindsight from "../vendor/hindsight-pi.mjs";
import { ensureNodeOnPath } from "./node-path.mjs";
import { applyPluginDefaults } from "./plugin-defaults.mjs";
import { createTranscriptStore } from "./transcript-store.mjs";

// Plugin defaults must be in process.env before the upstream factory resolves its config (and
// before it spawns the deepen child, which inherits them). See src/plugin-defaults.mjs.
applyPluginDefaults();

// Module load precedes the factory call that triggers the first background seed.
export const nodePathStatus = ensureNodeOnPath();
if (!nodePathStatus.ok) {
  console.warn(
    "[hindsight] 未找到可执行的 node，后台播种/加深会被上游静默跳过。" +
      "请把 node 所在目录加入 PI-Desktop 的 PATH，或设置 HINDSIGHT_NODE_BIN 指向 node 可执行文件。",
  );
}

const defaultStore = createTranscriptStore();

function withBranch(ctx, getBranch) {
  if (!ctx || typeof ctx !== "object" || !ctx.sessionManager) return ctx;
  const sm = { ...ctx.sessionManager, getBranch };
  return new Proxy(ctx, { get: (t, k, r) => (k === "sessionManager" ? sm : Reflect.get(t, k, r)) });
}

/** True when write-back is off, so no transcript should be kept on disk. Same parsing as upstream. */
function retainSessionsOff() {
  const env = process.env.HINDSIGHT_RETAIN_SESSIONS;
  if (env !== undefined && env.trim() !== "") return !["1", "true", "yes", "on"].includes(env.trim().toLowerCase());
  try {
    const file = process.env.HINDSIGHT_CONFIG || path.join(os.homedir(), ".hindsight", "coding-agent.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return (raw?.harnesses?.pi?.retainSessions ?? raw?.retainSessions) === false;
  } catch {
    return false;
  }
}

/**
 * Wrap `pi` so the upstream factory sees a host that exposes the session transcript.
 *
 * getBranch is lazy and evaluated once per event: upstream only calls it when the workspace is
 * enabled, so a disabled workspace (or retainSessions off) never records anything, and a second
 * call can never append the same run twice.
 */
export function adaptForPiDesktop(pi, factory, store = defaultStore) {
  const api = new Proxy(pi, {
    get(target, key, recv) {
      if (key === "on") {
        return (event, handler) =>
          target.on(event, (ev, ctx) => {
            if (event !== "agent_end") return handler(ev, withBranch(ctx, undefined));
            let done = false;
            let branch;
            const getBranch = () => {
              if (done) return branch;
              done = true;
              try {
                const sid = ctx?.sessionManager?.getSessionId?.();
                if (sid && !retainSessionsOff()) {
                  const entries = store.append(sid, ev?.messages);
                  if (entries.length) branch = entries;
                }
              } catch {
                /* branch stays undefined: upstream falls back to event.messages (lossy, never blocks) */
              }
              return branch;
            };
            return handler(ev, withBranch(ctx, getBranch));
          });
      }
      const v = Reflect.get(target, key, recv);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return factory(api);
}

export default function hindsightForPiDesktop(pi) {
  return adaptForPiDesktop(pi, hindsight);
}
