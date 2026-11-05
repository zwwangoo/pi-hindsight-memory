// Read-only Hindsight bank client for the panel.
//
// Mirrors the endpoints the upstream extension uses (vendor/hindsight-pi.mjs, HindsightClient):
//   GET  {apiUrl}/v1/version                     -> { api_version }
//   GET  {bankUrl}/documents?limit=&offset=      -> { items:[{id}], total }
//   GET  {bankUrl}/operations                    -> { operations|items:[{status}] }
//   GET  {bankUrl}/llm-requests/stats?period=&call_type=llm -> time buckets + token sums
//   GET  {bankUrl}/knowledge-base/tree           -> { roots:[{id,name,kind,children}] }
//   GET  {bankUrl}/knowledge-base/pages/{id}     -> page (body/markdown)
//   GET  {bankUrl}/knowledge-base/search?q=&limit=
//   POST {bankUrl}/reflect  { query, budget }    -> { text }
// where bankUrl = {apiUrl}/v1/default/banks/{bankId}.
//
// Everything here is read-only: no retain, no delete, no reset.

import { resolveConnection } from "./config.mjs";
import { loadEntry, saveEntry, emptyEntry } from "./usage-cache.mjs";
import { PanelError, scrub, maskSecret } from "./errors.mjs";

const TERMINAL = new Set(["completed", "failed", "cancelled", "error"]);
const USER_AGENT = "hindsight-memory-panel";
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_SUMMARY = 300;

function bankUrl(conn, suffix = "") {
  return `${conn.apiUrl}/v1/default/banks/${encodeURIComponent(conn.bankId)}${suffix}`;
}

async function request(url, { method = "GET", body, token, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Encoding": "identity" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new PanelError("TIMEOUT", `请求超时（${timeoutMs}ms）`, {
        hint: "服务端较慢或不可达。可调大 injectTimeoutMs / reflectTimeoutMs 后重试。",
        cause: e,
      });
    }
    const detail = scrub(String(e?.cause?.code ?? e?.cause?.message ?? e?.message ?? e), token);
    const tls = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/i.test(detail);
    throw new PanelError(
      "OFFLINE",
      tls ? "TLS 证书校验失败" : "无法连接服务端",
      {
        hint: tls
          ? "自签名或过期证书会让 Node 拒绝连接；请给该域名换有效证书，或改用 reverse proxy。"
          : `目标：${new URL(url).host}，原因：${detail}`,
        cause: e,
      },
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) {
    try {
      return await res.json();
    } catch {
      throw new PanelError("HTTP_ERROR", "服务端返回的不是 JSON", { hint: `状态 ${res.status}，可能被网关或登录页拦截。` });
    }
  }

  let summary = "";
  try {
    summary = scrub(await res.text(), token, MAX_SUMMARY);
  } catch {
    /* body is optional */
  }

  switch (res.status) {
    case 401:
      throw new PanelError("UNAUTHORIZED", "认证失败（401）", { hint: "apiToken 可能无效或已过期，可在配置页更新后保存。" });
    case 403:
      throw new PanelError("FORBIDDEN", "无权访问该 bank（403）", { hint: "确认 token 是否有这个 bank 的读权限。" });
    case 404:
      throw new PanelError("NOT_FOUND", "端点或 bank 不存在（404）", {
        hint: "服务端版本可能过低（knowledge base 需较新版本），或 bankId 尚未创建。",
      });
    case 429: {
      const retryAfter = Number(res.headers.get("retry-after"));
      const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined;
      throw new PanelError("RATE_LIMITED", "被限流（429）", {
        hint: retryAfterMs ? `请等待约 ${Math.round(retryAfterMs / 1000)} 秒后重试。` : "请稍后重试。",
        retryAfterMs,
      });
    }
    default: {
      const hint = res.status >= 500 ? "服务端内部错误，可稍后重试；持续出现请查看服务端日志。" : undefined;
      throw new PanelError("HTTP_ERROR", `HTTP ${res.status}${summary ? `：${summary}` : ""}`, { hint });
    }
  }
}

function flattenPages(roots) {
  const items = [];
  const walk = (nodes, folder) => {
    for (const node of nodes || []) {
      if (!node || !node.id || !node.name) continue;
      if (node.kind === "page") {
        items.push({
          id: node.id,
          name: node.name,
          ...(node.description ? { description: node.description } : {}),
          ...(folder ? { folder } : {}),
        });
      }
      if (Array.isArray(node.children) && node.children.length) {
        walk(node.children, node.kind === "folder" ? node.name : folder);
      }
    }
  };
  walk(roots, undefined);
  return items;
}

