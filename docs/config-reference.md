# 配置参考（Hindsight coding-agent 0.8.1）

上游配置由 `src/core/config.ts`（打包后位于 `vendor/hindsight-pi.mjs:16031-16420`）解析。

## 配置文件与优先级

1. 配置文件路径：`$HINDSIGHT_CONFIG`，否则 `~/.hindsight/coding-agent.json`
2. 合并顺序：**环境变量 → 文件顶层 → 文件的 `harnesses.<harness>` 段**（`banks` / `paths` 为浅合并）
3. 之后按序应用：`resolveConfig` → `deriveBankIdOrSkip` → `applyBankConfig`
   （opt-in 闸门 → `paths.<dir>` 段 → `banks.<bankId>` 段；段内**禁止**改 `bankId` / `harness` / `optIn` 等关键字段）

本插件的 harness 名恒为 `pi`（`createPiExtension("pi")`），所以 `harnesses.pi` 段生效。


## 主要字段与默认值

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `serverMode` | `cloud` | `cloud` \| `self-hosted` \| `daemon`；`daemon` 时 apiUrl 变成 `http://127.0.0.1:<apiPort>`（默认 9077），并需要 `uvx`、LLM（key 或 `claude` CLI）、macOS 上还需 Rust（详见 [compatibility.md](compatibility.md#10-survey--daemon-模式的实际前置条件)） |
| `apiUrl` | `https://api.hindsight.vectorize.io` | 服务端基址 |
| `apiToken` | — | Bearer token；401 时会重读配置并重放一次 |
| `disabled` | `false` | 整体关闭 |
| `bankId` | — | 固定 bank；为空且未开 `dynamicBankId` 时套 `bankIdTemplate` |
| `bankIdTemplate` | `coding-agent::{gitProject}` | 占位符：`{harness}` `{project}` `{gitProject}` `{channel}` `{user}` |
| `dynamicBankId` | 跟随 `!bankId` | 是否按模板派生 bank |
| `optInOnly` | `false` | 只对 `optInPaths` 内的目录生效；面板不能编辑 `optInPaths`，所以面板会拒绝在没有非空 `optInPaths` 时开启它 |
| `retainSessions` | `true` | 会话结束自动写回 |
| `retainExtractionMode` | `concise` | `concise` \| `verbose` \| `verbatim` \| `chunks`；只在首次配置 bank 时写入服务端 bank 配置，已初始化的 bank 改这里无效 |
| `maxParallelRetains` | `10` | 并发写回上限 |
| `autoInject` | `reflect` | 见下节 |
| `injectTimeoutMs` | `7000` | `pages` / `recall` 模式检索超时；reflect 模式只用于降级兜底，`none` 不用 |
| `reflectTimeoutMs` | `20000` | 自动注入里 reflect 的超时，**只在 `autoInject=reflect` 时使用** |
| `reflectToolTimeoutMs` | `max(reflectTimeoutMs, 330000)` | `hindsight_reflect` 工具的超时；调小 `reflectTimeoutMs` 不会把它压到 330s 以下 |
| `reflectBudget` | `high` | reflect 预算，服务端只接受 `low` / `mid` / `high`（自动注入固定用 `low`） |
| `pageSearchLimit` | `10` | 检索返回页数 |
| `pageRefreshEveryTurns` | `1` | 每 N 轮注入 `<hindsight_knowledge_refresh>` 页目录；上游是 `raw.x || 1`，所以 0 等价于 1（面板最小 1） |
| `pageTriggerType` / `pageTriggerCron` | `cron` / `H * * * *` | 页面重建触发；`H` 按 bank+page 哈希分散 |
| `pages` / `customPages` | 5 张固定页 | 5 张：Component map、Core concepts、Conventions and patterns、Key decisions and rationale、Initiatives and enhancements；`pages.<name>=false` 可关，`customPages` 可加 |
| `autoSeed` / `seedLimit` | `true` / `300` | `autoSeed` 开：git 仓库里每次会话开始都跑后台 deepen（空库冷启动播种，否则补齐新提交/新对话）；关：完全不跑后台 deepen。`seedLimit` 是 deepen 读取的提交条数，`|| 300`，所以 0 等价 300（面板最小 1） |
| `codebaseSurvey` | `true` | 调本机 claude / codex / agy / opencode 之一采样仓库生成 `repository-*` 文档；找不到 CLI 就静默不产出；会花钱（`surveyBudgetUsd`，默认 2） |
| `surveyModel` / `surveyBudgetUsd` | `haiku` / `2` | survey 用的模型与预算 |
| `surveyRefreshCommits` | `20` | 非空库上每多少新 commit 重跑 survey；判定为 `> 0`，所以 **0 合法且关闭周期性重跑**（首次冷启动 survey 仍跑） |
| `gitIngest` | `message` | `message` \| `full`（补 diff）\| `none` |
| `retainTags` / `retainMetadata` / `retainContext` | — | 写回时附加标签/元数据/上下文 |
| `observationScopes` | `shared` | observation 共享范围 |
| `autoUpdate` | `true` | 仅对 npx 暂存运行时生效（路径含 `_npx` 且 pkgRoot 为 `~/.hindsight/coding-agents`）；本项目以 vendored 文件运行，该字段永远不生效，面板已不再提供它（文件里已有的键原样保留） |
| `manageBankConfig` | `true` | 首次进入时向服务端写入本 bank 的清单配置 |
| `logLevel` | `info` | 日志级别 |

## 运行前置条件（survey / daemon）

这两项需要本机装东西，缺了不会报错、只是静默什么都不做：

- **codebase survey** 需要一个受支持的 agent CLI：`claude`（或 `$HINDSIGHT_CLAUDE_BIN`、`~/.claude/local/claude`）、
  `codex`、`agy`（antigravity-cli）或 `opencode` ≥ 1.x，按此顺序探测；探测细节与行号见 `compatibility.md` 第 10 节。
- **daemon 模式** 需要 PATH 上的 `uvx`、一个 LLM（`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` /
  `GROQ_API_KEY` / `HINDSIGHT_API_LLM_PROVIDER`，或 PATH 上的 `claude`）、macOS 上还需要 Rust 工具链；
  首次启动会 `uvx hindsight-embed@latest` 拉取嵌入服务端。

## `autoInject` 四种模式

| 值 | 注入内容 | 代价 |
| --- | --- | --- |
| `reflect`（默认） | 服务端对全量记忆做一次低预算 `reflect`，包进 `<hindsight_memory>` | 最丰富，慢；超时/5xx 时降级到 `pages` → `recall` |
| `pages` | 只做 `searchKnowledgePages(prompt)`（截断 500 字符），命中页与片段注入 | 快 |
| `recall` | `POST /memories/recall`，默认 `{types:["observation"], budget:"low", max_tokens:2000}` | 中等 |
| `none` | 不注入记忆，只在前言里提示“新目标先搜 pages” | 最省 |

旧字段 `autoReflect: false` 会映射为 `none`。首轮注入的 `<hindsight_knowledge>` 前言包含页目录与工具使用指南；
注入文本在写回前由 `stripInjectedMemory` 正则剥离。

## 常用环境变量

- 核心：`HINDSIGHT_CONFIG`、`HINDSIGHT_SERVER_MODE`、`HINDSIGHT_API_URL`、`HINDSIGHT_API_TOKEN`、`HINDSIGHT_API_PORT`、
  `HINDSIGHT_BANK_ID`、`HINDSIGHT_BANK_ID_TEMPLATE`、`HINDSIGHT_DYNAMIC_BANK_ID`、`HINDSIGHT_DISABLED`、
  `HINDSIGHT_RETAIN_SESSIONS`、`HINDSIGHT_AUTO_INJECT`、`HINDSIGHT_AUTO_REFLECT`、`HINDSIGHT_GIT_INGEST`、
  `HINDSIGHT_OBSERVATION_SCOPES`、`HINDSIGHT_AUTO_UPDATE`、`HINDSIGHT_OPT_IN_ONLY`、`HINDSIGHT_OPT_IN_PATHS`、
  `HINDSIGHT_RESOLVE_WORKTREES`、`HINDSIGHT_HARNESS`、`HINDSIGHT_PAGE_*`、`HINDSIGHT_SURVEY_*`、`HINDSIGHT_RETAIN_TAGS`
- 旁路：`HINDSIGHT_LOG_LEVEL`、`HINDSIGHT_LOG_FILE`、`HINDSIGHT_DIAG_FILE`、`HINDSIGHT_USAGE_FILE`、
  `HINDSIGHT_DISABLE_HOOKS`（递归防护）、`HINDSIGHT_CHANNEL_ID`、`HINDSIGHT_USER_ID`
- 宿主可执行文件：`HINDSIGHT_CLAUDE_BIN` / `CODEX_BIN` / `ANTIGRAVITY_BIN` / `OPENCODE_BIN`
- 布尔值判定：`1|true|yes|on`

## HTTP 端点（`HindsightClient`）

基址 `{apiUrl}/v1/default/banks/{bankId}`，鉴权 `Authorization: Bearer <apiToken>`，
UA 固定 `hindsight-coding-agents/0.8.1`。401 重读 token 后重放一次；429 按 `Retry-After` 退避。

- `POST /memories` — 写回（恒 `async: true`，支持 `operation_id`、`update_mode:"append"`）
- `POST /memories/recall`、`POST {bank}/reflect`
- `GET {bank}/documents`、`GET {bank}/documents?q=`、`DELETE {bank}/documents/{id}`
- `GET {bank}/operations`、`GET {bank}/operations/{id}` — 抽取任务轮询
- `GET {bank}/config`、`GET|DELETE {bank}`、`POST {bank}/import`
- knowledge base：`/knowledge-base/tree`、`/knowledge-base/pages/{id}`、`/knowledge-base/search`、
  `POST /knowledge-base/pages`、`PATCH /knowledge-base/nodes/{id}`、`POST /knowledge-base/folders`
- 能力探测：`GET /v1/version`（判断是否支持幂等 append，需服务端 ≥ 0.8.6）

## 服务端数据结构

- 文档 id 约定：`git:<sha>`、`gitlog:<repoName>`、`conversation:<sessionId>`、`chat:<id>`、
  `initiative-marker-<slug>`、`survey-baseline:<sha>`，上传文档用标题 slug。
- **memory/chunk** 是写回后被切块抽取的最小单元（fact type：`world` / `experience` / `observation`）。
- **knowledge page** 是从 memories 综合出的可读页面（树形 folder + page，id 形如 `kp-…`），由 `source_query` + trigger 重建。
- 冷启动判定：`source:git` 文档数为 0 且无 `survey-baseline:` 标记。
