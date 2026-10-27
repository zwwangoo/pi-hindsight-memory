// Read/write ~/.hindsight/coding-agent.json for the panel.
//
// - the token is only ever handed to the view as a mask; saving the mask back keeps the old value
// - unknown keys and the original key order survive a save
// - a file that does not parse is never overwritten
// - every write is preceded by a timestamped .bak and lands atomically (tmp + rename, mode 600)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { FIELDS, GROUPS, FIELD_BY_KEY, coercePatch, fieldDefaults } from "./fields.mjs";
import { PanelError, maskSecret } from "./errors.mjs";

const TOKEN_KEY = "apiToken";

export function configPath() {
  return process.env.HINDSIGHT_CONFIG || path.join(os.homedir(), ".hindsight", "coding-agent.json");
}

function parseObject(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new PanelError("INVALID_CONFIG", `coding-agent.json 不是合法 JSON：${e.message}`, {
      hint: "请手动修复该文件；在修好之前面板不会写入，以免覆盖内容。",
    });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PanelError("INVALID_CONFIG", "coding-agent.json 的根节点必须是 JSON 对象", {
      hint: "请手动修复该文件；在修好之前面板不会写入。",
    });
  }
  return raw;
}

/**
 * Raw read used by both the view and the bank client.
 * `parseError` is returned instead of thrown so the view can render a read-only banner.
 */
export function readRawConfig() {
  const file = configPath();
  let text = null;
  let exists = false;
  try {
    text = fs.readFileSync(file, "utf8");
    exists = true;
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw new PanelError("INVALID_CONFIG", `无法读取 ${file}：${e.message}`, { hint: "检查文件权限。" });
    }
  }
  if (!exists) return { path: file, exists: false, raw: {}, parseError: null };
  try {
    return { path: file, exists: true, raw: parseObject(text), parseError: null };
  } catch (e) {
    if (e instanceof PanelError) return { path: file, exists: true, raw: {}, parseError: e.message };
    throw e;
  }
}

function viewValues(raw) {
  const values = {};
  const sources = {};
  for (const field of FIELDS) {
    const present = Object.prototype.hasOwnProperty.call(raw, field.key);
    const value = present ? raw[field.key] : field.default;
    sources[field.key] = present ? "file" : "default";
    values[field.key] = field.type === "secret" && typeof value === "string" ? maskSecret(value) : value;
  }
  return { values, sources };
}

/** Payload for `hindsight.config.read`. */
export function readConfig() {
  const { path: file, exists, raw, parseError } = readRawConfig();
  const { values, sources } = viewValues(raw);
  return {
    path: file,
    exists,
    parseError,
    values,
    sources,
    unknownKeys: Object.keys(raw).filter((k) => !FIELD_BY_KEY.has(k)).sort(),
    fields: FIELDS,
    groups: GROUPS,
  };
}

/**
 * Connection facts for the bank client. Read straight from the file (not from the masked view
 * values) because the HTTP layer needs the real token.
 */
export function resolveConnection() {
  const { raw, parseError } = readRawConfig();
  if (parseError) throw new PanelError("INVALID_CONFIG", parseError, { hint: "修好 coding-agent.json 后重试。" });
  const defaults = fieldDefaults();
  const pick = (key) => (Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : defaults[key]);
  const apiUrl = String(pick("apiUrl") || "").replace(/\/+$/, "");
  const apiToken = String(pick(TOKEN_KEY) || "");
  const bankId = String(pick("bankId") || "").trim();
  if (!apiUrl) {
    throw new PanelError("INVALID_CONFIG", "apiUrl 为空", { hint: "在配置页填写服务端地址后保存。" });
  }
  if (!bankId) {
    throw new PanelError("INVALID_CONFIG", "bankId 未设置", {
      hint: "面板需要显式 bankId（扩展留空时会按仓库派生，面板无法猜测）。在配置页填写后保存。",
    });
  }
  return { apiUrl, apiToken, bankId, reflectTimeoutMs: Number(pick("reflectTimeoutMs")) || 20000 };
}

function timestamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function nextBackupPath(file) {
  const base = `${file}.bak.${timestamp()}`;
  if (!fs.existsSync(base)) return base;
  for (let i = 1; i < 100; i += 1) {
    const candidate = `${base}-${i}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new PanelError("INTERNAL", "备份文件名冲突过多，已中止写入");
}

/**
 * Apply `patch` (only known fields) and return the fresh view payload.
 * Throws PanelError with `fields` when a value fails validation.
 */
export function saveConfig(patch) {
  const file = configPath();
  const current = readRawConfig();
  if (current.parseError) {
    throw new PanelError("INVALID_CONFIG", current.parseError, { hint: "修好该文件后重试；面板拒绝覆盖无法解析的配置。" });
  }

  // The view only ever holds the mask: echoing it back means "unchanged", "" means clear.
  const incoming = { ...(patch || {}) };
  if (incoming[TOKEN_KEY] === maskSecret(current.raw[TOKEN_KEY]) && incoming[TOKEN_KEY] !== "") {
    delete incoming[TOKEN_KEY];
  }

  const { values, errors } = coercePatch(incoming);
  if (Object.keys(errors).length) {
    throw new PanelError("INVALID_CONFIG", "有字段未通过校验", { fields: errors });
  }

  // The panel cannot edit optInPaths, so turning opt-in mode on would silently disable memory in
  // every repository. Only enforce when this save explicitly sets the flag: a file that already
  // carries a broken optInOnly must still be editable.
  if (values.optInOnly === true) {
    const paths = Array.isArray(current.raw.optInPaths)
      ? current.raw.optInPaths.filter((p) => typeof p === "string" && p.trim() !== "")
      : [];
    if (paths.length === 0) {
      throw new PanelError("INVALID_CONFIG", "有字段未通过校验", {
        fields: {
          optInOnly:
            "needs a non-empty optInPaths array in coding-agent.json; add the repository paths by hand (the panel does not edit them) or leave opt-in mode off",
        },
        hint: "在 coding-agent.json 里手写 optInPaths（面板不编辑该字段），或关闭「仅白名单仓库」。",
      });
    }
  }

  if (!Object.keys(values).length) {
    // Nothing to do; still return the current view so the caller can re-render.
    return readConfig();
  }

  // Rebuild preserving the original key order, then append first-time keys in FIELDS order.
  const merged = {};
  for (const [key, value] of Object.entries(current.raw)) {
    merged[key] = key in values ? values[key] : value;
  }
  for (const field of FIELDS) {
    if (field.key in values && !Object.prototype.hasOwnProperty.call(merged, field.key)) {
      merged[field.key] = values[field.key];
    }
  }

  const backupPath = nextBackupPath(file);
  if (current.exists) {
    try {
      fs.copyFileSync(file, backupPath);
    } catch (e) {
      throw new PanelError("INTERNAL", `备份失败，未写入：${e.message}`, { hint: "检查 ~/.hindsight 的写权限与磁盘空间。" });
    }
    try {
      fs.chmodSync(backupPath, 0o600);
    } catch {
      /* best effort: keep the backup readable by the owner at least */
    }
  }

  // The file holds a bearer token, so it is always written 0600 regardless of what the previous
  // file mode was; a looser mode inherited from a stray editor is not worth preserving.

  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(6).toString("hex")}.tmp`);
  const body = `${JSON.stringify(merged, null, 2)}\n`;
  try {
    fs.writeFileSync(tmp, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* nothing to clean up */
    }
    throw new PanelError("INTERNAL", `写入 ${file} 失败：${e.message}`, { hint: "检查目录写权限与磁盘空间。" });
  }

  const fresh = readConfig();
  return { ...fresh, backupPath: current.exists ? backupPath : null };
}
