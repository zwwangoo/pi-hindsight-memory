// Single source of truth for the panel's editable config fields.
//
// These keys map 1:1 onto ~/.hindsight/coding-agent.json as read by the upstream extension
// (vendor/hindsight-pi.mjs, src/core/config.ts). Defaults mirror docs/config-reference.md; the
// `fields`/`groups` arrays are also what the panel view renders, so adding a field here is enough
// to get it into the UI, the whitelist and the validator.

export const GROUPS = [
  { id: "connection", label: { en: "Connection", "zh-CN": "连接" } },
  { id: "injection", label: { en: "Recall & injection", "zh-CN": "召回与注入" } },
  { id: "retention", label: { en: "Write-back", "zh-CN": "写回" } },
  { id: "seeding", label: { en: "Seeding & survey", "zh-CN": "播种与 survey" } },
  { id: "advanced", label: { en: "Advanced", "zh-CN": "高级" } },
];

/**
 * type: "string" | "secret" | "number" | "boolean" | "enum"
 * format (string/secret only): "url" | "bankId"
 * dependsOn (optional): { key, in } — the field only takes effect while the current value of `key`
 *   is one of `in`. It stays visible and editable (the user may be pre-filling a value), but the
 *   view renders it muted/disabled and validation never rejects a value just because the field is
 *   currently inactive.
 */
