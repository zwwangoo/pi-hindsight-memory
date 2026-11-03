# PI-Desktop 兼容性说明

本文件记录“上游 0.8.1 的 pi 扩展”和“PI-Desktop agent-runtime”之间的接缝，以及由此产生的风险。
所有结论都可在 `vendor/` 与 PI-Desktop 源码（`packages/agent-runtime/src/extensions/runner.ts`）中核对。

## 1. `getBranch()` 是空桩，`agent_end` 只给本次 run 的消息（已修复）

**现象**：
- 直接透传：`getBranch()` 返回 `[]`（truthy）→ `readPiEntries([])` → 0 条 turn → 每轮写回为空。
- 只隐藏 `getBranch`（本插件 0.2.0 及之前的做法，0.2.1 起修复）：上游改读 `event.messages`，而宿主在 `agent_end` 给的是
  agent-core 的 `newMessages`，即**仅本次 run 新增的消息**。上游 `planRetain` 发现 turn 不连续，
  **每轮都走 `replace`**，用最后一次 run 覆盖服务端文档 `conversation:<session>`：
  前面各轮的记忆被删掉、再重新抽取并触发 consolidation。实测（2026-11）一个写回 22 次、累计发送 499 个 turn 的会话，
  服务端文档只剩最后 7 行。

**原因**：

```js
// vendor/hindsight-pi.mjs:18863-18865
async agentEnd(event, sessionId, branch) {
  const turns = branch ? readPiEntries(branch) : readPiMessages(event.messages);
  ...
}
// vendor/hindsight-pi.mjs:18911-18915
pi.on("agent_end", async (event, ctx) => at(ctx)?.hooks.agentEnd(
  event, ctx.sessionManager.getSessionId(), ctx.sessionManager.getBranch?.()));
```

宿主侧（`runner.ts` / agent-runtime）：`getEntries: () => []`、`getBranch: () => []` 是故意留的空壳，
`agent_end` 的 `messages` 来自 agent-core 每次 run 的 `newMessages`。

**修复**（`src/index.mjs` + `src/transcript-store.mjs`）：包装 `pi.on`，在 `agent_end` 时

1. 把本次 `event.messages` 压缩后追加进按会话累积的转录（只保留上游 `renderMessage` 会读的内容：user/assistant 文本，
   以及工具调用的名字和 `actionLine` 打印的那一个目标参数；工具输出、thinking 全部丢弃，所以条目很小）；
2. 让 `ctx.sessionManager.getBranch()` 返回这份完整转录（`{type:"message", timestamp, message}` 条目），
   上游于是读到整段会话，cursor 命中后只 `append` 新增部分；
3. 其它事件仍把 `getBranch` 置为 `undefined`，行为与之前一致。

转录镜像在 `~/.hindsight/pi-desktop-transcripts/<session>.jsonl`（目录 700、文件 600，30 天未改动自动清理，
可用 `HINDSIGHT_PI_TRANSCRIPT_DIR` 改位置）。宿主进程重启后上游 cursor 丢失，首次写回会用**完整**转录做一次 `replace`，
而不是用残缺的后半段覆盖服务端文档。磁盘不可写时退化为仅进程内累积。

验证：`tests/retain.test.mjs` 用真实的 vendored 上游对接假服务端，断言第 1 轮整段写入、之后每轮只 `append` 新 turn
（旧实现在第 2 轮即退化为 `replace`，该测试会失败）。

## 2. 写回粒度与增量语义

上游不是盲目整段覆盖：

- `retainLiveSession` → `cursors` 串行化同会话写回（`vendor/hindsight-pi.mjs:17650`）
- `writeSession` 用 `planRetain(turns, cursor, {appendSupported, …})` 决定 append 还是 replace，并推进 `paths`（`17689`）
- 服务端是否支持幂等 append 由 `GET /v1/version` 探测（需服务端 ≥ 0.8.6）；不支持时退化为 replace

`planRetain` 靠 cursor 里的 `turns` 数与前缀指纹判断“是否在原转录上续写”，所以**传给它的必须是整段转录**，
这正是第 1 节修复的意义。怀疑写回异常时，用 `hindsight_sync_status`，或看 diag 里 `retain_ok.turns`：
修复后它应随会话单调增长（修复前是每轮各自的小数字，如 37、4、37、14）。

## 3. `cwd` 缺失会静默回落到启动目录

```js
// vendor/hindsight-pi.mjs:18878-18879
const launchDir = process.cwd();
const dirOf = (ctx) => ctx?.cwd || launchDir;
```

并且模块加载时就执行了 `at(void 0)`（`18901`），即用进程启动目录先建了一个 workspace。
若某个 hook 拿到的 `ctx` 没有 `cwd`，bank 绑定会落到启动目录上（`bankId` 固定时影响被弱化，
但换回按仓库派生的 bank 后要重新评估）。

## 4. 注入双通道

```js
// vendor/hindsight-pi.mjs:18853-18859
if (event.systemPromptOptions?.sections) {
  event.systemPromptOptions.sections.hindsight = injection;
  return;
}
return { systemPrompt: `${event.systemPrompt}\n\n${injection}` };
```

优先走 `systemPromptOptions.sections`。宿主若两者都不提供，会拼出 `undefined\n\n<injection>` 并把字面量
“undefined”喂给模型。PI-Desktop 当前走的是 `sections` 通道，正常。

## 5. 工具注册与多工作区

