// PI-Desktop wrapper for the official Hindsight pi extension (vendor/hindsight-pi.mjs, unmodified).
//
// Two host adaptations, both applied before the upstream factory runs:
//   1. PATH: upstream spawns a bare `node` for background seeding/deepening, and PI-Desktop's
//      GUI-launched PATH has no node. See src/node-path.mjs.
//   2. getBranch: PI-Desktop stubs ctx.sessionManager.getBranch() -> [], and Hindsight treats any
//      array as "use the branch", so agent_end would write back 0 turns. Hiding getBranch makes
//      Hindsight fall back to event.messages, which PI-Desktop does populate.
import hindsight from "../vendor/hindsight-pi.mjs";
import { ensureNodeOnPath } from "./node-path.mjs";

// Module load precedes the factory call that triggers the first background seed.
export const nodePathStatus = ensureNodeOnPath();
if (!nodePathStatus.ok) {
  console.warn(
    "[hindsight] 未找到可执行的 node，后台播种/加深会被上游静默跳过。" +
      "请把 node 所在目录加入 PI-Desktop 的 PATH，或设置 HINDSIGHT_NODE_BIN 指向 node 可执行文件。",
  );
}

function patchCtx(ctx) {
  if (!ctx || typeof ctx !== "object" || !ctx.sessionManager) return ctx;
  const sm = { ...ctx.sessionManager, getBranch: undefined };
  return new Proxy(ctx, { get: (t, k, r) => (k === "sessionManager" ? sm : Reflect.get(t, k, r)) });
}

export default function hindsightForPiDesktop(pi) {
  const api = new Proxy(pi, {
    get(target, key, recv) {
      if (key === "on") {
        return (event, handler) => target.on(event, (ev, ctx) => handler(ev, patchCtx(ctx)));
      }
      const v = Reflect.get(target, key, recv);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return hindsight(api);
}