export const FIELDS = [
  {
    key: "serverMode",
    group: "connection",
    type: "enum",
    enum: ["cloud", "self-hosted", "daemon"],
    default: "cloud",
    label: { en: "Server mode", "zh-CN": "服务端模式" },
    help: {
      en: "cloud = api.hindsight.vectorize.io · self-hosted = your apiUrl · daemon = the vendored daemon-start.js starts a local server on 127.0.0.1:<apiPort> (default 9077). daemon needs `uvx` on PATH, an LLM key (OPENAI/ANTHROPIC/GEMINI/GROQ) or the Claude Code CLI, and on macOS a Rust toolchain.",
      "zh-CN": "cloud = 官方托管 · self-hosted = 用下面的 apiUrl · daemon = 由 vendored 的 daemon-start.js 在 127.0.0.1:<apiPort>（默认 9077）起本地服务；需要 PATH 里有 uvx、一个 LLM key（OPENAI/ANTHROPIC/GEMINI/GROQ）或 Claude Code CLI，macOS 还需 Rust 工具链。",
    },
  },
  {
    key: "apiUrl",
    group: "connection",
    type: "string",
    format: "url",
    default: "https://api.hindsight.vectorize.io",
    placeholder: "https://hindsight.example.com",
    dependsOn: { key: "serverMode", in: ["self-hosted", "cloud"] },
    label: { en: "API URL", "zh-CN": "服务端地址" },
    help: {
      en: "Base URL of the Hindsight server. Only http:// and https:// are accepted. In daemon mode the URL is derived from apiPort instead.",
      "zh-CN": "Hindsight 服务端基址，只接受 http:// 与 https://。daemon 模式下改用 apiPort 推导的本地地址。",
    },
  },
  {
    key: "apiToken",
    group: "connection",
    type: "secret",
    default: "",
    label: { en: "API token", "zh-CN": "API Token" },
    help: {
      en: "Stored in plain text in coding-agent.json (mode 600). Leave untouched to keep the current one.",
      "zh-CN": "以明文存在 coding-agent.json（权限 600）。不改动即保留现有值。",
    },
  },
  {
    key: "bankId",
    group: "connection",
    type: "string",
    format: "bankId",
    default: "",
    placeholder: "my-project",
    label: { en: "Bank id", "zh-CN": "记忆库 ID" },
    help: {
      en: "Fixed bank name. Empty means the extension derives one per repository (coding-agent::<repo>); the panel needs it set explicitly.",
      "zh-CN": "固定 bank 名。留空时扩展按仓库派生（coding-agent::<repo>），但本面板需要显式设置才能查询。",
    },
  },
  {
    key: "autoInject",
    group: "injection",
    type: "enum",
    enum: ["reflect", "pages", "recall", "none"],
    default: "reflect",
    label: { en: "Auto inject", "zh-CN": "自动注入" },
    help: {
      en: "What gets injected at the start of a session: reflect = synthesized answer (slow, richest), pages = knowledge-page hits, recall = raw observations, none = nothing.",
      "zh-CN": "会话开始时注入什么：reflect = 综合答案（慢但最丰富），pages = 知识页检索命中，recall = 原始 observation，none = 不注入。",
    },
  },
  {
    key: "injectTimeoutMs",
    group: "injection",
    type: "number",
    default: 7000,
    min: 500,
    max: 120000,
    step: 500,
    unit: "ms",
    dependsOn: { key: "autoInject", in: ["pages", "recall", "reflect"] },
    label: { en: "Inject timeout", "zh-CN": "注入超时" },
    help: {
      en: "Upper bound for the pages/recall lookup on the first turn. In reflect mode it only bounds the degraded page-search fallback; unused when autoInject=none.",
      "zh-CN": "首轮 pages/recall 检索的时间上限；reflect 模式只用于降级后的页检索兜底，autoInject=none 时不用。",
    },
  },
  {
    key: "reflectTimeoutMs",
    group: "injection",
    type: "number",
    default: 20000,
    min: 1000,
    max: 600000,
    step: 1000,
    unit: "ms",
    dependsOn: { key: "autoInject", in: ["reflect"] },
    label: { en: "Reflect timeout (hook)", "zh-CN": "Reflect 超时（自动注入）" },
    help: {
      en: "Deadline for the auto-inject reflect call (only used when autoInject=reflect). Too low falls back to page search. The hindsight_reflect tool uses max(this, 330000) ms instead.",
      "zh-CN": "autoInject=reflect 时自动注入那次 reflect 的时限；过小会降级为页检索。hindsight_reflect 工具的超时是 max(本值, 330000) ms，不受此限。",
    },
  },
  {
    key: "pageSearchLimit",
    group: "injection",
    type: "number",
    default: 10,
    min: 1,
    max: 50,
    step: 1,
    label: { en: "Page search limit", "zh-CN": "页检索条数" },
    help: { en: "How many knowledge pages a search returns.", "zh-CN": "每次页检索返回多少条。" },
  },
  {
    key: "pageRefreshEveryTurns",
    group: "injection",
    type: "number",
    default: 1,
    min: 1,
    max: 50,
    step: 1,
    label: { en: "Page roster refresh", "zh-CN": "页目录刷新间隔" },
    help: {
      en: "Refresh the injected page roster every N turns (the roster also carries the tool guide).",
      "zh-CN": "每 N 轮刷新一次注入的页目录（页目录同时带工具使用指南）。",
    },
  },
  {
    key: "retainSessions",
    group: "retention",
    type: "boolean",
    default: true,
    label: { en: "Retain sessions", "zh-CN": "会话写回" },
    help: {
      en: "Write the transcript back into the bank when a run ends.",
      "zh-CN": "每轮结束时把对话写回记忆库。",
    },
  },
  {
    key: "retainExtractionMode",
    group: "retention",
    type: "enum",
    enum: ["concise", "verbose", "verbatim", "chunks"],
    default: "concise",
    label: { en: "Extraction mode", "zh-CN": "抽取模式" },
    help: {
      en: "How much of each turn the server extracts: concise, verbose, verbatim, chunks. It is only written into the bank's server config when the bank is first configured, so changing it on an already-initialised bank has no effect.",
      "zh-CN": "服务端从每轮抽取多少内容：concise、verbose、verbatim、chunks。该值只在首次配置 bank 时写入服务端 bank 配置，对已初始化的 bank 改动无效。",
    },
  },
  {
    key: "maxParallelRetains",
    group: "retention",
    type: "number",
    default: 10,
    min: 1,
    max: 64,
    step: 1,
    label: { en: "Max parallel retains", "zh-CN": "并发写回上限" },
    help: {
      en: "Concurrent retain requests. Lower it if the server rate-limits you.",
      "zh-CN": "并发写回请求数；被限流时调小。",
    },
  },
  {
    key: "autoSeed",
    group: "seeding",
    type: "boolean",
    default: true,
    label: { en: "Auto seed", "zh-CN": "自动播种" },
    help: {
      en: "When on, every session start in a git repo spawns the background deepen engine: it cold-seeds an empty bank, otherwise it catches up on new commits and chats. Off means no background deepen at all.",
      "zh-CN": "开启时，git 仓库里每次会话开始都会启动后台 deepen 引擎：空库做冷启动播种，否则补齐新提交与新对话；关闭则完全不跑后台 deepen。",
    },
  },
  {
    key: "seedLimit",
    group: "seeding",
    type: "number",
    default: 300,
    min: 1,
    max: 5000,
    step: 10,
    label: { en: "Seed commit limit", "zh-CN": "播种提交数" },
    help: {
      en: "How many commits the background deepen engine may read (also the per-run git window). Minimum 1: upstream treats 0 as the default 300.",
      "zh-CN": "后台 deepen 引擎读取的提交条数（也是每轮 git 窗口）。最小 1：上游把 0 当作默认 300。",
    },
  },
  {
    key: "codebaseSurvey",
    group: "seeding",
    type: "boolean",
    default: true,
    label: { en: "Codebase survey", "zh-CN": "Codebase survey" },
    help: {
      en: "Runs a read-only agent CLI (claude / codex / agy / opencode, first one found on PATH) to survey the repo into repository-* documents. Needs one of those CLIs installed and spends tokens/money (budget: surveyBudgetUsd, default $2).",
      "zh-CN": "调用本机找到的只读 agent CLI（claude / codex / agy / opencode，按 PATH 顺序取第一个）把仓库采样成 repository-* 文档。需要装其中至少一个 CLI，并会消耗 token/费用（预算 surveyBudgetUsd，默认 $2）。",
    },
  },
  {
    key: "surveyModel",
    group: "seeding",
    type: "string",
    default: "haiku",
    dependsOn: { key: "codebaseSurvey", in: [true] },
    label: { en: "Survey model", "zh-CN": "Survey 模型" },
    help: {
      en: "Model alias the survey CLI is launched with (only the claude-code recipe passes it).",
      "zh-CN": "启动 survey CLI 时使用的模型别名（只有 claude-code 配方会传）。",
    },
  },
  {
    key: "surveyRefreshCommits",
    group: "seeding",
    type: "number",
    default: 20,
    min: 0,
    max: 500,
    step: 1,
    dependsOn: { key: "codebaseSurvey", in: [true] },
    label: { en: "Survey refresh", "zh-CN": "Survey 刷新间隔" },
    help: {
      en: "Re-run the survey after this many new commits on an already-seeded bank. 0 disables the periodic re-survey (the first cold-start survey still runs).",
      "zh-CN": "非空库上每新增多少提交重跑一次 survey；0 表示不周期性重跑（首次冷启动 survey 仍会执行）。",
    },
  },
  {
    key: "gitIngest",
    group: "seeding",
    type: "enum",
    enum: ["message", "full", "none"],
    default: "message",
    label: { en: "Git ingest", "zh-CN": "Git 摄入" },
    help: {
      en: "message = commit messages only, full = also per-commit diffs (much heavier), none = skip git.",
      "zh-CN": "message = 只摄入提交说明，full = 额外摄入每个提交的 diff（重得多），none = 不摄入 git。",
    },
  },
  {
    key: "disabled",
    group: "advanced",
    type: "boolean",
    default: false,
    label: { en: "Disabled", "zh-CN": "停用记忆" },
    help: {
      en: "Turns the extension off entirely: no injection, no write-back, no tools.",
      "zh-CN": "整体停用扩展：不注入、不写回、也不注册工具。",
    },
  },
  {
    key: "optInOnly",
    group: "advanced",
    type: "boolean",
    default: false,
    label: { en: "Opt-in only", "zh-CN": "仅白名单仓库" },
    help: {
      en: "Only repositories listed in optInPaths get memory. The paths themselves are not editable here, so turning this on is rejected unless coding-agent.json already has a non-empty optInPaths array.",
      "zh-CN": "只对 optInPaths 里的仓库启用。optInPaths 不能在面板里编辑，因此只有 coding-agent.json 已有非空 optInPaths 数组时才允许开启，否则保存会被拒绝。",
    },
  },
  // `autoUpdate` is deliberately absent: it only applies to npx-run installs, never to this
  // vendored plugin. An existing key in the file is preserved untouched by config.mjs's merge.
];

