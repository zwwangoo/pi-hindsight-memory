/*
 * Hindsight Memory — right work-panel view.
 * Plain ES module. All data comes from window.pluginBridge; no network calls.
 */

const APPEARANCE_CACHE_KEY = "hindsight.panel.appearance.v1";
const DOC_TYPES = ["git", "gitlog", "conversation", "survey", "other"];
const BUDGETS = ["low", "mid", "high"];
const USAGE_PERIODS = ["1d", "7d", "30d"];

const STRINGS = {
  "zh-CN": {
    "app.title": "Hindsight 记忆",
    "status.connecting": "正在连接…",
    "status.online": "已连接",
    "status.offline": "离线",
    "status.error": "连接异常",
    "action.refresh": "刷新",
    "tabs.label": "面板视图",
    "tab.config": "配置",
    "tab.memory": "记忆库",
    "tab.stats": "统计",
    "tab.diagnostics": "诊断",
    "common.retry": "重试",
    "common.save": "保存",
    "common.saving": "保存中…",
    "common.loading": "加载中…",
    "common.undo": "撤销",
    "common.clear": "清除",
    "common.show": "显示",
    "common.on": "开",
    "common.off": "关",
    "common.hide": "隐藏",
    "config.readOnly": "只读（解析失败）",
    "config.pathLabel": "配置文件",
    "config.notFound.title": "配置文件不存在",
    "config.notFound.body": "保存将创建 {path}。",
    "config.parseError.title": "配置文件解析失败，当前只读",
    "config.parseError.body": "保存已禁用。先修复文件，再刷新本面板。",
    "config.unknownKeys": "{n} 个未识别字段已原样保留",
    "config.dirtyOne": "1 项未保存",
    "config.notFound.bar": "文件不存在，保存将创建",
    "config.dirtyMany": "{n} 项未保存",
    "config.noChanges": "无未保存更改",
    "config.refreshBlocked": "先保存或撤销未保存的更改",
    "config.saved.title": "已保存",
    "config.saved.body": "已写入 {path}。新会话或重载插件后生效。",
    "config.saved.toast": "已保存",
    "config.backup": "备份：{path}",
    "config.sourceDefault": "默认值",
    "config.secret.masked": "已保存（掩码）",
    "config.secret.replaced": "保存后将替换现有 token",
    "config.secret.cleared": "保存后将清除 token",
    "config.secret.placeholder": "输入新 token",
    "config.groupFallback": "其他",
    "config.empty": "没有可编辑的字段",
    "config.inactive": "仅在 {cond} 时生效",
    "unit.pages": "页",
    "unit.turns": "轮",
    "unit.parallel": "并发",
    "memory.searchLabel": "搜索记忆",
    "memory.searchPlaceholder": "搜索页面，回车执行",
    "memory.search": "搜索",
    "memory.clearSearch": "清除搜索",
    "memory.readerTitle": "阅读区",
    "memory.pagesTitle": "页面",
    "memory.resultsTitle": "搜索结果",
    "memory.pageCount": "{n} 页",
    "memory.resultsCount": "{n} 条结果",
    "memory.emptyPages.title": "这个 bank 还没有页面",
    "memory.emptyPages.body": "先把会话写回记忆，或让 agent 登记 initiative。",
    "memory.emptySearch.title": "没有匹配「{q}」的结果",
    "memory.emptySearch.body": "换一个更短的关键词，或在诊断里用 reflect 提问。",
    "memory.searchOffline": "离线时无法搜索",
    "memory.readerEmpty.title": "选择一页开始阅读",
    "memory.readerEmpty.body": "页面正文保留原始换行，长文在阅读区内滚动。",
    "memory.updated": "更新于 {date}",
    "memory.emptyBody": "这一页没有正文。",
    "memory.resultsFor": "查询：{q}",
    "diag.statusTitle": "服务端状态",
    "diag.server": "服务端",
    "diag.bank": "Bank",
    "diag.version": "版本",
    "diag.latency": "延迟",
    "diag.pages": "页面数",
    "diag.token": "Token",
    "diag.documents": "文档统计",
    "diag.docTotal": "共 {n}",
    "diag.doc.git": "Git 提交（逐条）",
    "diag.doc.gitlog": "Git 日志（按仓库）",
    "diag.docHint.git": "逐条提交的深化文档（git:<sha>），只有执行过 deepen 才会有，为 0 属正常",
    "diag.docHint.gitlog": "每个仓库一篇的提交历史摘要（gitlog:<仓库>）",
    "diag.docHint.conversation": "已写回的对话记录",
    "diag.docHint.survey": "代码库概览基线",
    "diag.docHint.other": "其他来源（导入、标记等）",
    "diag.docsUnavailable": "文档统计暂时取不到（不是 0 篇）。",
    "diag.operationsUnknown": "抽取状态未知",
    "diag.doc.conversation": "对话",
    "diag.doc.survey": "Codebase survey",
    "diag.doc.other": "其他",
    "diag.total": "合计",
    "diag.operations": "未完成抽取",
    "diag.operationsActive": "{n} 项进行中",
    "diag.operationsNone": "无进行中的任务",
    "diag.offline.title": "服务端不可达",
    "diag.offline.body": "配置页仍可编辑；记忆库、统计与诊断需要连接服务端。",
    "diag.reflectTitle": "Reflect 提问",
    "usage.title": "LLM 用量",
    "models.title": "按模型",
    "models.model": "模型",
    "models.empty": "此周期内没有可按模型统计的调用。",
    "models.partial": "调用明细较多，只统计了 {since} 之后的 {n} 次调用，更早的部分未计入，费用也是部分数据。",
    "models.unsupported": "服务端没有返回调用明细：可能未开启 LLM 请求追踪（HINDSIGHT_API_LLM_TRACE_ENABLED）。",
    "price.title": "单价设置（USD / 每百万 token）",
    "price.input": "输入",
    "price.cached": "缓存命中",
    "price.output": "输出",
    "price.cost": "估算费用",
    "price.estimated": "估算费用",
    "price.unset": "未设单价",
    "price.unpriced": "{n} 个模型未设单价，未计入",
    "price.none": "服务端只返回 token，不返回价格。展开下方「单价设置」，可一键从价格目录填入。",
    "price.help": "单价统一为美元。估算 =（输入−缓存）×输入价 + 缓存×缓存价 + 输出×输出价；缓存价留空则按输入价，推理 token 不另计。结果仅供参考，以供应商账单为准。",
    "price.fill": "从价格目录填入",
    "price.fillHint": "取自 PI-Desktop 使用的 models.dev 目录（美元）；只填空白行，不覆盖你已填的。",
    "price.fillNothing": "没有需要填入的空白模型",
    "price.filled": "已填入 {n} 个模型的单价，点击保存后生效",
    "price.filledMissed": "，另有 {m} 个在目录中找不到",
    "price.filledNone": "目录中没有匹配这些模型，请手动填写",
    "price.save": "保存单价",
    "price.saved": "单价已保存",
    "price.invalid": "有单价不是有效的非负数字",
    "usage.unsupported": "当前服务端暂不支持 LLM 用量统计，或 Bank 尚未创建。升级服务端后即可查看。",
    "usage.period": "统计周期",
    "usage.period.1d": "最近 1 天",
    "usage.period.7d": "最近 7 天",
    "usage.period.30d": "最近 30 天",
    "usage.requests": "请求数",
    "usage.total": "总 token",
    "usage.input": "输入",
    "usage.output": "输出",
    "usage.cached": "缓存",
    "usage.thoughts": "推理",
    "usage.note": "缓存与推理为明细，不另计入总数；— 表示服务端未返回。",
    "usage.empty": "此周期内没有已记录的 LLM 请求（统计依赖服务端的 LLM trace）。",
    "usage.retention": "服务端仅保留最近 {n} 天的记录，此周期的数据可能不完整。",
    "usage.historyDay": "按天分布",
    "usage.historyHour": "按小时分布（本地时区）",
    "usage.time": "时间",
    "usage.status.success": "成功",
    "usage.status.error": "失败",
    "usage.status.pending": "等待中",
    "usage.status.running": "进行中",
    "diag.reflectHelp": "对全量记忆做一次综合推理，通常需要 20–60 秒。",
    "diag.reflectPlaceholder": "例如：这个仓库为什么放弃了 X 方案？",
    "diag.reflectBudget": "预算",
    "diag.reflectSubmit": "提问",
    "diag.reflectThinking": "思考中…",
    "diag.reflectThinkingNote": "正在综合记忆，请保持面板打开。",
    "diag.reflectElapsed": "已用 {s}s",
    "diag.reflectResult": "回答",
    "diag.reflectMeta": "{budget} · {ms}ms",
    "diag.reflectRequired": "先输入问题",
    "diag.reflectAnswerEmpty": "服务端返回了空回答。",
    "diag.budget.low": "低",
    "diag.budget.mid": "中",
    "diag.budget.high": "高",
    "error.unknown": "未知错误",
    "error.bridge": "宿主桥不可用（请在 PI-Desktop 中打开本面板）",
  },
  en: {
    "app.title": "Hindsight Memory",
    "status.connecting": "Connecting…",
    "status.online": "Connected",
    "status.offline": "Offline",
    "status.error": "Connection problem",
    "action.refresh": "Refresh",
    "tabs.label": "Panel views",
    "tab.config": "Config",
    "tab.memory": "Memory",
    "tab.stats": "Stats",
    "tab.diagnostics": "Diagnostics",
    "common.retry": "Retry",
    "common.save": "Save",
    "common.saving": "Saving…",
    "common.loading": "Loading…",
    "common.undo": "Discard",
    "common.clear": "Clear",
    "common.show": "Show",
    "common.hide": "Hide",
    "common.on": "on",
    "common.off": "off",
    "config.readOnly": "Read-only (parse error)",
    "config.pathLabel": "Config file",
    "config.notFound.title": "Config file does not exist",
    "config.notFound.body": "Saving will create {path}.",
    "config.parseError.title": "Config file could not be parsed — read-only",
    "config.parseError.body": "Saving is disabled. Fix the file, then refresh this panel.",
    "config.notFound.bar": "File missing — saving will create it",
    "config.unknownKeys": "{n} unknown keys preserved as-is",
    "config.dirtyOne": "1 unsaved change",
    "config.dirtyMany": "{n} unsaved changes",
    "config.noChanges": "No unsaved changes",
    "config.refreshBlocked": "Save or discard unsaved changes first",
    "config.saved.title": "Saved",
    "config.saved.body": "Written to {path}. Takes effect in a new session or after reloading the plugin.",
    "config.saved.toast": "Saved",
    "config.backup": "Backup: {path}",
    "config.sourceDefault": "Default",
    "config.secret.masked": "Stored (masked)",
    "config.secret.replaced": "Replaces the stored token on save",
    "config.secret.cleared": "Clears the token on save",
    "config.secret.placeholder": "Enter a new token",
    "config.groupFallback": "Other",
    "config.empty": "No editable fields",
    "config.inactive": "Only takes effect when {cond}",
    "unit.pages": "pages",
    "unit.turns": "turns",
    "unit.parallel": "parallel",
    "memory.searchLabel": "Search memory",
    "memory.searchPlaceholder": "Search pages, press Enter",
    "memory.search": "Search",
    "memory.clearSearch": "Clear search",
    "memory.readerTitle": "Reader",
    "memory.pagesTitle": "Pages",
    "memory.resultsTitle": "Results",
    "memory.pageCount": "{n} pages",
    "memory.resultsCount": "{n} results",
    "memory.emptyPages.title": "This bank has no pages yet",
    "memory.emptyPages.body": "Retain a session first, or ask the agent to capture an initiative.",
    "memory.emptySearch.title": "No results for “{q}”",
    "memory.emptySearch.body": "Try a shorter query, or ask reflect in Diagnostics.",
    "memory.searchOffline": "Search unavailable offline",
    "memory.readerEmpty.title": "Select a page to read",
    "memory.readerEmpty.body": "Bodies keep their original line breaks and scroll inside this pane.",
    "memory.updated": "Updated {date}",
    "memory.emptyBody": "This page has no body.",
    "memory.resultsFor": "Query: {q}",
    "diag.statusTitle": "Server status",
    "diag.server": "Server",
    "diag.bank": "Bank",
    "diag.version": "Version",
    "diag.latency": "Latency",
    "diag.pages": "Pages",
    "diag.token": "Token",
    "diag.documents": "Documents",
    "diag.docTotal": "{n} total",
    "diag.doc.git": "Git commits (each)",
    "diag.doc.gitlog": "Git log (per repo)",
    "diag.docHint.git": "Per-commit deepened documents (git:<sha>); only exist after a deepen run, 0 is normal",
    "diag.docHint.gitlog": "One commit-history digest per repository (gitlog:<repo>)",
    "diag.docHint.conversation": "Retained conversation transcripts",
    "diag.docHint.survey": "Codebase survey baselines",
    "diag.docHint.other": "Other sources (imports, markers, …)",
    "diag.docsUnavailable": "Document counts are unavailable right now (this is not 0 documents).",
    "diag.operationsUnknown": "Extraction status unknown",
    "diag.doc.conversation": "Conversations",
    "diag.doc.survey": "Codebase survey",
    "diag.doc.other": "Other",
    "diag.total": "Total",
    "diag.operations": "Pending extractions",
    "diag.operationsActive": "{n} in progress",
    "diag.operationsNone": "None in progress",
    "diag.offline.title": "Server unreachable",
    "diag.offline.body": "You can still edit configuration; memory, stats and diagnostics need the server.",
    "diag.reflectTitle": "Reflect",
    "usage.title": "LLM usage",
    "models.title": "By model",
    "models.model": "Model",
    "models.empty": "No calls to break down by model in this period.",
    "models.partial": "Too many calls to read at once: only the {n} calls since {since} are counted; earlier ones are not, so cost is partial too.",
    "models.unsupported": "The server returned no call details: LLM request tracing may be off (HINDSIGHT_API_LLM_TRACE_ENABLED).",
    "price.title": "Unit prices (USD per 1M tokens)",
    "price.input": "Input",
    "price.cached": "Cache hit",
    "price.output": "Output",
    "price.cost": "Est. cost",
    "price.estimated": "Estimated cost",
    "price.unset": "No price",
    "price.unpriced": "{n} model(s) without a price are not included",
    "price.none": "The server reports tokens, not prices. Open \"Unit prices\" below to fill them from the price catalog.",
    "price.help": "All prices are in USD. Estimate = (input − cached) × input price + cached × cache price + output × output price; an empty cache price uses the input price and reasoning tokens are not billed separately. For reference only — the provider's bill is authoritative.",
    "price.fill": "Fill from price catalog",
    "price.fillHint": "From the models.dev catalog PI-Desktop uses (USD). Only empty rows are filled; your own prices are kept.",
    "price.fillNothing": "No empty models to fill",
    "price.filled": "Filled prices for {n} model(s); save to apply",
    "price.filledMissed": ", {m} not found in the catalog",
    "price.filledNone": "No catalog match for these models; enter prices by hand",
    "price.save": "Save prices",
    "price.saved": "Prices saved",
    "price.invalid": "Some prices are not valid non-negative numbers",
    "usage.unsupported": "This server does not provide LLM usage stats yet, or the bank has not been created. Upgrade the server to see them.",
    "usage.period": "Period",
    "usage.period.1d": "Last 1 day",
    "usage.period.7d": "Last 7 days",
    "usage.period.30d": "Last 30 days",
    "usage.requests": "Requests",
    "usage.total": "Total tokens",
    "usage.input": "Input",
    "usage.output": "Output",
    "usage.cached": "Cached",
    "usage.thoughts": "Reasoning",
    "usage.note": "Cached and reasoning are breakdowns, not added to the total. — means the server did not report it.",
    "usage.empty": "No recorded LLM requests in this period (statistics rely on server-side LLM tracing).",
    "usage.retention": "The server keeps only the last {n} days of records; this period may be incomplete.",
    "usage.historyDay": "By day",
    "usage.historyHour": "By hour (local time)",
    "usage.time": "Time",
    "usage.status.success": "Success",
    "usage.status.error": "Failed",
    "usage.status.pending": "Pending",
    "usage.status.running": "Running",
    "diag.reflectHelp": "Runs agentic reasoning over all memories; usually takes 20–60 s.",
    "diag.reflectPlaceholder": "e.g. Why did this repo drop approach X?",
    "diag.reflectBudget": "Budget",
    "diag.reflectSubmit": "Ask",
    "diag.reflectThinking": "Thinking…",
    "diag.reflectThinkingNote": "Synthesizing memories; keep this panel open.",
    "diag.reflectElapsed": "{s}s elapsed",
    "diag.reflectResult": "Answer",
    "diag.reflectMeta": "{budget} · {ms}ms",
    "diag.reflectRequired": "Enter a question first",
    "diag.reflectAnswerEmpty": "The server returned an empty answer.",
    "diag.budget.low": "Low",
    "diag.budget.mid": "Mid",
    "diag.budget.high": "High",
    "error.unknown": "Unknown error",
    "error.bridge": "Host bridge unavailable (open this panel inside PI-Desktop)",
  },
};

