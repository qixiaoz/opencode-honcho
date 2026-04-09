import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

import { __testing } from "../dist/index.js"

test("installGlobalConfig writes plugin and Honcho commands into global opencode.json", async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), "opencode-install-"))

  const result = await __testing.installGlobalConfig({
    configDir,
    pluginSpec: "@honcho-ai/opencode-honcho",
  })

  const config = JSON.parse(await readFile(path.join(configDir, "opencode.json"), "utf-8"))
  assert.equal(result.opencodeConfigPath, path.join(configDir, "opencode.json"))
  assert.equal(config.$schema, "https://opencode.ai/config.json")
  assert.deepEqual(config.plugin, ["@honcho-ai/opencode-honcho"])
  assert.ok(config.command["honcho:setup"])
  assert.ok(config.command["honcho:status"])
})

test("installGlobalConfig preserves existing config and avoids duplicate plugin specs", async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), "opencode-install-existing-"))
  await mkdir(configDir, { recursive: true })
  await writeFile(
    path.join(configDir, "opencode.json"),
    JSON.stringify(
      {
        plugin: ["@honcho-ai/opencode-honcho"],
        command: {
          existing: {
            description: "keep me",
            template: "echo existing",
          },
        },
      },
      null,
      2,
    ),
  )

  await __testing.installGlobalConfig({
    configDir,
    pluginSpec: "@honcho-ai/opencode-honcho",
  })

  const config = JSON.parse(await readFile(path.join(configDir, "opencode.json"), "utf-8"))
  assert.deepEqual(config.plugin, ["@honcho-ai/opencode-honcho"])
  assert.equal(config.command.existing.description, "keep me")
  assert.ok(config.command["honcho:setup"])
})
