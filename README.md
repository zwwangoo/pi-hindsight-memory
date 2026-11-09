# Hindsight Memory — PI-Desktop 插件

一个插件，两部分：

1. **长期记忆**（agent 侧）：包装官方 `@vectorize-io/hindsight-coding-agents` 的 pi 扩展，会话开始自动召回、
   结束自动写回，并修掉 PI-Desktop 与上游之间的两处不兼容。
2. **配置面板**（人侧）：工作面板「Hindsight 记忆」标签页，编辑 `~/.hindsight/coding-agent.json`、
   浏览/搜索/阅读 knowledge page、看同步诊断、向库提问。

| 项 | 值 |
| --- | --- |
| 插件 id | `local.hindsight.memory` |
| 版本 | `0.2.3` |
| 权限 | `agent.extension`（高风险）、`ui.view`、`ui.panel` |
| 上游版本 | `@vectorize-io/hindsight-coding-agents@0.8.1`（`vendor/UPSTREAM_VERSION`） |
| 配置 / 日志 | `~/.hindsight/coding-agent.json`、`~/.hindsight/coding-agents-logs/` |

> 面板用 Node 原生 `fs` / `fetch` 读写配置、访问服务端（配置文件在工作区之外，`manifest.fs` 覆盖不到），
> 属于可信代码。来源不可信时不要加载本插件。

## agent 侧

- **注入**：首轮把记忆写进 system prompt（`<hindsight_memory>` / `<hindsight_knowledge>`），每 N 轮刷新页目录；
  注入内容在写回前被剥离，避免自我污染。
- **写回**：`agent_end` 把本轮 transcript 增量 retain 进 bank。
- **后台加深**：每次会话开始在后台跑 `vendor/deepen.js`，补新 commit / 新对话并维护 5 张 knowledge page；
  可选 codebase survey。
- **8 个 Agent 工具**：`hindsight_search_knowledge_pages`、`hindsight_read_knowledge_page`、
  `hindsight_list_knowledge_pages`、`hindsight_reflect`、`hindsight_sync_status`、`hindsight_diagnose`、
  `hindsight_capture_initiative`、`hindsight_ingest_document`。

### 两处本地适配（`src/index.mjs`）

1. **PATH**：上游用裸 `node` spawn 后台 deepen 并吞掉失败；PI-Desktop 从 GUI 启动，PATH 里没有 node，
   于是 git 历史永远不入库、`hindsight_sync_status` 永远 `synced:false`。`src/node-path.mjs` 在扩展加载时把第一个
   含可执行 `node` 的目录（`$HINDSIGHT_NODE_BIN` → 当前可执行文件目录 → Homebrew/MacPorts 常见路径）**追加**到 PATH。
2. **转录累积**：PI-Desktop 的 `sessionManager.getBranch()` 恒返回 `[]`，且 `agent_end` 只给本次 run 的消息。
   直接透传会写回 0 条，仅隐藏 `getBranch` 则会让上游每轮 `replace` 掉整个会话文档（丢失前面各轮的记忆）。
   包装层按会话累积每次 run 的消息（`src/transcript-store.mjs`，镜像到 `~/.hindsight/pi-desktop-transcripts/`），
   在 `agent_end` 时把完整转录作为 `getBranch()` 返回，上游因此只 `append` 新增部分。详见 `docs/compatibility.md` §1。

`vendor/` 下五个文件是上游构建产物的逐字节拷贝（md5 见 `vendor/PROVENANCE.md`），**不要手改**。

> agent 扩展按进程加载：改 `src/index.mjs` / `src/node-path.mjs` 后需重启 PI-Desktop 才对新会话生效；
> 面板相关代码保存即热重载。

## 配置面板

两种打开方式，共用同一个 `views/index.html` 和 `main.js` 的 `onPanelInvoke`：右侧工作面板的「Hindsight 记忆」标签页，
或插件页的「打开面板」按钮 / 命令「Hindsight 记忆：打开面板」（独立窗口，`manifest.ui.panel`）。

| 标签页 | 内容 |
| --- | --- |
| **配置** | 22 个字段分 5 组；逐字段校验；有依赖的字段（如 `reflectTimeoutMs` 仅在 `autoInject=reflect` 生效）按当前未保存值实时置灰 |
| **记忆库** | 页列表 + 搜索 + 阅读区 |
| **统计** | 文档统计；最近 1 / 7 / 30 天 LLM 请求与 token 用量（1 天按小时、7/30 天按天分布，新的在上；数字取自本机累计，见下）；按模型的请求与 token，并可估算费用（服务端不返回价格：单价统一为美元/每百万 token，可一键从随插件发布的价格目录填入，也可手填；单价存于 `~/.hindsight/pi-desktop-prices.json`，不改动 `coding-agent.json`） |
| **诊断** | 服务端 / bank / 版本 / 延迟 / 页数 / 未完成抽取 / token 掩码，以及 reflect 提问（low/mid/high） |

