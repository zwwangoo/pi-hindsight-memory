"use strict";

// PI-Desktop plugin entry. The agent-facing behaviour lives in src/index.mjs (contributes.
// agentExtensions); this file serves the panel (docked view + standalone window) through
// `onPanelInvoke`, forwarding each channel to the panel backend modules.
//
// Channel contract: README.md (配置面板 section).
// Everything returns {ok:true, ...} or {ok:false, error:{code,message,hint?,fields?,retryAfterMs?}}.

let modulesPromise = null;

function loadModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("./src/panel/config.mjs"),
      import("./src/panel/bank.mjs"),
      import("./src/panel/errors.mjs"),
    ]).then(([config, bank, errors]) => ({ config, bank, errors }));
  }
  return modulesPromise;
}

const HANDLERS = {
  "hindsight.config.read": ({ config }) => config.readConfig(),
  "hindsight.config.save": ({ config }, payload) => config.saveConfig(payload && payload.patch),
  "hindsight.bank.status": ({ bank }) => bank.status(),
  "hindsight.bank.pages": ({ bank }) => bank.listPages(),
  "hindsight.bank.search": ({ bank }, payload) => bank.search(payload && payload.query, payload && payload.limit),
  "hindsight.bank.read": ({ bank }, payload) => bank.readPage(payload && payload.pageId),
  "hindsight.bank.reflect": ({ bank }, payload) => bank.reflect(payload && payload.query, payload && payload.budget),
};

async function onPanelInvoke(channel, payload) {
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, channel) ? HANDLERS[channel] : null;
  if (!handler) {
    return { ok: false, error: { code: "UNSUPPORTED", message: `未知的面板通道：${String(channel)}` } };
  }
  let modules;
  try {
    modules = await loadModules();
    const result = await handler(modules, payload || {});
    return { ok: true, ...(result || {}) };
  } catch (e) {
    if (modules) return modules.errors.toEnvelope(e);
    return { ok: false, error: { code: "INTERNAL", message: String((e && e.message) || e) } };
  }
}

const OPEN_COMMAND = "hindsight-memory.open";

// The standalone window and the docked work-panel tab share views/index.html and this file's
// onPanelInvoke. `pi` is injected by the host; it is absent when the module is loaded by tests.
async function onLoad() {
  if (typeof pi === "undefined") return;
  await pi.commands.register({
    id: OPEN_COMMAND,
    title: "Hindsight Memory: Open panel / Hindsight 记忆：打开面板",
    run: () => pi.ui.openPanel({ title: "Hindsight Memory" }),
  });
}

async function onUnload() {
  if (typeof pi === "undefined") return;
  await pi.commands.unregister(OPEN_COMMAND);
}

module.exports = { onLoad, onUnload, onPanelInvoke };