export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/** Default value per key, i.e. what the extension uses when the file omits the key. */
export function fieldDefaults() {
  const out = {};
  for (const f of FIELDS) out[f.key] = f.default;
  return out;
}

export class FieldError extends Error {
  constructor(message) {
    super(message);
    this.name = "FieldError";
  }
}

/**
 * Validate and normalise one value. Returns the value to persist; throws FieldError with a
 * human-readable, locale-neutral message (the view shows it next to the field).
 */
export function coerceField(field, value) {
  switch (field.type) {
    case "boolean":
      if (typeof value !== "boolean") throw new FieldError("expected true or false");
      return value;
    case "number": {
      const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
      if (!Number.isFinite(n)) throw new FieldError("expected a number");
      if (Number.isInteger(field.step ?? 1) && !Number.isInteger(n)) throw new FieldError("expected an integer");
      if (field.min !== undefined && n < field.min) throw new FieldError(`must be >= ${field.min}`);
      if (field.max !== undefined && n > field.max) throw new FieldError(`must be <= ${field.max}`);
      return n;
    }
    case "enum":
      if (!field.enum.includes(value)) throw new FieldError(`must be one of: ${field.enum.join(", ")}`);
      return value;
    case "secret":
    case "string": {
      if (typeof value !== "string") throw new FieldError("expected a string");
      const s = value.trim();
      if (field.format === "url") {
        let u;
        try {
          u = new URL(s);
        } catch {
          throw new FieldError("not a valid URL");
        }
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new FieldError("must start with http:// or https://");
        return s.replace(/\/+$/, "");
      }
      if (field.format === "bankId") {
        if (!/^[A-Za-z0-9._:-]{0,128}$/.test(s)) throw new FieldError("only A-Z a-z 0-9 . _ : - (max 128)");
        return s;
      }
      return s;
    }
    default:
      throw new FieldError(`unsupported field type ${field.type}`);
  }
}

/**
 * Validate a patch object. Unknown keys are rejected (the view only sends known ones, so this is a
 * guard against a stale view writing something the extension never reads). Values are validated
 * regardless of whether their `dependsOn` condition currently holds.
 */
export function coercePatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new FieldError("patch must be an object");
  }
  const values = {};
  const errors = {};
  for (const [key, raw] of Object.entries(patch)) {
    const field = FIELD_BY_KEY.get(key);
    if (!field) {
      errors[key] = "unknown field";
      continue;
    }
    try {
      values[key] = coerceField(field, raw);
    } catch (e) {
      errors[key] = e instanceof FieldError ? e.message : String(e?.message ?? e);
    }
  }
  return { values, errors };
}