const ICONS = {
  refresh:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 3v3h-3"/></svg>',
  search:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="4.25"/><path d="m10.2 10.2 3 3"/></svg>',
  x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m4.5 4.5 7 7m0-7-7 7"/></svg>',
  eye: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 8s2.2-3.5 6-3.5S14 8 14 8s-2.2 3.5-6 3.5S2 8 2 8Z"/><circle cx="8" cy="8" r="1.75"/></svg>',
  eyeOff:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 8s2.2-3.5 6-3.5S14 8 14 8s-2.2 3.5-6 3.5S2 8 2 8Z"/><circle cx="8" cy="8" r="1.75"/><path d="M3 3l10 10"/></svg>',
  alert:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8 2.5 14 13H2L8 2.5Z"/><path d="M8 6.5v3"/><path d="M8 11.5h.01"/></svg>',
  info: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6"/><path d="M8 7.5v3.5"/><path d="M8 5h.01"/></svg>',
  check:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6"/><path d="m5.25 8.25 1.9 1.9 3.6-4"/></svg>',
  book: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2.5 3.5h3A2.5 2.5 0 0 1 8 6v7a2 2 0 0 0-2-2H2.5v-7.5Z"/><path d="M13.5 3.5h-3A2.5 2.5 0 0 0 8 6v7a2 2 0 0 1 2-2h3.5v-7.5Z"/></svg>',
  server:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2.5" y="3" width="11" height="4" rx="1"/><rect x="2.5" y="9" width="11" height="4" rx="1"/><path d="M5 5h.01M5 11h.01"/></svg>',
  chevron:
    '<svg class="select-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m4 6 4 4 4-4"/></svg>',
};

const state = {
  locale: "zh-CN",
  tab: "config",
  status: { loading: true, data: null, error: null },
  config: {
    loading: true,
    data: null,
    fieldMap: {},
    values: {},
    baseline: {},
    dirty: new Set(),
    fieldErrors: {},
    secretVisible: {},
    saving: false,
    saveError: null,
    notice: null,
    backupPath: "",
    error: null,
    lastDirtyKey: "",
  },
  pages: { loading: true, loaded: false, items: [], error: null },
  search: { input: "", query: "", loading: false, items: null, error: null },
  reader: { id: "", loading: false, page: null, error: null },
  diag: {
    loading: true,
    data: null,
    error: null,
    reflect: {
      query: "",
      budget: "mid",
      running: false,
      startedAt: 0,
      result: null,
      error: null,
      timer: 0,
    },
  },
  stats: {
    period: "7d",
    usage: { loading: false, loaded: false, data: null, error: null },
    models: { loading: false, loaded: false, data: null, error: null },
    prices: { loading: false, loaded: false, data: null, draft: null, saving: false, filling: false, saveError: null, warning: "", open: false },
  },
};

const seq = { status: 0, config: 0, pages: 0, search: 0, read: 0, usage: 0, models: 0 };
let refreshing = false;
let unsubscribeAppearance = null;

/* ------------------------------------------------------------- utilities */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function esc(value) {
  return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function normalizeLocale(tag) {
  return /^zh(\b|[-_])/i.test(String(tag || "")) ? "zh-CN" : "en";
}

function t(key, vars = {}) {
  const dict = STRINGS[state.locale] || STRINGS["zh-CN"];
  const raw = dict[key] !== undefined ? dict[key] : STRINGS["zh-CN"][key] !== undefined ? STRINGS["zh-CN"][key] : key;
  return String(raw).replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] !== undefined ? String(vars[name]) : match,
  );
}

function localized(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  const zh = state.locale === "zh-CN";
  return value[zh ? "zh-CN" : "en"] ?? value.en ?? value["zh-CN"] ?? "";
}

function fmtNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(state.locale).format(n);
  } catch (error) {
    return String(n);
  }
}

function fmtDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  try {
    return new Intl.DateTimeFormat(state.locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch (error) {
    return date.toLocaleString();
  }
}

function messageOf(error) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    if (error.message) return String(error.message);
    try {
      return JSON.stringify(error);
    } catch (jsonError) {
      return String(error);
    }
  }
  return error ? String(error) : "";
}

function parseErrorMessage(value) {
  if (!value) return "";
  return messageOf(value);
}

function hostOf(url) {
  if (!url) return "";
  try {
    return new URL(String(url)).host;
  } catch (error) {
    return String(url).replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
  }
}

function isOffline(error) {
  if (!error) return false;
  const code = String(error.code || "").toUpperCase();
  const message = messageOf(error).toUpperCase();
  if (code === "OFFLINE" || code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ETIMEDOUT") {
    return true;
  }
  return /OFFLINE|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|NETWORK ERROR|FAILED TO FETCH/.test(message);
}

function isOfflineNow() {
  return Boolean(state.status.error && isOffline(state.status.error));
}

function readAppearanceCache() {
  try {
    return JSON.parse(window.localStorage.getItem(APPEARANCE_CACHE_KEY) || "null");
  } catch (error) {
    return null;
  }
}

function writeAppearanceCache() {
  try {
    window.localStorage.setItem(
      APPEARANCE_CACHE_KEY,
      JSON.stringify({
        base: document.documentElement.dataset.base || "",
        locale: document.documentElement.lang || state.locale,
      }),
    );
  } catch (error) {
    /* storage can be unavailable in sandboxed previews */
  }
}

/* ----------------------------------------------------------------- bridge */

function bridge() {
  return window.pluginBridge && typeof window.pluginBridge.invoke === "function"
    ? window.pluginBridge
    : null;
}

async function invokeHost(channel, payload) {
  const api = bridge();
  if (!api) return null;
  try {
    return await api.invoke(channel, payload || {});
  } catch (error) {
    return null;
  }
}

function bridgeOn(event, handler) {
  const api = bridge();
  if (!api || typeof api.on !== "function") return () => {};
  try {
    const off = api.on(event, handler);
    return typeof off === "function" ? off : () => {};
  } catch (error) {
    return () => {};
  }
}

function normalizeError(error) {
  if (!error) return { code: "UNKNOWN", message: t("error.unknown") };
  if (error instanceof Error) {
    const noBridge = error.message === "NO_BRIDGE";
    return {
      code: noBridge ? "NO_BRIDGE" : String(error.code || "BRIDGE_ERROR"),
      message: noBridge ? t("error.bridge") : error.message || t("error.unknown"),
    };
  }
  return {
    code: String(error.code || "UNKNOWN"),
    message: messageOf(error) || t("error.unknown"),
    hint: error.hint,
    retryAfterMs: error.retryAfterMs,
    fields: error.fields,
  };
}

