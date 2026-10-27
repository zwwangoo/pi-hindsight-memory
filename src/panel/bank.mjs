// Read-only Hindsight bank client for the panel.
//
// Mirrors the endpoints the upstream extension uses (vendor/hindsight-pi.mjs, HindsightClient):
//   GET  {apiUrl}/v1/version                     -> { api_version }
//   GET  {bankUrl}/documents?limit=&offset=      -> { items:[{id}], total }
//   GET  {bankUrl}/operations                    -> { operations|items:[{status}] }
//   GET  {bankUrl}/knowledge-base/tree           -> { roots:[{id,name,kind,children}] }
//   GET  {bankUrl}/knowledge-base/pages/{id}     -> page (body/markdown)
//   GET  {bankUrl}/knowledge-base/search?q=&limit=
//   POST {bankUrl}/reflect  { query, budget }    -> { text }
// where bankUrl = {apiUrl}/v1/default/banks/{bankId}.
//
// Everything here is read-only: no retain, no delete, no reset.

import { resolveConnection } from "./config.mjs";
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
    settle("documents", () => request(bankUrl(conn, "/documents?limit=500&offset=0"), { token: conn.apiToken }), null),
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

  const items = Array.isArray(docs?.items) ? docs.items : [];
  return {
    bank: conn.bankId,
    apiUrl: conn.apiUrl,
    version,
    latencyMs: Date.now() - started,
    pages,
    documents: docs === null ? null : { total: Number(docs?.total ?? items.length), ...bucketDocuments(items) },
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
