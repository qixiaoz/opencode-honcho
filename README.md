# @plasticlabs/opencode-honcho

TypeScript-native Honcho plugin runtime for OpenCode.

This package is the publishable runtime that powers the generated local OpenCode plugin bundle. It uses the Honcho TypeScript SDK directly and integrates with OpenCode's native plugin hooks for:

- prompt-level memory injection
- automatic durable memory writes
- multi-agent peer and session mapping
- project-local overrides plus global OpenCode Honcho config
- native OpenCode tools and slash-command control

## Repository Layout

- `src/*.ts` is the source of truth
- `dist/*.js` is the checked-in runtime artifact used by emitted OpenCode bundles
- `vendor/honcho-sdk` and `vendor/zod` are vendored runtime dependencies used to avoid plugin startup resolution issues inside OpenCode

## Setup

### Development

```bash
npm install
npm run check
npm run build
```

### Package Validation

```bash
npm pack
```

### OpenCode Runtime Usage

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
  "hosts": {
    "opencode": {
      "workspace": "opencode",
      "aiPeer": "opencode",
      "linkedHosts": []
    }
  }
}
```

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

## Publishing

This repo is the npm package surface that should be published as `@plasticlabs/opencode-honcho`.

It should include:

- `src/`
- `dist/`
- `vendor/`
- `README.md`
- `package.json`
- `tsconfig.json`

It should not include generated project `.opencode/` bundles or machine-local config.