function bucketDocuments(items) {
  const counts = { git: 0, gitlog: 0, conversation: 0, survey: 0, other: 0 };
  for (const item of items) {
    const id = String(item?.id ?? "");
    if (id.startsWith("git:")) counts.git += 1;
    else if (id.startsWith("gitlog:")) counts.gitlog += 1;
    else if (id.startsWith("conversation:") || id.startsWith("chat:")) counts.conversation += 1;
    else if (id.startsWith("survey-baseline:") || id.startsWith("repository-")) counts.survey += 1;
    else counts.other += 1;
  }
  return counts;
}

const DOC_PAGE_SIZE = 500;
const DOC_MAX_PAGES = 20;

/** All document ids of the bank, paged so a bank past 500 documents is not silently undercounted. */
async function listDocuments(conn) {
  const items = [];
  let total = null;
  for (let page = 0; page < DOC_MAX_PAGES; page += 1) {
    const json = await request(bankUrl(conn, `/documents?limit=${DOC_PAGE_SIZE}&offset=${page * DOC_PAGE_SIZE}`), {
      token: conn.apiToken,
    });
    const got = Array.isArray(json?.items) ? json.items : [];
    if (Number.isFinite(Number(json?.total))) total = Number(json.total);
    items.push(...got);
    if (got.length < DOC_PAGE_SIZE || (total !== null && items.length >= total)) break;
  }
  return { items, total: total ?? items.length };
}

async function serverVersion(conn) {
  try {
    const json = await request(`${conn.apiUrl}/v1/version`, { token: conn.apiToken, timeoutMs: 8000 });
    return json?.api_version ? String(json.api_version) : null;
  } catch (e) {
    if (e?.code === "UNAUTHORIZED" || e?.code === "FORBIDDEN") throw e;
    return null;
  }
}

/** `hindsight.bank.status` — never throws for partial data; throws only when the server is unreachable. */
export async function status() {
  const conn = resolveConnection();
  const started = Date.now();
  const version = await serverVersion(conn);

  const warnings = [];
  const failures = [];
  const settle = async (what, fn, fallback) => {
    try {
      return await fn();
    } catch (e) {
      failures.push(e);
      warnings.push({ what, code: e?.code ?? "INTERNAL", message: String(e?.message ?? e) });
      return fallback;
    }
  };

  const [docs, activeOperations, pages] = await Promise.all([
    settle("documents", () => listDocuments(conn), null),
    settle(
      "operations",
      async () => {
        const json = await request(bankUrl(conn, "/operations"), { token: conn.apiToken });
        const ops = Array.isArray(json.operations) ? json.operations : Array.isArray(json.items) ? json.items : [];
        return ops.filter((op) => !TERMINAL.has(String(op?.status ?? "").toLowerCase())).length;
      },
      null,
    ),
    settle("pages", async () => flattenPages((await request(bankUrl(conn, "/knowledge-base/tree"), { token: conn.apiToken })).roots).length, null),
  ]);

  // Nothing answered: report the transport failure instead of a hollow "ok:true, all null" that the
  // view would have to interpret. One failing section is different — that stays a warning.
  if (failures.length === 3 && version === null) {
    throw failures.find((e) => e?.code === "OFFLINE" || e?.code === "TIMEOUT") ?? failures[0];
  }

  const items = docs ? docs.items : [];
  return {
    bank: conn.bankId,
    apiUrl: conn.apiUrl,
    version,
    latencyMs: Date.now() - started,
    pages,
    documents: docs === null ? null : { total: docs.total, ...bucketDocuments(items) },
    activeOperations,
    tokenMasked: maskSecret(conn.apiToken),
    warnings,
  };
}

/** `hindsight.bank.pages` */
export async function listPages() {
  const conn = resolveConnection();
  const json = await request(bankUrl(conn, "/knowledge-base/tree"), { token: conn.apiToken });
  return { items: flattenPages(json?.roots) };
}

