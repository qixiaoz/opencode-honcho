# @honcho-ai/opencode-honcho

TypeScript-native Honcho plugin runtime for OpenCode.

This README assumes the public npm package name will be `@honcho-ai/opencode-honcho`.

The runtime uses the Honcho TypeScript SDK directly and integrates with OpenCode's native plugin hooks for:

- prompt-level memory injection
- automatic durable memory writes
- Claude-style peer mapping by default with optional hierarchical multi-agent peer mapping
- global OpenCode Honcho config with optional project overrides
- native OpenCode tools and emitted slash-command control

## Quick Start

The simplest setup is:

1. Install the runtime into your OpenCode project-local plugin environment.
2. Add the thin plugin shim that re-exports the package.
3. Add global Honcho config for either cloud or localhost.
4. Start OpenCode in that project.

### Install The Runtime

Create `.opencode/package.json`:

```json
{
  "name": "opencode-local-plugins",
  "private": true,
  "type": "module",
  "dependencies": {
    "@honcho-ai/opencode-honcho": "latest"
  }
}
```

Install it:

```bash
cd .opencode
npm install
```

### Add The Plugin Shim

Create `.opencode/plugins/honcho-runtime.js`:

```js
export { default } from "@honcho-ai/opencode-honcho"
```

### Cloud Setup

Create `~/.config/opencode/honcho.json`:

```json
{
  "apiKey": "hch-...",
  "baseUrl": "https://api.honcho.dev",
  "peerName": "alice",
  "globalOverride": false,
  "peerModel": "classic",
  "sessionStrategy": "per-directory",
  "hosts": {
    "opencode": {
      "workspace": "opencode",
      "aiPeer": "opencode",
      "linkedHosts": []
    }
  }
}
```

### Local Setup

For a local Honcho server, use `http://127.0.0.1:8000` or `http://localhost:8000`. Localhost mode is allowed without an API key.

Create `~/.config/opencode/honcho.json`:

```json
{
  "apiKey": "",
  "baseUrl": "http://127.0.0.1:8000",
  "peerName": "alice",
  "globalOverride": false,
  "peerModel": "classic",
  "sessionStrategy": "per-directory",
  "hosts": {
    "opencode": {
      "workspace": "opencode",
      "aiPeer": "opencode",
      "linkedHosts": []
    }
  }
}
```

### Optional Project Override

If you need per-project behavior, create `.opencode/honcho.json`:

```json
{
  "workspace": "my-project",
  "peerModel": "hierarchical"
}
```

### Start OpenCode

Run OpenCode from the project root after the plugin files exist under `.opencode/`.

If you are using the full emitted bundle, you should also have the Honcho slash commands:

- `/honcho:setup`
- `/honcho:status`
- `/honcho:settings`
- `/honcho:set`
- `/honcho:unset`

## Repository Layout

- `src/*.ts` is the source of truth
- `dist/*.js` is the checked-in runtime artifact used by emitted OpenCode bundles
- `vendor/honcho-sdk` and `vendor/zod` are vendored runtime dependencies used to avoid plugin startup resolution issues inside OpenCode

## Development

```bash
npm install
npm run check
npm run build
```

## Package Validation

```bash
npm pack
```

## Defaults

Current defaults:

- `enabled: true`
- `apiKey: ""`
- `baseUrl: "https://api.honcho.dev"`
- `peerName: ""` and falls back to the local OS user
- `aiPeer: ""` and falls back to `opencode`
- `workspace: ""` and falls back to configured host workspace, then project id, then repo name
- `globalOverride: false`
- `linkedHosts: []`
- `recallMode: "hybrid"`
- `observation: "directional"`
- `peerModel: "classic"`
- `writeFrequency: "async"`
- `sessionStrategy: "per-directory"`
- `dialecticReasoningLevel: "low"`
- `dialecticDynamic: true`
- `dialecticMaxChars: 600`
- `messageMaxChars: 25000`
- `saveMessages: true`
- `contextRefresh.messageThreshold: 30`
- `contextRefresh.ttlSeconds: 300`
- `contextRefresh.skipTrivialPrompts: true`
- `contextRefresh.useSessionStartDialectic: true`

Default peer behavior:

- user peer: `observeMe=true`, `observeOthers=false`
- root agent peer: `observeMe=true`, `observeOthers=true`
- child agent peer in `hierarchical` mode: `observeMe=true`, `observeOthers=false`, `sessionScoped=true`
- parent observer peer in `hierarchical` mode: `observeMe=false`, `observeOthers=true`, `modelsOnly=[childPeer]`

## OpenCode Runtime Usage

This package is meant to be consumed by an emitted local OpenCode bundle, not installed as a standalone top-level OpenCode command.

The generated OpenCode project bundle should contain:

- `opencode.json`
- `.opencode/plugins/honcho-runtime.js`
- `.opencode/package.json`
- `.opencode/honcho.json`

The thin plugin shim imports this package's `dist/index.js`.

## Runtime Config

The runtime uses two config layers:

- global OpenCode Honcho config: `~/.config/opencode/honcho.json`
- project overrides: `.opencode/honcho.json`

