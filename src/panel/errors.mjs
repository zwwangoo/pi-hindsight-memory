// Uniform error type shared by the panel backend modules and mapped to the channel envelope by
// main.js. Every message that can reach the view goes through `scrub()` so a token can never leak
// into a toast, a log line or an inline error.

export const ERROR_CODES = [
  "OFFLINE",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "TIMEOUT",
  "INVALID_CONFIG",
  "UNSUPPORTED",
  "HTTP_ERROR",
  "INTERNAL",
];

export class PanelError extends Error {
  /**
   * @param {string} code one of ERROR_CODES
   * @param {string} message human-readable, already scrubbed
   * @param {{hint?: string, fields?: Record<string,string>, retryAfterMs?: number, cause?: unknown}} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "PanelError";
    this.code = ERROR_CODES.includes(code) ? code : "INTERNAL";
    if (extra.hint) this.hint = extra.hint;
    if (extra.fields) this.fields = extra.fields;
    if (extra.retryAfterMs != null) this.retryAfterMs = extra.retryAfterMs;
    if (extra.cause !== undefined) this.cause = extra.cause;
  }
}

/** Replace every occurrence of a secret with its mask; also caps length for log/UI safety. */
export function scrub(text, secret, max = 300) {
  let s = String(text ?? "");
  if (secret && secret.length >= 6) {
    s = s.split(secret).join(maskSecret(secret));
  }
  if (s.length > max) s = `${s.slice(0, max)}…`;
  return s;
}

export function maskSecret(secret) {
  const s = String(secret ?? "");
  if (!s) return "";
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** Map any thrown value to the channel envelope the view expects. */
export function toEnvelope(e) {
  if (e instanceof PanelError) {
    return {
      ok: false,
      error: {
        code: e.code,
        message: e.message,
        ...(e.hint ? { hint: e.hint } : {}),
        ...(e.fields ? { fields: e.fields } : {}),
        ...(e.retryAfterMs != null ? { retryAfterMs: e.retryAfterMs } : {}),
      },
    };
  }
  return { ok: false, error: { code: "INTERNAL", message: String(e?.message ?? e) } };
}