/** `hindsight.bank.search` */
export async function search(query, limit) {
  const q = String(query ?? "").trim();
  if (!q) throw new PanelError("INVALID_CONFIG", "搜索关键词为空");
  const conn = resolveConnection();
  const n = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const url = bankUrl(conn, `/knowledge-base/search?q=${encodeURIComponent(q)}&limit=${n}`);
  const json = await request(url, { token: conn.apiToken });
  const items = (json?.results ?? []).map((hit) => ({
    id: hit.id,
    name: hit.name,
    ...(hit.source_query ? { source_query: hit.source_query } : {}),
    ...(hit.snippet ? { snippet: hit.snippet } : {}),
  }));
  return { items, query: q };
}

/** `hindsight.bank.read` */
export async function readPage(pageId) {
  const id = String(pageId ?? "").trim();
  if (!id) throw new PanelError("INVALID_CONFIG", "pageId 为空");
  const conn = resolveConnection();
  let json;
  try {
    json = await request(bankUrl(conn, `/knowledge-base/pages/${encodeURIComponent(id)}`), { token: conn.apiToken });
  } catch (e) {
    if (e?.code === "NOT_FOUND") {
      throw new PanelError("NOT_FOUND", `找不到页面：${id}`, { hint: "页面可能已被重建（id 变了）。重新加载页列表后再试。" });
    }
    throw e;
  }
  const body = typeof json?.body === "string" && json.body.trim() ? json.body : json?.markdown;
  return {
    page: {
      id: json?.id ?? id,
      name: json?.name ?? id,
      ...(json?.description ? { description: json.description } : {}),
      ...(Array.isArray(json?.tags) && json.tags.length ? { tags: json.tags } : {}),
      ...(json?.timestamp ? { last_updated_at: json.timestamp } : {}),
      body: typeof body === "string" ? body : "",
    },
  };
}

/** The server accepts low|mid|high only (upstream REFLECT_BUDGETS). */
function normalizeBudget(value) {
  const v = String(value ?? "").toLowerCase();
  return v === "high" || v === "mid" ? v : "low";
}

/** `hindsight.bank.reflect` */
export async function reflect(query, budget) {
  const q = String(query ?? "").trim();
  if (!q) throw new PanelError("INVALID_CONFIG", "问题为空");
  const conn = resolveConnection();
  const chosen = normalizeBudget(budget);
  const timeoutMs = Math.min(Math.max(conn.reflectTimeoutMs, 30000), 180000);
  const started = Date.now();
  const json = await request(bankUrl(conn, "/reflect"), {
    method: "POST",
    token: conn.apiToken,
    body: { query: q, budget: chosen },
    timeoutMs,
  });
  return { text: String(json?.text ?? "").trim(), budget: chosen, ms: Date.now() - started };
}

const USAGE_PERIODS = new Set(["1d", "7d", "30d"]);
const TOKEN_FIELDS = ["input", "output", "cached", "thoughts", "total"];

function usageNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** `hindsight.bank.usage` — independent of status so older servers only lose this section. */
export async function usage(period = "7d") {
  if (!USAGE_PERIODS.has(period)) {
    throw new PanelError("INVALID_CONFIG", "用量周期必须是 1d、7d 或 30d");
  }
  const conn = resolveConnection();
  let json;
  try {
    json = await request(bankUrl(conn, `/llm-requests/stats?period=${period}&call_type=llm`), { token: conn.apiToken });
  } catch (e) {
    if (e?.code === "NOT_FOUND") {
      throw new PanelError("NOT_FOUND", "LLM 用量接口或 bank 不存在（404）", {
        hint: "确认 bankId 已创建，且 Hindsight 服务端支持 /llm-requests/stats；旧版本需升级后查看 LLM 用量。",
      });
    }
    throw e;
  }
  if (!Array.isArray(json?.buckets)) {
    throw new PanelError("HTTP_ERROR", "服务端未返回有效的 LLM 用量统计");
  }
  const buckets = json.buckets.map((bucket) => {
    if (usageNumber(bucket?.total) === null || typeof bucket?.time !== "string") {
      throw new PanelError("HTTP_ERROR", "服务端返回的 LLM 用量时间桶无效");
    }
    return {
      time: bucket.time,
      requests: bucket.total,
      statuses: Object.fromEntries(Object.entries(bucket.statuses ?? {}).filter(([, count]) => usageNumber(count) !== null)),
      tokens: Object.fromEntries(TOKEN_FIELDS.map((field) => [field, usageNumber(bucket.tokens?.[field])])),
    };
  });
  const statuses = new Map();
  for (const bucket of buckets) {
    for (const [name, count] of Object.entries(bucket.statuses)) {
      statuses.set(name, (statuses.get(name) ?? 0) + count);
    }
  }
  return {
    bank: conn.bankId,
    period,
    start: typeof json.start === "string" ? json.start : null,
    trunc: json.trunc === "hour" ? "hour" : "day",
    ...(Object.hasOwn(json, "retention_days") ? { retentionDays: usageNumber(json.retention_days) } : {}),
    totals: {
      requests: buckets.reduce((sum, bucket) => sum + bucket.requests, 0),
      statuses: Object.fromEntries(statuses),
      // Cached/reasoning counters may overlap provider totals: never add them to total.
      // If any bucket lacks a counter, its aggregate is unknown rather than an undercount.
      tokens: Object.fromEntries(TOKEN_FIELDS.map((field) => [field,
        buckets.some((bucket) => bucket.tokens[field] === null)
          ? null : buckets.reduce((sum, bucket) => sum + bucket.tokens[field], 0),
      ])),
    },
    buckets,
  };
}