Effective precedence is:

1. project `.opencode/honcho.json`
2. global `~/.config/opencode/honcho.json`
3. environment
4. built defaults

The default global host mapping is Claude-style under `hosts.opencode`:

```json
{
  "apiKey": "hch-...",
  "peerName": "alice",
  "globalOverride": false,
  "peerModel": "classic",
  "hosts": {
    "opencode": {
      "workspace": "opencode",
      "aiPeer": "opencode",
      "linkedHosts": []
    }
  }
}
```

For a local Honcho instance, set `baseUrl` to `http://127.0.0.1:8000` or `http://localhost:8000`. Localhost mode is allowed without an API key; cloud mode still expects one.

## OpenCode Behavior

The runtime intentionally reflects current OpenCode host capabilities:

- `hard_command_interception`: unsupported
- `pre_model_command_execute`: supported
- `structured_question_ui`: unsupported
- `persistent_background_runtime`: unsupported

The runtime follows Claude-style memory layering:

- deeper warmup at session start
- cached lightweight prompt injection on normal turns
- explicit deep retrieval through Honcho tools

## OpenCode to Honcho Mapping

### Config Mapping

- Global user-wide config: `~/.config/opencode/honcho.json`
- Project overrides: `.opencode/honcho.json`
- Fallback environment: `HONCHO_API_KEY`, `HONCHO_URL`, `HONCHO_BASE_URL`, `HONCHO_PEER_NAME`, `HONCHO_WORKSPACE`

Effective precedence is:

1. project `.opencode/honcho.json`
2. global `~/.config/opencode/honcho.json`
3. environment
4. built defaults

### Workspace Mapping

- `workspace` maps to the Honcho workspace namespace
- Prefer top-level `workspace` when `globalOverride` is enabled
- Otherwise prefer `hosts.opencode.workspace`
- Fall back to repo- or project-derived workspace only when no explicit workspace is configured

This makes OpenCode align more closely with Claude Code's host-aware workspace model while still allowing per-project overrides.

### Peer Mapping

- `peerName` maps to the human user peer
- `aiPeer` maps to the root OpenCode agent peer
- `peerModel=classic` keeps a Claude Code-style durable model where delegated sessions stay on the stable `userPeer + aiPeer`
- `peerModel=hierarchical` enables explicit child and parent-observer peers for delegated child-agent sessions

The default `peerModel` is `classic`. Switch to the OpenCode-native hierarchical model by setting `peerModel=hierarchical` in config or with `/honcho:set peerModel hierarchical`.

Default peer observation semantics are:

- user peer: `observeMe=true`, `observeOthers=false`
- root agent peer: `observeMe=true`, `observeOthers=true`
- child agent peer in `hierarchical` mode: `observeMe=true`, `observeOthers=false`, `sessionScoped=true`
- parent observer peer in `hierarchical` mode: `observeMe=false`, `observeOthers=true`, `modelsOnly=[childPeer]`

### Session Mapping

- `sessionStrategy=per-repo`: one stable Honcho session per workspace and agent lineage
- `sessionStrategy=per-directory`: one stable Honcho session per working directory and agent lineage
- `sessionStrategy=per-session`: one Honcho session per OpenCode session id
- `sessionStrategy=chat-instance`: Claude Code-style alias for one Honcho session per OpenCode session id
- `sessionStrategy=git-branch`: Claude Code-style branch-scoped session key when the current git branch is available, with repo-name fallback when it is not
- `sessionStrategy=global`: one long-lived Honcho session for the configured workspace

Sessions are enabled by default. The default strategy is `per-directory`.

### Hook Mapping

- `event`: session lifecycle, warmup, and cleanup
- `chat.message`: observe user messages and trigger durable write heuristics
- `tool.execute.after`: observe tool outputs and trigger durable write heuristics
- `experimental.chat.system.transform`: inject cached Honcho prompt memory
- `experimental.session.compacting`: preserve continuity across compaction
- `shell.env`: expose resolved Honcho env into shell context

### Tool and Command Mapping

OpenCode-native tools provided by the runtime:

- `honcho_setup`
- `honcho_status`
- `honcho_get_config`
- `honcho_set_config`
- `honcho_search`
- `honcho_chat`
- `honcho_create_conclusion`

Expected OpenCode command layer from the emitted bundle:

- `/honcho:setup`
- `/honcho:status`
- `/honcho:settings`
- `/honcho:set`
- `/honcho:unset`
- `/honcho:mode`
- `/honcho:write`
- `/honcho:interview`

### Memory Layering

The runtime follows a Claude-style layering model:

- session-start deep warmup for stable user, agent, and summary context
- cached lightweight prompt injection on normal turns
- explicit deep retrieval through Honcho tools when more context is needed

## Publishing

This repo is the npm package surface that should be published as `@honcho-ai/opencode-honcho`.

It should include:

- `src/`
- `dist/`
- `vendor/`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `package.json`
- `tsconfig.json`

It should not include generated project `.opencode/` bundles or machine-local config.
