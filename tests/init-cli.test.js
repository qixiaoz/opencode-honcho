import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

import { __testing } from "../dist/index.js"

test("init scaffold writes the minimal OpenCode plugin files", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "opencode-init-"))

  const result = await __testing.initializeProject({
    rootDir,
    packageName: "@honcho-ai/opencode-honcho",
  })

  assert.deepEqual(
    result.createdPaths.map((file) => path.relative(rootDir, file)).sort(),
    [".opencode/honcho.json", ".opencode/plugins/honcho-runtime.js", "opencode.json"],
  )

  const shim = await readFile(path.join(rootDir, ".opencode/plugins/honcho-runtime.js"), "utf-8")
  assert.match(shim, /@honcho-ai\/opencode-honcho/)

  const manifest = JSON.parse(await readFile(path.join(rootDir, "opencode.json"), "utf-8"))
  assert.equal(manifest.$schema, "https://opencode.ai/config.json")
  assert.ok(manifest.command["honcho:setup"])
  assert.ok(manifest.command["honcho:status"])

  const projectConfig = JSON.parse(await readFile(path.join(rootDir, ".opencode/honcho.json"), "utf-8"))
  assert.deepEqual(projectConfig, {})
})
