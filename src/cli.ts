#!/usr/bin/env node

import path from "node:path"

import { initializeProject, scaffoldTemplates } from "./scaffold.js"

const usage = () => `Usage:
  opencode-honcho init [--dir <project-root>] [--force] [--package-name <npm-package>]

Examples:
  npx @honcho-ai/opencode-honcho init
  npx @honcho-ai/opencode-honcho init --dir /path/to/project
`

const parseInitArgs = (argv: string[]) => {
  let rootDir = process.cwd()
  let force = false
  let packageName = scaffoldTemplates.DEFAULT_PACKAGE_NAME

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--dir") {
      rootDir = argv[index + 1] ? path.resolve(argv[index + 1]) : rootDir
      index += 1
      continue
    }
    if (arg === "--package-name") {
      packageName = argv[index + 1] || packageName
      index += 1
      continue
    }
    if (arg === "--force") {
      force = true
      continue
    }
    if (arg === "--help" || arg === "-h") {
      console.log(usage())
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return { rootDir, force, packageName }
}

const main = async () => {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === "--help" || command === "-h") {
    console.log(usage())
    return
  }

  if (command !== "init") {
    throw new Error(`Unknown command: ${command}`)
  }

  const options = parseInitArgs(rest)
  const result = await initializeProject(options)
  console.log(JSON.stringify({
    ok: true,
    command: "init",
    rootDir: result.rootDir,
    createdPaths: result.createdPaths,
    skippedPaths: result.skippedPaths,
    nextSteps: [
      `npm install ${options.packageName}`,
      "Run OpenCode in this project and use /honcho:setup for cloud setup or set baseUrl to localhost for local Honcho.",
    ],
  }, null, 2))
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})