- 视图只通过 `window.pluginBridge.invoke("hindsight.*")` 与 `main.js` 通信（CSP `connect-src 'none'`）。
- token 只在插件进程内使用，视图永远拿到掩码；回传掩码 = 不变，回传空串 = 清除。
- 保存时保留未知字段与键顺序，写前生成 `coding-agent.json.bak.<时间戳>`，临时文件 + rename 原子写，权限 `0600`；
  文件 JSON 损坏时禁用保存。
- 面板只读记忆库：不删除记忆、不重置 bank、不触发 deepen。面板需要显式 `bankId`。
- `optInOnly` 只有在配置文件已有非空 `optInPaths` 时才允许开启（面板不编辑 `optInPaths`）。

### 通道契约

统一信封：成功 `{ok:true, ...}`；失败 `{ok:false, error:{code, message, hint?, fields?, retryAfterMs?}}`，
`code ∈ OFFLINE | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | RATE_LIMITED | TIMEOUT | INVALID_CONFIG | UNSUPPORTED | HTTP_ERROR | INTERNAL`。

| 通道 | 入参 | 出参 |
| --- | --- | --- |
| `hindsight.config.read` | `{}` | `{path, exists, parseError, values, sources, unknownKeys, fields, groups}` |
| `hindsight.config.save` | `{patch}` | 同上 + `backupPath` |
| `hindsight.bank.status` | `{}` | `{bank, apiUrl, version, latencyMs, pages, documents, activeOperations, tokenMasked, warnings}` |
| `hindsight.bank.usage` | `{period?: "1d" | "7d" | "30d"}` | `{bank, period, start, trunc, retentionDays?, totals:{requests, statuses, tokens:{input, output, cached, thoughts, total}}, buckets:[{time, requests, statuses, tokens}]}` |
| `hindsight.bank.usageModels` | `{period?, refresh?, cacheOnly?}` | `{period, cold, updatedAt, scanned, partial, since?, summary:{bank, period, trunc:"hour"\|"day", trackedFrom, limitedCoverage, totals:{requests, statuses, tokens}, buckets:[{time, requests, tokens:{total}}]}, models:[{model, provider, requests, missing, tokens:{input, output, cached, thoughts}}]}`。明细接口每条调用都带完整 prompt（约 20 MB/500 条，5–11 秒），所以首次同步一次读取最近 30 天（最多 6 页×500 条，超出则 `partial` 并给出 `since`），只把计数按「小时×模型」写入 `~/.hindsight/pi-desktop-llm-usage.json`（不含 prompt/回答），之后只拉水位线之后的新调用；`cacheOnly` 只读本地缓存，面板用它先秒出数字再同步 |
| `hindsight.prices.read` | `{}` | `{prices:{currency:"USD", models:{[model]:{input, cached, output}}}, warning?}`（每百万 token；读到非 USD 的旧文件会忽略并给出 `warning`） |
| `hindsight.prices.suggest` | `{models:[string]}` | `{suggestions:{[model]:{input, cached, output, vendor}}, unmatched:[string], catalogDate}`（按模型名前缀匹配原厂，不猜测） |
| `hindsight.prices.save` | `{prices:{models}}` | `{prices}`（始终以 USD 写入）；非数字/负数返回 `INVALID_CONFIG` 并带 `fields` |
| `hindsight.bank.pages` | `{}` | `{items:[{id, name, description?, folder?}]}` |
| `hindsight.bank.search` | `{query, limit?}` | `{items:[{id, name, source_query?, snippet?}], query}` |
| `hindsight.bank.read` | `{pageId}` | `{page:{id, name, description?, tags?, last_updated_at?, body}}` |
| `hindsight.bank.reflect` | `{query, budget?}` | `{text, budget, ms}` |

字段定义的单一来源是 `src/panel/fields.mjs`（驱动校验与渲染）。

## 目录结构

```
.
├── manifest.json
├── main.js                  # 插件进程入口：onPanelInvoke 分发 7 个通道 + 「打开面板」命令
├── src/
│   ├── index.mjs            # agent 扩展入口：PATH 适配 + 转录适配
│   ├── plugin-defaults.mjs  # 与上游不同的插件默认值（作为最低优先级环境变量层）
│   ├── transcript-store.mjs # 按会话累积转录（内存 + 本地 jsonl 镜像）
│   ├── node-path.mjs        # 让后台 `node` 可解析
│   └── panel/
│       ├── fields.mjs       # 配置字段定义（校验 + 渲染）
│       ├── config.mjs       # 读写 coding-agent.json
│       ├── bank.mjs         # 只读 bank 客户端
│       └── errors.mjs       # 错误类型、脱敏、通道信封
├── views/                   # 面板视图（无构建步骤）：index.html / panel.js / panel.css / appearance-boot.js
├── vendor/                  # 上游 0.8.1 构建产物（hindsight-pi.mjs、deepen.js、daemon-start.js、mcp-server.js、survey-supervisor.js）
├── tests/                   # node --test
├── scripts/sync-upstream.sh # 重新 vendor 上游并校验适配层前提
└── docs/
    ├── config-reference.md  # 配置项 / 环境变量 / HTTP 端点
    └── compatibility.md     # 与 PI-Desktop 的接缝与风险
```