- 工具集合在首次 `at(ctx)` 时注册一次（`toolsRegistered`，`18889-18898`），`execute` 时按 `ctx.cwd` 重新 bind。
- workspace 缓存以目录字符串为键，**无 TTL**；禁用状态用 `null` 表示。
- 被禁用的工作区调用工具会返回固定文案 “Hindsight memory is disabled for this workspace.”

## 6. flush 时间上限

`session_shutdown` → `core.flush()` 用 `FLUSH_TIMEOUT_MS`（10s）兜底，超时则最后一次写回可能丢失。
PI-Desktop 侧没有 `session_end`，所以这是唯一的收尾窗口。

## 7. 递归防护

survey 子进程会注入 `HINDSIGHT_DISABLE_HOOKS`，`seedIfCold` / `onPrompt` / `onTranscript` / `onSessionIdle`
见到该变量立即早退，避免 survey 里的 agent 再触发记忆写回造成自激。

## 8. 升级检查点

跑 `scripts/sync-upstream.sh <version>` 时脚本会断言：

1. `dist/pi.js` 仍引用 `getBranch`（否则兼容层的假设失效）
2. 仍存在 `event.messages` 回落
3. `dist/pi.js` 仍逐个提到 `deepen.js` / `daemon-start.js` / `mcp-server.js` / `survey-supervisor.js`
   （任一改名都会让对应功能静默变成 no-op）

任一断言变化都必须先人读新版 `pi-extension` 部分，再决定 `src/index.mjs` 的写法。

## 9. 其它值得留意的行为

- `hindsight_reflect` 工具默认超时 330s 级，自建服务端慢时会长时间占住工具调用。
- `session_start` 的 `additionalContext` 被上游丢弃，改为首轮 `before_agent_start` 注入。
- 上游 `autoUpdate` 只对 npx 暂存运行时生效；本项目以 vendored 文件运行，**自更新不会改这里**，必须手动 `sync-upstream.sh`。
  面板已不再提供该字段（它对 vendored 安装永远不会生效），但配置文件里已有的 `autoUpdate` 键会被原样保留。

## 10. survey / daemon 模式的实际前置条件

`daemon-start.js`、`mcp-server.js`、`survey-supervisor.js` 已按字节原样 vendored；它们对外部环境的依赖如下，
缺失时上游静默跳过：

### codebase survey（`codebaseSurvey: true`，默认开）

- 触发点：`vendor/hindsight-pi.mjs:18147`（冷启动）与 `18157`（非空库且 `surveyRefreshCommits > 0` 时按新提交数重跑）。
- 需要一个受支持的 agent CLI，按顺序探测（`startCodebaseSurvey`，`17192-17260`；`resolveAgentBin`，`17073-17083`）：
  1. `claude-code` → `$HINDSIGHT_CLAUDE_BIN` → `~/.claude/local/claude` → PATH 上的 `claude`
  2. `codex` → `$HINDSIGHT_CODEX_BIN` → PATH 上的 `codex`
  3. `antigravity-cli` → `$HINDSIGHT_ANTIGRAVITY_BIN` → PATH 上的 `agy`
  4. `opencode` → `$HINDSIGHT_OPENCODE_BIN` → PATH 上的 `opencode`；还要求 `opencode --version` ≥ 1.x（`17085-17098`）
- 一个都找不到（`binOnPath`，`15175`）时 `startCodebaseSurvey` 直接返回 `false`，**不报错**，只是 survey 不产出。
- survey 通过 `node vendor/mcp-server.js` 以 MCP 方式写回，`HINDSIGHT_MCP_HARNESS` 必填（`vendor/mcp-server.js:33642`），
  由 `buildSurveyPlan`（`17108-17189`）注入；`surveyModel` 只有 claude-code 配方会传 `--model`。
- 成本：claude-code 配方带 `--max-budget-usd`（`surveyBudgetUsd`，默认 2）；`HINDSIGHT_DISABLE_HOOKS=1` 防止 survey 里的
  agent 再触发写回自激（第 7 节）。
- 子进程走 `vendor/survey-supervisor.js`，租约目录在 `<tmp>/hindsight-coding-agent/surveys/`；同一 bank+token+URL 同时只跑一个。

### daemon 模式（`serverMode: "daemon"`）

- `startDaemonDetached`（`16774-16790`，调用点 `16820`）用裸 `node` 起 `vendor/daemon-start.js --harness <h>`；
  失败被吞掉（`child.on("error", () => {})`），所以 PATH 里没有 `node` 时会静默失败——本插件的 `src/node-path.mjs` 就是为此。
- `daemon-start.js:925` 起：`serverMode !== "daemon"` 直接返回；`/health` 已通（`:808`）则不重复启动。
- `preflightDaemon`（`895-918`）三道闸，任一不过就只打 warning 并退出：
  1. PATH 上有 `uvx`（`uv`，见 <https://docs.astral.sh/uv/>）；
  2. macOS 上需要可用的 Rust 工具链（`cargo --version`，litellm 无 macOS wheel）；
  3. 需要 LLM：`HINDSIGHT_API_LLM_PROVIDER`，或 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY`，
     或 PATH 上有 `claude` CLI（`detectLlm`，`844-867`）。
- 端口 `apiPort`（默认 9077，`hindsight-pi.mjs:16033`），URL 固定推导为 `http://127.0.0.1:<apiPort>`，因此面板里的 `apiUrl` 在 daemon 模式下不生效。
- 首次启动会 `uvx hindsight-embed@<embedVersion|latest>` 拉取嵌入服务端，耗时且需要网络。
