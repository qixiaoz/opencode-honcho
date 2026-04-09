#!/usr/bin/env node

import path from "node:path"
import { spawn } from "node:child_process"

import { initializeProject, installGlobalConfig, scaffoldTemplates } from "./scaffold.js"

const usage = () => `Usage:
  opencode-honcho install [--plugin-spec <spec>] [--config-dir <dir>] [--force]
  opencode-honcho init [--dir <project-root>] [--force] [--package-name <npm-package>]

Examples:
  npx @honcho-ai/opencode-honcho install
  npx @honcho-ai/opencode-honcho init
  npx @honcho-ai/opencode-honcho init --dir /path/to/project
`

const runCommand = (command: string, args: string[], env?: NodeJS.ProcessEnv) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        ...env,
      },
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`))
    })
  })

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

const parseInstallArgs = (argv: string[]) => {
  let force = false
  let pluginSpec = scaffoldTemplates.DEFAULT_PACKAGE_NAME
  let configDir: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--plugin-spec") {
      pluginSpec = argv[index + 1] || pluginSpec
      index += 1
      continue
    }
    if (arg === "--config-dir") {
      configDir = argv[index + 1] ? path.resolve(argv[index + 1]) : configDir
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

  return { force, pluginSpec, configDir }
}

const main = async () => {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === "--help" || command === "-h") {
    console.log(usage())
    return
  }

  if (command === "install") {
    const options = parseInstallArgs(rest)
    const env = options.configDir ? { OPENCODE_CONFIG_DIR: options.configDir } : undefined
    await runCommand("opencode", ["plugin", options.pluginSpec, "--global", ...(options.force ? ["--force"] : [])], env)
    const config = await installGlobalConfig({
      configDir: options.configDir,
      pluginSpec: options.pluginSpec,
    })
    console.log(
      JSON.stringify(
        {
          ok: true,
          command: "install",
          pluginSpec: options.pluginSpec,
          configDir: config.configDir,
          opencodeConfigPath: config.opencodeConfigPath,
          installedCommands: config.commandNames,
          nextSteps: [
            "Start OpenCode and run /honcho:setup for cloud setup or choose Self-hosted / local for a local Honcho instance.",
            "Run /honcho:status to verify the runtime.",
          ],
        },
        null,
        2,
      ),
    )
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