## 开发

```bash
node --test tests/*.test.mjs     # 配置往返/校验/备份/掩码、bank 错误映射、入口分发、PATH 适配、上游钩子加载
scripts/sync-upstream.sh 0.8.2   # 升级上游：重新 vendor，并检查适配层依赖的上游结构仍存在
```

开发时在 PI-Desktop 里以 dev 插件方式加载本目录；发布用 PluginPack 生成 `dist/local.hindsight.memory-<version>.piplug`。

## 排查

| 文件 | 内容 |
| --- | --- |
| `~/.hindsight/coding-agents-logs/plugin.log` | 人读日志（含 `[deepen]` 后台输出） |
| `~/.hindsight/coding-agents-logs/diag.jsonl` | 结构化事件：`session_start` / `inject_ok` / `retain_ok` / `deepen_started` … |

```bash
grep -E 'deepen_(started|done)' ~/.hindsight/coding-agents-logs/diag.jsonl | tail -3   # 后台加深是否在跑
grep retain_ok ~/.hindsight/coding-agents-logs/diag.jsonl | tail -3                    # 写回是否成功
```

后台 deepen 从不出现时，多半是找不到 node：把 node 目录加入 PI-Desktop 的 PATH，或设置 `HINDSIGHT_NODE_BIN`。

## 已知限制

- survey 需要本机有 `claude` / `codex` / `agy` / `opencode` 之一；daemon 模式需要 `uvx` + LLM（macOS 上还需 Rust）。
  缺失时上游静默跳过，详见 [docs/compatibility.md](docs/compatibility.md)。
- 多个仓库共用一个 bank 时，后台 deepen 按 bank 持租约：同时开会话的仓库只有一个会跑，其余下次会话再补。
- ctx 缺少 `cwd` 时上游回落到进程启动目录，可能绑错 bank；`session_shutdown` flush 上限 10s。
- token 明文存于 `~/.hindsight/coding-agent.json`（`0600`），不要提交或截图。

## 上游依赖是什么

`vendor/` 里的文件来自 npm 包 `@vectorize-io/hindsight-coding-agents@0.8.1` —— Hindsight 官方给
coding agent 用的接入层（记忆服务端负责存记忆库和知识页）。我们把它的构建产物**原样收进仓库**，
这样插件自包含、装上就能跑，不需要本机再 `npm install`。

| 文件 | 上游产物 | 作用 |
| --- | --- | --- |
| `hindsight-pi.mjs` | `dist/pi.js` | pi 扩展本体：4 个钩子 + 8 个 `hindsight_*` 工具 + 记忆库客户端 |
| `deepen.js` | `dist/deepen.js` | 后台加深引擎：读 git 历史、补新对话、维护那 5 张知识页 |
| `daemon-start.js` | `dist/daemon-start.js` | `serverMode: "daemon"` 时在本机启动服务端 |
| `mcp-server.js` | `dist/mcp-server.js` | 代码库 survey 时 agent 写回结论用的 MCP 服务 |
| `survey-supervisor.js` | `dist/survey-supervisor.js` | survey 子进程的租约托管与输出收集 |

md5 与来源逐项记录在 [vendor/PROVENANCE.md](vendor/PROVENANCE.md)。上游已发布 0.8.2，本插件固定在
0.8.1：升级用 `scripts/sync-upstream.sh <version>`，它会重新拉取 tarball 并校验适配层依赖的上游内部结构。

## 上游来源与许可

- 包：`@vectorize-io/hindsight-coding-agents@0.8.1`，仓库 <https://github.com/vectorize-io/hindsight.git>
  （`hindsight-integrations/coding-agents`）。
- 上游产物版权归原作者；npm 包未声明 `license` 字段，分发前请自行确认授权。


## 价格目录

`src/panel/price-catalog.json` 由 `node scripts/sync-prices.mjs` 从 PI-Desktop 自带的 models.dev 目录（`/Applications/PI-Desktop.app/Contents/Resources/models.dev/api.json`）抽取，仅含 deepseek / anthropic / google / openai / xai / mistral / moonshotai / zai 八家原厂的基础单价（USD/每百万 token，不含按上下文长度分档的价格）。PI-Desktop 升级、价格变动后重新运行该脚本并重新打包即可。

## LLM 用量为什么取自本机累计

Hindsight 服务端只保留较短时间的 LLM 调用记录（实测约一天），其 `/llm-requests/stats` 不管选 1/7/30 天都只能返回这一小段，所以统计页的用量汇总和按天分布不再用它，而是和「按模型」共用同一份本机累计（`~/.hindsight/pi-desktop-llm-usage.json`，按「小时×模型」只存计数，不含 prompt/回答）。面板每次打开统计页会把服务端的新调用累计进去；**面板没打开、而服务端又已删除的那段时间无法补回**，周期超过本机已累计的范围时页面会提示「本机只累计了 xx 之后的调用」。仅当调用明细接口不可用（如服务端未开启 LLM 请求追踪）时，才回退为服务端自带的统计。
