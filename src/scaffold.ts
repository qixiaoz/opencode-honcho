import { mkdir, writeFile, access } from "node:fs/promises"
import path from "node:path"

const DEFAULT_PACKAGE_NAME = "@honcho-ai/opencode-honcho"

type InitializeProjectOptions = {
  rootDir?: string
  packageName?: string
  force?: boolean
}

type InitializeProjectResult = {
  rootDir: string
  createdPaths: string[]
  skippedPaths: string[]
}

const opencodeCommands = () => ({
  "honcho:setup": {
    description: "Validate Honcho connectivity and repair OpenCode config.",
    template:
      "Global OpenCode Honcho config lives at `~/.config/opencode/honcho.json`. If the first command argument looks like an Honcho API key, pass it to `honcho_setup` as `apiKey` so it persists globally for all projects. Do not call `honcho_get_config` for setup. Immediately call `honcho_setup` exactly once and summarize the effective OpenCode Honcho status.",
  },
  "honcho:status": {
    description: "Show Honcho runtime health and current OpenCode memory state.",
    template:
      "Immediately call `honcho_status` exactly once. If the user asks for raw output, return the exact JSON and nothing else.",
  },
  "honcho:settings": {
    description: "Inspect persisted Honcho project settings for OpenCode.",
    template:
      "Persisted project settings live in `.opencode/honcho.json`, and global OpenCode Honcho config lives at `~/.config/opencode/honcho.json`. Immediately call `honcho_get_config` and summarize the effective values.",
  },
  "honcho:set": {
    description: "Persist a single Honcho setting for all future OpenCode sessions in this project.",
    template: "Update `.opencode/honcho.json` by calling `honcho_set_config` exactly once with the requested field and value.",
  },
  "honcho:unset": {
    description: "Reset a persisted Honcho setting back to its default value for this project.",
    template: "Reset the requested key to its documented default via `honcho_set_config`.",
  },
  "honcho:mode": {
    description: "Change the OpenCode Honcho recall mode.",
    template: "Call `honcho_set_config` with field `recallMode` and the requested value.",
  },
  "honcho:write": {
    description: "Change the OpenCode Honcho durable write policy.",
    template: "Call `honcho_set_config` with field `writeFrequency` and the requested value.",
  },
  "honcho:interview": {
    description: "Capture durable user preferences into Honcho.",
    template:
      "Ask concise durable-memory questions, or if direct text is provided call `honcho_create_conclusion` exactly once with that exact remaining argument text verbatim.",
  },
})

const opencodeManifest = () =>
  JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      command: opencodeCommands(),
    },
    null,
    2,
  ) + "\n"

const pluginShim = (packageName: string) => `export { default } from "${packageName}"\n`

const projectOverrideJson = () => "{}\n"

const writeFileIfNeeded = async ({
  filePath,
  content,
  force,
}: {
  filePath: string
  content: string
  force: boolean
}) => {
  if (!force) {
    try {
      await access(filePath)
      return false
    } catch {
      // File does not exist yet.
    }
  }

  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content, "utf-8")
  return true
}

export const initializeProject = async ({
  rootDir = process.cwd(),
  packageName = DEFAULT_PACKAGE_NAME,
  force = false,
}: InitializeProjectOptions = {}): Promise<InitializeProjectResult> => {
  const absoluteRoot = path.resolve(rootDir)
  const targets = [
    {
      filePath: path.join(absoluteRoot, "opencode.json"),
      content: opencodeManifest(),
    },
    {
      filePath: path.join(absoluteRoot, ".opencode", "plugins", "honcho-runtime.js"),
      content: pluginShim(packageName),
    },
    {
      filePath: path.join(absoluteRoot, ".opencode", "honcho.json"),
      content: projectOverrideJson(),
    },
  ]

  const createdPaths: string[] = []
  const skippedPaths: string[] = []

  for (const target of targets) {
    const wrote = await writeFileIfNeeded({
      filePath: target.filePath,
      content: target.content,
      force,
    })
    if (wrote) {
      createdPaths.push(target.filePath)
    } else {
      skippedPaths.push(target.filePath)
    }
  }

  return {
    rootDir: absoluteRoot,
    createdPaths,
    skippedPaths,
  }
}

export const scaffoldTemplates = {
  DEFAULT_PACKAGE_NAME,
  opencodeCommands,
  opencodeManifest,
  pluginShim,
  projectOverrideJson,
}