async function invokeData(channel, payload) {
  const api = bridge();
  if (!api) {
    return { ok: false, error: { code: "NO_BRIDGE", message: t("error.bridge") } };
  }
  try {
    const result = await api.invoke(channel, payload || {});
    if (!result || typeof result !== "object") {
      return { ok: false, error: { code: "INVALID_RESPONSE", message: t("error.unknown") } };
    }
    if (result.ok === false) return { ok: false, error: normalizeError(result.error) };
    return result;
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

function toast(message) {
  invokeHost("ui.showToast", { message });
}

/* ------------------------------------------------------------------ shell */

function renderShell() {
  const app = $("#app");
  if (!app) return;
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-main">
        <h1 class="topbar-title" data-i18n="app.title">${t("app.title")}</h1>
        <p class="conn" role="status" aria-live="polite" aria-atomic="true">
          <span class="status-dot" id="status-dot" data-state="loading" aria-hidden="true"></span>
          <span class="conn-text" id="conn-text">${t("status.connecting")}</span>
        </p>
      </div>
      <div class="topbar-actions">
        <button type="button" class="icon-btn" id="refresh-btn" aria-label="${t(
          "action.refresh",
        )}" title="${t("action.refresh")}" data-i18n-aria="action.refresh"
          data-i18n-title="action.refresh">${ICONS.refresh}</button>
      </div>
    </header>
    <nav class="tabs" role="tablist" aria-label="${t("tabs.label")}" data-i18n-aria="tabs.label">
      <button type="button" class="tab" role="tab" id="tab-config" data-tab="config" aria-controls="view-config" aria-selected="true" tabindex="0">
        <span data-i18n="tab.config">${t("tab.config")}</span><span class="tab-dot" data-tab-dot="config" aria-hidden="true" hidden></span>
      </button>
      <button type="button" class="tab" role="tab" id="tab-memory" data-tab="memory" aria-controls="view-memory" aria-selected="false" tabindex="-1">
        <span data-i18n="tab.memory">${t("tab.memory")}</span>
      </button>
      <button type="button" class="tab" role="tab" id="tab-stats" data-tab="stats" aria-controls="view-stats" aria-selected="false" tabindex="-1">
        <span data-i18n="tab.stats">${t("tab.stats")}</span>
      </button>
      <button type="button" class="tab" role="tab" id="tab-diagnostics" data-tab="diagnostics" aria-controls="view-diagnostics" aria-selected="false" tabindex="-1">
        <span data-i18n="tab.diagnostics">${t("tab.diagnostics")}</span>
      </button>
    </nav>
    <main class="panel-body">
      <section class="view" id="view-config" role="tabpanel" aria-labelledby="tab-config" tabindex="-1">
        <div class="config-notices" id="config-notices" aria-live="polite"></div>
        <div class="view-scroll" id="config-scroll">
          <div id="config-groups" aria-busy="true"></div>
          <p class="unknown-note" id="config-unknown" hidden></p>
        </div>
        <div class="config-actions" id="config-actions" hidden>
          <span class="dirty-count" id="dirty-count" role="status" aria-live="polite"></span>
          <button type="button" class="btn btn-quiet" id="config-undo" data-i18n="common.undo">${t("common.undo")}</button>
          <button type="button" class="btn btn-primary" id="config-save">
            <span class="spinner" id="config-save-spinner" hidden></span>
            <span id="config-save-label" data-i18n="common.save">${t("common.save")}</span>
          </button>
        </div>
      </section>
      <section class="view" id="view-memory" role="tabpanel" aria-labelledby="tab-memory" tabindex="-1" hidden>
        <form class="memory-toolbar" id="memory-search-form" role="search">
          <div class="search-field">
            ${ICONS.search}
            <label class="sr-only" for="memory-search">${t("memory.searchLabel")}</label>
            <input class="ctl-input search-input" id="memory-search" type="search" autocomplete="off" spellcheck="false"
              placeholder="${t("memory.searchPlaceholder")}" data-i18n-placeholder="memory.searchPlaceholder"
              aria-label="${t("memory.searchLabel")}" data-i18n-aria="memory.searchLabel" />
            <button type="button" class="search-clear" id="memory-clear" aria-label="${t(
              "memory.clearSearch",
            )}" title="${t("memory.clearSearch")}" data-i18n-aria="memory.clearSearch"
              data-i18n-title="memory.clearSearch" hidden>${ICONS.x}</button>
          </div>
          <button type="submit" class="btn btn-quiet" id="memory-search-btn" data-i18n="memory.search">${t(
            "memory.search",
          )}</button>
        </form>
        <div class="memory-meta" id="memory-meta"></div>
        <div class="memory-grid" id="memory-grid">
          <div class="memory-list-pane" id="memory-list" role="region" aria-label="${t(
            "memory.pagesTitle",
          )}" data-i18n-aria="memory.pagesTitle"></div>
          <div class="memory-reader" id="memory-reader" role="region" aria-label="${t(
            "memory.readerTitle",
          )}" data-i18n-aria="memory.readerTitle"></div>
        </div>
      </section>
      <section class="view" id="view-stats" role="tabpanel" aria-labelledby="tab-stats" tabindex="-1" hidden>
        <div class="view-scroll" id="stats-scroll">
          <div id="stats-content"></div>
        </div>
      </section>
      <section class="view" id="view-diagnostics" role="tabpanel" aria-labelledby="tab-diagnostics" tabindex="-1" hidden>
        <div class="view-scroll" id="diag-scroll">
          <div id="diag-content"></div>
        </div>
      </section>
    </main>
  `;
}

function applyStaticStrings() {
  document.title = t("app.title");
  $$("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  $$("[data-i18n-aria]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  });
  $$("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });
  $$("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
}

/* ---------------------------------------------------------------- generic */

function errorMarkup(error, options = {}) {
  const code = error && error.code ? error.code : "ERROR";
  const message = error && error.message ? error.message : t("error.unknown");
  const hint = error && error.hint ? `<p class="err-hint">${esc(error.hint)}</p>` : "";
  const retry = options.action
    ? `<div class="err-actions"><button type="button" class="btn" data-action="${options.action}">${t(
        "common.retry",
      )}</button></div>`
    : "";
  return `<div class="inline-error" role="alert">
    <span class="err-icon">${ICONS.alert}</span>
    <div class="err-body">
      <div class="err-line"><code class="err-code">${esc(code)}</code><span class="err-message">${esc(
        message,
      )}</span></div>
      ${hint}${retry}
    </div>
  </div>`;
}

function emptyMarkup(icon, title, body, extra = "") {
  return `<div class="empty">
    <span class="empty-icon">${icon}</span>
    <p class="empty-title">${esc(title)}</p>
    ${body ? `<p class="empty-body">${esc(body)}</p>` : ""}
    ${extra}
  </div>`;
}

function skeletonList(count) {
  return Array.from({ length: count }, () => '<div class="skeleton skeleton-row"></div>').join("");
}

function noticeMarkup(kind, title, bodyLines, icon) {
  const lines = (bodyLines || [])
    .filter(Boolean)
    .map((line) => `<p class="notice-sub">${line}</p>`)
    .join("");
  return `<div class="notice notice-${kind}" role="${kind === "danger" ? "alert" : "status"}">
    ${icon}
    <div class="notice-text"><p class="notice-title">${esc(title)}</p>${lines}</div>
  </div>`;
}

/* ----------------------------------------------------------------- status */

function statusKind() {
  if (state.status.error) return isOffline(state.status.error) ? "offline" : "error";
  if (state.status.loading) return state.status.data ? "online" : "loading";
  return state.status.data ? "online" : "loading";
}

function renderStatus() {
  const dot = $("#status-dot");
  const text = $("#conn-text");
  if (!dot || !text) return;

  const kind = statusKind();
  dot.dataset.state = kind;
  let label = t("status.connecting");
  let title = "";

  if (state.status.error) {
    label = isOffline(state.status.error) ? t("status.offline") : t("status.error");
    title = [state.status.error.code, messageOf(state.status.error), state.status.error.hint]
      .filter(Boolean)
      .join(" · ");
  } else if (state.status.data) {
    const host = hostOf(state.status.data.apiUrl);
    label = t("status.online") + (host ? ` · ${host}` : "");
    title = state.status.data.apiUrl || "";
  }

  text.textContent = label;
  text.title = title;
}

async function loadStatus() {
  const token = ++seq.status;
  state.status.loading = true;
  state.diag.loading = true;
  renderStatus();
  renderDiag();
  renderStats();

  const result = await invokeData("hindsight.bank.status");
  if (token !== seq.status) return;

  state.status.loading = false;
  state.diag.loading = false;
  if (result.ok) {
    state.status.data = result;
    state.status.error = null;
    state.diag.data = result;
    state.diag.error = null;
  } else {
    state.status.data = null;
    state.status.error = result.error;
    state.diag.data = null;
    state.diag.error = result.error;
  }
  renderStatus();
  renderDiag();
  renderStats();
  renderMemory();
}

/* ----------------------------------------------------------------- config */

function normalizeFieldValue(field, value) {
  if (field.type === "boolean") {
    return value === true || value === "true" || value === 1 || value === "1";
  }
  if (value === null || value === undefined) return "";
  return value;
}

function canonical(field, value) {
  if (field.type === "boolean") return value === true;
  if (field.type === "number") {
    if (value === "" || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value);
  }
  return value === null || value === undefined ? "" : String(value);
}

function dirtyText(count) {
  if (count === 0) return t("config.noChanges");
  if (count === 1) return t("config.dirtyOne");
  return t("config.dirtyMany", { n: count });
}

async function loadConfig(options = {}) {
  const cfg = state.config;
  if (cfg.saving) return;
  if (!options.force && cfg.data && cfg.dirty.size > 0) {
    toast(t("config.refreshBlocked"));
    return;
  }
  const token = ++seq.config;
  cfg.loading = true;
  cfg.error = null;
  renderConfig();

  const result = await invokeData("hindsight.config.read");
  if (token !== seq.config) return;

  cfg.loading = false;
  if (!result.ok) {
    cfg.error = result.error;
    cfg.data = null;
    renderConfig();
    return;
  }

  const fields = Array.isArray(result.fields) ? result.fields : [];
  const values = {};
  const baseline = {};
  for (const field of fields) {
    const hasValue =
      result.values && Object.prototype.hasOwnProperty.call(result.values, field.key);
    const value = normalizeFieldValue(field, hasValue ? result.values[field.key] : field.default);
    values[field.key] = value;
    baseline[field.key] = value;
  }

  cfg.data = {
    ...result,
    fields,
    groups: Array.isArray(result.groups) ? result.groups : [],
    sources: result.sources && typeof result.sources === "object" ? result.sources : {},
    unknownKeys: Array.isArray(result.unknownKeys) ? result.unknownKeys : [],
  };
  cfg.values = values;
  cfg.baseline = baseline;
  cfg.fieldMap = Object.fromEntries(fields.map((field) => [field.key, field]));
  cfg.dirty = new Set();
  cfg.fieldErrors = {};
  cfg.secretVisible = {};
  cfg.saving = false;
  cfg.saveError = null;
  cfg.notice = null;
  cfg.backupPath = "";
  cfg.lastDirtyKey = "";
  cfg.error = null;
  renderConfig();
}

function unitFor(key) {
  if (/Ms$/.test(key)) return "ms";
  if (key === "pageSearchLimit") return t("unit.pages");
  if (key === "pageRefreshEveryTurns") return t("unit.turns");
  if (key === "maxParallelRetains") return t("unit.parallel");
  return "";
}

function fieldErrorFor(key) {
  const raw = state.config.fieldErrors[key];
  return raw ? messageOf(raw) : "";
}

function secretNote(field) {
  const cfg = state.config;
  const value = cfg.values[field.key];
  const base = cfg.baseline[field.key];
  if (cfg.dirty.has(field.key)) {
    return value === "" ? t("config.secret.cleared") : t("config.secret.replaced");
  }
  return value === "" && !base ? "" : t("config.secret.masked");
}

function enumOptions(field) {
  const list = Array.isArray(field.enum) ? field.enum : [];
  return list.map((item) =>
    item && typeof item === "object"
      ? { value: String(item.value ?? ""), label: item.label ?? item.value }
      : { value: String(item), label: String(item) },
  );
}

function numberAttrs(field) {
  const attrs = ['step="' + Number(field.step ?? 1) + '"'];
  if (field.min !== undefined && field.min !== null && Number.isFinite(Number(field.min))) {
    attrs.push(`min="${Number(field.min)}"`);
  }
  if (field.max !== undefined && field.max !== null && Number.isFinite(Number(field.max))) {
    attrs.push(`max="${Number(field.max)}"`);
  }
  return attrs.join(" ");
}

/** Human-readable dependency label, e.g. 「自动注入 = reflect」. */
function dependencyLabel(field) {
  const dep = field.dependsOn;
  if (!dep) return "";
  const depField = state.config.fieldMap[dep.key];
  const name = (depField && localized(depField.label)) || dep.key;
  const values = dep.in
    .map((value) =>
      typeof value === "boolean" ? t(value ? "common.on" : "common.off") : String(value),
    )
    .join(" / ");
  return `${name} = ${values}`;
}

/** True while the controlling field's current (possibly unsaved) value lets this field apply. */
function isFieldActive(field) {
  const dep = field.dependsOn;
  if (!dep) return true;
  return dep.in.includes(state.config.values[dep.key]);
}

function renderField(field) {
  const cfg = state.config;
  const readonly = Boolean(cfg.data && cfg.data.parseError);
  // A dependent field whose condition does not hold stays visible but muted and disabled; its
  // value is still submitted if the user edited it earlier, and never rejected on that basis.
  const active = isFieldActive(field);
  const inactive = readonly || !active;
  const key = field.key;
  const idSafe = esc(key);
  const label = localized(field.label) || key;
  const help = localized(field.help);
  const value = cfg.values[key];
  const error = fieldErrorFor(key);
  const dirty = cfg.dirty.has(key);
  const isDefault = cfg.data.sources && cfg.data.sources[key] === "default";
  const disabled = inactive ? " disabled" : "";
  const depNote =
    active || !field.dependsOn
      ? ""
      : `<p class="field-dep" id="dep-${idSafe}">${esc(
          t("config.inactive", { cond: dependencyLabel(field) }),
        )}</p>`;
  const describedBy = `help-${idSafe}${error ? ` err-${idSafe}` : ""}${
    depNote ? ` dep-${idSafe}` : ""
  }`;
  const errorMarkupHtml = error
    ? `<p class="field-error" id="err-${idSafe}" role="alert">${esc(error)}</p>`
    : "";
  const labelTag = field.type === "boolean" ? "span" : "label";
  const labelAttr =
    field.type === "boolean" ? ` id="lbl-${idSafe}"` : ` for="cfg-${idSafe}"`;
  let control = "";

  if (field.type === "boolean") {
    control = `<button type="button" class="switch" role="switch" id="cfg-${idSafe}"
      aria-checked="${value === true}" aria-labelledby="lbl-${idSafe}" aria-describedby="${describedBy}"
      data-action="toggle-bool"${disabled}><span class="switch-thumb"></span></button>`;
  } else if (field.type === "enum" && enumOptions(field).length > 0) {
    const options = enumOptions(field)
      .map(
        (option) =>
          `<option value="${esc(option.value)}"${
            String(value) === option.value ? " selected" : ""
          }>${esc(localized(option.label))}</option>`,
      )
      .join("");
    control = `<div class="select-wrap"><select class="ctl-select" id="cfg-${idSafe}"
      data-field="${idSafe}" aria-describedby="${describedBy}"${disabled}>${options}</select>${ICONS.chevron}</div>`;
  } else if (field.type === "number") {
    const unit = unitFor(key);
    control = `<div class="num-wrap"><input class="ctl-input is-mono" id="cfg-${idSafe}" type="number"
      inputmode="numeric" value="${esc(value)}" ${numberAttrs(field)} aria-describedby="${describedBy}"
      data-field="${idSafe}"${disabled} />${unit ? `<span class="num-unit">${esc(unit)}</span>` : ""}</div>`;
  } else if (field.type === "secret" || field.secret) {
    const visible = Boolean(cfg.secretVisible[key]);
    const placeholder = localized(field.placeholder) || t("config.secret.placeholder");
    control = `<div class="secret-wrap">
      <input class="ctl-input is-mono" id="cfg-${idSafe}" type="${
        visible ? "text" : "password"
      }" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"
      aria-describedby="${describedBy}" data-field="${idSafe}"${disabled} />
      <button type="button" class="secret-btn" data-action="reveal-secret" aria-pressed="${visible}"
        aria-label="${visible ? t("common.hide") : t("common.show")}" title="${
          visible ? t("common.hide") : t("common.show")
        }"${disabled}>${visible ? ICONS.eyeOff : ICONS.eye}</button>
      <button type="button" class="secret-clear" data-action="clear-secret"${
        value === "" || inactive ? " disabled" : ""
      }>${t("common.clear")}</button>
    </div>
    <p class="field-note">${esc(secretNote(field))}</p>`;
  } else {
    const placeholder = localized(field.placeholder);
    const monoTokens = /(apiUrl|bankId|bankIdTemplate|url|cron)/i.test(key) ? " is-mono" : "";
    control = `<input class="ctl-input${monoTokens}" id="cfg-${idSafe}" type="text" value="${esc(
      value,
    )}" placeholder="${esc(placeholder)}" aria-describedby="${describedBy}" data-field="${idSafe}"${
      disabled
    } />`;
  }

  return `<div class="field${dirty ? " is-dirty" : ""}${error ? " has-error" : ""}${
    active ? "" : " is-inactive"
  }" data-field-key="${esc(key)}">
    <div class="field-meta">
      <div class="field-label-row">
        <${labelTag} class="field-label"${labelAttr}>${esc(label)}</${labelTag}>
        ${isDefault ? `<span class="src-badge">${t("config.sourceDefault")}</span>` : ""}
        <span class="dirty-dot" aria-hidden="true"></span>
      </div>
      ${help ? `<p class="field-help" id="help-${idSafe}">${esc(help)}</p>` : `<span id="help-${idSafe}" hidden></span>`}
      ${depNote}
    </div>
    <div class="field-control">${control}${errorMarkupHtml}</div>
  </div>`;
}

/** Re-render only the rows that depend on `changedKey`, so the dependency reacts to unsaved edits. */
function refreshDependentFields(changedKey) {
  const cfg = state.config;
  if (!cfg.data) return;
  for (const field of cfg.data.fields) {
    if (!field.dependsOn || field.dependsOn.key !== changedKey) continue;
    const row = $$("#config-groups .field").find((node) => node.dataset.fieldKey === field.key);
    if (!row) continue;
    const holder = document.createElement("div");
    holder.innerHTML = renderField(field).trim();
    const next = holder.firstElementChild;
    if (next) row.replaceWith(next);
  }
}

function configGroupsMarkup() {
  const cfg = state.config;
  const data = cfg.data;
  const groups = [];
  const index = new Map();

  for (const group of data.groups) {
    const id = group.id || "other";
    if (index.has(id)) continue;
    const item = { id, label: group.label, fields: [] };
    groups.push(item);
    index.set(id, item);
  }
  for (const field of data.fields) {
    const id = field.group || "other";
    let group = index.get(id);
    if (!group) {
      group = { id, label: null, fields: [] };
      groups.push(group);
      index.set(id, group);
    }
    group.fields.push(field);
  }

  const used = groups.filter((group) => group.fields.length > 0);
  if (used.length === 0) {
    return emptyMarkup(ICONS.book, t("config.empty"), "");
  }

  return used
    .map(
      (group, groupIndex) => `<section class="config-group">
        <div class="group-head">
          <h2 class="group-title" id="group-${groupIndex}">${esc(
            localized(group.label) || t("config.groupFallback"),
          )}</h2>
          <span class="group-count">${group.fields.length}</span>
        </div>
        <div class="field-list" role="group" aria-labelledby="group-${groupIndex}">
          ${group.fields.map(renderField).join("")}
        </div>
      </section>`,
    )
    .join("");
}

function renderConfigNotices() {
  const cfg = state.config;
  const container = $("#config-notices");
  if (!container) return;
  const parts = [];

  if (cfg.saveError) parts.push(errorMarkup(cfg.saveError));
  if (cfg.data && cfg.data.parseError) {
    parts.push(
      noticeMarkup(
        "danger",
        t("config.parseError.title"),
        [esc(parseErrorMessage(cfg.data.parseError)), t("config.parseError.body")],
        ICONS.alert,
      ),
    );
  } else if (cfg.data && cfg.data.exists === false) {
    const path = cfg.data.path || "—";
    parts.push(
      noticeMarkup("warn", t("config.notFound.title"), [t("config.notFound.body", { path: esc(path) })], ICONS.info),
    );
  }
  if (cfg.notice && cfg.notice.type === "success") {
    const path = cfg.backupPath ? cfg.data.path : cfg.data.path;
    const lines = [t("config.saved.body", { path: esc(path || "—") })];
    if (cfg.backupPath) {
      lines.push(t("config.backup", { path: `<code>${esc(cfg.backupPath)}</code>` }));
    }
    parts.push(noticeMarkup("success", t("config.saved.title"), lines, ICONS.check));
  }

  container.innerHTML = parts.join("");
}

function syncConfigActions() {
  const cfg = state.config;
  const bar = $("#config-actions");
  if (!bar) return;
  const count = cfg.dirty.size;
  const readOnly = Boolean(cfg.data && cfg.data.parseError);
  const fileMissing = Boolean(cfg.data && cfg.data.exists === false);
  const canSave = count > 0 || (fileMissing && !readOnly);
  bar.hidden = !cfg.data;
  const countNode = $("#dirty-count");
  if (countNode) {
    countNode.textContent = readOnly
      ? t("config.readOnly")
      : count === 0 && fileMissing
        ? t("config.notFound.bar")
        : dirtyText(count);
  }
  const save = $("#config-save");
  const undo = $("#config-undo");
  if (save) {
    save.disabled = cfg.saving || readOnly || !canSave;
    save.setAttribute("aria-busy", String(cfg.saving));
  }
  if (undo) undo.disabled = cfg.saving || count === 0;
  const spinner = $("#config-save-spinner");
  const label = $("#config-save-label");
  if (spinner) spinner.hidden = !cfg.saving;
  if (label) label.textContent = cfg.saving ? t("common.saving") : t("common.save");
  const dot = $('[data-tab-dot="config"]');
  if (dot) dot.hidden = count === 0;
  $$("#config-groups .field").forEach((row) => {
    row.classList.toggle("is-dirty", cfg.dirty.has(row.dataset.fieldKey));
  });
}

function renderConfig() {
  const cfg = state.config;
  const groups = $("#config-groups");
  groups.inert = cfg.saving || (cfg.loading && Boolean(cfg.data));
  renderConfigNotices();
  syncConfigActions();
  groups.setAttribute("aria-busy", String(cfg.loading || cfg.saving));

  if (cfg.loading && !cfg.data) {
    groups.innerHTML = `<div class="skeleton skeleton-card" style="height:18px;width:34%;margin-bottom:10px"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>`;
    const unknown = $("#config-unknown");
    if (unknown) unknown.hidden = true;
    return;
  }

  if (cfg.error) {
    groups.innerHTML = `<div class="config-load-error">${errorMarkup(cfg.error, {
      action: "retry-config",
    })}</div>`;
    const unknown = $("#config-unknown");
    if (unknown) unknown.hidden = true;
    return;
  }

  if (!cfg.data) {
    groups.innerHTML = "";
    return;
  }

  const unknown = $("#config-unknown");
  const path = cfg.data.path || "—";
  groups.innerHTML = `<div class="config-path">
      <span class="config-path-label">${t("config.pathLabel")}</span>
      <code title="${esc(path)}">${esc(path)}</code>
    </div>${configGroupsMarkup()}`;

  if (unknown) {
    const keys = cfg.data.unknownKeys;
    unknown.hidden = keys.length === 0;
    unknown.innerHTML =
      keys.length > 0
        ? `${t("config.unknownKeys", { n: keys.length })} · <code>${esc(keys.join(", "))}</code>`
        : "";
  }
}

function updateFieldValue(field, row, value) {
  const cfg = state.config;
  cfg.values[field.key] = value;
  const dirty = canonical(field, value) !== canonical(field, cfg.baseline[field.key]);
  if (dirty) {
    cfg.dirty.add(field.key);
    cfg.lastDirtyKey = field.key;
  } else {
    cfg.dirty.delete(field.key);
  }
  delete cfg.fieldErrors[field.key];
  row.classList.remove("has-error");
  const errorNode = row.querySelector(".field-error");
  if (errorNode) errorNode.remove();
  const note = row.querySelector(".field-note");
  if (note) note.textContent = secretNote(field);
  if (cfg.saveError || cfg.notice) {
    cfg.saveError = null;
    cfg.notice = null;
    renderConfigNotices();
  }
  syncConfigActions();
  refreshDependentFields(field.key);
}

function buildPatch() {
  const cfg = state.config;
  const patch = {};
  for (const field of cfg.data.fields) {
    if (!cfg.dirty.has(field.key)) continue;
    const raw = cfg.values[field.key];
    if (field.type === "boolean") {
      patch[field.key] = raw === true;
    } else if (field.type === "number") {
      if (raw === "" || raw === null || raw === undefined) {
        patch[field.key] = null;
      } else {
        const n = Number(raw);
        patch[field.key] = Number.isFinite(n) ? n : null;
      }
    } else {
      patch[field.key] = String(raw ?? "");
    }
  }
  return patch;
}

function focusField(key) {
  if (!key) return;
  const row = $$("#config-groups .field").find((node) => node.dataset.fieldKey === key);
  if (!row) return;
  const control = row.querySelector("input, select, button");
  if (control) control.focus();
}

function focusFirstFieldError() {
  const keys = Object.keys(state.config.fieldErrors);
  if (keys.length === 0) return;
  const key = keys[0];
  const row = $$("#config-groups .field").find((node) => node.dataset.fieldKey === key);
  if (!row) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  const control = row.querySelector("input, select, button");
  if (control) control.focus({ preventScroll: true });
}

async function saveConfig() {
  const cfg = state.config;
  if (!cfg.data || cfg.saving || cfg.data.parseError) return;
  const patch = buildPatch();
  const creating = cfg.data.exists === false;
  if (Object.keys(patch).length === 0 && !creating) return;

  cfg.saving = true;
  cfg.fieldErrors = {};
  cfg.saveError = null;
  cfg.notice = null;
  syncConfigActions();
  renderConfigNotices();
  $("#config-groups").inert = true;

  const result = await invokeData("hindsight.config.save", { patch });

  cfg.saving = false;
  const groups = $("#config-groups");
  if (groups) groups.inert = false;

  if (result.ok) {
    if (result.values && typeof result.values === "object") {
      for (const field of cfg.data.fields) {
        if (Object.prototype.hasOwnProperty.call(result.values, field.key)) {
          const value = normalizeFieldValue(field, result.values[field.key]);
          cfg.values[field.key] = value;
          cfg.baseline[field.key] = value;
        }
      }
    } else {
      for (const key of cfg.dirty) cfg.baseline[key] = cfg.values[key];
    }
    cfg.dirty.clear();
    cfg.fieldErrors = {};
    cfg.secretVisible = {};
    cfg.data.exists = true;
    if (result.path) cfg.data.path = result.path;
    if (result.sources && typeof result.sources === "object") cfg.data.sources = result.sources;
    if (Array.isArray(result.unknownKeys)) cfg.data.unknownKeys = result.unknownKeys;
    cfg.backupPath = result.backupPath || "";
    cfg.notice = { type: "success" };
    cfg.lastDirtyKey = "";
    toast(t("config.saved.toast"));
  } else {
    cfg.saveError = result.error;
    if (result.error && result.error.fields && typeof result.error.fields === "object") {
      cfg.fieldErrors = { ...result.error.fields };
    }
  }

  renderConfig();
  if (!result.ok) focusFirstFieldError();
}

function undoConfig() {
  const cfg = state.config;
  const key = cfg.lastDirtyKey;
  cfg.values = { ...cfg.baseline };
  cfg.dirty = new Set();
  cfg.fieldErrors = {};
  cfg.secretVisible = {};
  cfg.saveError = null;
  cfg.notice = null;
  cfg.backupPath = "";
  renderConfig();
  focusField(key);
}

/* ----------------------------------------------------------------- memory */

function syncSearchClear() {
  const input = $("#memory-search");
  const clear = $("#memory-clear");
  if (!input || !clear) return;
  clear.hidden = input.value.length === 0;
  if (isOfflineNow()) {
    input.setAttribute("placeholder", t("memory.searchOffline"));
    input.disabled = true;
  } else {
    input.setAttribute("placeholder", t("memory.searchPlaceholder"));
    input.disabled = false;
  }
  const button = $("#memory-search-btn");
  if (button) button.disabled = isOfflineNow();
}

function renderMemoryMeta() {
  const meta = $("#memory-meta");
  if (!meta) return;
  if (isOfflineNow()) {
    meta.innerHTML = `<span class="memory-meta-title">${t("memory.pagesTitle")}</span><span class="memory-meta-count">${t(
      "status.offline",
    )}</span>`;
    return;
  }
  const searching = state.search.items !== null || state.search.loading || Boolean(state.search.query);
  const loading = searching ? state.search.loading : state.pages.loading;
  const items = searching ? state.search.items || [] : state.pages.items;
  const title = searching ? t("memory.resultsTitle") : t("memory.pagesTitle");
  const count = searching
    ? t("memory.resultsCount", { n: fmtNumber(items.length) })
    : t("memory.pageCount", { n: fmtNumber(items.length) });
  const query = searching && state.search.query
    ? `<span class="memory-meta-query">${esc(
        t("memory.resultsFor", { q: state.search.query }),
      )}</span>`
    : "";
  meta.innerHTML = `<span class="memory-meta-title">${title}</span><span class="memory-meta-count">${
    loading ? t("common.loading") : count
  }</span>${query}`;
}

function pageItemMarkup(item, index) {
  const selected = state.reader.id === item.id;
  const name = item.name || item.id || "—";
  const secondary = item.snippet || item.description || "";
  const kind = item.snippet ? "page-item-snippet" : "page-item-desc";
  return `<li><button type="button" class="page-item" data-action="open-page" data-page-id="${esc(
    item.id,
  )}"${selected ? ' aria-current="true"' : ""} style="--i:${Math.min(index, 10)}">
    <span class="page-item-head">
      <span class="page-item-name">${esc(name)}</span>
      ${item.folder ? `<span class="page-item-folder">${esc(item.folder)}</span>` : ""}
    </span>
    ${secondary ? `<span class="${kind}">${esc(secondary)}</span>` : ""}
    ${item.source_query ? `<span class="page-item-query">${esc(item.source_query)}</span>` : ""}
  </button></li>`;
}

function renderMemoryList() {
  const list = $("#memory-list");
  if (!list) return;
  list.setAttribute("aria-busy", String(state.search.loading || state.pages.loading));

  if (isOfflineNow()) {
    list.innerHTML = emptyMarkup(
      ICONS.server,
      t("diag.offline.title"),
      t("diag.offline.body"),
      errorMarkup(state.status.error, { action: "retry-status" }),
    );
    return;
  }

  if (state.search.loading) {
    list.innerHTML = skeletonList(6);
    return;
  }
  if (state.search.error) {
    list.innerHTML = `<div style="padding:4px">${errorMarkup(state.search.error, {
      action: "retry-search",
    })}</div>`;
    return;
  }
  if (state.search.items !== null) {
    if (state.search.items.length === 0) {
      list.innerHTML = emptyMarkup(
        ICONS.search,
        t("memory.emptySearch.title", { q: state.search.query }),
        t("memory.emptySearch.body"),
      );
    } else {
      list.innerHTML = `<ul class="page-list" role="list">${state.search.items
        .map(pageItemMarkup)
        .join("")}</ul>`;
    }
    return;
  }
  if (state.pages.loading) {
    list.innerHTML = skeletonList(6);
    return;
  }
  if (state.pages.error) {
    list.innerHTML = `<div style="padding:4px">${errorMarkup(state.pages.error, {
      action: "retry-pages",
    })}</div>`;
    return;
  }
  if (state.pages.items.length === 0) {
    list.innerHTML = emptyMarkup(ICONS.book, t("memory.emptyPages.title"), t("memory.emptyPages.body"));
    return;
  }
  list.innerHTML = `<ul class="page-list" role="list">${state.pages.items
    .map(pageItemMarkup)
    .join("")}</ul>`;
}

function renderReader() {
  const reader = $("#memory-reader");
  if (!reader) return;
  const grid = $("#memory-grid");
  if (grid) grid.classList.toggle("is-offline", isOfflineNow());
  reader.hidden = isOfflineNow();
  if (isOfflineNow()) return;
  reader.setAttribute("aria-busy", String(state.reader.loading));

  if (state.reader.loading) {
    reader.innerHTML = `<div class="skeleton skeleton-card" style="height:16px;width:62%"></div>
      <div class="skeleton skeleton-card" style="height:16px;width:38%;margin-top:10px"></div>
      <div class="skeleton skeleton-card" style="height:120px;margin-top:14px"></div>`;
    return;
  }
  if (state.reader.error) {
    reader.innerHTML = errorMarkup(state.reader.error, { action: "retry-read" });
    return;
  }
  const page = state.reader.page;
  if (!page) {
    reader.innerHTML = emptyMarkup(
      ICONS.book,
      t("memory.readerEmpty.title"),
      t("memory.readerEmpty.body"),
    );
    return;
  }

  const tags = Array.isArray(page.tags) ? page.tags : [];
  const tagMarkup = tags
    .slice(0, 10)
    .map((tag) => `<span class="tag">${esc(localized(tag) || tag)}</span>`)
    .join("");
  const updated = page.last_updated_at
    ? `<span>${esc(t("memory.updated", { date: fmtDate(page.last_updated_at) }))}</span>`
    : "";
  reader.innerHTML = `<div class="reader-head">
      <h2 class="reader-title">${esc(page.name || page.id || "—")}</h2>
      <div class="reader-meta">
        <code class="reader-id" title="${esc(page.id || "")}">${esc(page.id || "")}</code>
        ${updated}${tagMarkup}
      </div>
    </div>
    ${page.description ? `<p class="reader-desc">${esc(page.description)}</p>` : ""}
    <pre class="reader-body"></pre>`;
  const body = $(".reader-body", reader);
  if (body) body.textContent = page.body ? String(page.body) : t("memory.emptyBody");
}

function renderMemory() {
  syncSearchClear();
  renderMemoryMeta();
  renderMemoryList();
  renderReader();
}

async function loadPages() {
  const token = ++seq.pages;
  state.pages.loading = true;
  state.pages.error = null;
  renderMemory();

  const result = await invokeData("hindsight.bank.pages");
  if (token !== seq.pages) return;
  state.pages.loading = false;
  state.pages.loaded = true;
  if (result.ok) {
    state.pages.items = Array.isArray(result.items) ? result.items : [];
  } else {
    state.pages.error = result.error;
    state.pages.items = [];
  }
  renderMemory();
}

function clearSearch() {
  seq.search += 1;
  state.search = { input: "", query: "", loading: false, items: null, error: null };
  const input = $("#memory-search");
  if (input) {
    input.value = "";
    input.focus();
  }
  renderMemory();
}

async function runSearch(raw) {
  const query = String(raw ?? "").trim();
  if (!query) {
    clearSearch();
    return;
  }
  if (isOfflineNow()) return;
  const token = ++seq.search;
  state.search.query = query;
  state.search.loading = true;
  state.search.error = null;
  state.search.items = null;
  renderMemory();

  const result = await invokeData("hindsight.bank.search", { query, limit: 30 });
  if (token !== seq.search) return;
  state.search.loading = false;
  if (result.ok) {
    state.search.items = Array.isArray(result.items) ? result.items : [];
    state.search.error = null;
  } else {
    state.search.items = [];
    state.search.error = result.error;
  }
  renderMemory();
}

async function openPage(pageId) {
  if (!pageId || isOfflineNow()) return;
  const token = ++seq.read;
  state.reader.id = pageId;
  state.reader.loading = true;
  state.reader.page = null;
  state.reader.error = null;
  renderMemory();

  const result = await invokeData("hindsight.bank.read", { pageId });
  if (token !== seq.read) return;
  state.reader.loading = false;
  if (result.ok && result.page) {
    state.reader.page = result.page;
    state.reader.error = null;
  } else {
    state.reader.page = null;
    state.reader.error = result.ok
      ? { code: "INVALID_RESPONSE", message: t("error.unknown") }
      : result.error;
  }
  renderMemory();
  const reader = $("#memory-reader");
  if (reader) reader.scrollTop = 0;
}

/* ------------------------------------------------- shared diagnostics bits */

function diagValue(value, isText = false) {
  return `<p class="diag-value${isText ? " is-text" : ""}">${value || "—"}</p>`;
}

function latencyMarkup(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return "—";
  const level = value < 250 ? "good" : value < 900 ? "ok" : "slow";
  return `<span class="latency" data-level="${level}">${fmtNumber(value)} ms</span>`;
}

function diagSkeletonMarkup() {
  return `<div class="diag-skeleton">
    <div class="skeleton skeleton-card diag-sk-grid"></div>
    <div class="skeleton skeleton-card diag-sk-block"></div>
  </div>`;
}

/** A titled block. `aside` (a pill, a count or a select) sits on the title row. */
function diagGroupMarkup(id, titleKey, inner, aside = "") {
  return `<section class="diag-group" id="group-${id}" aria-labelledby="diag-group-${id}">
    <div class="diag-group-head">
      <h2 class="diag-group-title" id="diag-group-${id}">${t(titleKey)}</h2>${aside}
    </div>
    ${inner}
  </section>`;
}

function offlineMarkup(error) {
  return emptyMarkup(
    ICONS.server,
    t("diag.offline.title"),
    t("diag.offline.body"),
    errorMarkup(error, { action: "retry-status" }),
  );
}

function isStatusOffline() {
  return Boolean(state.diag.error && isOffline(state.diag.error));
}

/** Status-derived body shared by the diagnostics and statistics tabs. */
function statusBody(render) {
  const diag = state.diag;
  if (diag.loading && !diag.data && !diag.error) return diagSkeletonMarkup();
  if (diag.error) return errorMarkup(diag.error, { action: "retry-status" });
  return diag.data ? render(diag.data) : "";
}

/* -------------------------------------------------------------- diagnostics */

function diagStatusMarkup(data) {
  const cell = (label, value) =>
    `<div class="diag-cell"><p class="diag-label">${t(label)}</p>${diagValue(value)}</div>`;
  return `<div class="diag-grid">
    ${cell("diag.server", esc(data.apiUrl || "—"))}
    ${cell("diag.bank", esc(data.bank || "—"))}
    ${cell("diag.version", esc(data.version || "—"))}
    ${cell("diag.latency", latencyMarkup(data.latencyMs))}
    ${cell("diag.pages", data.pages === null || data.pages === undefined ? "—" : fmtNumber(data.pages))}
    ${cell("diag.token", esc(data.tokenMasked || "—"))}
  </div>`;
}

function operationsPill(data) {
  if (data.activeOperations === null || data.activeOperations === undefined) {
    return `<span class="pill" title="${t("diag.operations")}">${t("diag.operationsUnknown")}</span>`;
  }
  const active = Number(data.activeOperations) || 0;
  return `<span class="pill" data-level="${active > 0 ? "warn" : "ok"}" title="${t("diag.operations")}">${
    active > 0 ? t("diag.operationsActive", { n: fmtNumber(active) }) : t("diag.operationsNone")
  }</span>`;
}

function reflectResultMarkup(result) {
  const budget = t(`diag.budget.${result.budget || "mid"}`);
  return `<div class="reflect-result">
    <div class="reflect-result-head">
      <strong>${t("diag.reflectResult")}</strong>
      <span>${esc(t("diag.reflectMeta", { budget, ms: fmtNumber(result.ms) }))}</span>
    </div>
    <pre></pre>
  </div>`;
}

function reflectMarkup(reflect) {
  const options = BUDGETS.map(
    (budget) =>
      `<option value="${budget}"${reflect.budget === budget ? " selected" : ""}>${t(
        `diag.budget.${budget}`,
      )}</option>`,
  ).join("");
  const elapsed = reflect.running
    ? Math.max(0, Math.floor((Date.now() - reflect.startedAt) / 1000))
    : 0;
  return `<form class="reflect-card" id="reflect-form" novalidate>
      <p class="field-help">${t("diag.reflectHelp")}</p>
      <label class="sr-only" for="reflect-input">${t("diag.reflectTitle")}</label>
      <textarea class="reflect-input" id="reflect-input" rows="3" placeholder="${t(
        "diag.reflectPlaceholder",
      )}"${reflect.running ? " disabled" : ""}>${esc(reflect.query)}</textarea>
      <div class="reflect-footer">
        <label class="budget" for="reflect-budget">${t("diag.reflectBudget")}</label>
        <div class="select-wrap">
          <select class="ctl-select" id="reflect-budget"${reflect.running ? " disabled" : ""}>${options}</select>
          ${ICONS.chevron}
        </div>
        <button type="submit" class="btn btn-primary" id="reflect-submit"${
          reflect.running ? " disabled" : ""
        }>${reflect.running ? `<span class="spinner"></span>${t("diag.reflectThinking")}` : t(
          "diag.reflectSubmit",
        )}</button>
      </div>
    </form>
    ${
      reflect.running
        ? `<div class="thinking" role="status" aria-live="polite">
            <span class="spinner"></span>
            <span>${t("diag.reflectThinking")}</span>
            <span class="thinking-elapsed" id="reflect-elapsed">${t("diag.reflectElapsed", {
              s: elapsed,
            })}</span>
            <span class="thinking-note">${t("diag.reflectThinkingNote")}</span>
          </div>`
        : ""
    }
    ${reflect.error ? `<div class="reflect-error">${errorMarkup(reflect.error)}</div>` : ""}
    ${reflect.result ? reflectResultMarkup(reflect.result) : ""}`;
}

function focusReflectInput() {
  const input = $("#reflect-input");
  if (!input) return;
  input.focus();
  const end = input.value.length;
  try {
    input.setSelectionRange(end, end);
  } catch (error) {
    /* some browsers reject setSelectionRange on disabled controls */
  }
}

/** Reflect repaints on its own and keeps the answer's scroll position. */
function renderReflect(restoreFocus = document.activeElement?.id === "reflect-input") {
  const box = $("#diag-reflect-box");
  if (!box) return;
  const reflect = state.diag.reflect;
  const scrollTop = box.querySelector(".reflect-result pre")?.scrollTop || 0;
  box.innerHTML = reflectMarkup(reflect);
  const pre = box.querySelector(".reflect-result pre");
  if (pre && reflect.result) {
    pre.textContent = reflect.result.text || t("diag.reflectAnswerEmpty");
    pre.scrollTop = scrollTop;
  }
  if (restoreFocus && !reflect.running) focusReflectInput();
}

function renderDiag() {
  const box = $("#diag-content");
  if (!box) return;
  const diag = state.diag;
  if (isStatusOffline()) {
    box.innerHTML = offlineMarkup(diag.error);
    return;
  }
  const activeId = document.activeElement ? document.activeElement.id : "";
  box.innerHTML =
    diagGroupMarkup(
      "server",
      "diag.statusTitle",
      statusBody(diagStatusMarkup),
      diag.data && !diag.error ? operationsPill(diag.data) : "",
    ) + diagGroupMarkup("reflect", "diag.reflectTitle", '<div id="diag-reflect-box"></div>');
  renderReflect(false);
  if (activeId === "reflect-input" && !diag.reflect.running) focusReflectInput();
}

/* -------------------------------------------------------------- statistics */

function warningFor(what) {
  const list = state.diag.data && Array.isArray(state.diag.data.warnings) ? state.diag.data.warnings : [];
  return list.find((item) => item && item.what === what) || null;
}

function documentsMarkup(documents) {
  if (documents === null || documents === undefined) {
    const warning = warningFor("documents");
    return `<p class="usage-note usage-warning" role="status">${t("diag.docsUnavailable")}${
      warning && warning.message ? ` <code>${esc(warning.code || "")}</code> ${esc(warning.message)}` : ""
    }</p>`;
  }
  const docs = documents && typeof documents === "object" ? documents : {};
  const counts = DOC_TYPES.map((type) => ({ type, count: Number(docs[type]) || 0 }));
  const total = Number.isFinite(Number(docs.total))
    ? Number(docs.total)
    : counts.reduce((sum, item) => sum + item.count, 0);
  const rows = counts
    .map(({ type, count }) => {
      const pct = total > 0 ? Math.max(count > 0 ? 2 : 0, Math.round((count / total) * 100)) : 0;
      return `<div class="doc-row">
        <span class="doc-label" title="${t(`diag.docHint.${type}`)}">${t(`diag.doc.${type}`)}</span>
        <span class="doc-bar"><span class="doc-fill" style="width:${pct}%"></span></span>
        <span class="doc-count">${fmtNumber(count)}</span>
      </div>`;
    })
    .join("");
  return `<div class="doc-list">${rows}</div>`;
}

function documentsTotal(documents) {
  const docs = documents && typeof documents === "object" ? documents : {};
  const parts = DOC_TYPES.reduce((sum, type) => sum + (Number(docs[type]) || 0), 0);
  return Number.isFinite(Number(docs.total)) ? Number(docs.total) : parts;
}

function usageValue(value) {
  return value === null || value === undefined ? "—" : fmtNumber(value);
}

function fmtCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(state.locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
  } catch (error) {
    return String(n);
  }
}

/** Every price in the plugin is USD. */
function fmtMoney(value) {
  if (!Number.isFinite(value)) return "—";
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}

/**
 * Estimated cost of one model row. Cached input is billed at the cached price (falls back to the
 * input price); reasoning tokens are not billed on top. Null when the model has no usable price.
 */
function estimateCost(row, price) {
  if (!price || price.input == null || price.output == null) return null;
  const tokens = row.tokens || {};
  const input = Number(tokens.input) || 0;
  const cached = Math.min(Number(tokens.cached) || 0, input);
  const cachedRate = price.cached == null ? price.input : price.cached;
  return ((input - cached) * price.input + cached * cachedRate + (Number(tokens.output) || 0) * price.output) / 1e6;
}

/** Day buckets are cut by the server at local midnight; show the day only, in local time. */
function fmtBucket(iso, trunc) {
  const date = new Date(String(iso || ""));
  if (Number.isNaN(date.getTime())) return String(iso || "");
  const options =
    trunc === "hour"
      ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { dateStyle: "medium" };
  try {
    return new Intl.DateTimeFormat(state.locale, options).format(date);
  } catch (error) {
    return date.toLocaleString();
  }
}

function usageErrorMarkup(error) {
  // 404 means "this server has no such endpoint / bank": nothing to retry.
  if (error && error.code === "NOT_FOUND") {
    return `<p class="usage-note usage-unsupported" role="status">${t("usage.unsupported")}</p>`;
  }
  return errorMarkup(error, { action: "retry-usage" });
}

function usageHistoryMarkup(data) {
  const buckets = Array.isArray(data.buckets) ? data.buckets : [];
  if (!buckets.length) return "";
  // Newest first.
  const sorted = [...buckets].sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0));
  const rows = sorted
    .map(
      (bucket) => `<tr>
        <th scope="row">${esc(fmtBucket(bucket.time, data.trunc))}</th>
        <td>${usageValue(bucket.requests)}</td><td>${usageValue(bucket.tokens && bucket.tokens.total)}</td>
      </tr>`,
    )
    .join("");
  const label = data.trunc === "hour" ? t("usage.historyHour") : t("usage.historyDay");
  return `<details class="usage-history"><summary>${label}</summary>
    <div class="usage-table-wrap"><table class="usage-table">
      <thead><tr><th scope="col">${t("usage.time")}</th><th scope="col">${t("usage.requests")}</th><th scope="col">${t("usage.total")}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></details>`;
}

function usageDataMarkup(data) {
  const totals = data.totals || {};
  const tokens = totals.tokens || {};
  const parts = [];
  if (totals.requests === 0) {
    parts.push(`<p class="usage-note usage-empty">${t("usage.empty")}</p>`);
  } else {
    const breakdown = ["input", "output", "cached", "thoughts"]
      .map(
        (field) =>
          `<span class="usage-part"><span class="usage-part-label">${t(`usage.${field}`)}</span><b>${usageValue(tokens[field])}</b></span>`,
      )
      .join("");
    const statuses = Object.entries(totals.statuses || {})
      .map(([status, count]) => {
        const key = `usage.status.${status}`;
        const label = t(key) === key ? status : t(key);
        const level = status === "success" ? "ok" : status === "error" ? "warn" : "";
        return `<span class="pill" data-level="${level}">${esc(label)} ${usageValue(count)}</span>`;
      })
      .join("");
    parts.push(`<div class="usage-primary">
        <div class="usage-stat"><p class="diag-label">${t("usage.requests")}</p><p class="usage-big">${usageValue(totals.requests)}</p></div>
        <div class="usage-stat"><p class="diag-label">${t("usage.total")}</p><p class="usage-big">${usageValue(tokens.total)}</p></div>
      </div>
      <div class="usage-breakdown">${breakdown}</div>
      ${statuses ? `<div class="status-line usage-statuses">${statuses}</div>` : ""}
      <p class="usage-note">${t("usage.note")}</p>`);
  }
  if (data.retentionDays != null && data.retentionDays < Number.parseInt(data.period, 10)) {
    parts.push(`<p class="usage-note usage-warning">${esc(t("usage.retention", { n: data.retentionDays }))}</p>`);
  }
  if (totals.requests !== 0) parts.push(usageHistoryMarkup(data));
  return parts.join("");
}

function usageBodyMarkup(usage) {
  if (usage.error) return usageErrorMarkup(usage.error);
  // Keep the previous result on screen while a new period loads (no height jump).
  if (usage.data) return usageDataMarkup(usage.data);
  return `<p class="usage-note" role="status"><span class="spinner"></span> ${t("common.loading")}</p>`;
}

function usageMarkup() {
  return `<div class="stats-block">${usageBodyMarkup(state.stats.usage)}</div>`;
}

function periodSelectMarkup() {
  const options = USAGE_PERIODS.map(
    (period) =>
      `<option value="${period}"${state.stats.period === period ? " selected" : ""}>${t(`usage.period.${period}`)}</option>`,
  ).join("");
  return `<div class="select-wrap"><select class="ctl-select" id="usage-period" aria-label="${t("usage.period")}">${options}</select>${ICONS.chevron}</div>`;
}

/* ---- per-model breakdown and price editor */

function priceInput(draft, model, field) {
  const entry = draft.models[model];
  const value = entry && entry[field] != null ? entry[field] : "";
  return `<label class="price-field"><span>${t(`price.${field}`)}</span><input class="ctl-input is-mono" type="number" inputmode="decimal" min="0" step="any"
    data-price-model="${esc(model)}" data-price-field="${field}" value="${esc(value)}" placeholder="—" /></label>`;
}

function priceEditorMarkup(models) {
  const prices = state.stats.prices;
  if (!prices.draft) return "";
  const names = [...new Set([...models.map((row) => row.model), ...Object.keys(prices.draft.models)])];
  const rows = names
    .map(
      (name) => `<div class="price-row">
        <span class="price-model" title="${esc(name)}">${esc(name)}</span>
        <div class="price-inputs">${["input", "cached", "output"].map((field) => priceInput(prices.draft, name, field)).join("")}</div>
      </div>`,
    )
    .join("");
  return `<details class="usage-history price-editor" id="price-editor"${prices.open ? " open" : ""}>
    <summary>${t("price.title")}</summary>
    <div class="price-body">
      ${prices.warning ? `<p class="usage-note usage-warning">${esc(prices.warning)}</p>` : ""}
      <div class="price-toolbar">
        <button type="button" class="btn btn-quiet" data-action="fill-prices"${prices.filling ? " disabled" : ""}>${t("price.fill")}</button>
        <span class="usage-note">${t("price.fillHint")}</span>
      </div>
      <div class="price-rows">${rows}</div>
      <p class="usage-note">${t("price.help")}</p>
      ${prices.saveError ? `<div class="reflect-error">${errorMarkup(prices.saveError)}</div>` : ""}
      <div class="price-actions">
        <button type="button" class="btn btn-primary" data-action="save-prices"${prices.saving ? " disabled" : ""}>${
          prices.saving ? `<span class="spinner"></span>` : ""
        }${t("price.save")}</button>
      </div>
    </div>
  </details>`;
}

function modelsTableMarkup(data) {
  const prices = state.stats.prices.data;
  let costTotal = 0;
  let priced = 0;
  const rows = data.models
    .map((row) => {
      const cost = estimateCost(row, prices && prices.models[row.model]);
      if (cost !== null) {
        costTotal += cost;
        priced += 1;
      }
      return `<tr>
        <th scope="row" title="${esc(row.provider ? `${row.provider}/${row.model}` : row.model)}">${esc(row.model)}</th>
        <td>${fmtNumber(row.requests)}</td>
        <td>${fmtCompact(row.tokens.input)}</td>
        <td>${fmtCompact(row.tokens.output)}</td>
        <td>${fmtCompact(row.tokens.cached)}</td>
        <td>${cost === null ? `<span class="muted">${t("price.unset")}</span>` : fmtMoney(cost)}</td>
      </tr>`;
    })
    .join("");
  const unpriced = data.models.length - priced;
  const summary = priced
    ? `<div class="usage-cost"><span class="usage-part-label">${t("price.estimated")}</span><b class="usage-big">${fmtMoney(
        costTotal,
      )}</b>${unpriced ? `<span class="usage-note">${t("price.unpriced", { n: unpriced })}</span>` : ""}</div>`
    : `<p class="usage-note">${t("price.none")}</p>`;
  return `${summary}
    <div class="usage-table-wrap is-boxed"><table class="usage-table models-table">
      <thead><tr><th scope="col">${t("models.model")}</th><th scope="col">${t("usage.requests")}</th><th scope="col">${t(
        "usage.input",
      )}</th><th scope="col">${t("usage.output")}</th><th scope="col">${t("usage.cached")}</th><th scope="col">${t(
        "price.cost",
      )}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${
      data.partial
        ? `<p class="usage-note usage-warning">${t("models.partial", { n: fmtNumber(data.scanned), since: fmtDate(data.since) })}</p>`
        : ""
    }`;
}

function modelsBodyMarkup() {
  const models = state.stats.models;
  if (models.error) {
    if (models.error.code === "NOT_FOUND") {
      return `<p class="usage-note usage-unsupported" role="status">${t("models.unsupported")}</p>`;
    }
    return errorMarkup(models.error, { action: "retry-models" });
  }
  if (!models.data) {
    return `<p class="usage-note" role="status"><span class="spinner"></span> ${t("common.loading")}</p>`;
  }
  if (!models.data.models.length) return `<p class="usage-note usage-empty">${t("models.empty")}</p>`;
  return modelsTableMarkup(models.data) + priceEditorMarkup(models.data.models);
}

function modelsMarkup() {
  return `<h3 class="diag-heading">${t("models.title")}</h3><div class="stats-block">${modelsBodyMarkup()}</div>`;
}

function updateStatsBusy() {
  const stats = state.stats;
  $("#group-llm")?.setAttribute("aria-busy", String(Boolean(stats.usage.loading || stats.models.loading)));
}

function renderUsage() {
  const box = $("#stats-usage-box");
  if (box) box.innerHTML = usageMarkup();
  updateStatsBusy();
}

function renderModels() {
  const box = $("#stats-models-box");
  if (box) box.innerHTML = modelsMarkup();
  updateStatsBusy();
}

function renderStats() {
  const box = $("#stats-content");
  if (!box) return;
  const diag = state.diag;
  if (isStatusOffline()) {
    box.innerHTML = offlineMarkup(diag.error);
    return;
  }
  const activeId = document.activeElement ? document.activeElement.id : "";
  const total =
    diag.data && !diag.error && diag.data.documents
      ? `<span class="diag-total">${t("diag.docTotal", { n: fmtNumber(documentsTotal(diag.data.documents)) })}</span>`
      : "";
  box.innerHTML =
    diagGroupMarkup("docs", "diag.documents", statusBody((data) => documentsMarkup(data.documents)), total) +
    diagGroupMarkup(
      "llm",
      "usage.title",
      '<div id="stats-usage-box"></div><div id="stats-models-box" class="stats-models"></div>',
      periodSelectMarkup(),
    );
  renderUsage();
  renderModels();
  if (activeId === "usage-period") $("#usage-period")?.focus();
}

async function loadUsage(period = state.stats.period) {
  const token = ++seq.usage;
  const usage = state.stats.usage;
  state.stats.period = period;
  usage.loading = true;
  usage.error = null;
  renderUsage();
  const result = await invokeData("hindsight.bank.usage", { period });
  if (token !== seq.usage) return;
  usage.loading = false;
  usage.loaded = true;
  usage.data = result.ok ? result : null;
  usage.error = result.ok ? null : result.error;
  renderUsage();
}

async function loadModels(period = state.stats.period, refresh = false) {
  const token = ++seq.models;
  const models = state.stats.models;
  state.stats.period = period;
  models.loading = true;
  models.error = null;
  renderModels();
  // First paint from the local cache (instant), then sync with the server for anything newer.
  if (!models.data) {
    const cached = await invokeData("hindsight.bank.usageModels", { period, cacheOnly: true });
    if (token !== seq.models) return;
    if (cached.ok && !cached.cold) {
      models.data = cached;
      renderModels();
    }
  }
  const result = await invokeData("hindsight.bank.usageModels", { period, refresh });
  if (token !== seq.models) return;
  models.loading = false;
  models.loaded = true;
  if (result.ok) {
    models.data = result;
    models.error = null;
  } else {
    // A failed sync keeps whatever the cache showed; only an empty panel shows the error.
    models.error = models.data ? null : result.error;
    if (models.data) toast(result.error && result.error.message ? result.error.message : t("error.unknown"));
  }
  renderModels();
}

function priceDraftFrom(prices) {
  const models = {};
  for (const [name, entry] of Object.entries(prices.models || {})) {
    models[name] = {
      input: entry.input == null ? "" : String(entry.input),
      cached: entry.cached == null ? "" : String(entry.cached),
      output: entry.output == null ? "" : String(entry.output),
    };
  }
  return { models };
}

async function loadPrices() {
  const prices = state.stats.prices;
  if (prices.loading) return;
  prices.loading = true;
  const result = await invokeData("hindsight.prices.read");
  prices.loading = false;
  prices.loaded = true;
  const data = result.ok ? result.prices : { models: {} };
  prices.data = data;
  prices.warning = result.ok ? result.warning || "" : "";
  prices.draft = priceDraftFrom(data);
  renderModels();
}

/** Fill still-empty rows from the bundled catalog; prices the user already typed are never touched. */
async function fillPrices() {
  const prices = state.stats.prices;
  if (prices.filling || !prices.draft) return;
  const seen = (state.stats.models.data?.models || []).map((row) => row.model);
  const names = [...new Set([...seen, ...Object.keys(prices.draft.models)])];
  const isEmpty = (name) => {
    const entry = prices.draft.models[name];
    return !entry || ["input", "cached", "output"].every((field) => !String(entry[field] ?? "").trim());
  };
  const wanted = names.filter(isEmpty);
  if (!wanted.length) {
    toast(t("price.fillNothing"));
    return;
  }
  prices.filling = true;
  renderModels();
  const result = await invokeData("hindsight.prices.suggest", { models: wanted });
  prices.filling = false;
  if (!result.ok) {
    prices.saveError = result.error;
    renderModels();
    return;
  }
  prices.saveError = null;
  let filled = 0;
  for (const [name, price] of Object.entries(result.suggestions || {})) {
    prices.draft.models[name] = {
      input: price.input == null ? "" : String(price.input),
      cached: price.cached == null ? "" : String(price.cached),
      output: price.output == null ? "" : String(price.output),
    };
    filled += 1;
  }
  prices.open = true;
  renderModels();
  const missed = (result.unmatched || []).length;
  toast(
    filled
      ? t("price.filled", { n: filled }) + (missed ? t("price.filledMissed", { m: missed }) : "")
      : t("price.filledNone"),
  );
}

function loadStats(period = state.stats.period, refresh = false) {
  const jobs = [loadUsage(period), loadModels(period, refresh)];
  if (!state.stats.prices.loaded) jobs.push(loadPrices());
  return Promise.allSettled(jobs);
}

function priceDraftToPayload(draft) {
  const models = {};
  const fieldErrors = {};
  for (const [name, entry] of Object.entries(draft.models)) {
    const price = {};
    for (const field of ["input", "cached", "output"]) {
      const raw = String(entry[field] ?? "").trim();
      if (!raw) {
        price[field] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) fieldErrors[`${name}.${field}`] = raw;
      else price[field] = n;
    }
    models[name] = price;
  }
  return { payload: { models }, fieldErrors };
}

async function savePrices() {
  const prices = state.stats.prices;
  if (prices.saving || !prices.draft) return;
  const { payload, fieldErrors } = priceDraftToPayload(prices.draft);
  if (Object.keys(fieldErrors).length) {
    prices.saveError = { code: "INVALID_CONFIG", message: t("price.invalid") };
    renderModels();
    return;
  }
  prices.saving = true;
  prices.saveError = null;
  renderModels();
  const result = await invokeData("hindsight.prices.save", { prices: payload });
  prices.saving = false;
  if (result.ok) {
    prices.data = result.prices;
    prices.draft = priceDraftFrom(result.prices);
    prices.warning = "";
    toast(t("price.saved"));
  } else {
    prices.saveError = result.error;
  }
  renderModels();
}

function startReflectTimer() {
  stopReflectTimer();
  state.diag.reflect.timer = window.setInterval(() => {
    const reflect = state.diag.reflect;
    if (!reflect.running) return;
    const node = $("#reflect-elapsed");
    if (!node) return;
    const seconds = Math.max(0, Math.floor((Date.now() - reflect.startedAt) / 1000));
    node.textContent = t("diag.reflectElapsed", { s: seconds });
  }, 1000);
}

function stopReflectTimer() {
  if (state.diag.reflect.timer) {
    window.clearInterval(state.diag.reflect.timer);
    state.diag.reflect.timer = 0;
  }
}

async function submitReflect() {
  const reflect = state.diag.reflect;
  if (reflect.running) return;
  const query = String(reflect.query || "").trim();
  if (!query) {
    reflect.error = { code: "EMPTY_QUERY", message: t("diag.reflectRequired") };
    renderReflect();
    $("#reflect-input")?.focus();
    return;
  }
  if (isOfflineNow()) {
    reflect.error = state.status.error;
    renderReflect();
    return;
  }

  reflect.query = query;
  reflect.running = true;
  reflect.startedAt = Date.now();
  reflect.result = null;
  reflect.error = null;
  renderReflect();
  startReflectTimer();

  const result = await invokeData("hindsight.bank.reflect", {
    query,
    budget: reflect.budget,
  });

  reflect.running = false;
  stopReflectTimer();
  if (result.ok) {
    reflect.result = {
      text: result.text ? String(result.text) : "",
      budget: result.budget || reflect.budget,
      ms: Number(result.ms) || 0,
    };
    reflect.error = null;
  } else {
    reflect.error = result.error;
  }
  renderReflect();
}

/* ------------------------------------------------------------------- tabs */

function syncTabs() {
  $$(".tab").forEach((tab) => {
    const active = tab.dataset.tab === state.tab;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  $$(".view").forEach((view) => {
    view.hidden = view.id !== `view-${state.tab}`;
  });
}

function activateTab(name, options = {}) {
  if (!["config", "memory", "stats", "diagnostics"].includes(name)) return;
  state.tab = name;
  syncTabs();
  if (options.focus) {
    const tab = $(`[data-tab="${name}"]`);
    if (tab) tab.focus();
  }
  if (name === "diagnostics" && !state.diag.loading && !state.diag.data && !state.diag.error) {
    loadStatus();
  }
  if (name === "stats" && !state.diag.loading && !state.diag.data && !state.diag.error) {
    loadStatus();
  }
  if (name === "stats" && !state.stats.usage.loaded && !state.stats.usage.loading) {
    loadStats();
  }
  if (name === "memory" && !state.pages.loading && !state.pages.loaded && !state.pages.error) {
    loadPages();
  }
}

function onTabKeydown(event) {
  const tabs = $$(".tab");
  const index = tabs.indexOf(document.activeElement);
  if (index < 0) return;
  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
  else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  else return;
  event.preventDefault();
  activateTab(tabs[next].dataset.tab, { focus: true });
}

/* --------------------------------------------------------------- refresh */

function updateRefreshUI() {
  const button = $("#refresh-btn");
  if (!button) return;
  button.setAttribute("aria-busy", String(refreshing));
  button.disabled = refreshing;
}

async function refreshCurrent() {
  if (refreshing) return;
  refreshing = true;
  updateRefreshUI();
  const jobs = [loadStatus()];
  if (state.tab === "config") {
    jobs.push(loadConfig());
  } else if (state.tab === "memory") {
    if (state.search.query) jobs.push(runSearch(state.search.input));
    else jobs.push(loadPages());
  } else if (state.tab === "stats") {
    jobs.push(loadUsage(), loadModels(state.stats.period, true));
  }
  await Promise.allSettled(jobs);
  refreshing = false;
  updateRefreshUI();
}

/* -------------------------------------------------------------- appearance */

function applyAppearance(appearance) {
  let changed = false;
  if (appearance && typeof appearance === "object") {
    let base = appearance.base;
    if (base === "system") {
      try {
        base = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } catch (error) {
        base = null;
      }
    }
    if ((base === "light" || base === "dark") && document.documentElement.dataset.base !== base) {
      document.documentElement.dataset.base = base;
      document.documentElement.style.colorScheme = base;
    }
    // data-base is the palette switch. data-theme stays untouched so a host
    // that sets it to a plugin theme id keeps ownership of that attribute.
    if (typeof appearance.locale === "string" && appearance.locale) {
      document.documentElement.lang = appearance.locale;
      const next = normalizeLocale(appearance.locale);
      if (next !== state.locale) {
        state.locale = next;
        changed = true;
      }
    }
  }
  writeAppearanceCache();
  if (changed) renderAll();
}

function renderAll() {
  applyStaticStrings();
  renderStatus();
  renderConfig();
  renderMemory();
  renderDiag();
  renderStats();
  syncTabs();
  updateRefreshUI();
}

/* ------------------------------------------------------------------ boot */

async function boot() {
  unsubscribeAppearance = bridgeOn("appearance:changed", (appearance) => {
    applyAppearance(appearance);
  });

  const appearance = await invokeHost("app.getAppearance");
  if (appearance && typeof appearance === "object") {
    applyAppearance(appearance);
  }
  if (!appearance || !appearance.locale) {
    const locale = await invokeHost("app.getLocale");
    if (typeof locale === "string" && locale) {
      document.documentElement.lang = locale;
      const next = normalizeLocale(locale);
      if (next !== state.locale) {
        state.locale = next;
        renderAll();
      }
    }
  }

  await Promise.allSettled([loadStatus(), loadConfig(), loadPages()]);
}

/* ---------------------------------------------------------------- events */

function bindEvents() {
  $("#refresh-btn")?.addEventListener("click", refreshCurrent);
  $("#config-save")?.addEventListener("click", saveConfig);
  $("#config-undo")?.addEventListener("click", undoConfig);

  const tablist = $(".tabs");
  tablist?.addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (tab) activateTab(tab.dataset.tab);
  });
  tablist?.addEventListener("keydown", onTabKeydown);

  const groups = $("#config-groups");
  const onFieldInput = (event) => {
    const control = event.target.closest("[data-field]");
    if (!control) return;
    const row = control.closest("[data-field-key]");
    if (!row) return;
    const field = state.config.fieldMap[row.dataset.fieldKey];
    if (!field || field.type === "boolean") return;
    const value = field.type === "number" ? control.value : control.value;
    updateFieldValue(field, row, value);
  };
  groups?.addEventListener("input", onFieldInput);
  groups?.addEventListener("change", (event) => {
    if (event.target.tagName === "SELECT") onFieldInput(event);
  });

  const searchForm = $("#memory-search-form");
  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isOfflineNow()) runSearch(state.search.input);
  });
  $("#memory-search")?.addEventListener("input", (event) => {
    state.search.input = event.target.value;
    syncSearchClear();
  });
  $("#memory-search")?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      clearSearch();
    }
  });
  $("#memory-clear")?.addEventListener("click", clearSearch);

  const diagContent = $("#diag-content");
  diagContent?.addEventListener("submit", (event) => {
    if (event.target.id !== "reflect-form") return;
    event.preventDefault();
    submitReflect();
  });
  diagContent?.addEventListener("input", (event) => {
    if (event.target.id === "reflect-input") state.diag.reflect.query = event.target.value;
  });
  diagContent?.addEventListener("change", (event) => {
    if (event.target.id === "reflect-budget") state.diag.reflect.budget = event.target.value;
  });
  diagContent?.addEventListener("keydown", (event) => {
    if (
      event.target.id === "reflect-input" &&
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      submitReflect();
    }
  });

  const statsContent = $("#stats-content");
  statsContent?.addEventListener("change", (event) => {
    const { target } = event;
    if (target.id === "usage-period") {
      state.stats.period = target.value;
      loadStats(target.value);
    }
  });
  statsContent?.addEventListener("input", (event) => {
    const { target } = event;
    const draft = state.stats.prices.draft;
    if (!draft || !target.dataset || !target.dataset.priceModel) return;
    const entry = (draft.models[target.dataset.priceModel] ||= { input: "", cached: "", output: "" });
    entry[target.dataset.priceField] = target.value;
  });
  // `toggle` does not bubble, so listen in the capture phase to remember the editor's open state.
  statsContent?.addEventListener(
    "toggle",
    (event) => {
      if (event.target.id === "price-editor") state.stats.prices.open = event.target.open;
    },
    true,
  );

  $("#app")?.addEventListener("click", async (event) => {
    const actionNode = event.target.closest("[data-action]");
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    if (action === "toggle-bool") {
      const row = actionNode.closest("[data-field-key]");
      const field = row ? state.config.fieldMap[row.dataset.fieldKey] : null;
      if (!field || actionNode.disabled) return;
      const next = actionNode.getAttribute("aria-checked") !== "true";
      actionNode.setAttribute("aria-checked", String(next));
      updateFieldValue(field, row, next);
      return;
    }
    if (action === "reveal-secret") {
      const row = actionNode.closest("[data-field-key]");
      const field = row ? state.config.fieldMap[row.dataset.fieldKey] : null;
      if (!field) return;
      const visible = !state.config.secretVisible[field.key];
      state.config.secretVisible[field.key] = visible;
      const input = row.querySelector("input[data-field]");
      if (input) input.type = visible ? "text" : "password";
      actionNode.setAttribute("aria-pressed", String(visible));
      actionNode.setAttribute("aria-label", visible ? t("common.hide") : t("common.show"));
      actionNode.title = visible ? t("common.hide") : t("common.show");
      actionNode.innerHTML = visible ? ICONS.eyeOff : ICONS.eye;
      return;
    }
    if (action === "clear-secret") {
      const row = actionNode.closest("[data-field-key]");
      const field = row ? state.config.fieldMap[row.dataset.fieldKey] : null;
      if (!field) return;
      const input = row.querySelector("input[data-field]");
      if (input) {
        input.value = "";
        input.focus();
      }
      updateFieldValue(field, row, "");
      return;
    }
    if (action === "open-page") {
      openPage(actionNode.dataset.pageId);
      return;
    }
    if (action === "retry-config") {
      loadConfig();
      return;
    }
    if (action === "retry-usage") {
      loadUsage();
      return;
    }
    if (action === "retry-models") {
      loadModels(state.stats.period, true);
      return;
    }
    if (action === "save-prices") {
      savePrices();
      return;
    }
    if (action === "fill-prices") {
      fillPrices();
      return;
    }
    if (action === "retry-status") {
      loadStatus();
      return;
    }
    if (action === "retry-pages") {
      loadPages();
      return;
    }
    if (action === "retry-search") {
      if (state.search.query) runSearch(state.search.input);
      else loadPages();
      return;
    }
    if (action === "retry-read") {
      if (state.reader.id) openPage(state.reader.id);
      return;
    }
  });

  window.addEventListener("pagehide", () => {
    stopReflectTimer();
    if (typeof unsubscribeAppearance === "function") unsubscribeAppearance();
  });
}

/* ------------------------------------------------------------------- init */

function init() {
  const cached = readAppearanceCache();
  const documentLang = document.documentElement.lang;
  // A non-default lang was set by the host preload; it outranks the cache.
  const hostLang = documentLang && documentLang !== "zh-CN" ? documentLang : "";
  state.locale = normalizeLocale(
    hostLang || (cached && cached.locale) || documentLang || navigator.language,
  );
  renderShell();
  bindEvents();
  applyStaticStrings();
  renderAll();
  boot();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