const PERIOD_DAYS = { "1d": 1, "7d": 7, "30d": 30 };
const WINDOW_DAYS = 30;
const MODEL_PAGE_SIZE = 500;
// A page of /llm-requests carries full prompts (~20 MB per 500 calls, 5–11 s), so one sync is capped.
// Whatever a capped sync leaves out is reported as `since` instead of being under-counted silently.
const MODEL_MAX_PAGES = 6;
const MODEL_PAGE_TIMEOUT_MS = 60_000;
const MODEL_THROTTLE_MS = 15_000;
const PENDING = new Set(["pending", "running", "queued", "in_progress"]);
const inflight = new Map();
const lastSync = new Map();

function hourKey(ms) {
  return new Date(ms).toISOString().slice(0, 13);
}

function addCall(entry, item, startedMs) {
  const hour = (entry.hours[hourKey(startedMs)] ??= {});
  const model = typeof item?.model === "string" && item.model ? item.model : "unknown";
  const row = (hour[model] ??= {
    provider: typeof item?.provider === "string" ? item.provider : "",
    requests: 0,
    missing: 0,
    input: 0,
    output: 0,
    cached: 0,
    thoughts: 0,
  });
  row.requests += 1;
  for (const [field, source] of [["input", "input_tokens"], ["output", "output_tokens"], ["cached", "cached_tokens"], ["thoughts", "thoughts_tokens"]]) {
    const n = usageNumber(item?.[source]);
    if (n === null) row.missing += 1;
    else row[field] += n;
  }
}

