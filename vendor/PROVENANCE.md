# Vendored upstream provenance

Every file in this directory is an **unmodified copy** of a build artifact from the npm package
`@vectorize-io/hindsight-coding-agents`. Verified 2026-10-27 by downloading the tarball and
diffing byte-for-byte (empty diff, identical md5).

| local file | upstream artifact | bytes | md5 |
| --- | --- | --- | --- |
| `hindsight-pi.mjs` | `package/dist/pi.js` | 730,680 | `0943cdcff0eb0230a3c9078e8d75d56d` |
| `deepen.js` | `package/dist/deepen.js` | 110,575 | `4e286b47d28c2f0a857363b18bd64d04` |
| `daemon-start.js` | `package/dist/daemon-start.js` | 36,918 | `264f3b42e3e15cb51b1be52d09257743` |
| `mcp-server.js` | `package/dist/mcp-server.js` | 1,250,696 | `4713f42732502d403db03b78e121fd25` |
| `survey-supervisor.js` | `package/dist/survey-supervisor.js` | 2,015 | `a5d4026a917636b0f0b76ae91438334f` |

## Source

- Package: `@vectorize-io/hindsight-coding-agents`
- Version: `0.8.1` (see `UPSTREAM_VERSION`)
- Tarball: <https://registry.npmjs.org/@vectorize-io/hindsight-coding-agents/-/hindsight-coding-agents-0.8.1.tgz>
- `dist.integrity` (npm): `sha512-Jo70NrIADWbvQAnOZgu3mZZI6wSKNtY7UUvJ+5gy+45cUc+YC2/M7H+GcZ4qEJV62QwO033O3lNmdqpw0RVuDQ==`
- Repository: <https://github.com/vectorize-io/hindsight.git> (`hindsight-integrations/coding-agents`)
- Package main: `dist/index.js`; the pi harness entry used here is `dist/pi.js`.

## Why these five files

- `hindsight-pi.mjs` is the bundled pi extension: hooks (`session_start`, `before_agent_start`,
  `agent_end`, `session_shutdown`), the eight `hindsight_*` tools, the memory-bank client and the
  transcript serializers. It is esbuild output — `// node_modules/...` and `// src/...` comments
  mark original file boundaries (e.g. `src/harness/pi-extension.ts`, `src/core/*`).
- `deepen.js` is the background deepening engine (a separate CLI bundle) that the extension spawns;
  it walks git history, surveys the codebase and maintains the knowledge pages.
- `daemon-start.js` is what `serverMode: "daemon"` spawns (`hindsight-pi.mjs:16776`): it loads the
  config, returns immediately when the URL already answers `/health`, runs the `uvx` / Rust / LLM
  preflight (`vendor/daemon-start.js:895-918`) and then starts the embedded
  `@vectorize-io/hindsight-all` server on `127.0.0.1:<apiPort>`.
- `mcp-server.js` is the MCP server the codebase survey agent launches to write its findings
  (`hindsight-pi.mjs:17196`, handed to `claude`/`codex` as `--mcp-config`). It requires the
  `HINDSIGHT_MCP_HARNESS` env var the survey recipe sets (`vendor/mcp-server.js:33642`).
- `survey-supervisor.js` is the tiny detached child the survey spawns per run
  (`hindsight-pi.mjs:17233`); it holds the survey lease, heartbeats it, streams the agent's output
  into `<tmp>/hindsight-coding-agent/surveys/` and reaps it on exit.

Missing any of the last three makes the corresponding feature fail silently: the upstream code
passes the sibling path to `spawn("node", …)` and swallows the error.

## Rules

1. Do not hand-edit these files. All local behaviour is in `src/index.mjs`.
2. Upgrade with `scripts/sync-upstream.sh <version>`; it re-fetches the tarball, asserts the
   upstream internals the wrapper relies on still exist, and rewrites this directory.
3. Upstream had `0.8.2` published at the time of writing while this copy is `0.8.1` — upgrading is a
   deliberate, separately verified step, not automatic.
