# @honcho-ai/opencode-honcho

Honcho Memory for OpenCode.

This plugin adds persistent [Honcho](https://github.com/plastic-labs/honcho) memory to OpenCode. It is designed for the current public OpenCode plugin surface and focuses on native runtime integration, Claude-style defaults, operator controls, and optional multi-agent memory modeling.

## Install the Plugin

Install the plugin with OpenCode:

```bash
opencode plugin @honcho-ai/opencode-honcho --global
```

This native install path gives OpenCode the Honcho runtime plus interactive Honcho commands in the TUI.

If you also want project-local server command scaffolding for non-interactive or config-backed command flows, run:

```bash
npx @honcho-ai/opencode-honcho init
```

The init command creates:

- `opencode.json`
- `.opencode/plugins/honcho-runtime.js`
- `.opencode/honcho.json`

## Quick Setup

### Minimal Path

1. Install the plugin with `opencode plugin @honcho-ai/opencode-honcho --global`.
2. Start OpenCode.
3. Run `/honcho:setup` from slash autocomplete or the command palette.
4. If you are using Honcho Cloud, keep the default cloud deployment and enter your Honcho API key.
5. If you are using a self-hosted or local Honcho instance, choose `Self-hosted / local` and set `baseUrl` to your Honcho endpoint such as `http://127.0.0.1:8000`.
6. Run `/honcho:status` to verify the runtime.

If you want local project scaffolding for config-backed command execution, run `npx @honcho-ai/opencode-honcho init` from the project root after installing the plugin.

If you use a self-hosted or local Honcho deployment, `baseUrl` must be reachable from the OpenCode host runtime. If OpenCode is running in Docker or a remote environment, `localhost` may not point at your machine.

## Features

- Adds persistent Honcho memory to OpenCode through the native plugin runtime.
- Maps OpenCode workspaces to Honcho workspaces.
- Maps OpenCode sessions to Honcho sessions with multiple session strategy options.
- Maps the user and OpenCode assistant to Honcho peers.
- Supports Claude-style `classic` peer modeling by default.
- Supports optional `hierarchical` peer modeling for delegated child-agent sessions.
- Injects cached Honcho context into OpenCode prompts.
- Supports automatic durable memory writes.
- Registers Honcho retrieval and durable-write tools for OpenCode.
- Supports both Honcho Cloud and self-hosted or local Honcho deployments.
- Supports explicit peer observation controls with `observeMe` and `observeOthers`.

## Capabilities

The plugin uses the following OpenCode plugin surfaces:

- `event`
- `chat.message`
- `tool.execute.after`
- `command.execute.before`
- `experimental.chat.system.transform`
- `experimental.session.compacting`
- `shell.env`
- `tool`

## Agent Tools

The plugin registers these Honcho tools for OpenCode:

- `honcho_setup`
- `honcho_status`
- `honcho_get_config`
- `honcho_set_config`
- `honcho_search`
- `honcho_chat`
- `honcho_create_conclusion`

## Operator Actions

The plugin exposes the main operator workflow directly:

- `/honcho:setup`
- `/honcho:status`
- `/honcho:settings`

Project-local scaffolding via `npx @honcho-ai/opencode-honcho init` also adds:

- `/honcho:set`
- `/honcho:unset`
- `/honcho:mode`
- `/honcho:write`
- `/honcho:interview`

## Configuration

### Required Settings

For Honcho Cloud:

- `apiKey`

For self-hosted or local Honcho:

- `baseUrl`
- `apiKey`

Localhost mode is allowed without an API key. For local Honcho, `apiKey` may be empty when `baseUrl` points at `http://127.0.0.1:8000` or `http://localhost:8000`.

### Defaults

| Setting | Default | Use when |
| --- | --- | --- |
| `enabled` | `true` | Turn this off to disable Honcho runtime behavior without uninstalling the plugin. |
| `apiKey` | `""` | Set this for Honcho Cloud or authenticated self-hosted deployments. |
| `baseUrl` | `https://api.honcho.dev` | Override this for self-hosted or local Honcho deployments. |
| `peerName` | `""` | Override this if you do not want the plugin to fall back to the local OS user. |
| `aiPeer` | `""` | Override this if you do not want the plugin to fall back to `opencode`. |
| `workspace` | `""` | Override this if you do not want the plugin to fall back to configured host workspace, then project id, then repo name. |
| `globalOverride` | `false` | Enable this if you want the top-level workspace to win over `hosts.opencode.workspace`. |
| `linkedHosts` | `[]` | Add linked host names when you want host-aware cross-memory configuration. |
| `recallMode` | `hybrid` | Change this to `context` or `tools` if you want different prompt-injection versus tool-use behavior. |
| `observation` | `directional` | Change this if you want a different peer observation mode. |
| `peerModel` | `classic` | Change this to `hierarchical` if you want explicit child and parent-observer peer modeling. |
| `writeFrequency` | `async` | Change this if you want a different durable-write cadence. |
| `sessionStrategy` | `per-directory` | Change this to `per-repo`, `per-session`, `chat-instance`, `git-branch`, or `global` for different session scoping. |
| `dialecticReasoningLevel` | `low` | Increase this if you want deeper Honcho reasoning behavior. |
| `dialecticDynamic` | `true` | Turn this off for more fixed dialectic behavior. |
| `dialecticMaxChars` | `600` | Increase this if you want larger dialectic summaries. |
| `messageMaxChars` | `25000` | Change this if you need a different message ingestion limit. |
| `saveMessages` | `true` | Turn this off if you do not want OpenCode messages saved into Honcho. |
| `contextRefresh.messageThreshold` | `30` | Lower this if you want prompt-context refreshes to happen more frequently. |
| `contextRefresh.ttlSeconds` | `300` | Lower this if you want prompt-context refreshes to expire sooner. |
| `contextRefresh.skipTrivialPrompts` | `true` | Turn this off if you want even trivial prompts to refresh memory context. |
| `contextRefresh.useSessionStartDialectic` | `true` | Turn this off if you want lighter session-start warmup behavior. |

## Development

```bash
npm install
npm run build
npm test
npm run check
```