/** Bring the local aggregate up to date; only calls newer than the watermark are downloaded. */
async function syncModels(conn, key) {
  const now = Date.now();
  const windowStart = now - WINDOW_DAYS * 86_400_000;
  let entry = loadEntry(key);
  const mark = entry.watermark ? Date.parse(entry.watermark) : NaN;
  const startMs = Number.isFinite(mark) && mark >= windowStart ? mark : windowStart;
  if (!(Number.isFinite(mark) && mark >= windowStart)) entry = { ...emptyEntry() };

  const fresh = [];
  let pendingMin = Infinity;
  let maxStarted = Number.isFinite(mark) ? mark : -Infinity;
  let oldestFetched = Infinity;
  let capped = false;
  const startDate = encodeURIComponent(new Date(startMs).toISOString());
  const counted = { ...entry.ids };

  for (let page = 0; page < MODEL_MAX_PAGES; page += 1) {
    let json;
    try {
      json = await request(
        bankUrl(conn, `/llm-requests?start_date=${startDate}&limit=${MODEL_PAGE_SIZE}&offset=${page * MODEL_PAGE_SIZE}`),
        { token: conn.apiToken, timeoutMs: MODEL_PAGE_TIMEOUT_MS },
      );
    } catch (e) {
      if (e?.code === "NOT_FOUND") {
        throw new PanelError("NOT_FOUND", "LLM 调用明细接口或 bank 不存在（404）", {
          hint: "确认 bankId 已创建，且服务端已开启 LLM 请求追踪（HINDSIGHT_API_LLM_TRACE_ENABLED）。",
        });
      }
      throw e;
    }
    if (!Array.isArray(json?.items)) {
      throw new PanelError("HTTP_ERROR", "服务端未返回有效的 LLM 调用明细");
    }
    for (const item of json.items) {
      const id = typeof item?.id === "string" ? item.id : "";
      const started = Date.parse(item?.started_at);
      const startedMs = Number.isFinite(started) ? started : now;
      oldestFetched = Math.min(oldestFetched, startedMs);
      if (id && counted[id] !== undefined) continue;
      if (PENDING.has(String(item?.status ?? "").toLowerCase())) {
        // Not finished: its tokens are still unknown. Hold the watermark back so it is re-read.
        pendingMin = Math.min(pendingMin, startedMs);
        continue;
      }
      fresh.push([item, startedMs, id]);
      if (id) counted[id] = startedMs;
      maxStarted = Math.max(maxStarted, startedMs);
    }
    if (json.items.length < MODEL_PAGE_SIZE) break;
    if (page === MODEL_MAX_PAGES - 1) capped = true;
  }

  if (capped) {
    // Newest-first paging: the older part of the gap was not read, so keep only what is contiguous.
    entry = { ...emptyEntry(), from: new Date(oldestFetched).toISOString() };
    for (const id of Object.keys(counted)) delete counted[id];
    for (const [, startedMs, id] of fresh) if (id) counted[id] = startedMs;
  }
  for (const [item, startedMs] of fresh.filter(([, ms]) => !capped || ms >= oldestFetched)) {
    addCall(entry, item, startedMs);
  }

  const watermark = Number.isFinite(pendingMin) ? pendingMin : maxStarted;
  if (Number.isFinite(watermark)) {
    entry.watermark = new Date(watermark).toISOString();
    for (const [id, ms] of Object.entries(counted)) if (ms < watermark) delete counted[id];
  }
  entry.ids = counted;
  // Hours that fell out of the 30-day window are dead weight.
  const keepFrom = hourKey(windowStart);
  for (const hour of Object.keys(entry.hours)) if (hour < keepFrom) delete entry.hours[hour];
  entry.updatedAt = now;
  saveEntry(key, entry);
  return entry;
}

/** `hindsight.bank.usageModels` — per-model request and token totals, read incrementally. */
export async function usageModels(period = "7d", { refresh = false, cacheOnly = false } = {}) {
  if (!USAGE_PERIODS.has(period)) {
    throw new PanelError("INVALID_CONFIG", "用量周期必须是 1d、7d 或 30d");
  }
  const conn = resolveConnection();
  const key = `${conn.apiUrl}|${conn.bankId}`;

  if (cacheOnly) {
    /* answer from disk only: lets the panel paint instantly, then sync in a second call */
  } else if (inflight.has(key)) {
    await inflight.get(key).catch(() => {});
  } else if (refresh || Date.now() - (lastSync.get(key) ?? 0) > MODEL_THROTTLE_MS) {
    const job = syncModels(conn, key).finally(() => inflight.delete(key));
    inflight.set(key, job);
    await job;
    lastSync.set(key, Date.now());
  }

  const entry = loadEntry(key);
  const cutoff = Date.now() - PERIOD_DAYS[period] * 86_400_000;
  const floorHour = hourKey(cutoff);
  const byModel = new Map();
  for (const [hour, models] of Object.entries(entry.hours)) {
    if (hour < floorHour) continue;
    for (const [model, row] of Object.entries(models)) {
      const sum = byModel.get(model) ?? {
        model,
        provider: row.provider,
        requests: 0,
        missing: 0,
        tokens: { input: 0, output: 0, cached: 0, thoughts: 0 },
      };
      sum.requests += row.requests;
      sum.missing += row.missing;
      for (const field of ["input", "output", "cached", "thoughts"]) sum.tokens[field] += row[field];
      byModel.set(model, sum);
    }
  }
  const models = [...byModel.values()].sort((a, b) => b.requests - a.requests);
  const fromMs = entry.from ? Date.parse(entry.from) : NaN;
  return {
    period,
    cold: entry.watermark === null,
    updatedAt: entry.updatedAt || null,
    scanned: models.reduce((total, row) => total + row.requests, 0),
    partial: Number.isFinite(fromMs) && fromMs > cutoff,
    ...(Number.isFinite(fromMs) && fromMs > cutoff ? { since: entry.from } : {}),
    models,
  };
}
